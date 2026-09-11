package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/activity"
	"github.com/workspace-cloud/agent/config"
	"github.com/workspace-cloud/agent/crypto"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/heartbeat"
	"github.com/workspace-cloud/agent/reporter"
)

// Server is the HTTP API server
type Server struct {
	cfg       *config.Config
	executor  *executor.Executor
	heartbeat *heartbeat.Manager
	tracker   *access.Tracker
	reporter  *reporter.Reporter
	detector  *activity.Detector
	server    *http.Server
	mu        sync.RWMutex
}

// NewServer creates a new API server
func NewServer(
	cfg *config.Config,
	exec *executor.Executor,
	hb *heartbeat.Manager,
	tracker *access.Tracker,
	r *reporter.Reporter,
	detector *activity.Detector,
) *Server {
	return &Server{
		cfg:       cfg,
		executor:  exec,
		heartbeat: hb,
		tracker:   tracker,
		reporter:  r,
		detector:  detector,
	}
}

// Start starts the HTTP server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Health check (no auth required)
	mux.HandleFunc("/health", s.handleHealth)

	// Authenticated endpoints
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/logs", s.handleLogs)
	mux.HandleFunc("/command", s.handleCommand)

	s.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.cfg.Port),
		Handler: s.withLogging(mux),
	}

	fmt.Printf("[api] Server starting on port %d\n", s.cfg.Port)
	return s.server.ListenAndServe()
}

// Stop gracefully stops the server
func (s *Server) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

// withLogging adds request logging
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Track access
		ip := access.ExtractIP(
			r.RemoteAddr,
			r.Header.Get("X-Forwarded-For"),
			r.Header.Get("X-Real-IP"),
		)
		userAgent := r.Header.Get("User-Agent")
		s.tracker.Record(ip, userAgent)

		// An authenticated API call is a direct sign of use — reflect it in the
		// activity detector so the idle watchdog does not reclaim a live session.
		if s.detector != nil && r.URL.Path != "/health" {
			s.detector.MarkActive()
		}

		next.ServeHTTP(w, r)

		duration := time.Since(start)
		fmt.Printf("[api] %s %s from %s (%v)\n", r.Method, r.URL.Path, ip, duration)
	})
}

// handleHealth handles GET /health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status := "healthy"
	scriptStatus := "unknown"
	if s.executor != nil {
		scriptStatus = string(s.executor.GetStatus())
	}

	response := map[string]interface{}{
		"status":        status,
		"agent_version": "1.0.0",
		"uptime":        int64(time.Since(time.Now()).Seconds()),
		"script_status": scriptStatus,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleStatus handles GET /status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify authentication
	if !s.authenticateRequest(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get access summary
	var accessSummary *access.AccessSummary
	if s.tracker != nil {
		summary := s.tracker.GetSummary()
		accessSummary = &summary
	}

	response := map[string]interface{}{
		"instance_id":    s.cfg.InstanceID,
		"status":         s.heartbeat.GetStatus(),
		"script_status":  s.executor.GetStatus(),
		"uptime":         int64(s.heartbeat.GetUptime().Seconds()),
		"access_summary": accessSummary,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleLogs handles GET /logs
func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify authentication
	if !s.authenticateRequest(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query parameters
	offset := 0
	limit := 100
	if o := r.URL.Query().Get("offset"); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	// Get logs
	allLogs := s.executor.GetLogs()
	total := len(allLogs)

	// Apply offset and limit
	start := offset
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}
	logs := allLogs[start:end]

	response := map[string]interface{}{
		"logs":     logs,
		"total":    total,
		"has_more": end < total,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleCommand handles POST /command
func (s *Server) handleCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify authentication
	if !s.authenticateRequest(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Verify IP whitelist
	ip := access.ExtractIP(
		r.RemoteAddr,
		r.Header.Get("X-Forwarded-For"),
		r.Header.Get("X-Real-IP"),
	)
	if !s.cfg.IsAllowedIP(ip) {
		http.Error(w, "Forbidden: IP not allowed", http.StatusForbidden)
		return
	}

	// Parse request body
	var request struct {
		Action    string `json:"action"`
		Timestamp string `json:"timestamp"`
		Signature string `json:"signature"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Verify timestamp
	if !crypto.IsTimestampValidDefault(request.Timestamp) {
		http.Error(w, "Invalid or expired timestamp", http.StatusBadRequest)
		return
	}

	// Verify signature using instance_id
	if !crypto.VerifySignature(s.cfg.BackendToken, s.cfg.InstanceID, request.Action, request.Timestamp, request.Signature) {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	// Execute command
	var response map[string]interface{}

	switch request.Action {
	case "run_entry":
		// Debug/retry hook for the template entry (docs/FINAL-PLAN.md §12.1).
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 35*time.Minute)
			defer cancel()
			if err := s.executor.RunEntry(ctx); err != nil {
				fmt.Printf("[api] run_entry failed: %v\n", err)
			}
		}()
		response = map[string]interface{}{
			"status":  "accepted",
			"action":  request.Action,
			"message": "Entry execution started",
		}
	case "retry_script":
		go s.executor.Execute()
		response = map[string]interface{}{
			"status":  "accepted",
			"action":  request.Action,
			"message": "Script execution started",
		}
	case "prepare_reclaim":
		response = map[string]interface{}{
			"status":  "accepted",
			"action":  request.Action,
			"message": "Prepare for reclaim",
		}
	case "force_stop":
		response = map[string]interface{}{
			"status":  "accepted",
			"action":  request.Action,
			"message": "Force stop initiated",
		}
	default:
		http.Error(w, "Unknown action", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// authenticateRequest verifies the request authentication
func (s *Server) authenticateRequest(r *http.Request) bool {
	// Check for agent token in header
	token := r.Header.Get("Authorization")
	if token == "Bearer "+s.cfg.BackendToken {
		return true
	}

	// Check for token in query parameter
	if t := r.URL.Query().Get("token"); t == s.cfg.BackendToken {
		return true
	}

	return false
}

// GetStatus returns the agent status
func (s *Server) GetStatus() string {
	if s.heartbeat != nil {
		return s.heartbeat.GetStatus()
	}
	return "unknown"
}
