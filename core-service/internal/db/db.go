package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) (*sql.DB, error) {
	if !strings.Contains(databaseURL, "search_path=") {
		if strings.Contains(databaseURL, "?") {
			databaseURL += "&search_path=core"
		} else {
			databaseURL += "?search_path=core"
		}
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return db, nil
}

func Migrate(db *sql.DB) error {
	migrations := []string{
		// Ensure the 'core' schema exists (shared Supabase DB, per-service schema isolation)
		`CREATE SCHEMA IF NOT EXISTS core`,
		`CREATE TABLE IF NOT EXISTS core.projects (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			key VARCHAR(10) NOT NULL,
			name VARCHAR(255) NOT NULL,
			description TEXT DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS core.boards (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS core.columns_ (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			board_id UUID NOT NULL REFERENCES core.boards(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			position INT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS core.sprints (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			start_date DATE,
			end_date DATE,
			status VARCHAR(20) NOT NULL DEFAULT 'planned'
		)`,
		`CREATE TABLE IF NOT EXISTS core.issues (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			key VARCHAR(20) NOT NULL,
			title VARCHAR(500) NOT NULL,
			description TEXT DEFAULT '',
			type VARCHAR(20) NOT NULL DEFAULT 'task',
			status VARCHAR(50) NOT NULL DEFAULT 'backlog',
			priority VARCHAR(20) NOT NULL DEFAULT 'medium',
			assignee_id UUID,
			reporter_id UUID NOT NULL,
			sprint_id UUID REFERENCES core.sprints(id),
			column_id UUID REFERENCES core.columns_(id),
			story_points INT,
			parent_issue_id UUID REFERENCES core.issues(id),
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS core.comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES core.issues(id) ON DELETE CASCADE,
			author_id UUID NOT NULL,
			body TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS core.labels (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			name VARCHAR(100) NOT NULL,
			color VARCHAR(20) NOT NULL DEFAULT '#6366f1'
		)`,
		`CREATE TABLE IF NOT EXISTS core.issue_labels (
			issue_id UUID NOT NULL REFERENCES core.issues(id) ON DELETE CASCADE,
			label_id UUID NOT NULL REFERENCES core.labels(id) ON DELETE CASCADE,
			PRIMARY KEY (issue_id, label_id)
		)`,
		`CREATE TABLE IF NOT EXISTS core.attachments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES core.issues(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			filename VARCHAR(255) NOT NULL,
			uploaded_by UUID NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS core.project_join_codes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			code VARCHAR(32) NOT NULL UNIQUE,
			expires_at TIMESTAMPTZ NOT NULL,
			created_by UUID NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		// Project-level membership — replaces org_memberships
		`CREATE TABLE IF NOT EXISTS core.project_members (
			project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
			user_id    UUID NOT NULL,
			role       VARCHAR(20) NOT NULL DEFAULT 'member',
			joined_at  TIMESTAMPTZ DEFAULT NOW(),
			PRIMARY KEY (project_id, user_id)
		)`,
		// Create sequence for issue keys
		`CREATE SEQUENCE IF NOT EXISTS core.issue_key_seq START 1`,
		// Idempotent schema migration: drop org_id if it still exists (legacy)
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'core' AND table_name = 'projects' AND column_name = 'org_id'
			) THEN
				ALTER TABLE core.projects DROP COLUMN org_id;
			END IF;
		END $$`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, m)
		}
	}

	return nil
}
