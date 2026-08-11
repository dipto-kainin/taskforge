package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

type Handler struct {
	db               *sql.DB
	searchServiceURL string
	gatewayNotifyURL string
}

func New(db *sql.DB, searchServiceURL, gatewayNotifyURL string) *Handler {
	return &Handler{
		db:               db,
		searchServiceURL: searchServiceURL,
		gatewayNotifyURL: gatewayNotifyURL,
	}
}

func getUserID(c *kai.Context) string {
	val, _ := c.Get("userId")
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}

// ---- Projects ----

func (h *Handler) CreateProject(c *kai.Context) {
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	orgID, _ := data["org_id"].(string)
	key, _ := data["key"].(string)
	name, _ := data["name"].(string)
	description, _ := data["description"].(string)

	if orgID == "" || key == "" || name == "" {
		c.JSON(400, map[string]string{"error": "org_id, key, and name are required"})
		return
	}

	// Check unique project name in organization
	var existingCount int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM core.projects WHERE org_id = $1 AND LOWER(name) = LOWER($2)`, orgID, name).Scan(&existingCount)
	if err != nil {
		log.Printf("[CreateProject] Check unique name error: %v", err)
	} else if existingCount > 0 {
		c.JSON(400, map[string]string{"error": "Project with this name already exists in organization"})
		return
	}

	projectID := uuid.New().String()

	_, err = h.db.Exec(
		`INSERT INTO core.projects (id, org_id, key, name, description) VALUES ($1, $2, $3, $4, $5)`,
		projectID, orgID, key, name, description,
	)
	if err != nil {
		log.Printf("[CreateProject] INSERT INTO projects error: %v", err)
		c.JSON(500, map[string]string{"error": "failed to create project: " + err.Error()})
		return
	}

	// Create default board
	boardID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO core.boards (id, project_id, name) VALUES ($1, $2, $3)`,
		boardID, projectID, "Main Board",
	)
	if err != nil {
		log.Printf("[CreateProject] INSERT INTO boards error: %v", err)
		c.JSON(500, map[string]string{"error": "failed to create board: " + err.Error()})
		return
	}

	// Create default columns
	columns := []struct{ name string; pos int }{
		{"Backlog", 0}, {"To Do", 1}, {"In Progress", 2}, {"Done", 3},
	}
	for _, col := range columns {
		colID := uuid.New().String()
		h.db.Exec(
			`INSERT INTO core.columns_ (id, board_id, name, position) VALUES ($1, $2, $3, $4)`,
			colID, boardID, col.name, col.pos,
		)
	}

	c.JSON(201, map[string]interface{}{
		"id":          projectID,
		"org_id":      orgID,
		"key":         key,
		"name":        name,
		"description": description,
	})
}

func (h *Handler) ListProjects(c *kai.Context) {
	orgID := c.Param("orgId")

	rows, err := h.db.Query(
		`SELECT id, org_id, key, name, description, created_at FROM core.projects WHERE org_id = $1 ORDER BY created_at DESC`,
		orgID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query projects: " + err.Error()})
		return
	}
	defer rows.Close()

	projects := []map[string]interface{}{}
	for rows.Next() {
		var id, oid, key, name, desc string
		var createdAt time.Time
		rows.Scan(&id, &oid, &key, &name, &desc, &createdAt)
		projects = append(projects, map[string]interface{}{
			"id": id, "org_id": oid, "key": key, "name": name,
			"description": desc, "created_at": createdAt,
		})
	}

	c.JSON(200, projects)
}

func (h *Handler) GetProject(c *kai.Context) {
	id := c.Param("id")

	var projectID, orgID, key, name, desc string
	var createdAt time.Time
	err := h.db.QueryRow(
		`SELECT id, org_id, key, name, description, created_at FROM core.projects WHERE id = $1`, id,
	).Scan(&projectID, &orgID, &key, &name, &desc, &createdAt)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error"})
		return
	}

	c.JSON(200, map[string]interface{}{
		"id": projectID, "org_id": orgID, "key": key, "name": name,
		"description": desc, "created_at": createdAt,
	})
}

// ---- Board ----

func (h *Handler) GetBoard(c *kai.Context) {
	projectID := c.Param("id")

	// Get board
	var boardID, boardName string
	err := h.db.QueryRow(
		`SELECT id, name FROM core.boards WHERE project_id = $1 LIMIT 1`, projectID,
	).Scan(&boardID, &boardName)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]string{"error": "board not found"})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error"})
		return
	}

	// Get columns
	colRows, err := h.db.Query(
		`SELECT id, name, position FROM core.columns_ WHERE board_id = $1 ORDER BY position`, boardID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query columns"})
		return
	}
	defer colRows.Close()

	columnsResult := []map[string]interface{}{}
	for colRows.Next() {
		var colID, colName string
		var pos int
		colRows.Scan(&colID, &colName, &pos)

		// Get issues for this column
		issueRows, err := h.db.Query(
			`SELECT id, key, title, description, type, status, priority, assignee_id, reporter_id, sprint_id, story_points, parent_issue_id, created_at, updated_at
			 FROM core.issues WHERE column_id = $1 ORDER BY created_at`, colID,
		)
		if err != nil {
			continue
		}

		issues := []map[string]interface{}{}
		for issueRows.Next() {
			var issueID, issueKey, title, description, issueType, status, priority, reporterID string
			var assigneeID, sprintID, parentIssueID sql.NullString
			var storyPoints sql.NullInt32
			var createdAt, updatedAt time.Time

			issueRows.Scan(&issueID, &issueKey, &title, &description, &issueType, &status, &priority,
				&assigneeID, &reporterID, &sprintID, &storyPoints, &parentIssueID, &createdAt, &updatedAt)

			issue := map[string]interface{}{
				"id": issueID, "key": issueKey, "title": title, "description": description,
				"type": issueType, "status": status, "priority": priority,
				"reporter_id": reporterID, "created_at": createdAt, "updated_at": updatedAt,
			}
			if assigneeID.Valid {
				issue["assignee_id"] = assigneeID.String
			}
			if sprintID.Valid {
				issue["sprint_id"] = sprintID.String
			}
			if storyPoints.Valid {
				issue["story_points"] = storyPoints.Int32
			}
			if parentIssueID.Valid {
				issue["parent_issue_id"] = parentIssueID.String
			}

			// Get labels for this issue
			labelRows, _ := h.db.Query(
				`SELECT l.id, l.name, l.color FROM core.labels l JOIN core.issue_labels il ON l.id = il.label_id WHERE il.issue_id = $1`, issueID,
			)
			labels := []map[string]string{}
			if labelRows != nil {
				for labelRows.Next() {
					var lid, lname, lcolor string
					labelRows.Scan(&lid, &lname, &lcolor)
					labels = append(labels, map[string]string{"id": lid, "name": lname, "color": lcolor})
				}
				labelRows.Close()
			}
			issue["labels"] = labels

			issues = append(issues, issue)
		}
		issueRows.Close()

		columnsResult = append(columnsResult, map[string]interface{}{
			"id": colID, "name": colName, "position": pos, "issues": issues,
		})
	}

	c.JSON(200, map[string]interface{}{
		"id":      boardID,
		"name":    boardName,
		"columns": columnsResult,
	})
}

// ---- Sprints ----

func (h *Handler) CreateSprint(c *kai.Context) {
	projectID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	name, _ := data["name"].(string)
	startDate, _ := data["start_date"].(string)
	endDate, _ := data["end_date"].(string)

	sprintID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO core.sprints (id, project_id, name, start_date, end_date) VALUES ($1, $2, $3, $4, $5)`,
		sprintID, projectID, name, startDate, endDate,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to create sprint"})
		return
	}

	c.JSON(201, map[string]interface{}{
		"id": sprintID, "project_id": projectID, "name": name,
		"start_date": startDate, "end_date": endDate, "status": "planned",
	})
}

func (h *Handler) UpdateSprint(c *kai.Context) {
	sprintID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	if status, ok := data["status"].(string); ok {
		_, err = h.db.Exec(`UPDATE core.sprints SET status = $1 WHERE id = $2`, status, sprintID)
		if err != nil {
			c.JSON(500, map[string]string{"error": "failed to update sprint"})
			return
		}
	}

	c.JSON(200, map[string]string{"message": "sprint updated"})
}

// ---- Issues ----

func (h *Handler) CreateIssue(c *kai.Context) {
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	projectID, _ := data["project_id"].(string)
	title, _ := data["title"].(string)
	description, _ := data["description"].(string)
	issueType, _ := data["type"].(string)
	priority, _ := data["priority"].(string)
	reporterID := getUserID(c)

	if projectID == "" || title == "" {
		c.JSON(400, map[string]string{"error": "project_id and title are required"})
		return
	}
	if issueType == "" {
		issueType = "task"
	}
	if priority == "" {
		priority = "medium"
	}

	// Get project key for issue key generation
	var projectKey string
	err = h.db.QueryRow(`SELECT key FROM core.projects WHERE id = $1`, projectID).Scan(&projectKey)
	if err != nil {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}

	// Generate issue key
	var seqVal int
	err = h.db.QueryRow(`SELECT nextval('core.issue_key_seq')`).Scan(&seqVal)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to generate issue key"})
		return
	}
	issueKey := fmt.Sprintf("%s-%d", projectKey, seqVal)

	// Get the first column (Backlog) for the project's board
	var columnID string
	err = h.db.QueryRow(
		`SELECT c.id FROM core.columns_ c JOIN core.boards b ON c.board_id = b.id WHERE b.project_id = $1 ORDER BY c.position LIMIT 1`,
		projectID,
	).Scan(&columnID)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to find default column"})
		return
	}

	issueID := uuid.New().String()

	// Handle optional fields
	assigneeID := sql.NullString{}
	if a, ok := data["assignee_id"].(string); ok && a != "" {
		assigneeID = sql.NullString{String: a, Valid: true}
	}
	sprintID := sql.NullString{}
	if s, ok := data["sprint_id"].(string); ok && s != "" {
		sprintID = sql.NullString{String: s, Valid: true}
	}
	parentIssueID := sql.NullString{}
	if p, ok := data["parent_issue_id"].(string); ok && p != "" {
		parentIssueID = sql.NullString{String: p, Valid: true}
	}
	var storyPoints sql.NullInt32
	if sp, ok := data["story_points"].(float64); ok {
		storyPoints = sql.NullInt32{Int32: int32(sp), Valid: true}
	}

	_, err = h.db.Exec(
		`INSERT INTO core.issues (id, project_id, key, title, description, type, status, priority, assignee_id, reporter_id, sprint_id, column_id, story_points, parent_issue_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
		issueID, projectID, issueKey, title, description, issueType, "backlog", priority,
		assigneeID, reporterID, sprintID, columnID, storyPoints, parentIssueID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to create issue: " + err.Error()})
		return
	}

	result := map[string]interface{}{
		"id": issueID, "project_id": projectID, "key": issueKey, "title": title,
		"description": description, "type": issueType, "status": "backlog", "priority": priority,
		"reporter_id": reporterID, "column_id": columnID,
	}

	// Phase 2: replace with Kafka IssueCreated event
	go h.indexIssue(issueID, title, description, projectID)

	c.JSON(201, result)
}

func (h *Handler) GetIssue(c *kai.Context) {
	id := c.Param("id")

	var issueID, projectID, issueKey, title, description, issueType, status, priority, reporterID string
	var assigneeID, sprintID, parentIssueID, columnID sql.NullString
	var storyPoints sql.NullInt32
	var createdAt, updatedAt time.Time

	err := h.db.QueryRow(
		`SELECT id, project_id, key, title, description, type, status, priority, assignee_id, reporter_id, sprint_id, column_id, story_points, parent_issue_id, created_at, updated_at
		 FROM issues WHERE id = $1`, id,
	).Scan(&issueID, &projectID, &issueKey, &title, &description, &issueType, &status, &priority,
		&assigneeID, &reporterID, &sprintID, &columnID, &storyPoints, &parentIssueID, &createdAt, &updatedAt)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]string{"error": "issue not found"})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error: " + err.Error()})
		return
	}

	issue := map[string]interface{}{
		"id": issueID, "project_id": projectID, "key": issueKey, "title": title,
		"description": description, "type": issueType, "status": status, "priority": priority,
		"reporter_id": reporterID, "created_at": createdAt, "updated_at": updatedAt,
	}
	if assigneeID.Valid {
		issue["assignee_id"] = assigneeID.String
	}
	if sprintID.Valid {
		issue["sprint_id"] = sprintID.String
	}
	if columnID.Valid {
		issue["column_id"] = columnID.String
	}
	if storyPoints.Valid {
		issue["story_points"] = storyPoints.Int32
	}
	if parentIssueID.Valid {
		issue["parent_issue_id"] = parentIssueID.String
	}

	// Get labels
	labelRows, _ := h.db.Query(
		`SELECT l.id, l.name, l.color FROM labels l JOIN issue_labels il ON l.id = il.label_id WHERE il.issue_id = $1`, issueID,
	)
	labels := []map[string]string{}
	if labelRows != nil {
		for labelRows.Next() {
			var lid, lname, lcolor string
			labelRows.Scan(&lid, &lname, &lcolor)
			labels = append(labels, map[string]string{"id": lid, "name": lname, "color": lcolor})
		}
		labelRows.Close()
	}
	issue["labels"] = labels

	// Get comments
	commentRows, _ := h.db.Query(
		`SELECT id, author_id, body, created_at FROM comments WHERE issue_id = $1 ORDER BY created_at`, issueID,
	)
	comments := []map[string]interface{}{}
	if commentRows != nil {
		for commentRows.Next() {
			var cid, aid, body string
			var cat time.Time
			commentRows.Scan(&cid, &aid, &body, &cat)
			comments = append(comments, map[string]interface{}{
				"id": cid, "author_id": aid, "body": body, "created_at": cat,
			})
		}
		commentRows.Close()
	}
	issue["comments"] = comments

	c.JSON(200, issue)
}

func (h *Handler) UpdateIssue(c *kai.Context) {
	id := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	// Build dynamic update
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if status, ok := data["status"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}
	if columnID, ok := data["column_id"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("column_id = $%d", argIdx))
		args = append(args, columnID)
		argIdx++
	}
	if assigneeID, ok := data["assignee_id"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("assignee_id = $%d", argIdx))
		args = append(args, assigneeID)
		argIdx++
	}
	if sprintID, ok := data["sprint_id"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("sprint_id = $%d", argIdx))
		args = append(args, sprintID)
		argIdx++
	}
	if title, ok := data["title"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, title)
		argIdx++
	}
	if description, ok := data["description"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, description)
		argIdx++
	}
	if priority, ok := data["priority"].(string); ok {
		setClauses = append(setClauses, fmt.Sprintf("priority = $%d", argIdx))
		args = append(args, priority)
		argIdx++
	}
	if sp, ok := data["story_points"].(float64); ok {
		setClauses = append(setClauses, fmt.Sprintf("story_points = $%d", argIdx))
		args = append(args, int(sp))
		argIdx++
	}

	if len(setClauses) == 0 {
		c.JSON(400, map[string]string{"error": "no fields to update"})
		return
	}

	// Always update updated_at
	setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	argIdx++

	args = append(args, id)
	query := fmt.Sprintf("UPDATE issues SET %s WHERE id = $%d",
		joinStrings(setClauses, ", "), argIdx)

	result, err := h.db.Exec(query, args...)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to update issue: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(404, map[string]string{"error": "issue not found"})
		return
	}

	// Phase 2: replace with Kafka IssueUpdated event
	go func() {
		var title, description, projectID string
		h.db.QueryRow(`SELECT title, description, project_id FROM issues WHERE id = $1`, id).Scan(&title, &description, &projectID)
		h.indexIssue(id, title, description, projectID)

		// Notify gateway for real-time updates
		if _, hasAssignee := data["assignee_id"]; hasAssignee {
			h.notifyGateway(id, "issue_assigned", data)
		}
		if _, hasColumn := data["column_id"]; hasColumn {
			h.notifyGateway(id, "issue_moved", data)
		}
	}()

	c.JSON(200, map[string]string{"message": "issue updated"})
}

// ---- Comments ----

func (h *Handler) CreateComment(c *kai.Context) {
	issueID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	body, _ := data["body"].(string)
	authorID := getUserID(c)

	if body == "" {
		c.JSON(400, map[string]string{"error": "body is required"})
		return
	}

	commentID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO comments (id, issue_id, author_id, body) VALUES ($1, $2, $3, $4)`,
		commentID, issueID, authorID, body,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to create comment"})
		return
	}

	// Phase 2: replace with Kafka CommentAdded event
	go h.notifyGateway(issueID, "comment_added", map[string]interface{}{
		"comment_id": commentID, "author_id": authorID, "body": body,
	})

	c.JSON(201, map[string]interface{}{
		"id": commentID, "issue_id": issueID, "author_id": authorID, "body": body,
	})
}

func (h *Handler) ListComments(c *kai.Context) {
	issueID := c.Param("id")

	rows, err := h.db.Query(
		`SELECT id, author_id, body, created_at FROM comments WHERE issue_id = $1 ORDER BY created_at`, issueID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query comments"})
		return
	}
	defer rows.Close()

	comments := []map[string]interface{}{}
	for rows.Next() {
		var id, authorID, body string
		var createdAt time.Time
		rows.Scan(&id, &authorID, &body, &createdAt)
		comments = append(comments, map[string]interface{}{
			"id": id, "author_id": authorID, "body": body, "created_at": createdAt,
		})
	}

	c.JSON(200, comments)
}

// ---- Labels ----

func (h *Handler) CreateLabel(c *kai.Context) {
	projectID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	name, _ := data["name"].(string)
	color, _ := data["color"].(string)
	if color == "" {
		color = "#6366f1"
	}

	labelID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO core.labels (id, project_id, name, color) VALUES ($1, $2, $3, $4)`,
		labelID, projectID, name, color,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to create label"})
		return
	}

	c.JSON(201, map[string]string{"id": labelID, "name": name, "color": color})
}

func (h *Handler) ListLabels(c *kai.Context) {
	projectID := c.Param("id")

	rows, err := h.db.Query(`SELECT id, name, color FROM core.labels WHERE project_id = $1`, projectID)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query labels"})
		return
	}
	defer rows.Close()

	labels := []map[string]string{}
	for rows.Next() {
		var id, name, color string
		rows.Scan(&id, &name, &color)
		labels = append(labels, map[string]string{"id": id, "name": name, "color": color})
	}

	c.JSON(200, labels)
}

func (h *Handler) AddLabel(c *kai.Context) {
	issueID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	labelID, _ := data["label_id"].(string)
	if labelID == "" {
		c.JSON(400, map[string]string{"error": "label_id is required"})
		return
	}

	_, err = h.db.Exec(
		`INSERT INTO core.issue_labels (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		issueID, labelID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to add label"})
		return
	}

	c.JSON(200, map[string]string{"message": "label added"})
}

// ---- Attachments ----

func (h *Handler) CreateAttachment(c *kai.Context) {
	issueID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	url, _ := data["url"].(string)
	filename, _ := data["filename"].(string)
	uploadedBy := getUserID(c)

	attachmentID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO core.attachments (id, issue_id, url, filename, uploaded_by) VALUES ($1, $2, $3, $4, $5)`,
		attachmentID, issueID, url, filename, uploadedBy,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to create attachment"})
		return
	}

	c.JSON(201, map[string]string{"id": attachmentID, "url": url, "filename": filename})
}

// ---- Join Codes ----

func generateRandomCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	now := time.Now().UnixNano()
	for i := range b {
		b[i] = chars[(now+int64(i*137))%int64(len(chars))]
	}
	return string(b)
}

func (h *Handler) GenerateJoinCode(c *kai.Context) {
	projectID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	durationMinutes := 60
	if dm, ok := data["duration_minutes"].(float64); ok && dm > 0 {
		durationMinutes = int(dm)
	}

	userID := getUserID(c)
	code := generateRandomCode()
	expiresAt := time.Now().Add(time.Duration(durationMinutes) * time.Minute)

	_, err = h.db.Exec(
		`INSERT INTO core.project_join_codes (id, project_id, code, expires_at, created_by) VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(), projectID, code, expiresAt, userID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to generate join code: " + err.Error()})
		return
	}

	c.JSON(201, map[string]interface{}{
		"code":       code,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func (h *Handler) JoinProject(c *kai.Context) {
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	code, _ := data["code"].(string)
	if code == "" {
		c.JSON(400, map[string]string{"error": "code is required"})
		return
	}

	userID := getUserID(c)
	if userID == "" {
		c.JSON(401, map[string]string{"error": "unauthorized"})
		return
	}

	var projectID, orgID, key, name, desc string
	var expiresAt time.Time
	err = h.db.QueryRow(
		`SELECT jc.project_id, p.org_id, p.key, p.name, p.description, jc.expires_at
		 FROM core.project_join_codes jc
		 JOIN core.projects p ON jc.project_id = p.id
		 WHERE UPPER(jc.code) = UPPER($1)`, code,
	).Scan(&projectID, &orgID, &key, &name, &desc, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]string{"error": "invalid join passcode"})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error: " + err.Error()})
		return
	}

	if time.Now().After(expiresAt) {
		c.JSON(400, map[string]string{"error": "join passcode has expired"})
		return
	}

	// Automatically add user to taskforge_auth.org_memberships if not already a member
	_, err = h.db.Exec(
		`INSERT INTO taskforge_auth.org_memberships (id, user_id, org_id, role)
		 VALUES ($1, $2, $3, 'member')
		 ON CONFLICT (user_id, org_id) DO NOTHING`,
		uuid.New().String(), userID, orgID,
	)
	if err != nil {
		log.Printf("Warning: failed to insert org membership: %v", err)
	}

	c.JSON(200, map[string]interface{}{
		"id":          projectID,
		"org_id":      orgID,
		"key":         key,
		"name":        name,
		"description": desc,
	})
}

// ---- Internal helpers ----

// indexIssue sends issue data to search-service for embedding indexing.
// Phase 2: replace with Kafka IssueCreated/IssueUpdated events
func (h *Handler) indexIssue(issueID, title, description, projectID string) {
	payload := map[string]string{
		"issue_id":    issueID,
		"title":       title,
		"description": description,
		"project_id":  projectID,
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(h.searchServiceURL+"/internal/index", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("WARNING: failed to index issue %s in search-service: %v", issueID, err)
		return
	}
	resp.Body.Close()
}

// notifyGateway sends notification to gateway for WebSocket push.
// Phase 2: replace with Kafka events
func (h *Handler) notifyGateway(issueID, eventType string, data map[string]interface{}) {
	// Get project_id for the issue
	var projectID string
	h.db.QueryRow(`SELECT project_id FROM core.issues WHERE id = $1`, issueID).Scan(&projectID)

	payload := map[string]interface{}{
		"issue_id":   issueID,
		"project_id": projectID,
		"event_type": eventType,
		"data":       data,
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(h.gatewayNotifyURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("WARNING: failed to notify gateway for issue %s: %v", issueID, err)
		return
	}
	resp.Body.Close()
}

func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}
