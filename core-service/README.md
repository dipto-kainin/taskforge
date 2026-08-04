# core-service

TaskForge's core service, built on [Kai](https://github.com/dipto-kainin/kai) — a lightweight Go HTTP framework.

## Kai Framework Extensions

This project required the following additions to Kai, made as part of the TaskForge build:

### 1. `PATCH` Method Routing
Added `PATCH` support to `Router`, `App`, and `Group` to handle partial updates (issue status changes, sprint state transitions). This mirrors the existing `GET`/`POST`/`PUT`/`DELETE` pattern.

**Files modified:**
- `kai/router.go` — added `Router.PATCH()`
- `kai/app.go` — added `App.PATCH()` and `Group.PATCH()`

### 2. JWKS JWT Verification Middleware
Built a reusable middleware (`internal/middleware/auth.go`) that:
- Fetches RSA public keys from `auth-service`'s `/.well-known/jwks.json` endpoint
- Caches keys for 5 minutes (double-checked locking with `sync.RWMutex`)
- Validates RS256 JWT signatures using Go's `crypto/rsa`
- Extracts claims (`sub`, `email`, `name`) into Kai's `Context.Set()` for handlers

This middleware is specific to TaskForge's JWKS flow but demonstrates how to build authentication middleware on Kai's `HandlerFunc` and `Context` primitives.

## Running Locally

```bash
# Requires PostgreSQL with taskforge_core database
export DATABASE_URL="postgres://taskforge:taskforge_secret@localhost:5432/taskforge_core?sslmode=disable"
export JWKS_URL="http://localhost:8080/.well-known/jwks.json"

go run ./cmd/main.go
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/projects` | Create project (auto-creates board + columns) |
| GET | `/api/orgs/:orgId/projects` | List projects for an org |
| GET | `/api/projects/:id` | Get project details |
| GET | `/api/projects/:id/board` | Get board with columns and nested issues |
| POST | `/api/projects/:id/sprints` | Create sprint |
| PATCH | `/api/sprints/:id` | Update sprint status |
| POST | `/api/issues` | Create issue (auto-generates key, indexes in search-service) |
| GET | `/api/issues/:id` | Get issue with comments and labels |
| PATCH | `/api/issues/:id` | Update issue (status, column, assignee, etc.) |
| POST | `/api/issues/:id/comments` | Add comment (notifies gateway) |
| POST | `/api/issues/:id/labels` | Add label to issue |
| POST | `/api/projects/:id/labels` | Create label |
| GET | `/api/projects/:id/labels` | List labels |
