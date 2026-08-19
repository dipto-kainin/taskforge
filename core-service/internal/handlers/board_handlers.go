package handlers

import (
	"database/sql"
	"time"

	"github.com/dipto-kainin/kai"
)

func (h *Handler) GetBoard(c *kai.Context) {
	projectID := c.Param("id")

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

	colRows, err := h.db.Query(
		`SELECT id, name, position FROM core.columns_ WHERE board_id = $1 ORDER BY position`, boardID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query columns"})
		return
	}
	defer colRows.Close()

	columns := []map[string]interface{}{}
	for colRows.Next() {
		var colID, colName string
		var pos int
		colRows.Scan(&colID, &colName, &pos)

		issues := h.getIssuesForColumn(colID)
		columns = append(columns, map[string]interface{}{
			"id": colID, "name": colName, "position": pos, "issues": issues,
		})
	}

	c.JSON(200, map[string]interface{}{
		"id": boardID, "name": boardName, "columns": columns,
	})
}

// getIssuesForColumn fetches all issues belonging to a board column, including their labels.
func (h *Handler) getIssuesForColumn(colID string) []map[string]interface{} {
	issueRows, err := h.db.Query(
		`SELECT id, key, title, description, type, status, priority, assignee_id, reporter_id, sprint_id, story_points, parent_issue_id, created_at, updated_at
		 FROM core.issues WHERE column_id = $1 ORDER BY created_at`, colID,
	)
	if err != nil {
		return []map[string]interface{}{}
	}
	defer issueRows.Close()

	issues := []map[string]interface{}{}
	for issueRows.Next() {
		var id, key, title, description, issueType, status, priority, reporterID string
		var assigneeID, sprintID, parentIssueID sql.NullString
		var storyPoints sql.NullInt32
		var createdAt, updatedAt time.Time

		issueRows.Scan(&id, &key, &title, &description, &issueType, &status, &priority,
			&assigneeID, &reporterID, &sprintID, &storyPoints, &parentIssueID, &createdAt, &updatedAt)

		issue := map[string]interface{}{
			"id": id, "key": key, "title": title, "description": description,
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
		issue["labels"] = h.getLabelsForIssue(id)
		issues = append(issues, issue)
	}
	return issues
}
