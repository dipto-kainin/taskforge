#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  TaskForge CLI — Project Management                         ║
# ║  Usage: ./taskforge.sh <command> [options]                  ║
# ╚══════════════════════════════════════════════════════════════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Load .env ────────────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -o allexport
  source "$SCRIPT_DIR/.env"
  set +o allexport
else
  echo "Error: .env file not found. Copy .env.example to .env and fill in PG_PASSWORD."
  exit 1
fi

# Validate required secret
if [ -z "$PG_PASSWORD" ]; then
  echo "Error: PG_PASSWORD is not set in .env. Please fill it in before starting."
  exit 1
fi

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

# ── Build cloud DB connection strings from .env ──────────────────
# auth-service: JDBC (Spring Boot)
AUTH_DB_URL="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${PG_DATABASE}?currentSchema=taskforge_auth&sslmode=require"

# core-service: libpq (Go)
CORE_DB_URL="postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}?search_path=core&sslmode=require"

# external-services platform: asyncpg (Python)
SEARCH_DB_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}?sslmode=require"

# ── Commands ────────────────────────────────────────────────────

cmd_start() {
  banner
  step "Starting TaskForge (fully Dockerized)..."
  divider

  local BUILD_FLAG=""
  local DETACH="-d"

  while [[ $# -gt 0 ]]; do
    case $1 in
      --build)   BUILD_FLAG="--build"; shift ;;
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

    printf "  ${DIM}Waiting for auth-service...${NC}"
    if wait_for_health "auth-service" "http://localhost:8080/.well-known/jwks.json" 90; then
      printf "\r"; success "auth-service          ${GREEN}healthy${NC}"
    else
      printf "\r"; error "auth-service          ${RED}timeout${NC}"; services_ok=false
    fi

    printf "  ${DIM}Waiting for core-service...${NC}"
    if wait_for_health "core-service" "http://localhost:8081/health" 30; then
      printf "\r"; success "core-service          ${GREEN}healthy${NC}"
    else
      printf "\r"; error "core-service          ${RED}timeout${NC}"; services_ok=false
    fi

    printf "  ${DIM}Waiting for services platform...${NC}"
    if wait_for_health "external-services" "http://localhost:8000/health" 60; then
      printf "\r"; success "external-services     ${GREEN}healthy${NC}"
    else
      printf "\r"; error "external-services     ${RED}timeout${NC}"; services_ok=false
    fi

    printf "  ${DIM}Waiting for gateway...${NC}"
    if wait_for_health "gateway" "http://localhost:4000/health" 30; then
      printf "\r"; success "gateway               ${GREEN}healthy${NC}"
    else
      printf "\r"; error "gateway               ${RED}timeout${NC}"; services_ok=false
    fi

    divider

    if $services_ok; then
      success "All services are healthy!"
    else
      warn "Some services failed to start. Run ${BOLD}./taskforge.sh logs${NC} to investigate."
    fi

    divider
    echo ""
    echo -e "  ${BOLD}📊 GraphQL:${NC}     ${CYAN}http://localhost:4000/graphql${NC}"
    echo -e "  ${BOLD}🔑 Auth API:${NC}    ${CYAN}http://localhost:8080${NC}"
    echo -e "  ${BOLD}⚙️  Core API:${NC}    ${CYAN}http://localhost:8081${NC}"
    echo -e "  ${BOLD}🔍 Search API:${NC}  ${CYAN}http://localhost:8000${NC}"
    echo -e "  ${BOLD}☁️  Database:${NC}    ${DIM}Supabase (${PG_HOST})${NC}"
    echo -e "  ${BOLD}🌐 Frontend:${NC}    ${DIM}Deployed on Vercel (set VITE_GRAPHQL_URL to gateway URL)${NC}"
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
  step "Starting TaskForge in DEV mode (hot-reload)..."
  divider
  echo ""
  info "Redis + auth-service   →  Docker"
  info "core / search / gateway / frontend  →  native (hot-reload)"
  info "Database  →  Supabase cloud (${PG_HOST})"
  echo ""

  # Ensure non-docker native service ports are clear
  $DC stop core-service external-services gateway frontend 2>/dev/null || true
  fuser -k 8081/tcp 8000/tcp 4000/tcp 3000/tcp 2>/dev/null || true

  # ── 1. Start redis + auth-service in Docker ────────────────────
  step "Starting Redis + auth-service [Docker]..."
  $DC up -d redis auth-service
  echo ""

  printf "  ${DIM}Waiting for redis...${NC}"
  local elapsed=0
  while [ $elapsed -lt 15 ]; do
    if $DC exec -T redis redis-cli ping > /dev/null 2>&1; then break; fi
    sleep 1; elapsed=$((elapsed+1))
  done
  printf "\r"; success "redis                 ${GREEN}ready${NC}"

  printf "  ${DIM}Waiting for auth-service (Spring Boot)...${NC}"
  if wait_for_health "auth-service" "http://localhost:8080/.well-known/jwks.json" 120; then
    printf "\r"; success "auth-service          ${GREEN}healthy${NC} ${DIM}(Spring Boot)${NC}"
  else
    printf "\r"; warn "auth-service still starting — check: ./taskforge.sh logs auth"
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

  local JWKS_LOCAL="http://localhost:8080/.well-known/jwks.json"
  local LOGS_DIR="$SCRIPT_DIR/.dev-logs"
  mkdir -p "$LOGS_DIR"

  # ── 2. core-service (Go — air or go run) ───────────────────────
  step "Starting core-service  [Go]..."
  (
    cd "$SCRIPT_DIR/core-service"
    DATABASE_URL="$CORE_DB_URL" \
    JWKS_URL="$JWKS_LOCAL" \
    AUTH_SERVICE_URL="http://localhost:8080" \
    EXTERNAL_SERVICES_URL="http://localhost:8000" \
    GATEWAY_NOTIFY_URL="http://localhost:4000/internal/notify" \
    PORT="8081" \
    go run ./cmd/main.go 2>&1
  ) > "$LOGS_DIR/core-service.log" 2>&1 &
  DEV_PIDS+=($!)
  info "core-service  PID=$!  →  logs: .dev-logs/core-service.log"
  echo ""

  # ── 3. external-services platform (Python / FastAPI --reload) ───────────
  step "Starting external-services platform  [Python / FastAPI --reload]..."
  (
    cd "$SCRIPT_DIR/external-services"
    if [ -d "venv" ]; then
      source venv/bin/activate 2>/dev/null || true
    elif [ -d ".venv" ]; then
      source .venv/bin/activate 2>/dev/null || true
    fi
    if ! command -v uvicorn &>/dev/null && ! python3 -m uvicorn --version &>/dev/null; then
      echo "ERROR: uvicorn is not installed in external-services. Please set up the venv:"
      echo "  cd external-services"
      echo "  python3 -m venv venv"
      echo "  source venv/bin/activate"
      echo "  pip install -r requirements.txt"
      exit 1
    fi
    DATABASE_URL="$SEARCH_DB_URL" \
    JWKS_URL="$JWKS_LOCAL" \

    SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}" \
    SMTP_PORT="${SMTP_PORT:-587}" \
    SMTP_USER="${SMTP_USER:-}" \
    SMTP_PASSWORD="${SMTP_PASSWORD:-}" \
    FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}" \
    SECRET_KEY="${SECRET_KEY:-}" \
    CORE_SERVICE_URL="http://localhost:8081" \
    AUTO_MIGRATE=false \
    python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1
  ) > "$LOGS_DIR/external-services.log" 2>&1 &
  DEV_PIDS+=($!)
  info "external-services PID=$!  →  logs: .dev-logs/external-services.log"
  echo ""

  # ── 4. gateway (NestJS --watch) ────────────────────────────────
  step "Starting gateway  [NestJS --watch]..."
  (
    cd "$SCRIPT_DIR/gateway"
    [ ! -d node_modules ] && npm install -q
    AUTH_SERVICE_URL="http://localhost:8080" \
    CORE_SERVICE_URL="http://localhost:8081" \
    EXTERNAL_SERVICES_URL="http://localhost:8000" \
    REDIS_URL="${REDIS_URL:-redis://localhost:6379}" \
    JWKS_URL="$JWKS_LOCAL" \
    PORT="4000" \
    npm run start:dev 2>&1
  ) > "$LOGS_DIR/gateway.log" 2>&1 &
  DEV_PIDS+=($!)
  info "gateway       PID=$!  →  logs: .dev-logs/gateway.log"
  echo ""

  # ── 5. frontend (Vite HMR) ─────────────────────────────────────
  step "Starting frontend  [Vite HMR — instant on save]..."
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
  echo -e "  ${BOLD}🔑 Auth API:${NC}    ${CYAN}http://localhost:8080${NC}  ${DIM}(Spring Boot / Docker)${NC}"
  echo -e "  ${BOLD}⚙️  Core API:${NC}    ${CYAN}http://localhost:8081${NC}  ${DIM}(Go)${NC}"
  echo -e "  ${BOLD}🔍 Services API:${NC} ${CYAN}http://localhost:8000${NC}  ${DIM}(FastAPI --reload)${NC}"
  echo -e "  ${BOLD}☁️  Database:${NC}    ${DIM}Supabase cloud (schemas: auth / core / search)${NC}"
  echo ""
  echo -e "  ${BOLD}📋 Logs:${NC}        ${DIM}.dev-logs/<service>.log${NC}  or  ${CYAN}./taskforge.sh logs -f <service>${NC}"
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

  warn "This will destroy all containers and images (cloud DB data is NOT affected)."
  echo ""
  read -p "  Are you sure? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    info "Aborted."
    echo ""
    return
  fi

  echo ""
  info "Stopping all containers..."
  $DC down --remove-orphans 2>/dev/null || true

  info "Removing built images..."
  local images=$($DC config --images 2>/dev/null || echo "")
  if [ -n "$images" ]; then
    echo "$images" | while read img; do
      docker rmi "$img" 2>/dev/null && info "  Removed image: $img" || true
    done
  fi

  info "Pruning dangling images..."
  docker image prune -f 2>/dev/null || true

  success "Reset complete. Run ${BOLD}./taskforge.sh start --build${NC} to rebuild."
  echo ""
}

cmd_migrate() {
  local TARGET="${1:-all}"

  _migrate_auth() {
    step "auth-service  [JPA / Hibernate DDL]"
    info "Running auth-service migrations on database..."
    HIBERNATE_DDL_AUTO=update SPRING_SQL_INIT_MODE=always $DC exec -T auth-service java -jar app.jar --spring.jpa.hibernate.ddl-auto=update --spring.sql.init.mode=always 2>/dev/null || \
    HIBERNATE_DDL_AUTO=update SPRING_SQL_INIT_MODE=always $DC restart auth-service 2>/dev/null
    success "auth-service migrations applied"
    divider
  }

  _migrate_core() {
    step "core-service  [Go — CREATE TABLE IF NOT EXISTS]"
    info "Running core-service migrations on database..."
    (
      cd "$SCRIPT_DIR/core-service"
      DATABASE_URL="$CORE_DB_URL" RUN_MIGRATE_ONLY=true go run ./cmd/main.go
    )
    success "core-service migrations applied"
    divider
  }

  _migrate_external_services() {
    step "external-services  [Python — table + pgvector index]"
    info "Running external-services platform migrations on database..."
    (
      cd "$SCRIPT_DIR/external-services"
      if [ -d "venv" ]; then
        source venv/bin/activate 2>/dev/null || true
      elif [ -d ".venv" ]; then
        source .venv/bin/activate 2>/dev/null || true
      fi
      DATABASE_URL="$SEARCH_DB_URL" \
      SECRET_KEY="${SECRET_KEY:-placeholder}" \
      AUTO_MIGRATE=true \
      python3 -c "
import asyncio, sys
sys.path.insert(0, '.')
from app.database import Database
db = Database()
asyncio.run(db.connect())
asyncio.run(db.migrate())
asyncio.run(db.disconnect())
print('Services migrations applied.')
" 2>/dev/null || true
    )
    success "external-services migrations applied"
    divider
  }

  banner
  step "Running migrations  [target: ${TARGET}]"
  divider
  echo ""

  case "$TARGET" in
    auth|auth-service)
      _migrate_auth
      ;;
    core|core-service)
      _migrate_core
      ;;
    search|search-service|external-services)
      _migrate_external_services
      ;;
    all)
      _migrate_auth
      _migrate_core
      _migrate_external_services
      ;;
    *)
      error "Unknown target: ${TARGET}"
      echo ""
      echo -e "  ${BOLD}Usage:${NC} ./taskforge.sh migrate [auth|core|search|all]"
      echo ""
      echo -e "  ${CYAN}auth${NC}     Restart auth-service  (Hibernate DDL)"
      echo -e "  ${CYAN}core${NC}     Restart core-service  (Go CREATE TABLE IF NOT EXISTS)"
      echo -e "  ${CYAN}search${NC}   Run services platform migrations (Python + pgvector)"
      echo -e "  ${CYAN}all${NC}      Restart all three      (default)"
      echo ""
      return 1
      ;;
  esac

  success "Migration complete for: ${TARGET}"
  echo ""
}


cmd_logs() {
  local SERVICE="$1"
  local FOLLOW="${2:---tail=100}"

  if [ -n "$SERVICE" ]; then
    case "$SERVICE" in
      -f|--follow)
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
      search|search-service|external-services)
        $DC logs --tail=100 external-services
        ;;
      gateway)
        $DC logs --tail=100 gateway
        ;;
      frontend)
        $DC logs --tail=100 frontend
        ;;
      redis)
        $DC logs --tail=100 redis
        ;;
      *)
        $DC logs --tail=100 "$SERVICE"
        ;;
    esac
  else
    banner
    step "Log Viewer"
    divider
    echo ""
    echo -e "  ${BOLD}Select a service to view logs:${NC}"
    echo ""
    echo -e "  ${CYAN}1${NC})  All services"
    echo -e "  ${CYAN}2${NC})  auth-service     ${DIM}(Java / Spring Boot)${NC}"
    echo -e "  ${CYAN}3${NC})  core-service     ${DIM}(Go)${NC}"
    echo -e "  ${CYAN}4${NC})  external-services ${DIM}(Python / FastAPI)${NC}"
    echo -e "  ${CYAN}5${NC})  gateway          ${DIM}(TypeScript / NestJS)${NC}"
    echo -e "  ${CYAN}6${NC})  frontend         ${DIM}(Vite / React)${NC}"
    echo -e "  ${CYAN}7${NC})  redis            ${DIM}(Redis)${NC}"
    echo ""
    echo -e "  ${DIM}Press Ctrl+C to stop following logs${NC}"
    echo ""
    read -p "  Choice [1-7]: " choice

    case "$choice" in
      1) $DC logs -f --tail=50 ;;
      2) $DC logs -f --tail=100 auth-service ;;
      3) $DC logs -f --tail=100 core-service ;;
      4) $DC logs -f --tail=100 external-services ;;
      5) $DC logs -f --tail=100 gateway ;;
      6) $DC logs -f --tail=100 frontend ;;
      7) $DC logs -f --tail=100 redis ;;
      *) error "Invalid choice"; return 1 ;;
    esac
  fi
}

cmd_status() {
  banner
  step "Service Status"
  divider
  echo ""

  printf "  ${BOLD}%-18s %-12s %-10s %-8s${NC}\n" "SERVICE" "STATUS" "PORT" "HEALTH"
  printf "  ${DIM}%-18s %-12s %-10s %-8s${NC}\n" "──────────────────" "────────────" "──────────" "────────"

  local services=("redis:6379" "auth-service:8080" "core-service:8081" "external-services:8000" "gateway:4000" "frontend:3000")
  local health_urls=("" "http://localhost:8080/.well-known/jwks.json" "http://localhost:8081/health" "http://localhost:8000/health" "http://localhost:4000/health" "http://localhost:3000")

  for i in "${!services[@]}"; do
    IFS=':' read -r svc port <<< "${services[$i]}"
    health_url="${health_urls[$i]}"

    local status=$($DC ps --format json "$svc" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','unknown'))" 2>/dev/null || echo "stopped")

    if [ "$status" = "running" ]; then
      local status_display="${GREEN}running${NC}"
      if [ -n "$health_url" ]; then
        if curl -sf "$health_url" > /dev/null 2>&1; then
          local health="${GREEN}✓${NC}"
        else
          local health="${YELLOW}?${NC}"
        fi
      else
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
  step "Resource Usage"
  echo ""
  docker stats --no-stream --format "  {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -10 || info "No running containers"
  echo ""

  echo ""
  info "[cloud] Database: Supabase -- ${PG_HOST} (schemas: auth / core / search)"
  echo ""
}

cmd_help() {
  banner
  echo -e "  ${BOLD}Usage:${NC} ./taskforge.sh ${CYAN}<command>${NC} [options]"
  echo ""
  echo -e "  ${BOLD}Lifecycle:${NC}"
  echo -e "    ${CYAN}start${NC}    [--build] [--attach]   Start all services (fully Dockerized)"
  echo -e "    ${CYAN}dev${NC}                             Hot-reload: Redis+auth in Docker, rest native"
  echo -e "    ${CYAN}stop${NC}                            Stop all services"
  echo -e "    ${CYAN}restart${NC}  [service]              Restart all or one service"
  echo -e "    ${CYAN}clear${NC}                           Reset containers + images (cloud DB untouched)"
  echo ""
  echo -e "  ${BOLD}Database:${NC}"
  echo -e "    ${CYAN}migrate${NC}                         Restart services to re-run auto-migrations"
  echo ""
  echo -e "  ${BOLD}Monitoring:${NC}"
  echo -e "    ${CYAN}logs${NC}     [service]              Interactive log viewer"
  echo -e "    ${CYAN}logs${NC}     -f [service]           Follow logs in real-time"
  echo -e "    ${CYAN}status${NC}                          Show service health + resource usage"
  echo ""
  echo -e "  ${BOLD}Services:${NC}  auth, core, search, gateway, frontend, redis"
  echo ""
  echo -e "  ${BOLD}Examples:${NC}"
  echo -e "    ${DIM}./taskforge.sh start --build        # First-time full Docker build${NC}"
  echo -e "    ${DIM}./taskforge.sh dev                  # Dev mode: instant hot-reload${NC}"
  echo -e "    ${DIM}./taskforge.sh logs -f core         # Follow core-service logs${NC}"
  echo -e "    ${DIM}./taskforge.sh restart auth-service # Restart auth only${NC}"
  echo -e "    ${DIM}./taskforge.sh clear                # Nuke containers + images${NC}"
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
  logs)     cmd_logs "$@" ;;
  log)      cmd_logs "$@" ;;
  status)   cmd_status ;;
  ps)       cmd_status ;;
  help)     cmd_help ;;
  -h)       cmd_help ;;
  --help)   cmd_help ;;
  *)
    error "Unknown command: $COMMAND"
    cmd_help
    exit 1
    ;;
esac
