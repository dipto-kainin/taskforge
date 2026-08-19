package com.taskforge.auth.controller;

import com.taskforge.auth.domain.User;
import com.taskforge.auth.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/{userId}")
    public ResponseEntity<?> getUser(@PathVariable UUID userId) {
        return userRepository.findById(userId)
                .map(u -> ResponseEntity.ok(Map.of(
                        "id", u.getId().toString(),
                        "email", u.getEmail(),
                        "name", u.getName(),
                        "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : ""
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/by-email")
    public ResponseEntity<?> getUserByEmail(@RequestParam String email) {
        return userRepository.findByEmail(email)
                .map(u -> ResponseEntity.ok(Map.of(
                        "id", u.getId().toString(),
                        "email", u.getEmail(),
                        "name", u.getName(),
                        "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : ""
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/batch")
    public ResponseEntity<?> batchGetUsers(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.getOrDefault("ids", List.of());
        List<Map<String, Object>> users = new ArrayList<>();
        for (String idStr : ids) {
            try {
                UUID id = UUID.fromString(idStr);
                userRepository.findById(id).ifPresent(u -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", u.getId().toString());
                    m.put("email", u.getEmail());
                    m.put("name", u.getName());
                    m.put("avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "");
                    users.add(m);
                });
            } catch (Exception ignored) {}
        }
        return ResponseEntity.ok(users);
    }
}
