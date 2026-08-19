# TaskForge — Phase 2 Roadmap

This document outlines the planned Phase 2 features for TaskForge. Each item is deferred from Phase 1 because it either adds complexity that would distract from the core demo flow, or depends on infrastructure that needs the Phase 1 foundation to be stable first.

---

## 1. Kafka Event Bus

**What it adds:** Replace the synchronous HTTP calls between `core-service → search-service` (for indexing) and `core-service → gateway` (for notifications) with an asynchronous Kafka event stream. Events like `IssueCreated`, `IssueUpdated`, `CommentAdded`, and `SprintStarted` would be published to topics that each consumer service subscribes to independently.

**Why it matters:** The current synchronous approach means that if `search-service` is slow or down, `core-service` API responses degrade. With Kafka, `core-service` publishes a fire-and-forget event and returns immediately. Search indexing and notification delivery become eventually consistent — which is perfectly acceptable for these use cases. Kafka also provides replay capability: if `search-service` is redeployed, it can re-consume events from an offset to rebuild its index without a full data migration.

**Why it's deferred:** Adding Kafka to the docker-compose stack increases memory requirements significantly (~1GB for Kafka + Zookeeper) and adds operational complexity. For Phase 1, the synchronous calls are wrapped in goroutines to avoid blocking the API response, and failure is logged rather than surfaced — a pragmatic "Kafka-lite" approach that demonstrates the integration points where Kafka would slot in (marked with `// Phase 2: replace with Kafka` comments in the code).

---

## 2. gRPC for Internal Service-to-Service Calls

**What it adds:** Once the REST contracts between services stabilize, internal calls (e.g., gateway → core-service, core-service → auth-service for user validation) would be swapped from REST/JSON to gRPC with Protocol Buffers. This provides typed, schema-enforced communication with significantly lower serialization overhead.

**Why it matters:** In a polyglot system, gRPC's code-generation from `.proto` files ensures that Java, Go, Python, and TypeScript services all agree on the exact shape of requests and responses at compile time — eliminating an entire class of integration bugs. The binary protocol also reduces network overhead by 5-10x compared to JSON for high-throughput internal calls.

**Why it's deferred:** gRPC requires defining `.proto` files and generating client/server stubs for all four languages. During Phase 1, the API contracts are still evolving rapidly (field names, response shapes, new endpoints). Stabilizing the REST API first and then migrating to gRPC is more efficient than maintaining `.proto` files through constant churn.

---

## 3. Standalone Vector Database (Qdrant/Weaviate)

**What it adds:** Migrate the semantic search embeddings from `pgvector` (inside PostgreSQL) to a purpose-built vector database like Qdrant or Weaviate. These systems offer optimized HNSW indexing, real-time index updates, and better query performance at scale.

**Why it matters:** `pgvector` works well for small-to-medium datasets (thousands of issues), but its IVFFlat indexing requires periodic re-indexing as data grows, and query latency increases non-linearly. A dedicated vector DB maintains sub-millisecond query times even at millions of vectors, and supports advanced features like filtering during vector search (e.g., "find similar issues, but only in project X").

**Why it's deferred:** At Phase 1 scale (~10-100 issues), `pgvector` is more than adequate and avoids adding another infrastructure dependency. The search-service's database layer is abstracted cleanly enough that swapping the storage backend would be a contained change to `database.py`.

---

## 4. Analytics Service

**What it adds:** A new dedicated service consuming the Kafka event stream (see #1) to compute project health metrics: sprint velocity (story points completed per sprint), burndown charts (remaining work over time), cycle time (how long issues spend in each status), lead time (creation to completion), and developer workload distribution.

**Why it matters:** These metrics are what engineering managers actually use to make decisions. Showing velocity trends over multiple sprints, identifying bottlenecks in the workflow, and surfacing overloaded team members transforms TaskForge from a task tracker into a project intelligence platform.

**Why it's deferred:** Analytics depends on Kafka (#1) for its event source and requires enough historical data to produce meaningful charts. It's also a separate bounded context that doesn't affect the core create/move/comment workflow — making it a clean Phase 2 addition.

---

## 5. Presence Indicators

**What it adds:** "Alice is viewing ISSUE-231" indicators shown to other users who have the same issue or board open. Implemented via Redis TTL keys (e.g., `presence:issue:231:alice` with a 30-second TTL) that are refreshed by periodic heartbeats from the frontend, with presence changes pushed to connected users via the existing WebSocket infrastructure.

**Why it matters:** Presence reduces wasted effort in collaborative environments — knowing that someone else is already looking at an issue prevents duplicate work and encourages real-time discussion instead of async comment threads.

**Why it's deferred:** Presence requires a reliable heartbeat mechanism and careful handling of stale presence data (browser crashes, network drops). The WebSocket infrastructure in Phase 1 handles one-way push notifications; presence requires bidirectional state synchronization, which is a meaningful increment in complexity.

---

## 6. AI Sprint Health Prediction

**What it adds:** A machine learning model that analyzes sprint event history (issues added/removed mid-sprint, velocity trends, team capacity changes) to predict the probability of a sprint completing on time. Surfaces a "sprint health" score on the board view with explanations ("3 high-priority issues added after sprint start, velocity is 20% below 4-sprint average").

**Why it matters:** This is the kind of proactive AI feature that differentiates a modern tool from Jira. Instead of waiting for the burndown chart to show a sprint is off-track, the system flags risk early enough to take corrective action (re-scope, add capacity, extend the sprint).

**Why it's deferred:** Requires enough sprint history data to train or calibrate a model (at least 5-10 completed sprints), and depends on the Analytics service (#4) for the underlying metrics. The Phase 1 AI features (search, duplicate detection, label suggestion) are inference-only and don't require training data.

---

## 7. Mobile App (React Native)

**What it adds:** A React Native client that reuses the existing GraphQL gateway API to provide iOS and Android access to TaskForge. Core screens would include the board view (with swipe-to-move instead of drag-and-drop), issue detail, and push notifications for assignments and mentions.

**Why it matters:** Project management is inherently mobile — quick status checks, approving PRs, reassigning issues during standup. A native app with push notifications makes TaskForge accessible outside the desktop context.

**Why it's deferred:** The GraphQL gateway is already mobile-ready (it's the same API), so the mobile app is purely a frontend effort. Building the web frontend first establishes the design language and interaction patterns that the mobile app would mirror.

---

## 8. Observability (OpenTelemetry)

**What it adds:** Distributed tracing across the gateway → services → database call path using OpenTelemetry. Each request gets a trace ID that follows it through all four backend services, with spans for database queries, HTTP calls, and embedding generation. Visualized in Jaeger or Grafana Tempo.

**Why it matters:** A polyglot microservice system is exactly where distributed tracing earns its keep. When a GraphQL query is slow, is it the gateway's resolver, the core-service's database query, or the search-service's embedding generation? Without tracing, debugging cross-service performance issues requires correlating logs across four different logging formats. With tracing, you get a single waterfall view.

**Why it's deferred:** OpenTelemetry instrumentation requires adding SDKs to all four services (Java, Go, Python, TypeScript) and running a collector + visualization backend. It's operational infrastructure that doesn't affect user-facing functionality — important for production, but not for a demo.

---

## 9. CI/CD + Kubernetes

**What it adds:** Per-service CI/CD pipelines (GitHub Actions) running tests, building Docker images, and pushing to a container registry. Helm charts for Kubernetes deployment with per-service scaling, readiness/liveness probes, and ConfigMaps for environment management.

**Why it matters:** `docker-compose` is a local development tool, not a production deployment strategy. Kubernetes provides horizontal scaling (more core-service replicas during heavy CRUD), rolling updates (deploy a new search-service version without downtime), and resource isolation (the search-service's ML model loading doesn't starve the gateway of CPU).

**Why it's deferred:** The Helm charts and CI/CD pipelines are boilerplate that doesn't demonstrate architectural thinking — it's configuration, not design. The docker-compose setup in Phase 1 proves that the services are containerized and independently deployable, which is the prerequisite for Kubernetes.

---

## 10. Office-Hours Keep-Alive Automation (Render Free Tier)

**Context:** All three backend services (auth-service, core-service, gateway) are hosted on Render's free tier, which provides 750 instance hours/month shared across the entire workspace. The auth-service (Spring Boot / JVM) has a ~125-second cold start when Render spins it down after 15 minutes of inactivity. An UptimeRobot monitor currently pings auth-service every 10 minutes to keep it warm — but this runs 24/7 and consumes ~720 hrs/month alone, leaving almost no buffer.

**What it adds:** A GitHub Actions cron workflow that automatically pauses and resumes the UptimeRobot monitor on a weekday office-hours schedule (10:00 AM – 8:00 PM IST, Monday–Friday). This keeps the service warm during the hours when recruiters and hiring managers are likely to view the portfolio, while letting it sleep overnight and on weekends to conserve the monthly hour budget.

**Implementation plan (ready to execute):**
- Workflow file: `.github/workflows/render-keepalive-schedule.yml`
- Cron: `30 4 * * 1-5` (start — 10 AM IST) and `30 14 * * 1-5` (stop — 8 PM IST)
- Uses UptimeRobot API v2 `editMonitor` endpoint with `status=1` (resume) and `status=0` (pause)
- Requires two GitHub repository secrets: `UPTIMEROBOT_API_KEY` and `UPTIMEROBOT_MONITOR_ID`
- Supports manual trigger (`workflow_dispatch`) with `start`/`stop` input for immediate control
- The workflow was fully designed and is ready to be created when needed

**Projected monthly hours with this in place:**
- Weekdays only (22 days × 10 hrs): ~220 hrs for auth-service
- Other services (natural on-demand traffic): ~15 hrs
- Total: ~235 hrs / 750 hrs = 31% of free allowance used

**Why it's deferred:** The current 24/7 ping has only been running for a short time and the monthly budget (12 hrs used with 12 days left this month) is not yet under pressure. This automation becomes important at the start of the next billing month when the full 720 hrs/month cost of 24/7 pinging would be felt.
