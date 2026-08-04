package com.taskforge.auth.repository;

import com.taskforge.auth.domain.Team;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TeamRepository extends JpaRepository<Team, UUID> {
    List<Team> findByOrganizationId(UUID orgId);
}
