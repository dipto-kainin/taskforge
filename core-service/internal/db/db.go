package db

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) (*sql.DB, error) {
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
		`CREATE TABLE IF NOT EXISTS projects (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			org_id UUID NOT NULL,
			key VARCHAR(10) NOT NULL,
			name VARCHAR(255) NOT NULL,
			description TEXT DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS boards (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS columns_ (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			position INT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS sprints (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			start_date DATE,
			end_date DATE,
			status VARCHAR(20) NOT NULL DEFAULT 'planned'
		)`,
		`CREATE TABLE IF NOT EXISTS issues (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			key VARCHAR(20) NOT NULL,
			title VARCHAR(500) NOT NULL,
			description TEXT DEFAULT '',
			type VARCHAR(20) NOT NULL DEFAULT 'task',
			status VARCHAR(50) NOT NULL DEFAULT 'backlog',
			priority VARCHAR(20) NOT NULL DEFAULT 'medium',
			assignee_id UUID,
			reporter_id UUID NOT NULL,
			sprint_id UUID REFERENCES sprints(id),
			column_id UUID REFERENCES columns_(id),
			story_points INT,
			parent_issue_id UUID REFERENCES issues(id),
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			author_id UUID NOT NULL,
			body TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS labels (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			name VARCHAR(100) NOT NULL,
			color VARCHAR(20) NOT NULL DEFAULT '#6366f1'
		)`,
		`CREATE TABLE IF NOT EXISTS issue_labels (
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
			PRIMARY KEY (issue_id, label_id)
		)`,
		`CREATE TABLE IF NOT EXISTS attachments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			filename VARCHAR(255) NOT NULL,
			uploaded_by UUID NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		// Create sequence for issue keys
		`CREATE SEQUENCE IF NOT EXISTS issue_key_seq START 1`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, m)
		}
	}

	return nil
}
