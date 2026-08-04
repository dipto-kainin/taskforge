#!/bin/bash
# TaskForge Seed Script
# Creates demo data: org, users, project, sprint, issues, comments
# Run after all services are up: bash infra/seed.sh

set -e

BASE_URL="${GATEWAY_URL:-http://localhost:4000}"
AUTH_URL="${AUTH_SERVICE_URL:-http://localhost:8080}"
CORE_URL="${CORE_SERVICE_URL:-http://localhost:8081}"

echo "🌱 Seeding TaskForge..."

# Wait for services to be ready
echo "⏳ Waiting for services..."
for i in $(seq 1 30); do
  if curl -sf "$AUTH_URL/.well-known/jwks.json" > /dev/null 2>&1 && \
     curl -sf "$CORE_URL/health" > /dev/null 2>&1; then
    echo "✅ Services are ready"
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 2
done

# ---- Register Users ----
echo "👤 Registering users..."

ALICE=$(curl -sf -X POST "$AUTH_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123","name":"Alice Johnson"}')
echo "  Alice: $(echo $ALICE | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id","error"))' 2>/dev/null || echo 'registered or exists')"

BOB=$(curl -sf -X POST "$AUTH_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"password123","name":"Bob Smith"}')
echo "  Bob: $(echo $BOB | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id","error"))' 2>/dev/null || echo 'registered or exists')"

# ---- Login as Alice ----
echo "🔑 Logging in as Alice..."
LOGIN=$(curl -sf -X POST "$AUTH_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
ALICE_ID=$(echo $LOGIN | python3 -c 'import sys,json; print(json.load(sys.stdin)["userId"])')
echo "  Token obtained for Alice (ID: $ALICE_ID)"

AUTH="Authorization: Bearer $TOKEN"

# ---- Login as Bob to get his ID ----
BOB_LOGIN=$(curl -sf -X POST "$AUTH_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"password123"}')
BOB_ID=$(echo $BOB_LOGIN | python3 -c 'import sys,json; print(json.load(sys.stdin)["userId"])')
echo "  Bob ID: $BOB_ID"

# ---- Create Organization ----
echo "🏢 Creating organization..."
ORG=$(curl -sf -X POST "$AUTH_URL/api/orgs" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"Acme Corp","slug":"acme-corp"}')
ORG_ID=$(echo $ORG | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "  Org ID: $ORG_ID"

# ---- Invite Bob ----
echo "📧 Inviting Bob to org..."
curl -sf -X POST "$AUTH_URL/api/orgs/$ORG_ID/invite" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"email\":\"bob@example.com\",\"role\":\"member\"}" > /dev/null
echo "  Bob invited"

# ---- Create Project ----
echo "📁 Creating project..."
PROJECT=$(curl -sf -X POST "$CORE_URL/api/projects" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"org_id\":\"$ORG_ID\",\"key\":\"TASK\",\"name\":\"TaskForge Platform\",\"description\":\"Building the next-gen project management tool\"}")
PROJECT_ID=$(echo $PROJECT | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "  Project ID: $PROJECT_ID"

# ---- Create Labels ----
echo "🏷️  Creating labels..."
for label_data in '{"name":"bug","color":"#ef4444"}' '{"name":"feature","color":"#3b82f6"}' '{"name":"enhancement","color":"#8b5cf6"}' '{"name":"documentation","color":"#06b6d4"}' '{"name":"urgent","color":"#f97316"}'; do
  curl -sf -X POST "$CORE_URL/api/projects/$PROJECT_ID/labels" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "$label_data" > /dev/null
done
echo "  5 labels created"

# Get labels for reference
LABELS=$(curl -sf "$CORE_URL/api/projects/$PROJECT_ID/labels" -H "$AUTH")

# ---- Create Sprint ----
echo "🏃 Creating sprint..."
SPRINT=$(curl -sf -X POST "$CORE_URL/api/projects/$PROJECT_ID/sprints" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"Sprint 1","start_date":"2026-08-01","end_date":"2026-08-14"}')
SPRINT_ID=$(echo $SPRINT | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "  Sprint ID: $SPRINT_ID"

# Activate sprint
curl -sf -X PATCH "$CORE_URL/api/sprints/$SPRINT_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"status":"active"}' > /dev/null
echo "  Sprint activated"

# ---- Get Board Columns ----
BOARD=$(curl -sf "$CORE_URL/api/projects/$PROJECT_ID/board" -H "$AUTH")
BACKLOG_COL=$(echo $BOARD | python3 -c 'import sys,json; cols=json.load(sys.stdin)["columns"]; print([c["id"] for c in cols if c["name"]=="Backlog"][0])')
TODO_COL=$(echo $BOARD | python3 -c 'import sys,json; cols=json.load(sys.stdin)["columns"]; print([c["id"] for c in cols if c["name"]=="To Do"][0])')
INPROG_COL=$(echo $BOARD | python3 -c 'import sys,json; cols=json.load(sys.stdin)["columns"]; print([c["id"] for c in cols if c["name"]=="In Progress"][0])')
DONE_COL=$(echo $BOARD | python3 -c 'import sys,json; cols=json.load(sys.stdin)["columns"]; print([c["id"] for c in cols if c["name"]=="Done"][0])')

# ---- Create Issues ----
echo "📋 Creating issues..."

create_issue() {
  local title="$1"
  local desc="$2"
  local type="$3"
  local priority="$4"
  local assignee="$5"
  local col="$6"
  local sp="$7"

  local body="{\"project_id\":\"$PROJECT_ID\",\"title\":\"$title\",\"description\":\"$desc\",\"type\":\"$type\",\"priority\":\"$priority\",\"sprint_id\":\"$SPRINT_ID\""
  if [ -n "$sp" ]; then
    body="$body,\"story_points\":$sp"
  fi
  body="$body}"

  local result=$(curl -sf -X POST "$CORE_URL/api/issues" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "$body")
  local issue_id=$(echo $result | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

  # Move to correct column if not backlog
  if [ -n "$col" ] && [ "$col" != "$BACKLOG_COL" ]; then
    curl -sf -X PATCH "$CORE_URL/api/issues/$issue_id" \
      -H "Content-Type: application/json" \
      -H "$AUTH" \
      -d "{\"column_id\":\"$col\",\"status\":\"$([ "$col" = "$TODO_COL" ] && echo 'todo' || ([ "$col" = "$INPROG_COL" ] && echo 'in_progress' || echo 'done'))\"}" > /dev/null
  fi

  # Assign if specified
  if [ -n "$assignee" ]; then
    curl -sf -X PATCH "$CORE_URL/api/issues/$issue_id" \
      -H "Content-Type: application/json" \
      -H "$AUTH" \
      -d "{\"assignee_id\":\"$assignee\"}" > /dev/null
  fi

  echo "$issue_id"
}

# Backlog issues
I1=$(create_issue "Set up CI/CD pipeline" "Configure GitHub Actions for automated testing and deployment across all services" "task" "low" "" "$BACKLOG_COL" 3)
I2=$(create_issue "Add email verification flow" "Users should verify their email after registration before being able to create organizations" "story" "medium" "" "$BACKLOG_COL" 5)

# To Do issues
I3=$(create_issue "Implement rate limiting on auth endpoints" "Add rate limiting to prevent brute force attacks on login and registration endpoints" "task" "high" "$ALICE_ID" "$TODO_COL" 3)
I4=$(create_issue "Add avatar upload support" "Allow users to upload profile pictures, store in S3-compatible storage" "feature" "medium" "$BOB_ID" "$TODO_COL" 5)

# In Progress issues
I5=$(create_issue "Fix issue key generation race condition" "Under concurrent creates, duplicate issue keys can be generated. Need to use a proper sequence" "bug" "critical" "$ALICE_ID" "$INPROG_COL" 2)
I6=$(create_issue "Implement drag-and-drop on Kanban board" "Use @dnd-kit to enable dragging issues between columns with optimistic updates" "story" "high" "$BOB_ID" "$INPROG_COL" 8)
I7=$(create_issue "Add WebSocket notification integration" "Connect frontend to gateway WebSocket for real-time board updates" "task" "high" "$ALICE_ID" "$INPROG_COL" 5)

# Done issues
I8=$(create_issue "Set up PostgreSQL with pgvector" "Configure PostgreSQL with pgvector extension for semantic search capabilities" "task" "high" "$ALICE_ID" "$DONE_COL" 3)
I9=$(create_issue "Implement JWT authentication" "RS256 JWT signing with JWKS endpoint for cross-service token verification" "story" "critical" "$ALICE_ID" "$DONE_COL" 8)
I10=$(create_issue "Design GraphQL schema" "Create comprehensive GraphQL schema for the API gateway covering all domain types" "task" "high" "$BOB_ID" "$DONE_COL" 5)

echo "  10 issues created"

# ---- Create Comments ----
echo "💬 Creating comments..."

add_comment() {
  local issue_id="$1"
  local body="$2"
  curl -sf -X POST "$CORE_URL/api/issues/$issue_id/comments" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "{\"body\":\"$body\"}" > /dev/null
}

add_comment "$I5" "I can reproduce this consistently when running parallel create-issue requests. The sequence is not atomic."
add_comment "$I5" "We should use a PostgreSQL sequence with nextval() instead of application-level counters."
add_comment "$I5" "Fixed in the latest commit. Using CREATE SEQUENCE issue_key_seq now."

add_comment "$I6" "Looking at @dnd-kit docs. The DndContext + SortableContext pattern seems clean."
add_comment "$I6" "Started on the KanbanBoard component. Drag between columns works, need to wire up the API call."

add_comment "$I7" "Gateway subscription endpoint is ready. Need to test with the frontend Apollo client."

add_comment "$I9" "JWKS endpoint is live at /.well-known/jwks.json. Core and search services can now verify tokens."
add_comment "$I9" "Tested cross-service JWT verification — working correctly with cached public keys."

add_comment "$I10" "Schema covers all types: Organization, User, Project, Board, Column, Sprint, Issue, Comment, Label."
add_comment "$I10" "Added subscriptions for real-time notifications. Schema is ready for review."

echo "  10 comments created"

echo ""
echo "✅ Seed complete!"
echo ""
echo "📊 Summary:"
echo "   Organization: Acme Corp (ID: $ORG_ID)"
echo "   Users: alice@example.com (owner), bob@example.com (member)"
echo "   Project: TaskForge Platform (TASK)"
echo "   Sprint: Sprint 1 (active)"
echo "   Issues: 10 (across Backlog, To Do, In Progress, Done)"
echo "   Comments: 10"
echo "   Labels: 5 (bug, feature, enhancement, documentation, urgent)"
echo ""
echo "🔐 Login credentials:"
echo "   alice@example.com / password123"
echo "   bob@example.com / password123"
