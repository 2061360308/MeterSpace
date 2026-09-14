package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/activity"
	"github.com/workspace-cloud/agent/config"
	"github.com/workspace-cloud/agent/crypto"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/heartbeat"
	"github.com/workspace-cloud/agent/reporter"
	"github.com/workspace-cloud/agent/stop"
)

// preStopScriptPath 是 pre_stop 指令脚本落盘位置（临时文件 + rename 原子写）。
const preStopScriptPath = "/opt/agent/pre-stop.sh"

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

	// pre-stop：并发防重 + 回收脚本执行器（docs/AGENT-PRESTOP.md §7.4）
	stopRunner  *stop.Runner
	stopMu      sync.Mutex
	stopRunning bool
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
		stopRunner: stop.NewRunner(cfg.WorkspaceDir, func(level, msg string) {
			full := fmt.Sprintf("[pre-stop] %s: %s", level, msg)
			fmt.Println(full)
			r.SendLog(reporter.LogEntry{
				Timestamp: time.Now(),
				Level:     level,
				Phase:     "pre_stop",
				Message:   full,
			})
		}),
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
		"agent_version": "1.1.0",
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
		Script    string `json:"script"`
		Timeout   int    `json:"timeout"`
		Reason    string `json:"reason"`
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

	// Verify signature: message = `<workspace_id>:<action>:<timestamp>`（docs/AGENT-PRESTOP.md 协议）。
	// HMAC key = backend token = 后端 `instances.accessToken`。
	if !crypto.VerifySignature(s.cfg.BackendToken, s.cfg.WorkspaceID, request.Action, request.Timestamp, request.Signature) {
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
	case "pre_stop":
		if err := s.startPreStop(request); err != nil {
			http.Error(w, err.Error(), err.Status)
			return
		}
		response = map[string]interface{}{
			"status":  "accepted",
			"action":  request.Action,
			"message": "Pre-stop started",
		}
	default:
		http.Error(w, "Unknown action", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

type httpError struct {
	Status  int
	Message string
}

func (e *httpError) Error() string { return e.Message }

// startPreStop 校验并启动一次 pre-stop 执行（docs/AGENT-PRESTOP.md §7.4）。
// 落盘脚本 → 防重检查 → 后台执行 → 立即 200；执行完由 goroutine 上报 ready-stop。
func (s *Server) startPreStop(request struct {
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
	Signature string `json:"signature"`
	Script    string `json:"script"`
	Timeout   int    `json:"timeout"`
	Reason    string `json:"reason"`
}) *httpError {
	if request.Script == "" {
		return &httpError{http.StatusBadRequest, "script is required"}
	}

	timeout := request.Timeout
	if timeout <= 0 {
		timeout = 120
	}
	if timeout > 300 {
		timeout = 300
	}

	s.stopMu.Lock()
	if s.stopRunning {
		s.stopMu.Unlock()
		return &httpError{http.StatusConflict, "pre_stop already in progress"}
	}
	s.stopRunning = true
	s.stopMu.Unlock()

	if err := writeStopScript(request.Script); err != nil {
		s.stopMu.Lock()
		s.stopRunning = false
		s.stopMu.Unlock()
		return &httpError{http.StatusInternalServerError, "failed to write pre-stop script: " + err.Error()}
	}

	go func() {
		defer func() {
			s.stopMu.Lock()
			s.stopRunning = false
			s.stopMu.Unlock()
		}()

		ossUsage, err := s.stopRunner.RunPreStop(preStopScriptPath, time.Duration(timeout)*time.Second)
		// 水位后补：确保 pre-stop 日志在上报结果前到达后端（与失败路径一致，见 AGENT-LIFECYCLE §6）
		s.reporter.Flush()
		if err != nil {
			fmt.Printf("[pre-stop] script failed: %v\n", err)
			_ = s.reporter.ReportReadyStop(false, 0, err.Error())
			return
		}
		fmt.Printf("[pre-stop] completed; oss_usage=%d bytes\n", ossUsage)
		_ = s.reporter.ReportReadyStop(true, ossUsage, "")
	}()

	return nil
}

// writeStopScript 原子写入 pre-stop 脚本（tmp + rename，0700）。
func writeStopScript(content string) error {
	tmp := preStopScriptPath + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o700); err != nil {
		return err
	}
	return os.Rename(tmp, preStopScriptPath)
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
