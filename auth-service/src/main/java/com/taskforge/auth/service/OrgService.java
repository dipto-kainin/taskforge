package com.taskforge.auth.service;

import com.taskforge.auth.domain.*;
import com.taskforge.auth.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class OrgService {

    private final OrganizationRepository orgRepository;
    private final OrgMembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final TeamMembershipRepository teamMembershipRepository;

    public OrgService(OrganizationRepository orgRepository, OrgMembershipRepository membershipRepository,
                      UserRepository userRepository, TeamRepository teamRepository,
                      TeamMembershipRepository teamMembershipRepository) {
        this.orgRepository = orgRepository;
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.teamMembershipRepository = teamMembershipRepository;
    }

    @Transactional
    public Organization createOrg(String name, String slug, UUID creatorUserId) {
        if (orgRepository.existsBySlug(slug)) {
            throw new IllegalArgumentException("Organization slug already taken");
        }

        User creator = userRepository.findById(creatorUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        Organization org = orgRepository.save(new Organization(name, slug));

        // Creator becomes owner
        membershipRepository.save(new OrgMembership(creator, org, OrgMembership.OrgRole.owner));

        return org;
    }

    public List<Organization> getOrgsForUser(UUID userId) {
        return membershipRepository.findByUserId(userId)
                .stream()
                .map(OrgMembership::getOrganization)
                .collect(Collectors.toList());
    }

    public Organization getOrg(UUID orgId) {
        return orgRepository.findById(orgId)
                .orElseThrow(() -> new IllegalArgumentException("Organization not found"));
    }

    @Transactional
    public OrgMembership inviteUser(UUID orgId, String email, OrgMembership.OrgRole role, UUID inviterUserId) {
        Organization org = getOrg(orgId);

        // Check inviter has permission (must be owner or admin)
        OrgMembership inviterMembership = membershipRepository.findByUserIdAndOrganizationId(inviterUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("You are not a member of this organization"));

        if (inviterMembership.getRole() == OrgMembership.OrgRole.member) {
            throw new IllegalArgumentException("Only owners and admins can invite users");
        }

        User invitee = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found with email: " + email));

        if (membershipRepository.existsByUserIdAndOrganizationId(invitee.getId(), orgId)) {
            throw new IllegalArgumentException("User is already a member of this organization");
        }

        return membershipRepository.save(new OrgMembership(invitee, org, role));
    }

    public List<Map<String, Object>> getMembers(UUID orgId) {
        List<OrgMembership> memberships = membershipRepository.findByOrganizationId(orgId);
        return memberships.stream().map(m -> {
            Map<String, Object> member = new HashMap<>();
            member.put("id", m.getUser().getId());
            member.put("email", m.getUser().getEmail());
            member.put("name", m.getUser().getName());
            member.put("avatarUrl", m.getUser().getAvatarUrl());
            member.put("role", m.getRole().name());
            return member;
        }).collect(Collectors.toList());
    }

    @Transactional
    public Team createTeam(UUID orgId, String teamName, UUID creatorUserId) {
        Organization org = getOrg(orgId);

        // Verify user is member
        membershipRepository.findByUserIdAndOrganizationId(creatorUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("You are not a member of this organization"));

        return teamRepository.save(new Team(org, teamName));
    }

    @Transactional
    public void removeMember(UUID orgId, UUID targetUserId, UUID callerUserId) {
        OrgMembership callerMembership = membershipRepository.findByUserIdAndOrganizationId(callerUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("You are not a member of this organization"));

        if (callerMembership.getRole() == OrgMembership.OrgRole.member) {
            throw new IllegalArgumentException("Only owners and admins can remove members");
        }

        OrgMembership targetMembership = membershipRepository.findByUserIdAndOrganizationId(targetUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("Target user is not a member"));

        // Admins cannot remove owners or other admins
        if (callerMembership.getRole() == OrgMembership.OrgRole.admin &&
                targetMembership.getRole() != OrgMembership.OrgRole.member) {
            throw new IllegalArgumentException("Admins can only remove members");
        }

        // Cannot remove yourself if you are the only owner
        if (targetUserId.equals(callerUserId) &&
                targetMembership.getRole() == OrgMembership.OrgRole.owner) {
            long ownerCount = membershipRepository.findByOrganizationId(orgId).stream()
                    .filter(m -> m.getRole() == OrgMembership.OrgRole.owner).count();
            if (ownerCount <= 1) {
                throw new IllegalArgumentException("Cannot remove the only owner");
            }
        }

        membershipRepository.delete(targetMembership);
    }

    @Transactional
    public OrgMembership updateMemberRole(UUID orgId, UUID targetUserId, OrgMembership.OrgRole newRole, UUID callerUserId) {
        OrgMembership callerMembership = membershipRepository.findByUserIdAndOrganizationId(callerUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("You are not a member of this organization"));

        if (callerMembership.getRole() != OrgMembership.OrgRole.owner) {
            throw new IllegalArgumentException("Only owners can change member roles");
        }

        OrgMembership targetMembership = membershipRepository.findByUserIdAndOrganizationId(targetUserId, orgId)
                .orElseThrow(() -> new IllegalArgumentException("Target user is not a member"));

        targetMembership.setRole(newRole);
        return membershipRepository.save(targetMembership);
    }

    public List<Team> getTeams(UUID orgId) {
        return teamRepository.findByOrganizationId(orgId);
    }
}
