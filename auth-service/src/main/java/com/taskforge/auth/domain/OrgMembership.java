package com.taskforge.auth.domain;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "org_memberships",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "org_id"}))
public class OrgMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id", nullable = false)
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrgRole role;

    public enum OrgRole {
        owner, admin, member
    }

    public OrgMembership() {}

    public OrgMembership(User user, Organization organization, OrgRole role) {
        this.user = user;
        this.organization = organization;
        this.role = role;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public OrgRole getRole() { return role; }
    public void setRole(OrgRole role) { this.role = role; }
}
