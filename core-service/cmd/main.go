package main

import (
	"log"
	"os"
	"strconv"

	"github.com/dipto-kainin/kai"
	"github.com/taskforge/core-service/internal/db"
	"github.com/taskforge/core-service/internal/handlers"
	"github.com/taskforge/core-service/internal/middleware"
)

func main() {
	// Connect to database
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required but not set")
	}

	database, err := db.Connect(dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	if os.Getenv("RUN_MIGRATE_ONLY") == "true" {
		log.Println("Running core-service migrations on database...")
		if err := db.Migrate(database); err != nil {
			log.Fatalf("Failed to run migrations: %v", err)
		}
		log.Println("Core migrations applied successfully!")
		return
	}

	if os.Getenv("AUTO_MIGRATE") == "true" {
		log.Println("AUTO_MIGRATE=true: running migrations...")
		if err := db.Migrate(database); err != nil {
			log.Fatalf("Failed to run migrations: %v", err)
		}
	} else {
		log.Println("Skipping migrations (set AUTO_MIGRATE=true to run, or use: ./taskforge.sh migrate core)")
	}

	// Get service URLs
	jwksURL := os.Getenv("JWKS_URL")
	if jwksURL == "" {
		jwksURL = "http://localhost:8080/.well-known/jwks.json"
	}
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://localhost:8080"
	}
	searchServiceURL := os.Getenv("EXTERNAL_SERVICES_URL")
	if searchServiceURL == "" {
		searchServiceURL = "http://localhost:8000"
	}
	gatewayNotifyURL := os.Getenv("GATEWAY_NOTIFY_URL")
	if gatewayNotifyURL == "" {
		gatewayNotifyURL = "http://localhost:4000/internal/notify"
	}
	mailServiceURL := os.Getenv("MAIL_SERVICE_URL")
	if mailServiceURL == "" {
		// Default to the services platform (same host as search service)
		mailServiceURL = searchServiceURL
	}

	// Create app
	app := kai.NewApp()

	// Global middleware
	app.Use(kai.Logger(), kai.DamageControl(), kai.Pain_of_CORS())

	// Health check
	app.GET("/health", func(c *kai.Context) {
		c.JSON(200, map[string]string{"status": "ok"})
	})

	// Initialize handlers
	h := handlers.New(database, authServiceURL, searchServiceURL, gatewayNotifyURL, mailServiceURL)

	// Auth middleware
	authMW := middleware.JWKSAuth(jwksURL)

	// API routes
	api := app.Group("/api")

	// Dashboard — single aggregated endpoint (projects + tickets + members)
	api.GET("/dashboard", authMW, h.GetDashboard)

	// Project routes
	api.POST("/projects", authMW, h.CreateProject)
	api.GET("/projects", authMW, h.ListProjects)           // user-scoped: returns only projects the caller is a member of
	api.POST("/projects/join", authMW, h.JoinProject)
	api.POST("/projects/join-invite", authMW, h.JoinProjectViaInvite)
	api.POST("/projects/:id/join-codes", authMW, h.GenerateJoinCode)
	api.GET("/projects/:id/join-codes/active", authMW, h.GetActiveJoinCode)
	api.GET("/projects/:id", authMW, h.GetProject)

	// Project member routes
	api.GET("/projects/:id/members", authMW, h.ListProjectMembers)
	api.POST("/projects/:id/members", authMW, h.InviteToProject)
	api.DELETE("/projects/:id/members/:userId", authMW, h.RemoveFromProject)
	api.PATCH("/projects/:id/members/:userId", authMW, h.UpdateProjectMemberRole)

	// Board routes
	api.GET("/projects/:id/board", authMW, h.GetBoard)

	// Sprint routes
	api.POST("/projects/:id/sprints", authMW, h.CreateSprint)
	api.PATCH("/sprints/:id", authMW, h.UpdateSprint)

	// Issue routes
	api.POST("/issues", authMW, h.CreateIssue)
	api.GET("/issues/:id", authMW, h.GetIssue)
	api.PATCH("/issues/:id", authMW, h.UpdateIssue)
	api.DELETE("/issues/:id", authMW, h.DeleteIssue)

	// Comment routes
	api.POST("/issues/:id/comments", authMW, h.CreateComment)
	api.GET("/issues/:id/comments", authMW, h.ListComments)

	// Label routes
	api.POST("/issues/:id/labels", authMW, h.AddLabel)
	api.GET("/projects/:id/labels", authMW, h.ListLabels)
	api.POST("/projects/:id/labels", authMW, h.CreateLabel)

	// Attachment routes
	api.POST("/issues/:id/attachments", authMW, h.CreateAttachment)

	port := 8081
	if p := os.Getenv("PORT"); p != "" {
		port, _ = strconv.Atoi(p)
	}

	log.Printf("core-service starting on port %d", port)
	if err := app.Play(port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
