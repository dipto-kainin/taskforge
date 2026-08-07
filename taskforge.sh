#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  TaskForge CLI — Project Management                         ║
# ║  Usage: ./taskforge.sh <command> [options]                  ║
# ╚══════════════════════════════════════════════════════════════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Docker Compose Command Resolution ───────────────────────────
if command -v docker-compose &>/dev/null; then
  DC="docker-compose"
elif docker compose version &>/dev/null; then
  DC="docker compose"
else
  echo "Error: Neither docker-compose nor 'docker compose' was found."
  exit 1
fi

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Helpers ─────────────────────────────────────────────────────
banner() {
  echo ""
  echo -e "${PURPLE}${BOLD}  ╔═══════════════════════════════════╗${NC}"
  echo -e "${PURPLE}${BOLD}  ║       ⚡ TaskForge CLI ⚡         ║${NC}"
  echo -e "${PURPLE}${BOLD}  ╚═══════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
success() { echo -e "  ${GREEN}✓${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "  ${RED}✗${NC}  $1"; }
step()    { echo -e "  ${CYAN}▸${NC}  ${BOLD}$1${NC}"; }
divider() { echo -e "  ${DIM}─────────────────────────────────────${NC}"; }

spinner() {
  local pid=$1
  local msg=$2
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}${frames[$i]}${NC}  %s" "$msg"
    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.1
  done
  printf "\r"
}

wait_for_health() {
  local service=$1
  local url=$2
  local max_wait=${3:-60}
  local elapsed=0

  while [ $elapsed -lt $max_wait ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# ── Commands ────────────────────────────────────────────────────

cmd_start() {
  banner
  step "Starting TaskForge..."
  divider

  local BUILD_FLAG=""
  local DETACH="-d"
  local SEED=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --build)   BUILD_FLAG="--build"; shift ;;
      --seed)    SEED=true; shift ;;
      --attach)  DETACH=""; shift ;;
      *)         shift ;;
    esac
  done

  info "Running $DC up ${BUILD_FLAG} ${DETACH}"
  $DC up $BUILD_FLAG $DETACH

  if [ -n "$DETACH" ]; then
    divider
    step "Waiting for services to be healthy..."

    local services_ok=true
    echo ""

    # Check auth-service
    printf "  ${DIM}Waiting for auth-service...${NC}"
    if wait_for_health "auth-service" "http://localhost:8080/.well-known/jwks.json" 90; then
      printf "\r"; success "auth-service          ${GREEN}healthy${NC}"
    else
      printf "\r"; error "auth-service          ${RED}timeout${NC}"; services_ok=false
    fi

    # Check core-service
    printf "  ${DIM}Waiting for core-service...${NC}"
    if wait_for_health "core-service" "http://localhost:8081/health" 30; then
      printf "\r"; success "core-service          ${GREEN}healthy${NC}"
    else
      printf "\r"; error "core-service          ${RED}timeout${NC}"; services_ok=false
    fi

    # Check search-service
    printf "  ${DIM}Waiting for search-service...${NC}"
    if wait_for_health "search-service" "http://localhost:8000/health" 60; then
      printf "\r"; success "search-service        ${GREEN}healthy${NC}"
    else
      printf "\r"; error "search-service        ${RED}timeout${NC}"; services_ok=false
    fi

    # Check gateway
    printf "  ${DIM}Waiting for gateway...${NC}"
    if wait_for_health "gateway" "http://localhost:4000/health" 30; then
      printf "\r"; success "gateway               ${GREEN}healthy${NC}"
    else
      printf "\r"; error "gateway               ${RED}timeout${NC}"; services_ok=false
    fi

    # Check frontend
    printf "  ${DIM}Waiting for frontend...${NC}"
    if wait_for_health "frontend" "http://localhost:3000" 30; then
      printf "\r"; success "frontend              ${GREEN}healthy${NC}"
    else
      printf "\r"; error "frontend              ${RED}timeout${NC}"; services_ok=false
    fi

    divider

    if $services_ok; then
      success "All services are healthy!"
    else
      warn "Some services failed to start. Run ${BOLD}./taskforge.sh logs${NC} to investigate."
    fi

    if $SEED; then
      echo ""
      cmd_seed
    fi

    divider
    echo ""
    echo -e "  ${BOLD}🌐 Frontend:${NC}    ${CYAN}http://localhost:3000${NC}"
    echo -e "  ${BOLD}📊 GraphQL:${NC}     ${CYAN}http://localhost:4000/graphql${NC}"
    echo -e "  ${BOLD}🔑 Auth API:${NC}    ${CYAN}http://localhost:8080${NC}"
    echo -e "  ${BOLD}⚙️  Core API:${NC}    ${CYAN}http://localhost:8081${NC}"
    echo -e "  ${BOLD}🔍 Search API:${NC}  ${CYAN}http://localhost:8000${NC}"
    echo ""
    echo -e "  ${DIM}Demo login: alice@example.com / password123${NC}"
    echo ""
  fi
}

cmd_stop() {
  banner
  step "Stopping TaskForge..."
  divider

  $DC down "$@"
  success "All services stopped."
  echo ""
}

cmd_dev() {
  banner
  step "Starting TaskForge in FULL DEV mode..."
  divider
  echo ""
  info "Postgres + Redis + auth-service (Java 21)  →  Docker"
  info "core / search / gateway / frontend           →  native from source (hot-reload)"
  echo ""

  # ── 1. Start infrastructure + auth-service (Java 21) in Docker ────
  step "Starting infrastructure + auth-service [Java 21] in Docker..."
  $DC up -d postgres redis auth-service
  echo ""

  printf "  ${DIM}Waiting for postgres...${NC}"
  local elapsed=0
  while [ $elapsed -lt 30 ]; do
    if $DC exec -T postgres pg_isready -U taskforge > /dev/null 2>&1; then break; fi
    sleep 1; elapsed=$((elapsed+1))
  done
  printf "\r"; success "postgres              ${GREEN}ready${NC}"

  printf "  ${DIM}Waiting for redis...${NC}"
  elapsed=0
  while [ $elapsed -lt 15 ]; do
    if $DC exec -T redis redis-cli ping > /dev/null 2>&1; then break; fi
    sleep 1; elapsed=$((elapsed+1))
  done
  printf "\r"; success "redis                 ${GREEN}ready${NC}"

  printf "  ${DIM}Waiting for auth-service (Java 21)...${NC}"
  if wait_for_health "auth-service" "http://localhost:8080/.well-known/jwks.json" 120; then
    printf "\r"; success "auth-service          ${GREEN}healthy${NC} ${DIM}(Java 21)${NC}"
  else
    printf "\r"; warn "auth-service still starting — check docker logs"
  fi

  divider
  echo ""

  # ── PID tracking for clean shutdown ────────────────────────────
  DEV_PIDS=()

  cleanup_dev() {
    echo ""
    divider
    step "Shutting down dev services..."
    for pid in "${DEV_PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    sleep 1
    for pid in "${DEV_PIDS[@]}"; do
      kill -9 "$pid" 2>/dev/null || true
    done
    success "All dev services stopped."
    echo ""
    exit 0
  }
  trap cleanup_dev INT TERM

  # ── Shared env (localhost URLs since services run on the host) ──
  local DB_URL_BASE="postgres://taskforge:taskforge_secret@localhost:5432"
  local JWKS_LOCAL="http://localhost:8080/.well-known/jwks.json"
  local LOGS_DIR="$SCRIPT_DIR/.dev-logs"
  mkdir -p "$LOGS_DIR"

  # ── 3. core-service (Go) ───────────────────────────────────────
  step "Starting core-service  [Go]..."
  (
    cd "$SCRIPT_DIR/core-service"
    DATABASE_URL="${DB_URL_BASE}/taskforge_core?sslmode=disable" \
    JWKS_URL="$JWKS_LOCAL" \
    SEARCH_SERVICE_URL="http://localhost:8000" \
    GATEWAY_NOTIFY_URL="http://localhost:4000/internal/notify" \
    PORT="8081" \
    go run ./cmd/main.go 2>&1
  ) > "$LOGS_DIR/core-service.log" 2>&1 &
  DEV_PIDS+=($!)
  info "core-service  PID=$!  →  logs: .dev-logs/core-service.log"
  echo ""

  # ── 4. search-service (Python / FastAPI) ───────────────────────
  step "Starting search-service  [Python / FastAPI --reload]..."
  (
    cd "$SCRIPT_DIR/search-service"
    # Use venv if present, else fallback to system python
    if [ -d "venv" ]; then
      source venv/bin/activate 2>/dev/null || true
    elif [ -d ".venv" ]; then
      source .venv/bin/activate 2>/dev/null || true
    else
      pip install -r requirements.txt -q 2>/dev/null || true
    fi
    DATABASE_URL="postgresql://taskforge:taskforge_secret@localhost:5432/taskforge_search" \
    JWKS_URL="$JWKS_LOCAL" \
    EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2" \
    uvicorn main:app --reload --host 0.0.0.0 --port 8000 2>&1
  ) > "$LOGS_DIR/search-service.log" 2>&1 &
  DEV_PIDS+=($!)
  info "search-service PID=$!  →  logs: .dev-logs/search-service.log"
  echo ""

  # ── 5. gateway (NestJS --watch) ────────────────────────────────
  step "Starting gateway  [NestJS --watch]..."
  (
    cd "$SCRIPT_DIR/gateway"
    [ ! -d node_modules ] && npm install -q
    AUTH_SERVICE_URL="http://localhost:8080" \
    CORE_SERVICE_URL="http://localhost:8081" \
    SEARCH_SERVICE_URL="http://localhost:8000" \
    REDIS_URL="redis://localhost:6379" \
    JWKS_URL="$JWKS_LOCAL" \
    PORT="4000" \
    npm run start:dev 2>&1
  ) > "$LOGS_DIR/gateway.log" 2>&1 &
  DEV_PIDS+=($!)
  info "gateway       PID=$!  →  logs: .dev-logs/gateway.log"
  echo ""

  # ── 6. frontend (Vite HMR) ─────────────────────────────────────
  step "Starting frontend  [Vite HMR]..."
  (
    cd "$SCRIPT_DIR/frontend"
    [ ! -d node_modules ] && npm install --legacy-peer-deps -q
    VITE_GRAPHQL_URL="http://localhost:4000/graphql" \
    npm run dev -- --port 3000 --host 2>&1
  ) > "$LOGS_DIR/frontend.log" 2>&1 &
  DEV_PIDS+=($!)
  info "frontend      PID=$!  →  logs: .dev-logs/frontend.log"

  divider
  echo ""
  echo -e "  ${BOLD}🌐 Frontend:${NC}    ${CYAN}http://localhost:3000${NC}  ${DIM}(Vite HMR — instant on save)${NC}"
  echo -e "  ${BOLD}📊 GraphQL:${NC}     ${CYAN}http://localhost:4000/graphql${NC}  ${DIM}(NestJS --watch)${NC}"
  echo -e "  ${BOLD}🔑 Auth API:${NC}    ${CYAN}http://localhost:8080${NC}  ${DIM}(Spring Boot)${NC}"
  echo -e "  ${BOLD}⚙️  Core API:${NC}    ${CYAN}http://localhost:8081${NC}  ${DIM}(Go)${NC}"
  echo -e "  ${BOLD}🔍 Search API:${NC}  ${CYAN}http://localhost:8000${NC}  ${DIM}(FastAPI --reload)${NC}"
  echo ""
  echo -e "  ${BOLD}📋 Logs:${NC}        ${DIM}.dev-logs/<service>.log${NC}"
  echo -e "  ${DIM}Demo login: alice@example.com / password123${NC}"
  echo ""
  echo -e "  ${DIM}Press Ctrl+C to stop all services.${NC}"
  divider
  echo ""

  # Keep script alive until Ctrl+C
  wait
}

cmd_restart() {
  banner
  step "Restarting TaskForge..."
  divider

  local SERVICE="$1"
  if [ -n "$SERVICE" ]; then
    info "Restarting service: ${BOLD}$SERVICE${NC}"
    $DC restart "$SERVICE"
    success "$SERVICE restarted."
  else
    $DC restart
    success "All services restarted."
  fi
  echo ""
}

cmd_clear() {
  banner
  step "Clearing TaskForge (full reset)..."
  divider

  warn "This will destroy all data, containers, images, and volumes."
  echo ""
  read -p "  Are you sure? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    info "Aborted."
    echo ""
    return
  fi

  echo ""
  info "Stopping all containers..."
  $DC down -v --remove-orphans 2>/dev/null || true

  info "Removing built images..."
  local images=$($DC config --images 2>/dev/null || echo "")
  if [ -n "$images" ]; then
    echo "$images" | while read img; do
      docker rmi "$img" 2>/dev/null && info "  Removed image: $img" || true
    done
  fi

  info "Pruning dangling images..."
  docker image prune -f --filter "label=com.docker.compose.project" 2>/dev/null || true

  info "Removing volume data..."
  docker volume rm "$(basename $SCRIPT_DIR)_pgdata" 2>/dev/null || true

  success "Full reset complete. Run ${BOLD}./taskforge.sh start --build --seed${NC} to rebuild."
  echo ""
}

cmd_migrate() {
  banner
  step "Running database migrations..."
  divider

  # Check if postgres is running
  if ! $DC ps postgres 2>/dev/null | grep -q "running\|Up"; then
    error "PostgreSQL is not running. Start it first with ${BOLD}./taskforge.sh start${NC}"
    echo ""
    return 1
  fi

  local DB_HOST="localhost"
  local DB_PORT="5432"
  local DB_USER="taskforge"
  local DB_PASS="taskforge_secret"

  # ── auth-service (JPA auto-migrates on startup, just restart) ──
  step "auth-service (JPA auto-migration)"
  info "JPA/Hibernate auto-creates tables on startup. Restarting..."
  $DC restart auth-service 2>/dev/null
  success "auth-service migrations applied (via JPA hibernate.ddl-auto=update)"
  divider

  # ── core-service (Go auto-migrates on startup) ──
  step "core-service (Go auto-migration)"
  info "Core-service runs CREATE TABLE IF NOT EXISTS on startup. Restarting..."
  $DC restart core-service 2>/dev/null
  success "core-service migrations applied"
  divider

  # ── search-service (Python auto-migrates on startup) ──
  step "search-service (Python auto-migration)"
  info "Search-service creates tables + pgvector indexes on startup. Restarting..."
  $DC restart search-service 2>/dev/null
  success "search-service migrations applied"
  divider

  # ── Manual SQL (for ad-hoc migrations) ──
  step "Manual migration check"
  echo ""
  echo -e "  ${DIM}To run custom SQL against each database:${NC}"
  echo ""
  echo -e "  ${CYAN}# auth database${NC}"
  echo -e "  $DC exec postgres psql -U $DB_USER -d taskforge_auth"
  echo ""
  echo -e "  ${CYAN}# core database${NC}"
  echo -e "  $DC exec postgres psql -U $DB_USER -d taskforge_core"
  echo ""
  echo -e "  ${CYAN}# search database${NC}"
  echo -e "  $DC exec postgres psql -U $DB_USER -d taskforge_search"
  echo ""

  success "All migrations complete."
  echo ""
}

cmd_seed() {
  step "Seeding demo data..."
  divider

  if [ ! -f "$SCRIPT_DIR/infra/seed.sh" ]; then
    error "Seed script not found at infra/seed.sh"
    return 1
  fi

  bash "$SCRIPT_DIR/infra/seed.sh"
  echo ""
}

cmd_logs() {
  local SERVICE="$1"
  local FOLLOW="${2:---tail=100}"

  if [ -n "$SERVICE" ]; then
    case "$SERVICE" in
      -f|--follow)
        # ./taskforge.sh logs -f [service]
        SERVICE="$2"
        if [ -n "$SERVICE" ]; then
          $DC logs -f "$SERVICE"
        else
          $DC logs -f
        fi
        ;;
      --all)
        $DC logs --tail=200
        ;;
      auth|auth-service)
        $DC logs --tail=100 auth-service
        ;;
      core|core-service)
        $DC logs --tail=100 core-service
        ;;
      search|search-service)
        $DC logs --tail=100 search-service
        ;;
      gateway)
        $DC logs --tail=100 gateway
        ;;
      frontend)
        $DC logs --tail=100 frontend
        ;;
      postgres|db)
        $DC logs --tail=100 postgres
        ;;
      redis)
        $DC logs --tail=100 redis
        ;;
      *)
        $DC logs --tail=100 "$SERVICE"
        ;;
    esac
  else
    # Interactive log viewer
    banner
    step "Log Viewer"
    divider
    echo ""
    echo -e "  ${BOLD}Select a service to view logs:${NC}"
    echo ""
    echo -e "  ${CYAN}1${NC})  All services"
    echo -e "  ${CYAN}2${NC})  auth-service     ${DIM}(Java / Spring Boot)${NC}"
    echo -e "  ${CYAN}3${NC})  core-service     ${DIM}(Go / Kai)${NC}"
    echo -e "  ${CYAN}4${NC})  search-service   ${DIM}(Python / FastAPI)${NC}"
    echo -e "  ${CYAN}5${NC})  gateway          ${DIM}(TypeScript / NestJS)${NC}"
    echo -e "  ${CYAN}6${NC})  frontend         ${DIM}(Vite / React)${NC}"
    echo -e "  ${CYAN}7${NC})  postgres         ${DIM}(PostgreSQL)${NC}"
    echo -e "  ${CYAN}8${NC})  redis            ${DIM}(Redis)${NC}"
    echo ""
    echo -e "  ${DIM}Press Ctrl+C to stop following logs${NC}"
    echo ""
    read -p "  Choice [1-8]: " choice

    case "$choice" in
      1) $DC logs -f --tail=50 ;;
      2) $DC logs -f --tail=100 auth-service ;;
      3) $DC logs -f --tail=100 core-service ;;
      4) $DC logs -f --tail=100 search-service ;;
      5) $DC logs -f --tail=100 gateway ;;
      6) $DC logs -f --tail=100 frontend ;;
      7) $DC logs -f --tail=100 postgres ;;
      8) $DC logs -f --tail=100 redis ;;
      *) error "Invalid choice"; return 1 ;;
    esac
  fi
}

cmd_status() {
  banner
  step "Service Status"
  divider
  echo ""

  # Table header
  printf "  ${BOLD}%-18s %-12s %-10s %-8s${NC}\n" "SERVICE" "STATUS" "PORT" "HEALTH"
  printf "  ${DIM}%-18s %-12s %-10s %-8s${NC}\n" "──────────────────" "────────────" "──────────" "────────"

  # Check each service
  local services=("postgres:5432" "redis:6379" "auth-service:8080" "core-service:8081" "search-service:8000" "gateway:4000" "frontend:3000")
  local health_urls=("" "" "http://localhost:8080/.well-known/jwks.json" "http://localhost:8081/health" "http://localhost:8000/health" "http://localhost:4000/health" "http://localhost:3000")

  for i in "${!services[@]}"; do
    IFS=':' read -r svc port <<< "${services[$i]}"
    health_url="${health_urls[$i]}"

    # Check if container is running
    local status=$($DC ps --format json "$svc" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','unknown'))" 2>/dev/null || echo "stopped")

    if [ "$status" = "running" ]; then
      local status_display="${GREEN}running${NC}"

      # Check health
      if [ -n "$health_url" ]; then
        if curl -sf "$health_url" > /dev/null 2>&1; then
          local health="${GREEN}✓${NC}"
        else
          local health="${YELLOW}?${NC}"
        fi
      else
        # For postgres/redis, check if port responds
        if nc -z localhost "$port" 2>/dev/null; then
          local health="${GREEN}✓${NC}"
        else
          local health="${YELLOW}?${NC}"
        fi
      fi
    else
      local status_display="${RED}stopped${NC}"
      local health="${RED}✗${NC}"
    fi

    printf "  %-18s %-22b %-10s %-18b\n" "$svc" "$status_display" ":$port" "$health"
  done

  echo ""
  divider

  # Show resource usage
  step "Resource Usage"
  echo ""
  docker stats --no-stream --format "  {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -10 || info "No running containers"
  echo ""
}

cmd_db() {
  local DB_NAME="$1"

  case "$DB_NAME" in
    auth)
      info "Connecting to ${BOLD}taskforge_auth${NC} database..."
      $DC exec postgres psql -U taskforge -d taskforge_auth
      ;;
    core)
      info "Connecting to ${BOLD}taskforge_core${NC} database..."
      $DC exec postgres psql -U taskforge -d taskforge_core
      ;;
    search)
      info "Connecting to ${BOLD}taskforge_search${NC} database..."
      $DC exec postgres psql -U taskforge -d taskforge_search
      ;;
    *)
      banner
      step "Database Shell"
      divider
      echo ""
      echo -e "  ${BOLD}Usage:${NC} ./taskforge.sh db <database>"
      echo ""
      echo -e "  ${CYAN}auth${NC}      Connect to taskforge_auth"
      echo -e "  ${CYAN}core${NC}      Connect to taskforge_core"
      echo -e "  ${CYAN}search${NC}    Connect to taskforge_search"
      echo ""
      echo -e "  ${DIM}Example: ./taskforge.sh db core${NC}"
      echo ""
      ;;
  esac
}

cmd_help() {
  banner
  echo -e "  ${BOLD}Usage:${NC} ./taskforge.sh ${CYAN}<command>${NC} [options]"
  echo ""
  echo -e "  ${BOLD}Lifecycle:${NC}"
  echo -e "    ${CYAN}start${NC}    [--build] [--seed] [--attach]   Start all services (fully Dockerized)"
  echo -e "    ${CYAN}dev${NC}      [--build]                       All services in Docker + Vite HMR (no rebuild)"
  echo -e "    ${CYAN}stop${NC}                                     Stop all services"
  echo -e "    ${CYAN}restart${NC}  [service]                       Restart all or one service"
  echo -e "    ${CYAN}clear${NC}                                    Full reset (containers + volumes + images)"
  echo ""
  echo -e "  ${BOLD}Database:${NC}"
  echo -e "    ${CYAN}migrate${NC}                                  Restart services to re-run auto-migrations"
  echo -e "    ${CYAN}seed${NC}                                     Populate demo data"
  echo -e "    ${CYAN}db${NC}       <auth|core|search>              Open psql shell to a database"
  echo ""
  echo -e "  ${BOLD}Monitoring:${NC}"
  echo -e "    ${CYAN}logs${NC}     [service]                       Interactive log viewer"
  echo -e "    ${CYAN}logs${NC}     -f [service]                    Follow logs in real-time"
  echo -e "    ${CYAN}status${NC}                                   Show service health + resource usage"
  echo ""
  echo -e "  ${BOLD}Services:${NC}  auth, core, search, gateway, frontend, postgres, redis"
  echo ""
  echo -e "  ${BOLD}Examples:${NC}"
  echo -e "    ${DIM}./taskforge.sh start --build --seed     # First-time setup (fully Dockerized)${NC}"
  echo -e "    ${DIM}./taskforge.sh dev                      # Dev mode: HMR frontend + Docker backends${NC}"
  echo -e "    ${DIM}./taskforge.sh dev --build              # Same, but rebuild backend images first${NC}"
  echo -e "    ${DIM}./taskforge.sh logs -f core             # Follow core-service logs${NC}"
  echo -e "    ${DIM}./taskforge.sh restart auth-service      # Restart auth only${NC}"
  echo -e "    ${DIM}./taskforge.sh db core                   # Open psql to core DB${NC}"
  echo -e "    ${DIM}./taskforge.sh clear                     # Full nuke + reset${NC}"
  echo ""
}

# ── Entrypoint ──────────────────────────────────────────────────

COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  start)    cmd_start "$@" ;;
  dev)      cmd_dev "$@" ;;
  stop)     cmd_stop "$@" ;;
  restart)  cmd_restart "$@" ;;
  clear)    cmd_clear ;;
  nuke)     cmd_clear ;;
  migrate)  cmd_migrate ;;
  seed)     cmd_seed ;;
  logs)     cmd_logs "$@" ;;
  log)      cmd_logs "$@" ;;
  status)   cmd_status ;;
  ps)       cmd_status ;;
  db)       cmd_db "$@" ;;
  psql)     cmd_db "$@" ;;
  help)     cmd_help ;;
  -h)       cmd_help ;;
  --help)   cmd_help ;;
  *)
    error "Unknown command: $COMMAND"
    cmd_help
    exit 1
    ;;
esac
