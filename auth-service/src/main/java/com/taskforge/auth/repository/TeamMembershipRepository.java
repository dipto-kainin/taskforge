package com.taskforge.auth.repository;

import com.taskforge.auth.domain.TeamMembership;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TeamMembershipRepository extends JpaRepository<TeamMembership, UUID> {
    List<TeamMembership> findByTeamId(UUID teamId);
    boolean existsByUserIdAndTeamId(UUID userId, UUID teamId);
}
