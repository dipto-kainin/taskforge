// Package handlers wires together all HTTP handlers for the core-service.
// Each domain has its own file:
//   handlers.go         — Handler struct, constructor, shared helpers
//   project_handlers.go — CreateProject, ListProjects, GetProject
//   member_handlers.go  — ListProjectMembers, InviteToProject, RemoveFromProject, UpdateProjectMemberRole
//   joincode_handlers.go — GenerateJoinCode, JoinProject
//   board_handlers.go   — GetBoard
//   sprint_handlers.go  — CreateSprint, UpdateSprint
//   issue_handlers.go   — CreateIssue, GetIssue, UpdateIssue
//   comment_handlers.go — CreateComment, ListComments
//   label_handlers.go   — CreateLabel, ListLabels, AddLabel
//   attachment_handlers.go — CreateAttachment
package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/dipto-kainin/kai"
)

// Handler holds shared dependencies injected into every handler method.
type Handler struct {
	db               *sql.DB
	authServiceURL   string
	searchServiceURL string
	gatewayNotifyURL string
	mailServiceURL   string
}

// New creates a Handler with all required dependencies.
func New(db *sql.DB, authServiceURL, searchServiceURL, gatewayNotifyURL, mailServiceURL string) *Handler {
	return &Handler{
		db:               db,
		authServiceURL:   authServiceURL,
		searchServiceURL: searchServiceURL,
		gatewayNotifyURL: gatewayNotifyURL,
		mailServiceURL:   mailServiceURL,
	}
}

// ── Shared helpers ────────────────────────────────────────────────

// getUserID extracts the authenticated user's ID from the request context (set by JWKS middleware).
func getUserID(c *kai.Context) string {
	val, _ := c.Get("userId")
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}

// getCallerToken extracts the raw JWT string from the Authorization header.
// Used to forward the caller's credentials to auth-service for SEC-07 internal calls.
func getCallerToken(c *kai.Context) string {
	auth := c.Header("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	return ""
}

// getCallerRole returns the caller's role in a project ("owner", "admin", "member") or "" if not a member.
func (h *Handler) getCallerRole(projectID, userID string) string {
	var role string
	err := h.db.QueryRow(
		`SELECT role FROM core.project_members WHERE project_id = $1 AND user_id = $2`,
		projectID, userID,
	).Scan(&role)
	if err != nil {
		return ""
	}
	return role
}

// batchFetchUsers fetches user info from auth-service for a list of user IDs.
// callerToken is the caller's Bearer token, forwarded to satisfy auth-service auth (SEC-07).
func (h *Handler) batchFetchUsers(userIDs []string, callerToken string) map[string]map[string]interface{} {
	result := map[string]map[string]interface{}{}
	if len(userIDs) == 0 {
		return result
	}

	payload := map[string]interface{}{"ids": userIDs}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, h.authServiceURL+"/api/users/batch", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("WARNING: failed to build batch users request: %v", err)
		return result
	}
	req.Header.Set("Content-Type", "application/json")
	if callerToken != "" {
		req.Header.Set("Authorization", "Bearer "+callerToken)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("WARNING: failed to batch fetch users: %v", err)
		return result
	}
	defer resp.Body.Close()

	var users []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return result
	}
	for _, u := range users {
		if id, ok := u["id"].(string); ok {
			result[id] = u
		}
	}
	return result
}

// fetchUserByEmail resolves an email to user info via auth-service.
// callerToken is the caller's Bearer token, forwarded to satisfy auth-service auth (SEC-07).
func (h *Handler) fetchUserByEmail(email, callerToken string) (map[string]interface{}, error) {
	req, err := http.NewRequest(http.MethodGet, h.authServiceURL+"/api/users/by-email?email="+email, nil)
	if err != nil {
		return nil, err
	}
	if callerToken != "" {
		req.Header.Set("Authorization", "Bearer "+callerToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, nil
	}
	var user map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return user, nil
}

// indexIssue sends issue data to external-services for embedding indexing.
// Phase 2: replace with Kafka IssueCreated/IssueUpdated events.
func (h *Handler) indexIssue(issueID, title, description, projectID string) {
	payload := map[string]string{
		"issue_id":    issueID,
		"title":       title,
		"description": description,
		"project_id":  projectID,
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(h.searchServiceURL+"/internal/index", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("WARNING: failed to index issue %s in external-services: %v", issueID, err)
		return
	}
	resp.Body.Close()
}

// notifyGateway sends a notification to the gateway for WebSocket push.
// Phase 2: replace with Kafka events.
func (h *Handler) notifyGateway(issueID, eventType string, data map[string]interface{}) {
	var projectID string
	h.db.QueryRow(`SELECT project_id FROM core.issues WHERE id = $1`, issueID).Scan(&projectID)

	payload := map[string]interface{}{
		"issue_id":   issueID,
		"project_id": projectID,
		"event_type": eventType,
		"data":       data,
	}
	jsonData, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, h.gatewayNotifyURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	// SEC-08: add pre-shared secret so gateway can verify this is a legitimate internal call
	if secret := os.Getenv("INTERNAL_SECRET"); secret != "" {
		req.Header.Set("X-Internal-Secret", secret)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("WARNING: failed to notify gateway for issue %s: %v", issueID, err)
		return
	}
	resp.Body.Close()
}

// sendInviteEmail fires an async HTTP call to the mail service after a successful invite.
// Non-blocking — runs in a goroutine so invite response is not delayed by email delivery.
// callerToken is forwarded as Authorization so external-services can auth the request (SEC-03).
func (h *Handler) sendInviteEmail(
	toEmail, inviterName, projectName, projectID, role, token, callerToken string,
	inviteeExists bool,
) {
	if h.mailServiceURL == "" {
		log.Printf("INFO: MAIL_SERVICE_URL not set — skipping invite email to %s", toEmail)
		return
	}

	go func() {
		payload := map[string]interface{}{
			"to_email":       toEmail,
			"inviter_name":   inviterName,
			"project_name":   projectName,
			"project_id":     projectID,
			"role":           role,
			"token":          token,
			"invitee_exists": inviteeExists,
		}
		jsonData, _ := json.Marshal(payload)
		req, err := http.NewRequest(http.MethodPost, h.mailServiceURL+"/api/mail/invite", bytes.NewBuffer(jsonData))
		if err != nil {
			log.Printf("WARNING: failed to build invite email request to %s: %v", toEmail, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if callerToken != "" {
			req.Header.Set("Authorization", "Bearer "+callerToken)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("WARNING: failed to send invite email to %s: %v", toEmail, err)
			return
		}
		resp.Body.Close()
		log.Printf("INFO: invite email triggered for %s (project: %s)", toEmail, projectID)
	}()
}

// joinStrings joins a string slice with a separator.
func joinStrings(strs []string, sep string) string {
	return strings.Join(strs, sep)
}
