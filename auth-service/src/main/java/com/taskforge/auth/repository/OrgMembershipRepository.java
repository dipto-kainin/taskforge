package com.taskforge.auth.repository;

import com.taskforge.auth.domain.OrgMembership;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrgMembershipRepository extends JpaRepository<OrgMembership, UUID> {
    List<OrgMembership> findByOrganizationId(UUID orgId);
    List<OrgMembership> findByUserId(UUID userId);
    Optional<OrgMembership> findByUserIdAndOrganizationId(UUID userId, UUID orgId);
    boolean existsByUserIdAndOrganizationId(UUID userId, UUID orgId);
}
