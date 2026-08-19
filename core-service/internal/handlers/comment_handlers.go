package handlers

import (
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

func (h *Handler) CreateComment(c *kai.Context) {
	issueID := c.Param("id")
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}
	body, _ := data["body"].(string)
	if body == "" {
		c.JSON(400, map[string]string{"error": "body is required"})
		return
	}
	authorID := getUserID(c)

	commentID := uuid.New().String()
	if _, err = h.db.Exec(
		`INSERT INTO core.comments (id, issue_id, author_id, body) VALUES ($1, $2, $3, $4)`,
		commentID, issueID, authorID, body,
	); err != nil {
		c.JSON(500, map[string]string{"error": "failed to create comment"})
		return
	}

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
		`SELECT id, author_id, body, created_at FROM core.comments WHERE issue_id = $1 ORDER BY created_at`, issueID,
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
