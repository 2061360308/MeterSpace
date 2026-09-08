package executor

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ScriptStatus represents the status of script execution
type ScriptStatus string

const (
	StatusPending  ScriptStatus = "pending"
	StatusRunning  ScriptStatus = "running"
	StatusSuccess  ScriptStatus = "success"
	StatusFailed   ScriptStatus = "failed"
	StatusTimeout  ScriptStatus = "timeout"
)

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Phase     string    `json:"phase,omitempty"`
	Message   string    `json:"message"`
}

// Executor handles script execution
type Executor struct {
	scriptPath     string
	timeout        time.Duration
	status         ScriptStatus
	error          string
	logs           []LogEntry
	logsMu         sync.RWMutex
	onLog          func(LogEntry)
	onStatusChange func(ScriptStatus, string)
	logCh          chan<- LogEntry
}

// NewExecutor creates a new executor
func NewExecutor(scriptPath string, timeout time.Duration) *Executor {
	return &Executor{
		scriptPath: scriptPath,
		timeout:    timeout,
		status:     StatusPending,
		logs:       make([]LogEntry, 0),
	}
}

// SetOnLog sets the callback for log entries
func (e *Executor) SetOnLog(fn func(LogEntry)) {
	e.onLog = fn
}

// SetOnStatusChange sets the callback for status changes
func (e *Executor) SetOnStatusChange(fn func(ScriptStatus, string)) {
	e.onStatusChange = fn
}

// SetLogChannel sets a channel for streaming logs
func (e *Executor) SetLogChannel(ch chan<- LogEntry) {
	e.logCh = ch
}

// GetStatus returns the current script status
func (e *Executor) GetStatus() ScriptStatus {
	return e.status
}

// GetError returns the error message if status is failed
func (e *Executor) GetError() string {
	return e.error
}

// GetLogs returns a copy of the logs
func (e *Executor) GetLogs() []LogEntry {
	e.logsMu.RLock()
	defer e.logsMu.RUnlock()
	logs := make([]LogEntry, len(e.logs))
	copy(logs, e.logs)
	return logs
}

// GetLogsSince returns logs since a specific index
func (e *Executor) GetLogsSince(index int) []LogEntry {
	e.logsMu.RLock()
	defer e.logsMu.RUnlock()
	if index >= len(e.logs) {
		return nil
	}
	logs := make([]LogEntry, len(e.logs)-index)
	copy(logs, e.logs[index:])
	return logs
}

// GetLogCount returns the number of logs
func (e *Executor) GetLogCount() int {
	e.logsMu.RLock()
	defer e.logsMu.RUnlock()
	return len(e.logs)
}

// Execute runs the script
func (e *Executor) Execute() error {
	// Check if script exists
	if _, err := os.Stat(e.scriptPath); os.IsNotExist(err) {
		return fmt.Errorf("script not found: %s", e.scriptPath)
	}

	e.setStatus(StatusRunning, "")

	// Create command
	cmd := exec.Command("bash", e.scriptPath)

	// Get stdout and stderr pipes
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		e.setStatus(StatusFailed, fmt.Sprintf("failed to create stdout pipe: %v", err))
		return err
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		e.setStatus(StatusFailed, fmt.Sprintf("failed to create stderr pipe: %v", err))
		return err
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		e.setStatus(StatusFailed, fmt.Sprintf("failed to start script: %v", err))
		return err
	}

	// Read stdout and stderr concurrently
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		e.readOutput(stdout, "info")
	}()

	go func() {
		defer wg.Done()
		e.readOutput(stderr, "error")
	}()

	// Wait for output reading to complete
	wg.Wait()

	// Wait for command to finish with timeout
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		if err != nil {
			e.setStatus(StatusFailed, fmt.Sprintf("script execution failed: %v", err))
			return err
		}
		e.setStatus(StatusSuccess, "")
		return nil
	case <-time.After(e.timeout):
		// Kill the process on timeout
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		e.setStatus(StatusTimeout, "script execution timed out")
		return fmt.Errorf("script execution timed out after %v", e.timeout)
	}
}

// readOutput reads from a reader and processes each line
func (e *Executor) readOutput(r io.Reader, level string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		entry := LogEntry{
			Timestamp: time.Now(),
			Level:     level,
			Message:   line,
		}
		e.addLog(entry)
	}
}

// addLog adds a log entry
func (e *Executor) addLog(entry LogEntry) {
	e.logsMu.Lock()
	e.logs = append(e.logs, entry)
	e.logsMu.Unlock()

	if e.onLog != nil {
		e.onLog(entry)
	}

	// Send to channel for streaming to backend
	if e.logCh != nil {
		select {
		case e.logCh <- entry:
		default:
			// Channel full, drop to avoid blocking
		}
	}
}

// setStatus updates the script status
func (e *Executor) setStatus(status ScriptStatus, errMsg string) {
	e.status = status
	e.error = errMsg

	if e.onStatusChange != nil {
		e.onStatusChange(status, errMsg)
	}
}

// Reset resets the executor state
func (e *Executor) Reset() {
	e.logsMu.Lock()
	e.logs = make([]LogEntry, 0)
	e.logsMu.Unlock()
	e.status = StatusPending
	e.error = ""
}
