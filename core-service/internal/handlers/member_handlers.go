package handlers

import (
	"time"

	"github.com/dipto-kainin/kai"
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
	userInfo := h.batchFetchUsers(userIDs)

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

	inviteeInfo, err := h.fetchUserByEmail(email)
	if err != nil || inviteeInfo == nil {
		c.JSON(404, map[string]string{"error": "no user found with that email"})
		return
	}
	inviteeID, _ := inviteeInfo["id"].(string)

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

	c.JSON(201, map[string]interface{}{
		"id":        inviteeID,
		"name":      inviteeInfo["name"],
		"email":     inviteeInfo["email"],
		"avatarUrl": inviteeInfo["avatarUrl"],
		"role":      role,
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
