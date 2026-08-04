package com.taskforge.auth.domain;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "team_memberships",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "team_id"}))
public class TeamMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    public TeamMembership() {}

    public TeamMembership(User user, Team team) {
        this.user = user;
        this.team = team;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Team getTeam() { return team; }
    public void setTeam(Team team) { this.team = team; }
}
