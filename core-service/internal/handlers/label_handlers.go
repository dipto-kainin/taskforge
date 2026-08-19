package handlers

import (
	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

// getLabelsForIssue is a shared helper used by GetIssue and getIssuesForColumn.
func (h *Handler) getLabelsForIssue(issueID string) []map[string]string {
	rows, err := h.db.Query(
		`SELECT l.id, l.name, l.color FROM core.labels l JOIN core.issue_labels il ON l.id = il.label_id WHERE il.issue_id = $1`, issueID,
	)
	labels := []map[string]string{}
	if err != nil {
		return labels
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, color string
		rows.Scan(&id, &name, &color)
		labels = append(labels, map[string]string{"id": id, "name": name, "color": color})
	}
	return labels
}

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
	if _, err = h.db.Exec(
		`INSERT INTO core.labels (id, project_id, name, color) VALUES ($1, $2, $3, $4)`,
		labelID, projectID, name, color,
	); err != nil {
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
	if _, err = h.db.Exec(
		`INSERT INTO core.issue_labels (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		issueID, labelID,
	); err != nil {
		c.JSON(500, map[string]string{"error": "failed to add label"})
		return
	}
	c.JSON(200, map[string]string{"message": "label added"})
}
