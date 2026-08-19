-- Create taskforge_auth schema (avoiding collision with Supabase system 'auth' schema)
CREATE SCHEMA IF NOT EXISTS taskforge_auth;

-- Drop orphaned org/team tables (removed from codebase — project-level membership replaces org membership)
DROP TABLE IF EXISTS taskforge_auth.team_memberships CASCADE;
DROP TABLE IF EXISTS taskforge_auth.org_memberships CASCADE;
DROP TABLE IF EXISTS taskforge_auth.teams CASCADE;
DROP TABLE IF EXISTS taskforge_auth.organizations CASCADE;
