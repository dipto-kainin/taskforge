# TaskForge

A modern, full-stack project management platform (Jira/Linear-style) built with a polyglot microservice architecture. Designed as a portfolio project demonstrating end-to-end system design across four backend languages, a GraphQL gateway, and a premium Next.js frontend with AI-powered features.

![Architecture](https://img.shields.io/badge/architecture-microservices-blue) ![Status](https://img.shields.io/badge/phase-1%20complete-green)

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Gateway    │────▶│  auth-service    │
│  Next.js 14  │     │  NestJS +    │     │  Spring Boot 3   │
│  Port 3000   │     │  GraphQL     │     │  Java 21         │
│              │◀────│  Port 4000   │────▶│  Port 8080       │
│  @dnd-kit    │  WS │              │     │  RS256 JWT/JWKS  │
└──────────────┘     │              │────▶├──────────────────┤
                     │              │     │  core-service    │
                     │              │     │  Go + Kai        │
                     │              │────▶│  Port 8081       │
                     │              │     ├──────────────────┤
                     └──────────────┘     │  search-service  │
                                          │ FastAPI + Python │
                                          │  Port 8000       │
                                          │  pgvector + AI   │
                                          └──────────────────┘
                                                   │
                     ┌──────────────┐     ┌────────┴─────────┐
                     │    Redis     │     │   PostgreSQL     │
                     │  Pub/Sub +   │     │  3 logical DBs   │
                     │  Cache       │     │  + pgvector      │
                     └──────────────┘     └──────────────────┘
```

## Why This Stack

| Service | Language | Why |
|---|---|---|
| **auth-service** | Java 21 / Spring Boot 3 | Spring Security is the gold standard for enterprise auth. RS256 JWKS allows zero-trust token verification across services without shared secrets. |
| **core-service** | Go / Kai Framework | Go's concurrency model is ideal for a high-throughput CRUD service. Kai is my own HTTP framework — extending it for this project (adding PATCH routing, JWKS middleware) demonstrates framework-level Go proficiency. |
| **search-service** | Python / FastAPI | Python has the best ML/AI ecosystem. sentence-transformers runs natively for local semantic search. FastAPI's async support handles concurrent embedding operations efficiently. |
| **gateway** | TypeScript / NestJS | NestJS provides first-class GraphQL + WebSocket support. TypeScript catches schema mismatches at compile time. The gateway is pure aggregation — no business logic. |
| **frontend** | Next.js 14 / TypeScript | App Router, server components, and Tailwind CSS for a premium dark-mode UI. @dnd-kit for accessible drag-and-drop on the Kanban board. |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- ~4GB RAM available for containers

### Run

```bash
# Clone and start all services
git clone <repo-url>
cd taskforge
docker-compose up --build -d

# Wait for all services to be healthy (~60s for first build)
docker-compose ps

# Seed demo data
bash infra/seed.sh

# Open the app
open http://localhost:3000
```

### Demo Credentials
- **alice@example.com** / `password123` (org owner)
- **bob@example.com** / `password123` (org member)

## Features (Phase 1)

### Core
- ✅ User registration & login with RS256 JWT
- ✅ Organization & team management with RBAC
- ✅ Project creation with auto-generated boards & columns
- ✅ Sprint management (planned → active → completed)
- ✅ Full issue lifecycle: create, assign, label, move, comment

### Kanban Board
- ✅ Drag-and-drop issues between columns (@dnd-kit)
- ✅ Optimistic updates — UI updates instantly, persists in background
- ✅ Real-time updates via WebSocket — changes appear in other tabs automatically
- ✅ Color-coded issue types, priorities, and labels

### AI Features (Zero API Keys Required)
- ✅ **Semantic Search** — natural language issue search using sentence-transformers + pgvector
- ✅ **Duplicate Detection** — embedding similarity flags similar existing issues
- ✅ **Label Suggestions** — AI recommends labels based on issue content
- ✅ **Comment Summarization** — extractive summary of comment threads

### Cross-Service Auth
- ✅ RS256 JWT signed by auth-service
- ✅ Public key exposed at `/.well-known/jwks.json`
- ✅ All services verify tokens via JWKS (cached, no shared secrets)

## API Endpoints

### auth-service (:8080)
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/.well-known/jwks.json` | JWKS public key |
| GET/POST | `/api/orgs` | List/create organizations |
| POST | `/api/orgs/:id/invite` | Invite user to org |
| GET | `/api/orgs/:id/members` | List org members |

### core-service (:8081)
| Method | Path | Description |
|---|---|---|
| POST | `/api/projects` | Create project |
| GET | `/api/orgs/:orgId/projects` | List org projects |
| GET | `/api/projects/:id/board` | Get board with columns + issues |
| POST | `/api/issues` | Create issue |
| PATCH | `/api/issues/:id` | Update issue (status, column, etc.) |
| POST | `/api/issues/:id/comments` | Add comment |

### search-service (:8000)
| Method | Path | Description |
|---|---|---|
| POST | `/internal/index` | Index issue embedding |
| GET | `/api/search?q=...` | Semantic search |
| POST | `/api/ai/duplicate-check` | AI duplicate detection |
| POST | `/api/ai/suggest-labels` | AI label suggestions |

### gateway (:4000)
- GraphQL endpoint: `POST /graphql`
- GraphQL Playground: `GET /graphql`
- WebSocket subscriptions: `ws://localhost:4000/graphql`

## Project Structure

```
taskforge/
├── auth-service/          # Java 21 / Spring Boot 3
├── core-service/          # Go / Kai framework
├── search-service/        # Python / FastAPI
├── gateway/               # TypeScript / NestJS + GraphQL
├── frontend/              # Next.js 14 + Tailwind
├── infra/
│   ├── init-databases.sh  # PostgreSQL init script
│   └── seed.sh            # Demo data seeder
├── docker-compose.yml
├── README.md
└── ROADMAP.md
```

## License

MIT
