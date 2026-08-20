package handlers

import (
	"database/sql"
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

// GenerateJoinCode creates a time-limited join code for a project.
//
// Request body (JSON):
//   - duration_minutes  int   (optional, default 60) — how long the code is valid
//   - override          bool  (optional, default false) — if true, invalidate any
//     existing active code and create a new one; if false and an active code
//     already exists the request returns 409 with the current code details.
//
// Behaviour:
//  1. Check for an active (non-expired) code for this project.
//  2. If one exists and override == false → 409 Conflict with the existing code.
//  3. If one exists and override == true  → DELETE all codes for this project, then insert new one.
//  4. If none exists                      → insert new code (normal path).
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

	override := false
	if ov, ok := data["override"].(bool); ok {
		override = ov
	}

	callerRole := h.getCallerRole(projectID, userID)
	if callerRole == "" || callerRole == "member" {
		c.JSON(403, map[string]string{"error": "only owners and admins can generate join codes"})
		return
	}

	// Check for an existing active code for this project
	var existingCode string
	var existingExpiresAt time.Time
	err = h.db.QueryRow(
		`SELECT code, expires_at
		 FROM core.project_join_codes
		 WHERE project_id = $1 AND expires_at > NOW()
		 ORDER BY expires_at DESC
		 LIMIT 1`,
		projectID,
	).Scan(&existingCode, &existingExpiresAt)

	activeCodeExists := (err == nil) // err == sql.ErrNoRows means none found

	if activeCodeExists && !override {
		// Return 200 (not 409) so the GraphQL gateway receives the response body
		// instead of throwing an axios error. The frontend inspects already_exists
		// to decide whether to show the override confirmation dialog.
		c.JSON(200, map[string]interface{}{
			"code":           existingCode,
			"expires_at":     existingExpiresAt.Format(time.RFC3339),
			"already_exists": true,
		})
		return
	}

	if activeCodeExists && override {
		// Invalidate all existing codes for this project before creating a new one.
		if _, err := h.db.Exec(
			`DELETE FROM core.project_join_codes WHERE project_id = $1`,
			projectID,
		); err != nil {
			c.JSON(500, map[string]string{"error": "failed to invalidate old join code: " + err.Error()})
			return
		}
	}

	// Generate and persist the new code
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
		"code":           code,
		"expires_at":     expiresAt.Format(time.RFC3339),
		"already_exists": false,
	})
}

// GetActiveJoinCode returns the currently active (non-expired) join code for a project,
// or 404 if none exists. Only owners and admins can view the code.
func (h *Handler) GetActiveJoinCode(c *kai.Context) {
	projectID := c.Param("id")
	userID := getUserID(c)

	callerRole := h.getCallerRole(projectID, userID)
	if callerRole == "" || callerRole == "member" {
		c.JSON(403, map[string]string{"error": "only owners and admins can view join codes"})
		return
	}

	var code string
	var expiresAt time.Time
	err := h.db.QueryRow(
		`SELECT code, expires_at
		 FROM core.project_join_codes
		 WHERE project_id = $1 AND expires_at > NOW()
		 ORDER BY expires_at DESC
		 LIMIT 1`,
		projectID,
	).Scan(&code, &expiresAt)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]interface{}{
			"code":           nil,
			"expires_at":     nil,
			"already_exists": false,
		})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error"})
		return
	}

	c.JSON(200, map[string]interface{}{
		"code":           code,
		"expires_at":     expiresAt.Format(time.RFC3339),
		"already_exists": true,
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
