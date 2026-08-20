package handlers

import (
	"database/sql"
	"time"

	"github.com/dipto-kainin/kai"
)

// GetDashboard returns all the data the frontend needs to populate its global
// TrackerProvider store in a single request:
//
//   - projects     — list of projects the caller is a member of (with their role)
//   - tickets      — all issues across all those projects (with labels)
//   - members      — all project members, grouped by project_id
//
// This replaces the previous pattern of 1 + N + N sequential HTTP calls from the
// frontend (where N = number of projects). The gateway calls this once and returns
// the entire payload as a single GraphQL DashboardData response.
func (h *Handler) GetDashboard(c *kai.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(401, map[string]string{"error": "unauthorized"})
		return
	}

	// ── 1. Fetch all projects the user belongs to ─────────────────────────────
	projRows, err := h.db.Query(
		`SELECT p.id, p.key, p.name, COALESCE(p.description, ''), p.created_at, pm.role
		 FROM core.projects p
		 JOIN core.project_members pm ON pm.project_id = p.id
		 WHERE pm.user_id = $1
		 ORDER BY p.created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query projects: " + err.Error()})
		return
	}
	defer projRows.Close()

	type projectRow struct {
		id          string
		key         string
		name        string
		description string
		createdAt   time.Time
		myRole      string
	}
	var projects []projectRow
	var projectIDs []string

	for projRows.Next() {
		var p projectRow
		projRows.Scan(&p.id, &p.key, &p.name, &p.description, &p.createdAt, &p.myRole)
		projects = append(projects, p)
		projectIDs = append(projectIDs, p.id)
	}

	if len(projects) == 0 {
		c.JSON(200, map[string]interface{}{
			"projects": []interface{}{},
			"tickets":  []interface{}{},
			"members":  []interface{}{},
		})
		return
	}

	// Build a Postgres ANY($1) array placeholder for the project ID list.
	// We use a subquery approach to avoid manually building $1,$2,$3... placeholders.
	// Instead, pass project IDs as a single array using lib/pq's pq.Array; but since
	// we're using database/sql directly we construct the ANY with a repeated scan.
	// Simplest approach: build query dynamically using joinStrings helper.
	placeholders := make([]string, len(projectIDs))
	args := make([]interface{}, len(projectIDs))
	for i, id := range projectIDs {
		placeholders[i] = "$" + intToStr(i+1)
		args[i] = id
	}
	inClause := joinStrings(placeholders, ",")

	// ── 2. Fetch ALL tickets across all user projects in one query ────────────
	ticketQuery := `
		SELECT i.id, i.project_id, i.key, i.title, COALESCE(i.description, ''),
		       i.type, i.status, i.priority,
		       i.assignee_id, i.column_id, i.story_points,
		       i.created_at, i.updated_at
		FROM core.issues i
		WHERE i.project_id IN (` + inClause + `)
		ORDER BY i.created_at DESC`

	ticketRows, err := h.db.Query(ticketQuery, args...)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query tickets: " + err.Error()})
		return
	}
	defer ticketRows.Close()

	type ticketRow struct {
		id          string
		projectID   string
		key         string
		title       string
		description string
		issueType   string
		status      string
		priority    string
		assigneeID  sql.NullString
		columnID    sql.NullString
		storyPoints sql.NullInt32
		createdAt   time.Time
		updatedAt   time.Time
	}
	var tickets []ticketRow
	var ticketIDs []string

	for ticketRows.Next() {
		var t ticketRow
		ticketRows.Scan(
			&t.id, &t.projectID, &t.key, &t.title, &t.description,
			&t.issueType, &t.status, &t.priority,
			&t.assigneeID, &t.columnID, &t.storyPoints,
			&t.createdAt, &t.updatedAt,
		)
		tickets = append(tickets, t)
		ticketIDs = append(ticketIDs, t.id)
	}

	// ── 3. Fetch labels for all tickets (one bulk query) ──────────────────────
	labelsByTicket := map[string][]map[string]interface{}{}
	if len(ticketIDs) > 0 {
		labelPlaceholders := make([]string, len(ticketIDs))
		labelArgs := make([]interface{}, len(ticketIDs))
		for i, id := range ticketIDs {
			labelPlaceholders[i] = "$" + intToStr(i+1)
			labelArgs[i] = id
		}
		labelRows, err := h.db.Query(
			`SELECT il.issue_id, l.id, l.name, l.color
			 FROM core.issue_labels il
			 JOIN core.labels l ON l.id = il.label_id
			 WHERE il.issue_id IN (`+joinStrings(labelPlaceholders, ",")+`)`,
			labelArgs...,
		)
		if err == nil {
			defer labelRows.Close()
			for labelRows.Next() {
				var issueID, labelID, labelName, labelColor string
				labelRows.Scan(&issueID, &labelID, &labelName, &labelColor)
				labelsByTicket[issueID] = append(labelsByTicket[issueID], map[string]interface{}{
					"id": labelID, "name": labelName, "color": labelColor,
				})
			}
		}
	}

	// ── 4. Fetch ALL project members across all projects in one query ──────────
	memberQuery := `
		SELECT pm.project_id, pm.user_id, pm.role
		FROM core.project_members pm
		WHERE pm.project_id IN (` + inClause + `)
		ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, pm.joined_at`

	memberRows, err := h.db.Query(memberQuery, args...)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query members: " + err.Error()})
		return
	}
	defer memberRows.Close()

	type memberRow struct {
		projectID string
		userID    string
		role      string
	}
	var members []memberRow
	memberUserIDSet := map[string]bool{}

	for memberRows.Next() {
		var m memberRow
		memberRows.Scan(&m.projectID, &m.userID, &m.role)
		members = append(members, m)
		memberUserIDSet[m.userID] = true
	}

	// ── 5. Batch-fetch user info from auth-service ────────────────────────────
	allUserIDs := make([]string, 0, len(memberUserIDSet))
	for id := range memberUserIDSet {
		allUserIDs = append(allUserIDs, id)
	}
	userInfo := h.batchFetchUsers(allUserIDs)

	// ── 6. Build response ─────────────────────────────────────────────────────

	// Projects
	projectsOut := make([]map[string]interface{}, 0, len(projects))
	for _, p := range projects {
		projectsOut = append(projectsOut, map[string]interface{}{
			"id":          p.id,
			"key":         p.key,
			"name":        p.name,
			"description": p.description,
			"created_at":  p.createdAt,
			"my_role":     p.myRole,
		})
	}

	// Tickets
	ticketsOut := make([]map[string]interface{}, 0, len(tickets))
	for _, t := range tickets {
		ticket := map[string]interface{}{
			"id":          t.id,
			"project_id":  t.projectID,
			"key":         t.key,
			"title":       t.title,
			"description": t.description,
			"type":        t.issueType,
			"status":      t.status,
			"priority":    t.priority,
			"created_at":  t.createdAt,
			"updated_at":  t.updatedAt,
			"labels":      labelsByTicket[t.id],
		}
		if t.assigneeID.Valid {
			ticket["assignee_id"] = t.assigneeID.String
		}
		if t.columnID.Valid {
			ticket["column_id"] = t.columnID.String
		}
		if t.storyPoints.Valid {
			ticket["story_points"] = t.storyPoints.Int32
		}
		if ticket["labels"] == nil {
			ticket["labels"] = []map[string]interface{}{}
		}
		ticketsOut = append(ticketsOut, ticket)
	}

	// Members grouped by project
	type membersByProjectEntry struct {
		ProjectID string                   `json:"project_id"`
		Members   []map[string]interface{} `json:"members"`
	}
	membersByProjectMap := map[string][]map[string]interface{}{}
	for _, m := range members {
		info := userInfo[m.userID]
		entry := map[string]interface{}{
			"id":   m.userID,
			"role": m.role,
		}
		if info != nil {
			entry["name"] = info["name"]
			entry["email"] = info["email"]
			entry["avatar_url"] = info["avatarUrl"]
		} else {
			entry["name"] = ""
			entry["email"] = ""
			entry["avatar_url"] = nil
		}
		membersByProjectMap[m.projectID] = append(membersByProjectMap[m.projectID], entry)
	}

	membersOut := make([]map[string]interface{}, 0, len(membersByProjectMap))
	for projID, mems := range membersByProjectMap {
		membersOut = append(membersOut, map[string]interface{}{
			"project_id": projID,
			"members":    mems,
		})
	}

	c.JSON(200, map[string]interface{}{
		"projects": projectsOut,
		"tickets":  ticketsOut,
		"members":  membersOut,
	})
}

// intToStr converts an int to its decimal string representation without importing strconv.
func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
