package handlers

import (
	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

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
		if _, err = h.db.Exec(`UPDATE core.sprints SET status = $1 WHERE id = $2`, status, sprintID); err != nil {
			c.JSON(500, map[string]string{"error": "failed to update sprint"})
			return
		}
	}
	c.JSON(200, map[string]string{"message": "sprint updated"})
}
