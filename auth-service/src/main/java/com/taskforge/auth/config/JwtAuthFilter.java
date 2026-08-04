package com.taskforge.auth.config;

import com.nimbusds.jwt.JWTClaimsSet;
import com.taskforge.auth.domain.User;
import com.taskforge.auth.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    private final UserRepository userRepository;

    public JwtAuthFilter(JwtProvider jwtProvider, UserRepository userRepository) {
        this.jwtProvider = jwtProvider;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);
        JWTClaimsSet claims = jwtProvider.validateToken(token);

        if (claims == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            String tokenType = claims.getStringClaim("token_type");
            if (!"access".equals(tokenType)) {
                filterChain.doFilter(request, response);
                return;
            }

            UUID userId = UUID.fromString(claims.getSubject());
            String email = claims.getStringClaim("email");
            String name = claims.getStringClaim("name");

            // Create a lightweight principal without loading user from DB on every request
            UserPrincipal principal = new UserPrincipal(userId, email, name);

            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));

            SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (Exception e) {
            // Invalid claims, proceed without authentication
        }

        filterChain.doFilter(request, response);
    }

    public static class UserPrincipal {
        private final UUID id;
        private final String email;
        private final String name;

        public UserPrincipal(UUID id, String email, String name) {
            this.id = id;
            this.email = email;
            this.name = name;
        }

        public UUID getId() { return id; }
        public String getEmail() { return email; }
        public String getName() { return name; }
    }
}
