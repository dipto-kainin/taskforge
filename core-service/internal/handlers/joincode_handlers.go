package handlers

import (
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

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
	userID := getUserID(c)

	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}
	durationMinutes := 60
	if dm, ok := data["duration_minutes"].(float64); ok && dm > 0 {
		durationMinutes = int(dm)
	}

	callerRole := h.getCallerRole(projectID, userID)
	if callerRole == "" || callerRole == "member" {
		c.JSON(403, map[string]string{"error": "only owners and admins can generate join codes"})
		return
	}

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

	var projectID, key, name, desc string
	var expiresAt time.Time
	err = h.db.QueryRow(
		`SELECT jc.project_id, p.key, p.name, p.description, jc.expires_at
		 FROM core.project_join_codes jc
		 JOIN core.projects p ON jc.project_id = p.id
		 WHERE UPPER(jc.code) = UPPER($1)`, code,
	).Scan(&projectID, &key, &name, &desc, &expiresAt)

	if err != nil {
		c.JSON(404, map[string]string{"error": "invalid join passcode"})
		return
	}
	if time.Now().After(expiresAt) {
		c.JSON(400, map[string]string{"error": "join passcode has expired"})
		return
	}

	_, err = h.db.Exec(
		`INSERT INTO core.project_members (project_id, user_id, role)
		 VALUES ($1, $2, 'member')
		 ON CONFLICT (project_id, user_id) DO NOTHING`,
		projectID, userID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to join project"})
		return
	}

	c.JSON(200, map[string]interface{}{
		"id": projectID, "key": key, "name": name, "description": desc,
	})
}
