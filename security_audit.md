# 🛡️ TaskForge Security Audit — Verified Findings

All findings below were manually verified against the actual codebase. Findings that could not be confirmed or were inaccurate have been removed or corrected.

---

## Summary

| Severity | ID | Description | Status |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | SEC-01 | Pseudo-random join passcode (only 31 unique codes possible) | ✅ Confirmed |
| **CRITICAL** | SEC-02 | Authorization bypass on issue & project endpoints (IDOR) | ✅ Confirmed (partial) |
| **CRITICAL** | SEC-03 | No authentication on external-services AI & mail endpoints | ✅ Confirmed |
| **HIGH** | SEC-04 | Ephemeral in-memory RSA key — all tokens invalidated on restart | ✅ Confirmed |
| **HIGH** | SEC-05 | Refresh tokens accepted as access tokens (no `token_type` check) | ✅ Confirmed |
| **HIGH** | SEC-06 | Hardcoded fallback secret for invite tokens | ✅ Confirmed |
| **HIGH** | SEC-07 | Unauthenticated user enumeration endpoints | ✅ Confirmed |
| **MEDIUM** | SEC-08 | Unauthenticated internal webhook + open GraphQL subscriptions | ✅ Confirmed |
| **MEDIUM** | SEC-09 | Wildcard CORS with `credentials: true` | ✅ Confirmed |
| **MEDIUM** | SEC-10 | Internal service ports exposed on host; Redis has no password | ✅ Confirmed |
| **LOW** | SEC-11 | Tokens stored in `localStorage` | ✅ Confirmed |

---

## Detailed Findings

---

### 🚨 [CRITICAL] SEC-01 — Pseudo-Random Join Passcode Generator

**File:** [`joincode_handlers.go` L11–L19](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/handlers/joincode_handlers.go#L11-L19)

The `generateRandomCode()` function derives all 6 characters from a single timestamp value using a fixed arithmetic formula:

```go
b[i] = chars[(now + int64(i*137)) % int64(len(chars))]
```

Because all characters share the same base value (`now % 31`), the entire 6-character output is determined by a single number in the range `[0, 30]`. This means the function can only ever produce **31 unique codes**, making brute force trivially fast.

---

### 🚨 [CRITICAL] SEC-02 — Authorization Bypass & IDOR on Core Endpoints

**Files:**
- [`issue_handlers.go`](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/handlers/issue_handlers.go) — `CreateIssue`, `GetIssue`, `UpdateIssue`, `DeleteIssue`
- [`joincode_handlers.go` L213–L246](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/handlers/joincode_handlers.go#L213-L246) — `JoinProjectByID`
- [`project_handlers.go` L124–L146](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/handlers/project_handlers.go#L124-L146) — `GetProject`

Three distinct authorization gaps confirmed:

1. **`JoinProjectByID`** — any authenticated user can join any project by ID without an invite; the handler just looks up the project and inserts the caller as a member with no token check.

2. **Issue handlers** — `CreateIssue`, `GetIssue`, `UpdateIssue`, and `DeleteIssue` all operate on issues by ID without checking whether the caller is a member of the issue's parent project. Any logged-in user can read, edit, or delete any issue across the entire database.

3. **`GetProject`** — fetches and returns project details to any authenticated caller regardless of project membership. Scope is lower (read-only metadata), but still leaks data.

> [!NOTE]
> `GenerateJoinCode` and `GetActiveJoinCode` *do* correctly call `h.getCallerRole()`, so those handlers are fine.

---

### 🚨 [CRITICAL] SEC-03 — No Authentication on External Services

**Files:**
- [`external-services/app/ai/router.py` L48–L68](file:///home/kainin/Desktop/Projects/Capstone/external-services/app/ai/router.py#L48-L68)
- [`external-services/app/mail/router.py` L28–L44](file:///home/kainin/Desktop/Projects/Capstone/external-services/app/mail/router.py#L28-L44)

The FastAPI service has no authentication middleware. Three unauthenticated endpoints are accessible:

- `POST /api/ai/project-key` — sets/overwrites an LLM API key for any project ID
- `DELETE /api/ai/project-key/{project_id}` — deletes the LLM key for any project
- `POST /api/mail/invite` — triggers an email send using the server's SMTP credentials

Combined with SEC-10 (port 8000 exposed on host), these endpoints are reachable from the internet with no credentials required.

---

### ⚠️ [HIGH] SEC-04 — Ephemeral In-Memory RSA Key

**File:** [`JwtProvider.java` L32–L40](file:///home/kainin/Desktop/Projects/Capstone/auth-service/src/main/java/com/taskforge/auth/config/JwtProvider.java#L32-L40)

A fresh RSA-2048 keypair is generated in `@PostConstruct` on every startup. Consequences:

- Every service restart immediately invalidates all existing access tokens and 7-day refresh tokens, logging out all users.
- If multiple `auth-service` instances are deployed, tokens signed by instance A are rejected by instance B.
- Refresh tokens are stateless (not stored anywhere), so there is no mechanism to revoke them on logout or password change.

---

### ⚠️ [HIGH] SEC-05 — Refresh Token Accepted as Access Token

**File:** [`auth.go` L64–L125](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/middleware/auth.go#L64-L125)

`validateJWT()` verifies the RS256 signature and the `exp` claim, but never reads the `token_type` claim from the payload. The auth service *does* embed `"token_type": "refresh"` in refresh tokens, but the Go middleware ignores this field entirely. A 7-day refresh token therefore passes all validation checks and grants full API access, bypassing the 15-minute access token window.

---

### ⚠️ [HIGH] SEC-06 — Hardcoded Fallback Secret for Invite Tokens

**File:** [`invite_token.go` L24–L29](file:///home/kainin/Desktop/Projects/Capstone/core-service/internal/auth/invite_token.go#L24-L29)

```go
if secret == "" {
    secret = "taskforge-default-invite-secret-key-2026"
}
```

If `SECRET_KEY` is absent from the environment the service silently uses this known string as the HMAC-SHA256 signing key. Anyone with this value can forge valid invite tokens for any email, project ID, and role (including `owner`/`admin`).

---

### ⚠️ [HIGH] SEC-07 — Unauthenticated User Enumeration

**Files:**
- [`UserController.java` L20–L62](file:///home/kainin/Desktop/Projects/Capstone/auth-service/src/main/java/com/taskforge/auth/controller/UserController.java#L20-L62)
- [`SecurityConfig.java` L37](file:///home/kainin/Desktop/Projects/Capstone/auth-service/src/main/java/com/taskforge/auth/config/SecurityConfig.java#L37)

`SecurityConfig` uses `.anyRequest().permitAll()`, which means Spring Security's `JwtAuthFilter` is registered but the application does not enforce authentication on any route. Three endpoints on `UserController` are therefore publicly accessible with no token:

- `GET /api/users/{userId}` — returns name, email, avatar URL
- `GET /api/users/by-email?email=...` — look up any user by email address
- `POST /api/users/batch` — bulk-resolve a list of user IDs to names and emails

These allow harvesting the full user database without any credentials.

---

### ⚠️ [MEDIUM] SEC-08 — Unauthenticated Webhook & Open GraphQL Subscriptions

**Files:**
- [`notify.controller.ts`](file:///home/kainin/Desktop/Projects/Capstone/gateway/src/notify/notify.controller.ts)
- [`app.module.ts` L20–L22](file:///home/kainin/Desktop/Projects/Capstone/gateway/src/app.module.ts#L20-L22)

`POST /internal/notify` accepts any body and immediately publishes it to all subscribers on that `project_id` with no secret or token check. Any caller who knows a project ID can inject arbitrary events into clients' real-time feeds.

GraphQL WebSocket subscriptions are configured with `'graphql-ws': true` and no `onConnect` handler, so any unauthenticated WebSocket client can subscribe to any project's event stream.

---

### ⚠️ [MEDIUM] SEC-09 — Wildcard CORS with Credentials

**Files:**
- [`main.ts` L7–L11](file:///home/kainin/Desktop/Projects/Capstone/gateway/src/main.ts#L7-L11)
- [`SecurityConfig.java` L50–L54](file:///home/kainin/Desktop/Projects/Capstone/auth-service/src/main/java/com/taskforge/auth/config/SecurityConfig.java#L50-L54)

Both the gateway and auth service set `origin: '*'` (or `allowedOriginPatterns: "*"`) combined with `credentials: true`. Browsers block wildcard origins with credentials per the CORS spec, but using `allowedOriginPatterns("*")` in Spring is a common workaround that effectively allows any origin to make credentialed requests. This enables CSRF-style attacks from any third-party site a logged-in user visits.

---

### ⚠️ [MEDIUM] SEC-10 — Internal Ports Exposed on Host; Redis Unauthenticated

**File:** [`docker-compose.yml` L4–L60](file:///home/kainin/Desktop/Projects/Capstone/docker-compose.yml#L4-L60)

Four services bind internal ports directly to `0.0.0.0` on the host:

| Service | Host Port |
| :--- | :--- |
| `redis` | 6379 |
| `auth-service` | 8080 |
| `core-service` | 8081 |
| `external-services` | 8000 |

On a cloud VM, this makes all microservices and Redis directly reachable from the internet, bypassing the gateway entirely. Redis runs without a password (`requirepass` is not configured), so anyone who reaches port 6379 can read or write pub/sub channels and any cached data.

---

### ℹ️ [LOW] SEC-11 — Tokens in `localStorage`

**File:** [`auth-context.tsx` L115–L117](file:///home/kainin/Desktop/Projects/Capstone/frontend/src/lib/auth-context.tsx#L115-L117)

Both the access token and refresh token are stored in `localStorage`. Any JavaScript running on the page (including third-party scripts or XSS payloads) can read these values. The risk is lower if a robust CSP is in place, but `HttpOnly` cookies would eliminate this attack surface entirely.

---

*Audit date: 2026-08-24 | Verified by: code inspection*
