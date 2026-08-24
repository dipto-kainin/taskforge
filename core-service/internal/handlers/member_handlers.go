package handlers

import (
	"strings"
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/taskforge/core-service/internal/auth"
)

func (h *Handler) ListProjectMembers(c *kai.Context) {
	projectID := c.Param("id")
	userID := getUserID(c)

	if role := h.getCallerRole(projectID, userID); role == "" {
		c.JSON(403, map[string]string{"error": "you are not a member of this project"})
		return
	}

	rows, err := h.db.Query(
		`SELECT pm.user_id, pm.role, pm.joined_at
		 FROM core.project_members pm
		 WHERE pm.project_id = $1
		 ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, pm.joined_at`,
		projectID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query members"})
		return
	}
	defer rows.Close()

	type memberRow struct {
		userID   string
		role     string
		joinedAt time.Time
	}
	var memberRows []memberRow
	for rows.Next() {
		var m memberRow
		rows.Scan(&m.userID, &m.role, &m.joinedAt)
		memberRows = append(memberRows, m)
	}

	userIDs := make([]string, len(memberRows))
	for i, m := range memberRows {
		userIDs[i] = m.userID
	}
	userInfo := h.batchFetchUsers(userIDs, getCallerToken(c))

	members := []map[string]interface{}{}
	for _, m := range memberRows {
		info := userInfo[m.userID]
		member := map[string]interface{}{
			"id":        m.userID,
			"role":      m.role,
			"joined_at": m.joinedAt,
		}
		if info != nil {
			member["name"] = info["name"]
			member["email"] = info["email"]
			member["avatar_url"] = info["avatarUrl"]
		}
		members = append(members, member)
	}

	c.JSON(200, members)
}

func (h *Handler) InviteToProject(c *kai.Context) {
	projectID := c.Param("id")
	callerID := getUserID(c)

	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}
	email, _ := data["email"].(string)
	role, _ := data["role"].(string)

	if email == "" {
		c.JSON(400, map[string]string{"error": "email is required"})
		return
	}
	if role == "" {
		role = "member"
	}
	if role != "admin" && role != "member" {
		c.JSON(400, map[string]string{"error": "role must be 'admin' or 'member'"})
		return
	}

	callerRole := h.getCallerRole(projectID, callerID)
	if callerRole == "" {
		c.JSON(403, map[string]string{"error": "you are not a member of this project"})
		return
	}
	if callerRole == "member" {
		c.JSON(403, map[string]string{"error": "only owners and admins can invite members"})
		return
	}
	if callerRole == "admin" && role == "admin" {
		c.JSON(403, map[string]string{"error": "only owners can add admins"})
		return
	}

	// Fetch project name & inviter name for email
	var projectName string
	h.db.QueryRow(`SELECT name FROM core.projects WHERE id = $1`, projectID).Scan(&projectName)

	inviterName := "A teammate"
	if callerIDs, ok := h.batchFetchUsers([]string{callerID}, getCallerToken(c))[callerID]; ok {
		if name, ok := callerIDs["name"].(string); ok && name != "" {
			inviterName = name
		}
	}

	inviteeInfo, err := h.fetchUserByEmail(email, getCallerToken(c))
	var inviteeID string
	if inviteeInfo != nil {
		if id, ok := inviteeInfo["id"].(string); ok {
			inviteeID = id
		}
	}

	inviteToken, _ := auth.GenerateInviteToken(projectID, email, role)

	if err != nil || inviteeInfo == nil || inviteeID == "" {
		// User account does not exist yet (or has no valid UUID) — send sign-up invitation email with JWT token (non-blocking)
		h.sendInviteEmail(email, inviterName, projectName, projectID, role, inviteToken, getCallerToken(c), false)
		c.JSON(201, map[string]interface{}{
			"id":        "pending-" + email,
			"name":      email,
			"email":     email,
			"avatarUrl": "",
			"role":      role,
		})
		return
	}

	var existing int
	h.db.QueryRow(
		`SELECT COUNT(*) FROM core.project_members WHERE project_id = $1 AND user_id = $2`,
		projectID, inviteeID,
	).Scan(&existing)
	if existing > 0 {
		c.JSON(400, map[string]string{"error": "user is already a member of this project"})
		return
	}

	_, err = h.db.Exec(
		`INSERT INTO core.project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
		projectID, inviteeID, role,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to add member: " + err.Error()})
		return
	}

	// Fire invite email for existing user with JWT token
	h.sendInviteEmail(email, inviterName, projectName, projectID, role, inviteToken, getCallerToken(c), true)

	c.JSON(201, map[string]interface{}{
		"id":        inviteeID,
		"name":      inviteeInfo["name"],
		"email":     inviteeInfo["email"],
		"avatarUrl": inviteeInfo["avatarUrl"],
		"role":      role,
	})
}

// JoinProjectViaInvite verifies temporal JWT token, email match, checks membership, and joins project.
func (h *Handler) JoinProjectViaInvite(c *kai.Context) {
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	tokenStr, _ := data["token"].(string)
	if tokenStr == "" {
		c.JSON(400, map[string]string{"error": "invite token is required"})
		return
	}

	userID := getUserID(c)
	if userID == "" {
		c.JSON(401, map[string]string{"error": "unauthorized"})
		return
	}

	// 1. Verify JWT signature & expiration
	claims, err := auth.VerifyInviteToken(tokenStr)
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid or expired invite link"})
		return
	}

	// 2. Fetch authenticated user's email to verify it matches token email
	var callerEmail string
	if emailVal, ok := c.Get("email"); ok {
		callerEmail, _ = emailVal.(string)
	}
	if callerEmail == "" {
		if callerUsers := h.batchFetchUsers([]string{userID}, getCallerToken(c)); callerUsers[userID] != nil {
			callerEmail, _ = callerUsers[userID]["email"].(string)
		}
	}

	if callerEmail == "" {
		c.JSON(401, map[string]string{"error": "user email not found in token"})
		return
	}

	if strings.ToLower(strings.TrimSpace(callerEmail)) != strings.ToLower(strings.TrimSpace(claims.Email)) {
		c.JSON(403, map[string]string{"error": "this invite link was sent to a different email address"})
		return
	}

	// 3. Check if user is ALREADY added to the project
	var existing int
	h.db.QueryRow(
		`SELECT COUNT(*) FROM core.project_members WHERE project_id = $1 AND user_id = $2`,
		claims.ProjectID, userID,
	).Scan(&existing)

	var key, name, desc string
	err = h.db.QueryRow(
		`SELECT key, name, description FROM core.projects WHERE id = $1`, claims.ProjectID,
	).Scan(&key, &name, &desc)

	if err != nil {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}

	if existing > 0 {
		c.JSON(200, map[string]interface{}{
			"id": claims.ProjectID, "key": key, "name": name, "description": desc, "already_joined": true,
		})
		return
	}

	// 4. Add user to project
	role := claims.Role
	if role == "" {
		role = "member"
	}

	_, err = h.db.Exec(
		`INSERT INTO core.project_members (project_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO NOTHING`,
		claims.ProjectID, userID, role,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to join project"})
		return
	}

	c.JSON(200, map[string]interface{}{
		"id": claims.ProjectID, "key": key, "name": name, "description": desc, "already_joined": false,
	})
}

func (h *Handler) RemoveFromProject(c *kai.Context) {
	projectID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID := getUserID(c)

	callerRole := h.getCallerRole(projectID, callerID)
	if callerRole == "" {
		c.JSON(403, map[string]string{"error": "you are not a member of this project"})
		return
	}
	if callerRole == "member" {
		c.JSON(403, map[string]string{"error": "only owners and admins can remove members"})
		return
	}

	targetRole := h.getCallerRole(projectID, targetUserID)
	if targetRole == "" {
		c.JSON(404, map[string]string{"error": "target user is not a member of this project"})
		return
	}
	if callerRole == "admin" && targetRole != "member" {
		c.JSON(403, map[string]string{"error": "admins can only remove members"})
		return
	}

	if targetRole == "owner" {
		var ownerCount int
		h.db.QueryRow(
			`SELECT COUNT(*) FROM core.project_members WHERE project_id = $1 AND role = 'owner'`,
			projectID,
		).Scan(&ownerCount)
		if ownerCount <= 1 {
			c.JSON(400, map[string]string{"error": "cannot remove the only owner"})
			return
		}
	}

	if _, err := h.db.Exec(
		`DELETE FROM core.project_members WHERE project_id = $1 AND user_id = $2`,
		projectID, targetUserID,
	); err != nil {
		c.JSON(500, map[string]string{"error": "failed to remove member"})
		return
	}

	c.JSON(200, map[string]string{"message": "member removed"})
}

func (h *Handler) UpdateProjectMemberRole(c *kai.Context) {
	projectID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID := getUserID(c)

	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}
	newRole, _ := data["role"].(string)
	if newRole != "admin" && newRole != "member" {
		c.JSON(400, map[string]string{"error": "role must be 'admin' or 'member'"})
		return
	}

	if h.getCallerRole(projectID, callerID) != "owner" {
		c.JSON(403, map[string]string{"error": "only owners can change member roles"})
		return
	}

	targetRole := h.getCallerRole(projectID, targetUserID)
	if targetRole == "" {
		c.JSON(404, map[string]string{"error": "target user is not a member"})
		return
	}
	if targetRole == "owner" {
		c.JSON(400, map[string]string{"error": "cannot change an owner's role"})
		return
	}

	if _, err = h.db.Exec(
		`UPDATE core.project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`,
		newRole, projectID, targetUserID,
	); err != nil {
		c.JSON(500, map[string]string{"error": "failed to update role"})
		return
	}

	c.JSON(200, map[string]interface{}{"id": targetUserID, "role": newRole})
}
