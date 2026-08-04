package com.taskforge.auth.controller;

import com.taskforge.auth.config.JwtAuthFilter;
import com.taskforge.auth.domain.Organization;
import com.taskforge.auth.domain.OrgMembership;
import com.taskforge.auth.domain.Team;
import com.taskforge.auth.service.OrgService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/orgs")
public class OrgController {

    private final OrgService orgService;

    public OrgController(OrgService orgService) {
        this.orgService = orgService;
    }

    public record CreateOrgRequest(
            @NotBlank String name,
            @NotBlank String slug
    ) {}

    public record InviteRequest(
            @NotBlank String email,
            String role  // defaults to "member"
    ) {}

    public record CreateTeamRequest(
            @NotBlank String name
    ) {}

    @GetMapping
    public ResponseEntity<?> listOrgs(@AuthenticationPrincipal JwtAuthFilter.UserPrincipal principal) {
        List<Organization> orgs = orgService.getOrgsForUser(principal.getId());
        List<Map<String, Object>> result = orgs.stream().map(o -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", o.getId());
            m.put("name", o.getName());
            m.put("slug", o.getSlug());
            m.put("createdAt", o.getCreatedAt());
            return m;
        }).toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> createOrg(@Valid @RequestBody CreateOrgRequest req,
                                       @AuthenticationPrincipal JwtAuthFilter.UserPrincipal principal) {
        try {
            Organization org = orgService.createOrg(req.name(), req.slug(), principal.getId());
            return ResponseEntity.ok(Map.of(
                    "id", org.getId(),
                    "name", org.getName(),
                    "slug", org.getSlug(),
                    "createdAt", org.getCreatedAt()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{orgId}/invite")
    public ResponseEntity<?> invite(@PathVariable UUID orgId,
                                    @Valid @RequestBody InviteRequest req,
                                    @AuthenticationPrincipal JwtAuthFilter.UserPrincipal principal) {
        try {
            String roleStr = req.role() != null ? req.role() : "member";
            OrgMembership.OrgRole role = OrgMembership.OrgRole.valueOf(roleStr);
            OrgMembership membership = orgService.inviteUser(orgId, req.email(), role, principal.getId());
            return ResponseEntity.ok(Map.of(
                    "message", "User invited successfully",
                    "role", membership.getRole().name()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{orgId}/members")
    public ResponseEntity<?> getMembers(@PathVariable UUID orgId,
                                        @AuthenticationPrincipal JwtAuthFilter.UserPrincipal principal) {
        return ResponseEntity.ok(orgService.getMembers(orgId));
    }

    @PostMapping("/{orgId}/teams")
    public ResponseEntity<?> createTeam(@PathVariable UUID orgId,
                                        @Valid @RequestBody CreateTeamRequest req,
                                        @AuthenticationPrincipal JwtAuthFilter.UserPrincipal principal) {
        try {
            Team team = orgService.createTeam(orgId, req.name(), principal.getId());
            return ResponseEntity.ok(Map.of(
                    "id", team.getId(),
                    "name", team.getName()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{orgId}/teams")
    public ResponseEntity<?> getTeams(@PathVariable UUID orgId) {
        List<Team> teams = orgService.getTeams(orgId);
        List<Map<String, Object>> result = teams.stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.getId());
            m.put("name", t.getName());
            return m;
        }).toList();
        return ResponseEntity.ok(result);
    }
}
