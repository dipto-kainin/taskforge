# Master prompt: GitHub repo & branch integration for TaskForge core-service

Written against the real repo (github.com/dipto-kainin/taskforge) after reading `core-service`'s actual `go.mod`, `cmd/main.go`, `internal/handlers/handlers.go`, `internal/middleware/auth.go`, and `internal/db/db.go`, plus the `dipto-kainin/kai` framework's `context.go`. Everything below matches those conventions exactly — Handler struct pattern, raw SQL via `database/sql`/`lib/pq`, `uuid.New().String()` IDs, and Kai's `Context` API.

## Where this lives, and why

This is **core-service** work, not gateway work. The gateway is explicitly "pure aggregation — no business logic" (per the repo's own README), and core-service already owns `projects` and `issues` — this feature is just new tables and handlers alongside the existing ones in that same service. Do not create a separate integrations service for this.

Auth model: a **GitHub App** installation, not OAuth or a personal access token — same reasoning as always: it's the only approach that gives clean, revocable, per-org access to private repos without a user's token sitting in the DB.

## Dependencies

Run (don't hardcode versions — let `go get` resolve the current majors):
```bash
cd core-service
go get github.com/google/go-github/v66/github   # or whatever's current
go get github.com/bradleyfalzon/ghinstallation/v2
```
`ghinstallation` is the Go equivalent of what Octokit's `authStrategy` does in JS — it's an `http.RoundTripper` that requests installation tokens on demand and caches them until just before expiry. You never touch the 1-hour clock yourself.

## Data model — append to `internal/db/db.go`'s `migrations` slice

Match the existing style exactly (backtick strings, `IF NOT EXISTS`, `ON DELETE CASCADE` where the existing tables use it). Note `org_id` has no `REFERENCES` clause on `projects` either — orgs live in auth-service's own database, not core-service's, so don't add an FK constraint here.

```sql
CREATE TABLE IF NOT EXISTS github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    installation_id BIGINT NOT NULL UNIQUE,
    account_login VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS project_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    installation_id UUID NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
    repo_id BIGINT NOT NULL,
    repo_full_name VARCHAR(255) NOT NULL,
    default_branch VARCHAR(255) NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, repo_id)
)

CREATE TABLE IF NOT EXISTS issue_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    project_repo_id UUID NOT NULL REFERENCES project_repos(id) ON DELETE CASCADE,
    branch_name VARCHAR(255) NOT NULL,
    last_commit_sha VARCHAR(40),
    last_commit_message TEXT,
    ahead_by INT DEFAULT 0,
    behind_by INT DEFAULT 0,
    pr_number INT,
    pr_state VARCHAR(20),
    pr_url TEXT,
    linked_by VARCHAR(20) NOT NULL DEFAULT 'manual',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(issue_id, project_repo_id, branch_name)
)
```

Note the naming: `issue_branches`, not `ticket_branches` — the schema calls them issues everywhere, stay consistent with that.

## New file: `core-service/internal/githubapp/client.go`

```go
package githubapp

import (
	"net/http"

	"github.com/bradleyfalzon/ghinstallation/v2"
	"github.com/google/go-github/v66/github"
)

// Client returns a *github.Client authenticated as a specific installation.
// The transport fetches and caches installation tokens automatically —
// nothing here needs to know about the 1-hour token lifetime.
func Client(appID, installationID int64, privateKeyPEM []byte) (*github.Client, error) {
	tr, err := ghinstallation.New(http.DefaultTransport, appID, installationID, privateKeyPEM)
	if err != nil {
		return nil, err
	}
	return github.NewClient(&http.Client{Transport: tr}), nil
}
```

## Extend `Handler` in `internal/handlers/handlers.go`

```go
type Handler struct {
	db                  *sql.DB
	searchServiceURL    string
	gatewayNotifyURL    string
	githubAppID         int64
	githubPrivateKey    []byte
	githubWebhookSecret string
}

func New(db *sql.DB, searchServiceURL, gatewayNotifyURL string, githubAppID int64, githubPrivateKey []byte, githubWebhookSecret string) *Handler {
	return &Handler{
		db:                  db,
		searchServiceURL:    searchServiceURL,
		gatewayNotifyURL:    gatewayNotifyURL,
		githubAppID:         githubAppID,
		githubPrivateKey:    githubPrivateKey,
		githubWebhookSecret: githubWebhookSecret,
	}
}
```

`cmd/main.go` needs three new env vars read the same way `JWKS_URL` etc. already are: `GITHUB_APP_ID` (parsed to int64), `GITHUB_APP_PRIVATE_KEY` (PEM contents, or read from a path in `GITHUB_APP_PRIVATE_KEY_PATH` — either is fine, match whatever's easiest to wire into docker-compose), and `GITHUB_WEBHOOK_SECRET`. Pass all three into `handlers.New(...)`.

## New file: `core-service/internal/handlers/github.go`

Routes to register in `cmd/main.go`, alongside the existing ones (the callback and webhook are **not** behind `authMW` — GitHub calls them directly, with no bearer token):

```go
api.GET("/integrations/github/install-url", authMW, h.GithubInstallURL)
app.GET("/integrations/github/callback", h.GithubCallback)
api.GET("/projects/:id/available-repos", authMW, h.ListAvailableRepos)
api.POST("/projects/:id/repos", authMW, h.LinkProjectRepo)
api.DELETE("/projects/:id/repos/:repoId", authMW, h.UnlinkProjectRepo)
api.GET("/issues/:id/available-branches", authMW, h.ListAvailableBranches)
api.POST("/issues/:id/branches", authMW, h.LinkIssueBranch)
api.DELETE("/issues/:id/branches/:branchId", authMW, h.UnlinkIssueBranch)
app.POST("/webhooks/github", h.GithubWebhook)
```

Callback — verifies `state`, stores the installation:

```go
func (h *Handler) GithubCallback(c *kai.Context) {
	installationIDStr := c.Query("installation_id")
	setupAction := c.Query("setup_action")
	orgID := c.Query("state")

	if setupAction != "install" || installationIDStr == "" || orgID == "" {
		c.Redirect(302, "/settings/integrations?error=cancelled")
		return
	}
	installationID, err := strconv.ParseInt(installationIDStr, 10, 64)
	if err != nil {
		c.Redirect(302, "/settings/integrations?error=invalid_installation")
		return
	}

	client, err := githubapp.Client(h.githubAppID, installationID, h.githubPrivateKey)
	if err != nil {
		c.Redirect(302, "/settings/integrations?error=auth_failed")
		return
	}
	installation, _, err := client.Apps.GetInstallation(c.Request.Context(), installationID)
	if err != nil {
		c.Redirect(302, "/settings/integrations?error=fetch_failed")
		return
	}

	id := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO github_installations (id, org_id, installation_id, account_login, account_type)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (installation_id) DO UPDATE SET status = 'active'`,
		id, orgID, installationID, installation.GetAccount().GetLogin(), installation.GetAccount().GetType(),
	)
	if err != nil {
		c.Redirect(302, "/settings/integrations?error=save_failed")
		return
	}

	c.Redirect(302, "/settings/integrations?connected=github")
}
```

`GithubInstallURL` is a one-liner — read `orgId` from the query, return `https://github.com/apps/<your-app-slug>/installations/new?state=<orgId>` as JSON for the frontend to redirect to.

Listing repos and linking one to a project — the private-repo-visibility guarantee comes entirely from `ListRepos`, which only returns what the installation was actually granted:

```go
func (h *Handler) ListAvailableRepos(c *kai.Context) {
	projectID := c.Param("id")

	var orgID string
	if err := h.db.QueryRow(`SELECT org_id FROM projects WHERE id = $1`, projectID).Scan(&orgID); err != nil {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}

	var installationID int64
	err := h.db.QueryRow(
		`SELECT installation_id FROM github_installations WHERE org_id = $1 AND status = 'active'`, orgID,
	).Scan(&installationID)
	if err == sql.ErrNoRows {
		c.JSON(409, map[string]string{"error": "github not connected for this org"})
		return
	}

	client, err := githubapp.Client(h.githubAppID, installationID, h.githubPrivateKey)
	if err != nil {
		c.JSON(500, map[string]string{"error": "github auth failed"})
		return
	}

	repos, _, err := client.Apps.ListRepos(c.Request.Context(), nil)
	if err != nil {
		c.JSON(502, map[string]string{"error": "failed to list repos: " + err.Error()})
		return
	}

	result := []map[string]interface{}{}
	for _, r := range repos.Repositories {
		result = append(result, map[string]interface{}{
			"id": r.GetID(), "full_name": r.GetFullName(),
			"private": r.GetPrivate(), "default_branch": r.GetDefaultBranch(),
		})
	}
	c.JSON(200, result)
}
```

`LinkProjectRepo` and `UnlinkProjectRepo` are plain CRUD against `project_repos` — same shape as `CreateLabel`/nothing-special, INSERT and DELETE respectively.

Branch listing and linking — this is where "which branch is doing what" actually gets computed:

```go
func (h *Handler) ListAvailableBranches(c *kai.Context) {
	issueID := c.Param("id")

	var projectID string
	h.db.QueryRow(`SELECT project_id FROM issues WHERE id = $1`, issueID).Scan(&projectID)

	var installationID int64
	var repoFullName string
	err := h.db.QueryRow(
		`SELECT gi.installation_id, pr.repo_full_name
		 FROM project_repos pr JOIN github_installations gi ON pr.installation_id = gi.id
		 WHERE pr.project_id = $1 AND pr.status = 'active' LIMIT 1`, projectID,
	).Scan(&installationID, &repoFullName)
	if err == sql.ErrNoRows {
		c.JSON(409, map[string]string{"error": "no repo linked to this project"})
		return
	}

	client, err := githubapp.Client(h.githubAppID, installationID, h.githubPrivateKey)
	if err != nil {
		c.JSON(500, map[string]string{"error": "github auth failed"})
		return
	}
	owner, repo, _ := strings.Cut(repoFullName, "/")

	branches, _, err := client.Repositories.ListBranches(c.Request.Context(), owner, repo, nil)
	if err != nil {
		c.JSON(502, map[string]string{"error": "failed to list branches"})
		return
	}

	result := []map[string]interface{}{}
	for _, b := range branches {
		result = append(result, map[string]interface{}{"name": b.GetName(), "sha": b.GetCommit().GetSHA()})
	}
	c.JSON(200, result)
}

func (h *Handler) LinkIssueBranch(c *kai.Context) {
	issueID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}
	branchName, _ := data["branch_name"].(string)
	if branchName == "" {
		c.JSON(400, map[string]string{"error": "branch_name is required"})
		return
	}

	var projectRepoID, installationID, repoFullName, defaultBranch string
	err = h.db.QueryRow(
		`SELECT pr.id, gi.installation_id::text, pr.repo_full_name, pr.default_branch
		 FROM project_repos pr JOIN github_installations gi ON pr.installation_id = gi.id
		 JOIN issues i ON i.project_id = pr.project_id
		 WHERE i.id = $1 AND pr.status = 'active' LIMIT 1`, issueID,
	).Scan(&projectRepoID, &installationID, &repoFullName, &defaultBranch)
	if err == sql.ErrNoRows {
		c.JSON(409, map[string]string{"error": "no repo linked to this issue's project"})
		return
	}

	status := h.fetchBranchStatus(c, installationID, repoFullName, defaultBranch, branchName)

	branchID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO issue_branches (id, issue_id, project_repo_id, branch_name, last_commit_sha, last_commit_message, ahead_by, behind_by, pr_number, pr_state, pr_url, linked_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')
		 ON CONFLICT (issue_id, project_repo_id, branch_name) DO UPDATE SET
		   last_commit_sha = EXCLUDED.last_commit_sha, ahead_by = EXCLUDED.ahead_by,
		   behind_by = EXCLUDED.behind_by, pr_number = EXCLUDED.pr_number,
		   pr_state = EXCLUDED.pr_state, pr_url = EXCLUDED.pr_url, updated_at = NOW()`,
		branchID, issueID, projectRepoID, branchName, status.sha, status.message,
		status.aheadBy, status.behindBy, status.prNumber, status.prState, status.prURL,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to link branch: " + err.Error()})
		return
	}

	// Phase 2: replace with Kafka BranchLinked event
	go h.notifyGateway(issueID, "branch_linked", map[string]interface{}{"branch_name": branchName})

	c.JSON(201, map[string]interface{}{"id": branchID, "branch_name": branchName})
}
```

`fetchBranchStatus` is a small helper (not a route) that mirrors the earlier TypeScript version: `client.Repositories.CompareCommits(ctx, owner, repo, defaultBranch, branchName, nil)` for ahead/behind, and `client.PullRequests.List(ctx, owner, repo, &github.PullRequestListOptions{Head: owner+":"+branchName, State: "all"})` for the linked PR. Write it as a private method on `*Handler` returning a small struct, called from both `LinkIssueBranch` and the webhook handler below.

## Webhook — `GithubWebhook`

Uses Kai's `c.BodyBytes()` (it caches the raw body so it's safe to read here and still `json.Unmarshal` afterward) to verify `X-Hub-Signature-256` before trusting anything in the payload:

```go
func (h *Handler) GithubWebhook(c *kai.Context) {
	body, err := c.BodyBytes()
	if err != nil {
		c.AbortWithStatusJSON(400, map[string]string{"error": "failed to read body"})
		return
	}

	sig := c.Header("X-Hub-Signature-256")
	mac := hmac.New(sha256.New, []byte(h.githubWebhookSecret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if sig == "" || !hmac.Equal([]byte(sig), []byte(expected)) {
		c.AbortWithStatusJSON(401, map[string]string{"error": "invalid signature"})
		return
	}

	event := c.Header("X-GitHub-Event")
	var payload map[string]interface{}
	json.Unmarshal(body, &payload)

	switch event {
	case "push":
		h.handlePushEvent(payload)
	case "pull_request":
		h.handlePullRequestEvent(payload)
	case "installation":
		if action, _ := payload["action"].(string); action == "deleted" || action == "suspend" {
			installation, _ := payload["installation"].(map[string]interface{})
			installationID := int64(installation["id"].(float64))
			h.db.Exec(`UPDATE github_installations SET status = 'revoked' WHERE installation_id = $1`, installationID)
		}
	case "installation_repositories":
		if action, _ := payload["action"].(string); action == "removed" {
			h.handleReposRemoved(payload)
		}
	}

	c.JSON(200, map[string]string{"status": "ok"})
}
```

`handlePushEvent`: pull `ref` (strip `refs/heads/`) and `repository.id` out of the payload, regex-match a ticket key (`[A-Z]+-\d+`) against the branch name, look up the matching `issues` row by key and the `project_repos` row by `repo_id`, and upsert `issue_branches` with `linked_by = 'auto'` — same logic as the earlier design, just reading from the parsed `map[string]interface{}` instead of a typed body.

`handlePullRequestEvent`: update `pr_number`/`pr_state`/`pr_url` on the `issue_branches` row matching `repository.id` + `pull_request.head.ref`.

`handleReposRemoved`: for each repo in `repositories_removed`, set `project_repos.status = 'unreachable'` by `repo_id`.

As a fallback for anything a missed webhook didn't catch, any `githubapp.Client` call that comes back with a 401 or 404 should also flip the relevant row's `status` — same principle as the webhook handlers, just reactive instead of proactive.

## Frontend hook (brief — not the focus of this pass)

In `frontend/`: a "Connect GitHub" button in org settings that redirects to the URL from `GET /integrations/github/install-url`; a repo picker in project settings backed by `GET /projects/:id/available-repos`; a branch picker + status chip on the issue detail view backed by `GET /issues/:id/available-branches` and the `issue_branches` row once linked. Read `github_installations.status` / `project_repos.status` to decide whether to show a "Reconnect GitHub" banner — never show it just because a request is in flight.

## Definition of done

- [ ] `docker-compose.yml` / `.env` carry `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, wired into `core-service`.
- [ ] Migrations run cleanly on a fresh DB via the existing `db.Migrate` call in `cmd/main.go` — no manual schema steps.
- [ ] An org can install the GitHub App and `github_installations.status` shows `active`.
- [ ] `GET /projects/:id/available-repos` returns private repos when the installation was granted access to them.
- [ ] Linking a branch to an issue populates commit, ahead/behind, and PR fields immediately.
- [ ] Pushing to `feature/<ISSUE-KEY>-...` on a linked repo auto-creates an `issue_branches` row with `linked_by = 'auto'`.
- [ ] A simulated `installation.deleted` webhook payload flips `github_installations.status` to `revoked` with no user-facing token error anywhere in the flow.
- [ ] Unit tests: `fetchBranchStatus`'s ahead/behind + PR matching, webhook signature verification (valid/invalid/missing), and the branch-name regex matcher (including a branch with no issue key, which must be a no-op).
