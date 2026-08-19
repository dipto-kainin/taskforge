package handlers

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

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

	var projectKey string
	if err = h.db.QueryRow(`SELECT key FROM core.projects WHERE id = $1`, projectID).Scan(&projectKey); err != nil {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}

	var seqVal int
	if err = h.db.QueryRow(`SELECT nextval('core.issue_key_seq')`).Scan(&seqVal); err != nil {
		c.JSON(500, map[string]string{"error": "failed to generate issue key"})
		return
	}
	issueKey := fmt.Sprintf("%s-%d", projectKey, seqVal)

	var columnID string
	if err = h.db.QueryRow(
		`SELECT c.id FROM core.columns_ c JOIN core.boards b ON c.board_id = b.id WHERE b.project_id = $1 ORDER BY c.position LIMIT 1`,
		projectID,
	).Scan(&columnID); err != nil {
		c.JSON(500, map[string]string{"error": "failed to find default column"})
		return
	}

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

	issueID := uuid.New().String()
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

	go h.indexIssue(issueID, title, description, projectID)

	c.JSON(201, map[string]interface{}{
		"id": issueID, "project_id": projectID, "key": issueKey, "title": title,
		"description": description, "type": issueType, "status": "backlog", "priority": priority,
		"reporter_id": reporterID, "column_id": columnID,
	})
}

func (h *Handler) GetIssue(c *kai.Context) {
	id := c.Param("id")

	var issueID, projectID, issueKey, title, description, issueType, status, priority, reporterID string
	var assigneeID, sprintID, parentIssueID, columnID sql.NullString
	var storyPoints sql.NullInt32
	var createdAt, updatedAt time.Time

	err := h.db.QueryRow(
		`SELECT id, project_id, key, title, description, type, status, priority, assignee_id, reporter_id, sprint_id, column_id, story_points, parent_issue_id, created_at, updated_at
		 FROM core.issues WHERE id = $1`, id,
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
		"labels": h.getLabelsForIssue(issueID),
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

	// Inline comments
	commentRows, _ := h.db.Query(
		`SELECT id, author_id, body, created_at FROM core.comments WHERE issue_id = $1 ORDER BY created_at`, issueID,
	)
	comments := []map[string]interface{}{}
	if commentRows != nil {
		defer commentRows.Close()
		for commentRows.Next() {
			var cid, aid, body string
			var cat time.Time
			commentRows.Scan(&cid, &aid, &body, &cat)
			comments = append(comments, map[string]interface{}{
				"id": cid, "author_id": aid, "body": body, "created_at": cat,
			})
		}
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

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	addField := func(col string, val interface{}) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if v, ok := data["status"].(string); ok {
		addField("status", v)
	}
	if v, ok := data["column_id"].(string); ok {
		addField("column_id", v)
	}
	if v, ok := data["assignee_id"].(string); ok {
		addField("assignee_id", v)
	}
	if v, ok := data["sprint_id"].(string); ok {
		addField("sprint_id", v)
	}
	if v, ok := data["title"].(string); ok {
		addField("title", v)
	}
	if v, ok := data["description"].(string); ok {
		addField("description", v)
	}
	if v, ok := data["priority"].(string); ok {
		addField("priority", v)
	}
	if v, ok := data["story_points"].(float64); ok {
		addField("story_points", int(v))
	}

	if len(setClauses) == 0 {
		c.JSON(400, map[string]string{"error": "no fields to update"})
		return
	}
	addField("updated_at", time.Now())
	args = append(args, id)

	query := fmt.Sprintf("UPDATE core.issues SET %s WHERE id = $%d", joinStrings(setClauses, ", "), argIdx)
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

	go func() {
		var title, description, projectID string
		h.db.QueryRow(`SELECT title, description, project_id FROM core.issues WHERE id = $1`, id).Scan(&title, &description, &projectID)
		h.indexIssue(id, title, description, projectID)
		if _, hasAssignee := data["assignee_id"]; hasAssignee {
			h.notifyGateway(id, "issue_assigned", data)
		}
		if _, hasColumn := data["column_id"]; hasColumn {
			h.notifyGateway(id, "issue_moved", data)
		}
	}()

	c.JSON(200, map[string]string{"message": "issue updated"})
}

func (h *Handler) DeleteIssue(c *kai.Context) {
	id := c.Param("id")
	result, err := h.db.Exec(`DELETE FROM core.issues WHERE id = $1`, id)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to delete issue: " + err.Error()})
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(404, map[string]string{"error": "issue not found"})
		return
	}
	c.JSON(200, map[string]string{"message": "issue deleted"})
}

