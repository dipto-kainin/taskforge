# TaskForge

> **A production-deployed, polyglot microservice project management platform** — built from scratch to demonstrate full-stack system design across distributed backend services, a GraphQL API gateway, real-time WebSocket subscriptions, JWT zero-trust auth, and a premium React frontend deployed on the cloud.

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-taskforge.vercel.app-6366f1?style=for-the-badge)]([https://taskforge.vercel.app](https://taskforge-rust.vercel.app/))
[![Auth Service](https://img.shields.io/badge/Auth_Service-onrender.com-22c55e?style=for-the-badge)](https://taskforge-x0w1.onrender.com/.well-known/jwks.json)
[![Core Service](https://img.shields.io/badge/Core_Service-onrender.com-22c55e?style=for-the-badge)](https://taskforge-core.onrender.com/health)
[![Gateway](https://img.shields.io/badge/GraphQL_Gateway-onrender.com-22c55e?style=for-the-badge)](https://taskforge-gateway.onrender.com/graphql)

---

## What Is This?

TaskForge is a **Jira/Linear-style project management platform** built with an intentionally polyglot microservice architecture. Each service is written in a different language to demonstrate the ability to design, build, and integrate heterogeneous systems — a real-world backend engineering skill.

Every service is **independently containerized, individually deployed**, and communicates through well-defined API contracts without sharing databases or secrets. Authentication uses **RS256 asymmetric JWT** with a public JWKS endpoint, so each service can verify tokens without calling the auth service.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                  │
│            React + Vite + TanStack Router            │
│                 GraphQL Client (fetch)               │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS GraphQL
                         ▼
┌─────────────────────────────────────────────────────┐
│              Render — Gateway Service               │
│           TypeScript / NestJS / GraphQL              │
│    • Aggregates all services into one GraphQL API    │
│    • JWT validation via JWKS (zero shared secrets)   │
│    • Redis pub/sub → WebSocket real-time push        │
│    • Graceful degradation (search optional)          │
└──────────┬─────────────────────────┬────────────────┘
           │ REST                    │ REST
           ▼                         ▼
┌──────────────────┐     ┌──────────────────────────┐
│  Render — Auth   │     │   Render — Core Service  │
│  Java 21 /       │     │   Go + Kai Framework     │
│  Spring Boot 3   │     │                          │
│                  │     │ • Projects, Issues,       │
│ • RS256 JWT sign │     │   Comments, Boards,       │
│ • JWKS endpoint  │     │   Columns (CRUD)          │
│ • Refresh tokens │     │ • JWKS token validation   │
│ • Org + RBAC     │     │ • PostgreSQL via lib/pq   │
│ • HikariCP pool  │     │ • Async search indexing   │
└──────────────────┘     └──────────────────────────┘
           │                         │
           └─────────┬───────────────┘
                     ▼
         ┌───────────────────────┐     ┌───────────────┐
         │  Supabase PostgreSQL  │     │ Upstash Redis │
         │  • taskforge_auth     │     │ • Pub/Sub     │
         │  • core (schema)      │     │ • TLS / cloud │
         └───────────────────────┘     └───────────────┘
```

---

## Tech Stack at a Glance

| Service | Language & Framework | Key Design Decisions |
|:---|:---|:---|
| **Frontend** | TypeScript · React · Vite · TanStack Router | File-based routing, optimistic updates, skeleton loaders, live service health widget |
| **Gateway** | TypeScript · NestJS · GraphQL (code-first) | Single GraphQL endpoint aggregating 3 backends; JWT JWKS middleware; Redis WebSocket pub/sub; graceful search degradation |
| **Auth Service** | Java 21 · Spring Boot 3 · Spring Security | RS256 asymmetric JWT signing; JWKS public key endpoint; HikariCP connection pooling for Supabase free-tier limits |
| **Core Service** | Go · [Kai Framework](https://github.com/dipto-kainin/kai) | Custom HTTP framework extended with PATCH routing and JWKS middleware; PostgreSQL; async search indexing goroutines |
| **Search Service** | Python · FastAPI · pgvector | Semantic search via `sentence-transformers`; AI duplicate detection and label suggestions (deferred — on-hold) |
| **Database** | PostgreSQL (Supabase) | Logical schema isolation per service; transaction-mode pooler for connection limits |
| **Cache / Pub-Sub** | Redis (Upstash) | TLS-secured cloud Redis; pub/sub for real-time WebSocket event fanout |

---

## Key Engineering Highlights

### 🔐 Zero-Trust Cross-Service Authentication
Auth-service signs JWTs with an RS256 private key and exposes the public key at `/.well-known/jwks.json`. Every downstream service (gateway, core-service) independently fetches and caches the public key to verify tokens — **no shared secrets, no inter-service auth calls on each request**.

### 🏗️ Polyglot Microservices with Shared Contracts
Four backend services in four different languages (Java, Go, Python, TypeScript) communicate through REST and GraphQL with well-defined JSON contracts. The gateway resolves all GraphQL types to individual service calls, giving the frontend a single typed API.

### ⚡ Real-Time WebSocket Updates
When a user moves a Kanban card or posts a comment, `core-service` fires an HTTP notification to the gateway, which publishes an event to Redis pub/sub. All connected gateway instances fan the event out to subscribed WebSocket clients — enabling real-time board sync across browser tabs.

### 🧩 Custom Go HTTP Framework
`core-service` is built on [Kai](https://github.com/dipto-kainin/kai) — a custom HTTP micro-framework for Go that was extended for this project to add PATCH routing support, JWKS token verification middleware, and JSON error handling.

### 🎨 Optimistic UI + Skeleton Loaders
The frontend uses optimistic updates — Kanban drag-and-drop and form submissions reflect immediately in the UI while the GraphQL mutation runs in the background. Animated skeleton loaders with `animate-pulse` provide high-contrast loading states matching the app's neo-brutalist design.

### 🌐 Cloud-Native Free-Tier Deployment
All services deployed and configured for production cloud constraints:
- **HikariCP** pool size limited to 3 connections for Supabase's 15-connection session-mode limit
- **Transaction pooler** (port 6543) with `prepareThreshold=0` for Supabase compatibility
- **JVM heap** capped at `-Xmx256m` to stay within Render's 512 MB free-tier instance limit
- **Upstash Redis** with `rediss://` TLS connection for secure cloud pub/sub

### 🛡️ Graceful Degradation
Gateway search methods return empty arrays when `SEARCH_SERVICE_URL` is unset — the entire search/AI layer can be toggled on or off via a single environment variable without any code changes or service restarts.

### 🩺 Live Service Health Widget
The login page features a live multi-service health widget that polls `GET /api/status` (a deep health endpoint that checks auth-service and core-service reachability in parallel). The Submit button stays disabled until all critical services report `ok` — preventing 502 errors on Render's cold-start wake-up.

---

## Features

### Auth & Access Control
- ✅ User registration & login — email/password with RS256 JWT
- ✅ JWT access tokens (15 min) + refresh tokens (7 days)
- ✅ Organization creation and slug-based routing
- ✅ Role-Based Access Control (RBAC): Owner / Admin / Member
- ✅ Org member invite by email, role management, member removal

### Project & Issue Management
- ✅ Project creation with auto-generated Kanban board and default columns
- ✅ Full issue lifecycle: create, update title/description/status/priority, move, delete
- ✅ Assignee picker with real org member data
- ✅ Issue comments with real-time delivery
- ✅ Backlog view with filtering and priority sorting
- ✅ "My Assigned" cross-project view

### Kanban Board
- ✅ Drag-and-drop cards between columns (`@dnd-kit`)
- ✅ Optimistic updates — instant UI response, background persistence
- ✅ Real-time WebSocket sync — card moves appear in other browser tabs

### Frontend UX
- ✅ Neo-brutalist design system with `Space Grotesk` + `Archivo Black` typography
- ✅ Animated skeleton loaders on all data-loading pages (header, KPI cards, issue lists)
- ✅ Service health status widget on login page with per-service status indicators
- ✅ Login guard — login form disabled until all backend services are ready (Render cold-start aware)
- ✅ Dark-mode ready color tokens

### AI / Search (On-Hold — Search Service Deferred)
- 🔄 Semantic issue search via `sentence-transformers` + `pgvector`
- 🔄 AI duplicate detection with cosine similarity threshold
- 🔄 AI label suggestions from issue content
- 🔄 Comment thread summarization

---

## Project Structure

```
taskforge/
├── auth-service/               # Java 21 · Spring Boot 3
│   ├── src/main/java/          # Controllers, services, JWT provider
│   ├── src/main/resources/     # application.yml (Hikari pool config)
│   └── Dockerfile              # Multi-stage: Maven build → JRE runtime
│
├── core-service/               # Go · Kai framework
│   ├── cmd/main.go             # Entry point
│   ├── internal/handlers/      # HTTP route handlers
│   └── Dockerfile              # Multi-stage: golang:alpine → alpine
│
├── search-service/             # Python · FastAPI (deferred)
│   ├── main.py
│   └── Dockerfile
│
├── gateway/                    # TypeScript · NestJS · GraphQL
│   ├── src/resolvers/          # GraphQL resolvers per domain
│   ├── src/services/           # Proxy service, pub/sub service
│   ├── src/health.controller.ts # Deep /api/status endpoint
│   └── Dockerfile
│
├── frontend/                   # React · Vite · TanStack Router
│   ├── src/routes/             # File-based page routes
│   ├── src/lib/tracker/        # Global state store (TrackerContext)
│   ├── src/lib/graphql-client.ts # Typed fetch client with token refresh
│   └── src/components/tracker/ # UI components + service health widget
│
├── docker-compose.yml          # Local dev orchestration (all services)
├── docker-compose.dev.yml      # Dev overrides
└── taskforge.sh                # Dev CLI: health checks, logs, restart
```

---

## Running Locally

### Prerequisites
- Docker & Docker Compose
- ~4 GB RAM available for all containers

### Start All Services

```bash
git clone https://github.com/dipto-kainin/taskforge
cd taskforge
cp .env.example .env   # Fill in your DB credentials

docker compose up --build -d
./taskforge.sh health  # Wait for all services to be healthy
```

Then open **http://localhost:3000**

### Individual Service Commands

```bash
# Auth service only
docker compose up auth-service -d

# Gateway only
docker compose up gateway -d

# View logs
./taskforge.sh logs gateway
./taskforge.sh logs core-service
```

---

## Deployment (Current Production Setup)

| Service | Platform | URL |
|:---|:---|:---|
| Frontend | Vercel | [taskforge.vercel.app](https://taskforge.vercel.app) |
| Gateway | Render (Free) | `taskforge-gateway.onrender.com` |
| Auth Service | Render (Free) | `taskforge-x0w1.onrender.com` |
| Core Service | Render (Free) | `taskforge-core.onrender.com` |
| Database | Supabase (Free) | PostgreSQL — transaction pooler mode |
| Cache | Upstash (Free) | Redis — TLS `rediss://` |

> ⚠️ **Cold Start Note:** Render free-tier services sleep after 15 minutes of inactivity. The login page's live health widget shows wake-up status and automatically unlocks the form once all services report `ok`.

---

## API Reference

### Auth Service (`:8080`)
| Method | Path | Description |
|:---|:---|:---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login — returns `accessToken` + `refreshToken` |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/.well-known/jwks.json` | JWKS public key (RS256) |
| `GET` | `/api/orgs` | List organizations for authenticated user |
| `POST` | `/api/orgs` | Create organization |
| `POST` | `/api/orgs/:id/invite` | Invite user by email |
| `PATCH` | `/api/orgs/:id/members/:userId/role` | Update member role |
| `DELETE` | `/api/orgs/:id/members/:userId` | Remove member |

### Core Service (`:8081`)
| Method | Path | Description |
|:---|:---|:---|
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/orgs/:orgId/projects` | List projects in org |
| `GET` | `/api/projects/:id/board` | Board with columns + issues |
| `POST` | `/api/issues` | Create issue |
| `PATCH` | `/api/issues/:id` | Update issue fields |
| `DELETE` | `/api/issues/:id` | Delete issue |
| `POST` | `/api/issues/:id/comments` | Post a comment |
| `GET` | `/health` | Service health check |

### Gateway (`:4000`)
| Endpoint | Protocol | Description |
|:---|:---|:---|
| `/graphql` | HTTP POST | GraphQL API — all queries and mutations |
| `/graphql` | WebSocket | GraphQL subscriptions (real-time) |
| `/api/status` | HTTP GET | Deep multi-service health check |
| `/internal/notify` | HTTP POST | Event notification from core-service |

---

## What I'd Add Next

See [ROADMAP.md](./ROADMAP.md) for the full Phase 2 plan. Top priorities:

1. **Kafka Event Bus** — replace synchronous HTTP event calls with async Kafka topics for true service decoupling
2. **gRPC Internal Transport** — swap REST between services for typed Protocol Buffer contracts
3. **Search Service Re-enable** — Upgrade to a dedicated Qdrant/Weaviate vector DB for production-scale semantic search
4. **OpenTelemetry Tracing** — distributed trace IDs across all four services for cross-service latency debugging
5. **CI/CD + Kubernetes** — GitHub Actions pipelines + Helm charts for production-grade deployment

---

## License

MIT — see [LICENSE](./LICENSE)
