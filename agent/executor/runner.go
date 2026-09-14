package executor

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/workspace-cloud/agent/compose"
	"github.com/workspace-cloud/agent/devcontainer"
)

// ScriptStatus represents the status of entry execution
type ScriptStatus string

const (
	StatusPending ScriptStatus = "pending"
	StatusRunning ScriptStatus = "running"
	StatusSuccess ScriptStatus = "success"
	StatusFailed  ScriptStatus = "failed"
	StatusTimeout ScriptStatus = "timeout"
	StatusSkipped ScriptStatus = "skipped"
)

// EntryKind mirrors the backend's resolveEntryKind (docs/FINAL-PLAN.md §2.4).
type EntryKind string

const (
	KindCommand      EntryKind = "command"
	KindDevcontainer EntryKind = "devcontainer"
	KindCompose      EntryKind = "compose"
)

// ResolveEntryKind maps an entry file name to its execution kind.
// Mirrors src/lib/templates/types.ts:resolveEntryKind.
func ResolveEntryKind(entry string) (EntryKind, error) {
	lower := strings.ToLower(entry)
	base := filepath.Base(lower)
	if strings.HasSuffix(base, ".json") && strings.Contains(base, "devcontainer") {
		return KindDevcontainer, nil
	}
	if strings.HasSuffix(base, ".yml") || strings.HasSuffix(base, ".yaml") {
		return KindCompose, nil
	}
	if strings.HasSuffix(base, ".sh") {
		return KindCommand, nil
	}
	return "", fmt.Errorf("unrecognised entry: %s", entry)
}

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Phase     string    `json:"phase,omitempty"`
	Message   string    `json:"message"`
}

// 日志通道限制（docs/AGENT-LIFECYCLE.md §6 D16）：
// 内存环形限量 maxLogBuffer 条，前端丢弃；磁盘滚动文件 ~20MB 轮转一次。
const (
	maxLogBuffer = 5000

	diskLogPath     = "/var/log/meterspace-agent/entry.log"
	maxDiskLogBytes = 20 * 1024 * 1024
)

// Options configures RunEntry.
type Options struct {
	// EntryPath is the absolute path of the entry file.
	EntryPath string
	// Entry is the relative entry name (used to pick the runner).
	Entry string
	// WorkspaceRoot is the working directory for the entry process.
	WorkspaceRoot string
	// Timeout bounds the whole entry execution.
	Timeout time.Duration
	// ExtraEnv is appended to the process environment (WS_* vars, §6.1).
	ExtraEnv []string
}

// Executor handles entry execution
type Executor struct {
	scriptPath     string
	timeout        time.Duration
	status         ScriptStatus
	error          string
	logs           []LogEntry
	// streamed 是「已交给日志通道」的水位（条数）。通道满被丢弃的条目不会前移，
	// 之后的 UnstreamedLogs() 会原样补发（docs/AGENT-LIFECYCLE.md §6）。
	streamed       int
	diskLog        *os.File
	logsMu         sync.RWMutex
	onLog          func(LogEntry)
	onStatusChange func(ScriptStatus, string)
	logCh          chan<- LogEntry

	// template-mode fields (set via Configure)
	opts *Options
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

// GetLogCount returns the number of logs kept in the ring
func (e *Executor) GetLogCount() int {
	e.logsMu.RLock()
	defer e.logsMu.RUnlock()
	return len(e.logs)
}

// UnstreamedLogs returns the logs that have not yet been handed to the log
// stream channel since the last successful handover (i.e. past the watermark),
// and advances the watermark past them. Used by the failure path to re-send
// anything that was dropped when the channel was full (docs/AGENT-LIFECYCLE.md §6).
func (e *Executor) UnstreamedLogs() []LogEntry {
	e.logsMu.Lock()
	defer e.logsMu.Unlock()
	if e.streamed >= len(e.logs) {
		return nil
	}
	logs := make([]LogEntry, len(e.logs)-e.streamed)
	copy(logs, e.logs[e.streamed:])
	e.streamed = len(e.logs)
	return logs
}

// Configure switches the executor into template mode: subsequent RunEntry()
// calls use opts instead of scriptPath.
func (e *Executor) Configure(opts *Options) {
	e.opts = opts
	if opts.Timeout > 0 {
		e.timeout = opts.Timeout
	}
}

// RunEntry executes the configured entry. It is the template-protocol
// replacement for the old Execute() (docs/FINAL-PLAN.md §12.1).
//
// Dispatch (docs/FINAL-PLAN.md §2.4):
//
//	*.sh                    → bash <file>
//	devcontainer.json       → devcontainer up --workspace-folder <root>
//	*.yml / *.yaml          → docker compose -f <file> up -d
func (e *Executor) RunEntry(ctx context.Context) error {
	o := e.opts
	if o == nil {
		// No template config: fall back to the legacy script path.
		return e.Execute()
	}

	kind, err := ResolveEntryKind(o.Entry)
	if err != nil {
		e.setStatus(StatusFailed, err.Error())
		return err
	}

	// entry file must exist on disk
	if _, err := os.Stat(o.EntryPath); err != nil {
		msg := fmt.Sprintf("entry file missing: %s", o.EntryPath)
		e.setStatus(StatusFailed, msg)
		return fmt.Errorf("%s", msg)
	}

	e.logf("info", fmt.Sprintf("entry=%s kind=%s root=%s timeout=%s",
		o.Entry, kind, o.WorkspaceRoot, o.Timeout))

	timeout := o.Timeout
	if timeout <= 0 {
		timeout = e.timeout
	}
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	e.setStatus(StatusRunning, "")

	switch kind {
	case KindCommand:
		if isBlankScript(o.EntryPath) {
			e.logf("info", "blank entry detected — nothing to run, skipping")
			e.setStatus(StatusSkipped, "")
			return nil
		}
		err = e.runCommand(runCtx, o)
	case KindDevcontainer:
		err = e.runDevcontainer(runCtx, o)
	case KindCompose:
		err = e.runCompose(runCtx, o)
	default:
		err = fmt.Errorf("unsupported entry kind: %s", kind)
	}

	if err != nil {
		if runCtx.Err() == context.DeadlineExceeded {
			msg := fmt.Sprintf("entry timed out after %s", timeout)
			e.setStatus(StatusTimeout, msg)
			return fmt.Errorf("%s", msg)
		}
		e.setStatus(StatusFailed, err.Error())
		return err
	}

	e.setStatus(StatusSuccess, "")
	return nil
}

// isBlankScript reports whether the entry is an effectively empty shell script
// (only shebang/comments/whitespace) — such templates start no process.
func isBlankScript(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		return false
	}
	return true
}

// runCommand runs `bash <entry>` with the workspace as working directory.
func (e *Executor) runCommand(ctx context.Context, o *Options) error {
	cmd := exec.CommandContext(ctx, "bash", o.EntryPath)
	cmd.Dir = o.WorkspaceRoot
	cmd.Env = buildEnv(o.ExtraEnv)

	return e.pump(ctx, cmd)
}

// runDevcontainer invokes the official devcontainer CLI (§5.2).
func (e *Executor) runDevcontainer(ctx context.Context, o *Options) error {
	r := devcontainer.New(o.WorkspaceRoot, func(level, msg string) {
		e.addLog(LogEntry{Timestamp: time.Now(), Level: level, Phase: "devcontainer", Message: msg})
	})
	if !r.Available() {
		return fmt.Errorf("devcontainer CLI 不可用：请确认 entrypoint.sh 已从 %s 拉取 CLI bundle", "public/devcontainer-cli.tar.gz")
	}

	done := make(chan error, 1)
	go func() { done <- r.Up() }()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("devcontainer up cancelled: %w", ctx.Err())
	}
}

// runCompose invokes `docker compose up -d` (§5.3).
func (e *Executor) runCompose(ctx context.Context, o *Options) error {
	r := compose.New(o.WorkspaceRoot, o.Entry, func(level, msg string) {
		e.addLog(LogEntry{Timestamp: time.Now(), Level: level, Phase: "compose", Message: msg})
	})
	if !r.Available() {
		return fmt.Errorf("docker CLI 不可用：COMPOSE 型 entry 需要实例内安装 docker")
	}

	done := make(chan error, 1)
	go func() { done <- r.Up() }()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("docker compose up cancelled: %w", ctx.Err())
	}
}

// buildEnv assembles the process environment with the WS_* variables (§6.1).
func buildEnv(extra []string) []string {
	env := append(os.Environ(),
		"HOME=/root",
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"DEBIAN_FRONTEND=noninteractive",
	)
	env = append(env, extra...)
	return env
}

// pump starts cmd, streams stdout/stderr into the log channel, and waits.
func (e *Executor) pump(ctx context.Context, cmd *exec.Cmd) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", cmd.Path, err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); e.readOutput(stdout, "info") }()
	go func() { defer wg.Done(); e.readOutput(stderr, "warning") }()

	// Killing on context cancellation unblocks the pipe readers.
	waitErr := make(chan error, 1)
	go func() { waitErr <- cmd.Wait() }()

	select {
	case <-ctx.Done():
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-waitErr
		wg.Wait()
		return ctx.Err()
	case err := <-waitErr:
		wg.Wait()
		if err != nil {
			return fmt.Errorf("entry exited non-zero: %w", err)
		}
		return nil
	}
}

// Execute runs the legacy startup script (kept for backwards compatibility).
func (e *Executor) Execute() error {
	if _, err := os.Stat(e.scriptPath); os.IsNotExist(err) {
		return fmt.Errorf("script not found: %s", e.scriptPath)
	}

	e.setStatus(StatusRunning, "")

	cmd := exec.Command("bash", e.scriptPath)
	cmd.Env = buildEnv(nil)

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

	if err := cmd.Start(); err != nil {
		e.setStatus(StatusFailed, fmt.Sprintf("failed to start script: %v", err))
		return err
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		e.readOutput(stdout, "info")
	}()

	go func() {
		defer wg.Done()
		e.readOutput(stderr, "warning")
	}()

	wg.Wait()

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
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		entry := LogEntry{
			Timestamp: time.Now(),
			Level:     level,
			Message:   scanner.Text(),
		}
		e.addLog(entry)
	}
}

// addLog adds a log entry
func (e *Executor) addLog(entry LogEntry) {
	e.logsMu.Lock()
	e.logs = append(e.logs, entry)
	if len(e.logs) > maxLogBuffer {
		// 环形：前端裁剪；被裁剪掉的条目视作已处理，水位随滑窗前移
		dropped := len(e.logs) - maxLogBuffer
		e.logs = e.logs[dropped:]
		e.streamed -= dropped
		if e.streamed < 0 {
			e.streamed = 0
		}
	}
	e.writeDiskLog(entry)
	e.logsMu.Unlock()

	if e.onLog != nil {
		e.onLog(entry)
	}

	if e.logCh != nil {
		select {
		case e.logCh <- entry:
			e.logsMu.Lock()
			e.streamed++
			e.logsMu.Unlock()
		default:
			// Channel full, drop to avoid blocking; watermark stays put so
			// the failure path can re-send it via UnstreamedLogs.
		}
	}
}

// writeDiskLog appends the entry to the rolling disk log, rotating at ~20MB.
// Best-effort: any failure is silently ignored (memory ring remains authoritative).
func (e *Executor) writeDiskLog(entry LogEntry) {
	if e.diskLog == nil {
		if err := os.MkdirAll(filepath.Dir(diskLogPath), 0o755); err != nil {
			return
		}
		f, err := os.OpenFile(diskLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		e.diskLog = f
	}
	line := fmt.Sprintf("%s [%s] %s\n", entry.Timestamp.Format(time.RFC3339), entry.Level, entry.Message)
	if fi, err := e.diskLog.Stat(); err == nil && fi.Size() > maxDiskLogBytes {
		_ = e.diskLog.Close()
		_ = os.Rename(diskLogPath, diskLogPath+".1")
		if f, err := os.OpenFile(diskLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
			e.diskLog = f
		} else {
			e.diskLog = nil
		}
	}
	_, _ = e.diskLog.WriteString(line)
}

func (e *Executor) logf(level, msg string) {
	e.addLog(LogEntry{Timestamp: time.Now(), Level: level, Phase: "entry", Message: msg})
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
	e.streamed = 0
	e.logsMu.Unlock()
	e.status = StatusPending
	e.error = ""
}
