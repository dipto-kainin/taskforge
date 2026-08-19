package handlers

import (
	"database/sql"
	"log"
	"time"

	"github.com/dipto-kainin/kai"
	"github.com/google/uuid"
)

func (h *Handler) CreateProject(c *kai.Context) {
	data, err := c.GetJSON()
	if err != nil {
		c.JSON(400, map[string]string{"error": "invalid JSON"})
		return
	}

	key, _ := data["key"].(string)
	name, _ := data["name"].(string)
	description, _ := data["description"].(string)
	creatorID := getUserID(c)

	if key == "" || name == "" {
		c.JSON(400, map[string]string{"error": "key and name are required"})
		return
	}
	if creatorID == "" {
		c.JSON(401, map[string]string{"error": "unauthorized"})
		return
	}

	// Unique name check
	var existingCount int
	if err = h.db.QueryRow(`SELECT COUNT(*) FROM core.projects WHERE LOWER(name) = LOWER($1)`, name).Scan(&existingCount); err != nil {
		log.Printf("[CreateProject] name check error: %v", err)
	} else if existingCount > 0 {
		c.JSON(400, map[string]string{"error": "Project with this name already exists"})
		return
	}

	projectID := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO core.projects (id, key, name, description) VALUES ($1, $2, $3, $4)`,
		projectID, key, name, description,
	)
	if err != nil {
		log.Printf("[CreateProject] insert error: %v", err)
		c.JSON(500, map[string]string{"error": "failed to create project: " + err.Error()})
		return
	}

	// Creator becomes owner
	_, err = h.db.Exec(
		`INSERT INTO core.project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
		projectID, creatorID,
	)
	if err != nil {
		log.Printf("[CreateProject] set owner error: %v", err)
		c.JSON(500, map[string]string{"error": "failed to set project owner: " + err.Error()})
		return
	}

	// Default board
	boardID := uuid.New().String()
	if _, err = h.db.Exec(
		`INSERT INTO core.boards (id, project_id, name) VALUES ($1, $2, $3)`,
		boardID, projectID, "Main Board",
	); err != nil {
		log.Printf("[CreateProject] board error: %v", err)
		c.JSON(500, map[string]string{"error": "failed to create board: " + err.Error()})
		return
	}

	// Default columns
	for pos, colName := range []string{"Backlog", "To Do", "In Progress", "Done"} {
		h.db.Exec(
			`INSERT INTO core.columns_ (id, board_id, name, position) VALUES ($1, $2, $3, $4)`,
			uuid.New().String(), boardID, colName, pos,
		)
	}

	c.JSON(201, map[string]interface{}{
		"id": projectID, "key": key, "name": name, "description": description,
	})
}

// ListProjects returns only projects the current user is a member of.
func (h *Handler) ListProjects(c *kai.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(401, map[string]string{"error": "unauthorized"})
		return
	}

	rows, err := h.db.Query(
		`SELECT p.id, p.key, p.name, p.description, p.created_at, pm.role
		 FROM core.projects p
		 JOIN core.project_members pm ON pm.project_id = p.id
		 WHERE pm.user_id = $1
		 ORDER BY p.created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(500, map[string]string{"error": "failed to query projects: " + err.Error()})
		return
	}
	defer rows.Close()

	projects := []map[string]interface{}{}
	for rows.Next() {
		var id, key, name, desc, role string
		var createdAt time.Time
		rows.Scan(&id, &key, &name, &desc, &createdAt, &role)
		projects = append(projects, map[string]interface{}{
			"id": id, "key": key, "name": name,
			"description": desc, "created_at": createdAt, "my_role": role,
		})
	}

	c.JSON(200, projects)
}

func (h *Handler) GetProject(c *kai.Context) {
	id := c.Param("id")

	var projectID, key, name, desc string
	var createdAt time.Time
	err := h.db.QueryRow(
		`SELECT id, key, name, description, created_at FROM core.projects WHERE id = $1`, id,
	).Scan(&projectID, &key, &name, &desc, &createdAt)

	if err == sql.ErrNoRows {
		c.JSON(404, map[string]string{"error": "project not found"})
		return
	}
	if err != nil {
		c.JSON(500, map[string]string{"error": "database error"})
		return
	}

	c.JSON(200, map[string]interface{}{
		"id": projectID, "key": key, "name": name,
		"description": desc, "created_at": createdAt,
	})
}
