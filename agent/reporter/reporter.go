package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/workspace-cloud/agent/access"
)

// Reporter handles communication with the backend
type Reporter struct {
	backendURL   string
	backendToken string
	workspaceID  string
	client       *http.Client
}

// NewReporter creates a new reporter
func NewReporter(backendURL, backendToken, workspaceID string) *Reporter {
	return &Reporter{
		backendURL:   backendURL,
		backendToken: backendToken,
		workspaceID:  workspaceID,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// HeartbeatPayload represents the heartbeat data
type HeartbeatPayload struct {
	WorkspaceID    string              `json:"workspace_id"`
	InstanceID     string              `json:"instance_id,omitempty"`
	Status         string              `json:"status"`
	Active         bool                `json:"active"`
	Uptime         int64               `json:"uptime"`
	LastActiveAt   time.Time           `json:"last_active_at"`
	ScriptStatus   string              `json:"script_status"`
	ScriptError    string              `json:"script_error,omitempty"`
	ResourceUsage  *ResourceUsage      `json:"resource_usage,omitempty"`
	AccessSummary  *access.AccessSummary `json:"access_summary,omitempty"`
	Metadata       *Metadata           `json:"metadata,omitempty"`
}

// ResourceUsage represents resource usage
type ResourceUsage struct {
	CPUPercent float64 `json:"cpu_percent"`
	MemoryMB   int64   `json:"memory_mb"`
	DiskMB     int64   `json:"disk_mb"`
}

// Metadata represents additional metadata
type Metadata struct {
	IDEConnected bool   `json:"ide_connected"`
	TerminalCount int   `json:"terminal_count"`
	GitDirty      bool  `json:"git_dirty"`
	AgentVersion  string `json:"agent_version"`
}

// ReadyPayload represents the ready notification
type ReadyPayload struct {
	AgentToken    string `json:"agent_token"`
	InstanceID    string `json:"instance_id"`
	PublicIP      string `json:"public_ip"`
	AgentVersion  string `json:"agent_version"`
}

// StatusPayload represents status change
type StatusPayload struct {
	AgentToken string `json:"agent_token"`
	Status     string `json:"status"`
	Reason     string `json:"reason,omitempty"`
}

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
}

// LogsPayload represents log upload
type LogsPayload struct {
	AgentToken string     `json:"agent_token"`
	Logs       []LogEntry `json:"logs"`
}

// ErrorPayload represents error report
type ErrorPayload struct {
	AgentToken   string `json:"agent_token"`
	ErrorType    string `json:"error_type"`
	ErrorMessage string `json:"error_message"`
	StackTrace   string `json:"stack_trace,omitempty"`
}

// ReportReady notifies the backend that the agent is ready
func (r *Reporter) ReportReady(instanceID, publicIP, agentVersion string) error {
	payload := ReadyPayload{
		AgentToken:   r.backendToken,
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
func (r *Reporter) ReportStatus(status, reason string) error {
	payload := StatusPayload{
		AgentToken: r.backendToken,
		Status:     status,
		Reason:     reason,
	}
	return r.post("/agent-status", payload)
}

// ReportLogs uploads logs to the backend
func (r *Reporter) ReportLogs(logs []LogEntry) error {
	if len(logs) == 0 {
		return nil
	}
	payload := LogsPayload{
		AgentToken: r.backendToken,
		Logs:       logs,
	}
	return r.post("/agent-logs", payload)
}

// ReportError reports an error
func (r *Reporter) ReportError(errorType, errorMessage, stackTrace string) error {
	payload := ErrorPayload{
		AgentToken:   r.backendToken,
		ErrorType:    errorType,
		ErrorMessage: errorMessage,
		StackTrace:   stackTrace,
	}
	return r.post("/agent-error", payload)
}

// post sends a POST request to the backend
func (r *Reporter) post(path string, payload interface{}) error {
	url := fmt.Sprintf("%s/api/health/%s%s", r.backendURL, r.workspaceID, path)

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
