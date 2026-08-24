package com.taskforge.auth.config;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.security.KeyFactory;
import java.util.*;

/**
 * JwtProvider — signs and verifies RS256 JWTs.
 *
 * SEC-04 fix: The RSA keypair is no longer ephemeral. On startup the service
 * checks for an RSA_PRIVATE_KEY environment variable (base64-encoded PKCS#8 PEM).
 * If present, the key is decoded and used directly — surviving every container
 * restart and redeploy (including Render's ephemeral filesystem).
 * If absent (local dev), a fresh keypair is generated in-memory as before.
 *
 * The keyId is derived as the hex-encoded SHA-256 of the public key bytes so
 * it is stable across restarts when the same key is loaded.
 */
@Component
public class JwtProvider {

    @Value("${jwt.access-token-expiry-ms:900000}")
    private long accessTokenExpiryMs;

    @Value("${jwt.refresh-token-expiry-ms:604800000}")
    private long refreshTokenExpiryMs;

    private RSAPrivateKey privateKey;
    private RSAPublicKey publicKey;
    private String keyId;

    @PostConstruct
    public void init() throws Exception {
        String rsaKeyEnv = System.getenv("RSA_PRIVATE_KEY");

        if (rsaKeyEnv != null && !rsaKeyEnv.isBlank()) {
            // SEC-04: load persisted key from environment variable (Render-compatible)
            byte[] keyBytes = Base64.getDecoder().decode(rsaKeyEnv.trim());
            KeyFactory kf = KeyFactory.getInstance("RSA");
            this.privateKey = (RSAPrivateKey) kf.generatePrivate(new PKCS8EncodedKeySpec(keyBytes));

            // Derive the public key from the private key via RSAPrivateCrtKey
            if (this.privateKey instanceof java.security.interfaces.RSAPrivateCrtKey crtKey) {
                java.security.spec.RSAPublicKeySpec pubSpec = new java.security.spec.RSAPublicKeySpec(
                        crtKey.getModulus(), crtKey.getPublicExponent());
                this.publicKey = (RSAPublicKey) kf.generatePublic(pubSpec);
            } else {
                throw new IllegalStateException("RSA_PRIVATE_KEY must be a CRT private key (standard PKCS#8 from openssl genrsa)");
            }
        } else {
            // Local dev fallback: generate ephemeral keypair (acceptable for development only)
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            KeyPair kp = kpg.generateKeyPair();
            this.privateKey = (RSAPrivateKey) kp.getPrivate();
            this.publicKey = (RSAPublicKey) kp.getPublic();
        }

        // Derive a stable keyId from the public key bytes (SHA-256 hex prefix)
        // This means the same key always produces the same kid — stable across restarts.
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(this.publicKey.getEncoded());
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 8; i++) {
            sb.append(String.format("%02x", hash[i]));
        }
        this.keyId = sb.toString();
    }

    public String generateAccessToken(UUID userId, String email, String name) {
        return generateToken(userId, email, name, accessTokenExpiryMs, "access");
    }

    public String generateRefreshToken(UUID userId, String email, String name) {
        return generateToken(userId, email, name, refreshTokenExpiryMs, "refresh");
    }

    private String generateToken(UUID userId, String email, String name, long expiryMs, String tokenType) {
        try {
            Date now = new Date();
            Date expiry = new Date(now.getTime() + expiryMs);

            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                    .subject(userId.toString())
                    .claim("email", email)
                    .claim("name", name)
                    .claim("token_type", tokenType)
                    .issuer("taskforge-auth")
                    .issueTime(now)
                    .expirationTime(expiry)
                    .jwtID(UUID.randomUUID().toString())
                    .build();

            JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                    .keyID(keyId)
                    .build();

            SignedJWT signedJWT = new SignedJWT(header, claims);
            signedJWT.sign(new RSASSASigner(privateKey));

            return signedJWT.serialize();
        } catch (JOSEException e) {
            throw new RuntimeException("Failed to sign JWT", e);
        }
    }

    public JWTClaimsSet validateToken(String token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token);
            JWSVerifier verifier = new RSASSAVerifier(publicKey);
            if (!signedJWT.verify(verifier)) {
                return null;
            }
            JWTClaimsSet claims = signedJWT.getJWTClaimsSet();
            if (claims.getExpirationTime().before(new Date())) {
                return null;
            }
            return claims;
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, Object> getJwks() {
        RSAKey jwk = new RSAKey.Builder(publicKey)
                .keyID(keyId)
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.RS256)
                .build();

        Map<String, Object> jwks = new HashMap<>();
        jwks.put("keys", List.of(jwk.toJSONObject()));
        return jwks;
    }
}
