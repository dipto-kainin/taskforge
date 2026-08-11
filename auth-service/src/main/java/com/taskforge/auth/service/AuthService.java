package com.taskforge.auth.service;

import com.taskforge.auth.config.JwtProvider;
import com.taskforge.auth.domain.User;
import com.taskforge.auth.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;
    private final OrgService orgService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                       JwtProvider jwtProvider, OrgService orgService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtProvider = jwtProvider;
        this.orgService = orgService;
    }

    @Transactional
    public User register(String email, String password, String name) {
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered");
        }
        return userRepository.save(new User(email, passwordEncoder.encode(password), name));
    }

    public Map<String, String> login(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid credentials");
        }

        String accessToken = jwtProvider.generateAccessToken(user.getId(), user.getEmail(), user.getName());
        String refreshToken = jwtProvider.generateRefreshToken(user.getId(), user.getEmail(), user.getName());

        return Map.of(
                "accessToken", accessToken,
                "refreshToken", refreshToken,
                "userId", user.getId().toString(),
                "email", user.getEmail(),
                "name", user.getName()
        );
    }

    public Map<String, String> refresh(String refreshToken) {
        var claims = jwtProvider.validateToken(refreshToken);
        if (claims == null) {
            throw new IllegalArgumentException("Invalid refresh token");
        }

        try {
            String tokenType = claims.getStringClaim("token_type");
            if (!"refresh".equals(tokenType)) {
                throw new IllegalArgumentException("Not a refresh token");
            }

            UUID userId = UUID.fromString(claims.getSubject());
            String email = claims.getStringClaim("email");
            String name = claims.getStringClaim("name");

            String newAccessToken = jwtProvider.generateAccessToken(userId, email, name);
            String newRefreshToken = jwtProvider.generateRefreshToken(userId, email, name);

            return Map.of(
                    "accessToken", newAccessToken,
                    "refreshToken", newRefreshToken
            );
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid refresh token claims");
        }
    }

    public Optional<User> findById(UUID id) {
        return userRepository.findById(id);
    }

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }
}
