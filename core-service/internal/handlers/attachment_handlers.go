package handlers

import (
	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

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
	if _, err = h.db.Exec(
		`INSERT INTO core.attachments (id, issue_id, url, filename, uploaded_by) VALUES ($1, $2, $3, $4, $5)`,
		attachmentID, issueID, url, filename, uploadedBy,
	); err != nil {
		c.JSON(500, map[string]string{"error": "failed to create attachment"})
		return
	}
	c.JSON(201, map[string]string{"id": attachmentID, "url": url, "filename": filename})
}
