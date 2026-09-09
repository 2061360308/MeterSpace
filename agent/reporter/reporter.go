package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/workspace-cloud/agent/access"
)

// Reporter handles communication with the backend
type Reporter struct {
	backendURL   string
	backendToken string
	instanceID   string
	client       *http.Client

	// Log streaming
	logBuffer []LogEntry
	logMu     sync.Mutex
	logCh     chan LogEntry
	doneCh    chan struct{}
}

// NewReporter creates a new reporter
func NewReporter(backendURL, backendToken, instanceID string) *Reporter {
	r := &Reporter{
		backendURL:   backendURL,
		backendToken: backendToken,
		instanceID:   instanceID,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logCh:  make(chan LogEntry, 100),
		doneCh: make(chan struct{}),
	}
	go r.logStreamLoop()
	return r
}

// HeartbeatPayload represents the heartbeat data
type HeartbeatPayload struct {
	Token          string                `json:"token"`
	WorkspaceID    string                `json:"workspace_id"`
	InstanceID     string                `json:"instance_id,omitempty"`
	Status         string                `json:"status"`
	Active         bool                  `json:"active"`
	Uptime         int64                 `json:"uptime"`
	LastActiveAt   time.Time             `json:"last_active_at"`
	ScriptStatus   string                `json:"script_status"`
	ScriptError    string                `json:"script_error,omitempty"`
	ResourceUsage  *ResourceUsage        `json:"resource_usage,omitempty"`
	AccessSummary  *access.AccessSummary `json:"access_summary,omitempty"`
	Metadata       *Metadata             `json:"metadata,omitempty"`
}

// ResourceUsage represents resource usage
type ResourceUsage struct {
	CPUPercent float64 `json:"cpu_percent"`
	MemoryMB   int64   `json:"memory_mb"`
	DiskMB     int64   `json:"disk_mb"`
}

// Metadata represents additional metadata
type Metadata struct {
	IDEConnected  bool   `json:"ide_connected"`
	TerminalCount int    `json:"terminal_count"`
	GitDirty      bool   `json:"git_dirty"`
	AgentVersion  string `json:"agent_version"`
}

// ReadyPayload represents the ready notification
type ReadyPayload struct {
	Token        string `json:"token"`
	InstanceID   string `json:"instance_id"`
	PublicIP     string `json:"public_ip"`
	AgentVersion string `json:"agent_version"`
}

// StatusPayload represents status change
type StatusPayload struct {
	Token    string `json:"token"`
	Status   string `json:"status"`
	Phase    string `json:"phase,omitempty"`
	Message  string `json:"message,omitempty"`
}

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Phase     string    `json:"phase,omitempty"`
	Message   string    `json:"message"`
}

// LogsPayload represents log upload
type LogsPayload struct {
	Token string     `json:"token"`
	Logs  []LogEntry `json:"logs"`
}

// ErrorPayload represents error report
type ErrorPayload struct {
	Token  string `json:"token"`
	Error  string `json:"error"`
	Phase  string `json:"phase,omitempty"`
}

// SendLog queues a log entry for streaming to backend
func (r *Reporter) SendLog(entry LogEntry) {
	select {
	case r.logCh <- entry:
	default:
		// Channel full, drop log to avoid blocking
	}
}

// logStreamLoop reads logs from channel and sends in batches
func (r *Reporter) logStreamLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case entry := <-r.logCh:
			r.logMu.Lock()
			r.logBuffer = append(r.logBuffer, entry)
			// Flush if buffer is large
			if len(r.logBuffer) >= 10 {
				r.flushLogs()
			}
			r.logMu.Unlock()
		case <-ticker.C:
			r.logMu.Lock()
			if len(r.logBuffer) > 0 {
				r.flushLogs()
			}
			r.logMu.Unlock()
		case <-r.doneCh:
			// Final flush
			r.logMu.Lock()
			r.flushLogs()
			r.logMu.Unlock()
			return
		}
	}
}

// flushLogs sends buffered logs to backend
func (r *Reporter) flushLogs() {
	if len(r.logBuffer) == 0 {
		return
	}
	logs := r.logBuffer
	r.logBuffer = nil
	r.logMu.Unlock()
	r.ReportLogs(logs)
	r.logMu.Lock()
}

// Stop stops the log stream
func (r *Reporter) Stop() {
	close(r.doneCh)
}

// GetToken returns the backend token
func (r *Reporter) GetToken() string {
	return r.backendToken
}

// ReportReady notifies the backend that the agent is ready
func (r *Reporter) ReportReady(instanceID, publicIP, agentVersion string) error {
	payload := ReadyPayload{
		Token:        r.backendToken,
		InstanceID:   instanceID,
		PublicIP:     publicIP,
		AgentVersion: agentVersion,
	}
	return r.post("/agent-ready", payload)
}

// ReportHeartbeat sends heartbeat to the backend
func (r *Reporter) ReportHeartbeat(payload *HeartbeatPayload) error {
	return r.post("/agent-heartbeat", payload)
}

// ReportStatus reports status change
func (r *Reporter) ReportStatus(status, phase, message string) error {
	payload := StatusPayload{
		Token:   r.backendToken,
		Status:  status,
		Phase:   phase,
		Message: message,
	}
	return r.post("/agent-status", payload)
}

// ReportLogs uploads logs to the backend
func (r *Reporter) ReportLogs(logs []LogEntry) error {
	if len(logs) == 0 {
		return nil
	}
	payload := LogsPayload{
		Token: r.backendToken,
		Logs:  logs,
	}
	return r.post("/agent-logs", payload)
}

// ReportError reports an error
func (r *Reporter) ReportError(errorMsg, phase string) error {
	payload := ErrorPayload{
		Token: r.backendToken,
		Error: errorMsg,
		Phase: phase,
	}
	return r.post("/agent-error", payload)
}

// post sends a POST request to the backend
func (r *Reporter) post(path string, payload interface{}) error {
	url := fmt.Sprintf("%s/api/instances/%s%s", r.backendURL, r.instanceID, path)

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "workspace-agent/1.0.0")

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("backend returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
