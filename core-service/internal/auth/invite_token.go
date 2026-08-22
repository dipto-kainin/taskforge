package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type InviteClaims struct {
	Sub       string `json:"sub"`
	ProjectID string `json:"project_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Exp       int64  `json:"exp"`
	Jti       string `json:"jti"`
}

func getSecretKey() []byte {
	secret := os.Getenv("SECRET_KEY")
	if secret == "" {
		secret = "taskforge-default-invite-secret-key-2026"
	}
	return []byte(secret)
}

func base64URLEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

func base64URLDecode(s string) ([]byte, error) {
	if l := len(s) % 4; l > 0 {
		s += strings.Repeat("=", 4-l)
	}
	return base64.URLEncoding.DecodeString(s)
}

// GenerateInviteToken creates a 7-day signed JWT containing recipient email, project_id, and role.
func GenerateInviteToken(projectID, email, role string) (string, error) {
	headerJSON := `{"alg":"HS256","typ":"JWT"}`
	headerB64 := base64URLEncode([]byte(headerJSON))

	claims := InviteClaims{
		Sub:       "project_invite",
		ProjectID: projectID,
		Email:     strings.ToLower(strings.TrimSpace(email)),
		Role:      role,
		Exp:       time.Now().Add(7 * 24 * time.Hour).Unix(),
		Jti:       fmt.Sprintf("%d", time.Now().UnixNano()),
	}

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payloadB64 := base64URLEncode(payloadBytes)

	unsignedToken := headerB64 + "." + payloadB64

	h := hmac.New(sha256.New, getSecretKey())
	h.Write([]byte(unsignedToken))
	signature := base64URLEncode(h.Sum(nil))

	return unsignedToken + "." + signature, nil
}

// VerifyInviteToken validates the token signature, expiration, and returns claims.
func VerifyInviteToken(tokenStr string) (*InviteClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid invite token format")
	}

	unsignedToken := parts[0] + "." + parts[1]
	signatureProvided, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, errors.New("invalid signature encoding")
	}

	h := hmac.New(sha256.New, getSecretKey())
	h.Write([]byte(unsignedToken))
	expectedSignature := h.Sum(nil)

	if !hmac.Equal(signatureProvided, expectedSignature) {
		return nil, errors.New("invalid invite token signature")
	}

	payloadBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, errors.New("invalid payload encoding")
	}

	var claims InviteClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errors.New("failed to parse token claims")
	}

	if claims.Sub != "project_invite" {
		return nil, errors.New("invalid token type")
	}

	if time.Now().Unix() > claims.Exp {
		return nil, errors.New("invite link has expired")
	}

	return &claims, nil
}
