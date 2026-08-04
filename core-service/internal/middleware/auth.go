package middleware

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/dipto-kainin/kai"
)

type jwksCache struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
	jwksURL   string
}

var cache *jwksCache

// JWKSAuth creates a Kai middleware that validates JWTs against an auth-service JWKS endpoint.
// Keys are cached for 5 minutes to avoid per-request fetches.
func JWKSAuth(jwksURL string) kai.HandlerFunc {
	cache = &jwksCache{
		keys:    make(map[string]*rsa.PublicKey),
		jwksURL: jwksURL,
	}

	return func(c *kai.Context) {
		authHeader := c.Header("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(401, map[string]string{"error": "missing or invalid authorization header"})
			return
		}

		token := authHeader[7:]
		claims, err := validateJWT(token)
		if err != nil {
			c.AbortWithStatusJSON(401, map[string]string{"error": "invalid token: " + err.Error()})
			return
		}

		// Store claims in context for handlers
		c.Set("userId", claims["sub"])
		if email, ok := claims["email"]; ok {
			c.Set("email", email)
		}
		if name, ok := claims["name"]; ok {
			c.Set("name", name)
		}

		c.Next()
	}
}

func validateJWT(tokenStr string) (map[string]interface{}, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	// Decode header
	headerBytes, err := base64URLDecode(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid header: %w", err)
	}

	var header map[string]interface{}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("invalid header JSON: %w", err)
	}

	kid, _ := header["kid"].(string)
	alg, _ := header["alg"].(string)
	if alg != "RS256" {
		return nil, fmt.Errorf("unsupported algorithm: %s", alg)
	}

	// Get public key
	pubKey, err := getPublicKey(kid)
	if err != nil {
		return nil, fmt.Errorf("failed to get public key: %w", err)
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	signature, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding: %w", err)
	}

	hash := sha256.Sum256([]byte(signingInput))
	err = rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], signature)
	if err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	// Decode payload
	payloadBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload: %w", err)
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid payload JSON: %w", err)
	}

	// Check expiration
	if exp, ok := claims["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return nil, fmt.Errorf("token expired")
		}
	}

	return claims, nil
}

func getPublicKey(kid string) (*rsa.PublicKey, error) {
	cache.mu.RLock()
	if key, ok := cache.keys[kid]; ok && time.Since(cache.fetchedAt) < 5*time.Minute {
		cache.mu.RUnlock()
		return key, nil
	}
	cache.mu.RUnlock()

	return fetchAndCacheKeys(kid)
}

func fetchAndCacheKeys(kid string) (*rsa.PublicKey, error) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	// Double-check after acquiring write lock
	if key, ok := cache.keys[kid]; ok && time.Since(cache.fetchedAt) < 5*time.Minute {
		return key, nil
	}

	resp, err := http.Get(cache.jwksURL)
	if err != nil {
		if key, ok := cache.keys[kid]; ok {
			return key, nil
		}
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JWKS response: %w", err)
	}

	var jwks struct {
		Keys []map[string]interface{} `json:"keys"`
	}
	if err := json.Unmarshal(body, &jwks); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}

	cache.keys = make(map[string]*rsa.PublicKey)
	cache.fetchedAt = time.Now()

	for _, jwk := range jwks.Keys {
		keyID, _ := jwk["kid"].(string)
		n, _ := jwk["n"].(string)
		e, _ := jwk["e"].(string)

		pubKey, err := parseRSAPublicKey(n, e)
		if err != nil {
			continue
		}
		cache.keys[keyID] = pubKey
	}

	if key, ok := cache.keys[kid]; ok {
		return key, nil
	}

	// If kid is empty, return the first key
	if kid == "" {
		for _, key := range cache.keys {
			return key, nil
		}
	}

	return nil, fmt.Errorf("key not found for kid: %s", kid)
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64URLDecode(nStr)
	if err != nil {
		return nil, err
	}

	eBytes, err := base64URLDecode(eStr)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e*256 + int(b)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func base64URLDecode(s string) ([]byte, error) {
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}
