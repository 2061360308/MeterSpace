package heartbeat

import (
	"math/rand"
	"sync"
	"time"

	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/reporter"
)

// Manager handles heartbeat sending
type Manager struct {
	reporter        *reporter.Reporter
	accessTracker   *access.Tracker
	executor        *executor.Executor
	interval        time.Duration
	jitter          time.Duration
	workspaceID     string
	instanceID      string
	agentVersion    string
	startTime       time.Time
	lastActiveAt    time.Time
	active          bool
	status          string
	mu              sync.RWMutex
	stopCh          chan struct{}
}

// NewManager creates a new heartbeat manager
func NewManager(
	r *reporter.Reporter,
	at *access.Tracker,
	e *executor.Executor,
	interval, jitter time.Duration,
	workspaceID, agentVersion string,
) *Manager {
	return &Manager{
		reporter:      r,
		accessTracker: at,
		executor:      e,
		interval:      interval,
		jitter:        jitter,
		workspaceID:   workspaceID,
		agentVersion:  agentVersion,
		startTime:     time.Now(),
		lastActiveAt:  time.Now(),
		active:        false,
		status:        "starting",
		stopCh:        make(chan struct{}),
	}
}

// SetInstanceID sets the instance ID
func (m *Manager) SetInstanceID(instanceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.instanceID = instanceID
}

// SetStatus sets the agent status
func (m *Manager) SetStatus(status string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status = status
}

// GetStatus returns the agent status
func (m *Manager) GetStatus() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.status
}

// SetActive marks the agent as active
func (m *Manager) SetActive(active bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.active = active
	if active {
		m.lastActiveAt = time.Now()
	}
}

// UpdateActivity records user activity
func (m *Manager) UpdateActivity() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastActiveAt = time.Now()
	m.active = true
}

// Start begins the heartbeat loop
func (m *Manager) Start() {
	go m.heartbeatLoop()
}

// Stop stops the heartbeat loop
func (m *Manager) Stop() {
	close(m.stopCh)
}

// heartbeatLoop sends heartbeats at regular intervals
func (m *Manager) heartbeatLoop() {
	for {
		select {
		case <-m.stopCh:
			return
		default:
			m.sendHeartbeat()
			// Add jitter to prevent thundering herd
			jitter := time.Duration(rand.Int63n(int64(m.jitter)))
			time.Sleep(m.interval + jitter)
		}
	}
}

// sendHeartbeat sends a single heartbeat
func (m *Manager) sendHeartbeat() {
	m.mu.RLock()
	instanceID := m.instanceID
	status := m.status
	active := m.active
	lastActiveAt := m.lastActiveAt
	m.mu.RUnlock()

	// Get script status
	scriptStatus := "unknown"
	scriptError := ""
	if m.executor != nil {
		scriptStatus = string(m.executor.GetStatus())
		scriptError = m.executor.GetError()
	}

	// Get access summary
	var accessSummary *access.AccessSummary
	if m.accessTracker != nil {
		summary := m.accessTracker.GetSummary()
		accessSummary = &summary
	}

	// Get resource usage (placeholder - would need gopsutil integration)
	resourceUsage := &reporter.ResourceUsage{
		CPUPercent: 0,
		MemoryMB:   0,
		DiskMB:     0,
	}

	// Build metadata
	metadata := &reporter.Metadata{
		IDEConnected: active,
		TerminalCount: 0,
		GitDirty:      false,
		AgentVersion:  m.agentVersion,
	}

	// Build heartbeat payload
	payload := &reporter.HeartbeatPayload{
		Token:          m.reporter.GetToken(),
		WorkspaceID:   m.workspaceID,
		InstanceID:    instanceID,
		Status:        status,
		Active:        active,
		Uptime:        int64(time.Since(m.startTime).Seconds()),
		LastActiveAt:  lastActiveAt,
		ScriptStatus:  scriptStatus,
		ScriptError:   scriptError,
		ResourceUsage: resourceUsage,
		AccessSummary: accessSummary,
		Metadata:      metadata,
	}

	// Send heartbeat
	if err := m.reporter.ReportHeartbeat(payload); err != nil {
		// Log error but don't stop heartbeat
		println("[heartbeat] Failed to send heartbeat:", err.Error())
	}
}

// IsIdle checks if the agent has been idle for too long
func (m *Manager) IsIdle(idleMinutes int) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	idleDuration := time.Duration(idleMinutes) * time.Minute
	return time.Since(m.lastActiveAt) > idleDuration
}

// GetUptime returns the agent uptime
func (m *Manager) GetUptime() time.Duration {
	return time.Since(m.startTime)
}

// GetLastActiveAt returns the last active time
func (m *Manager) GetLastActiveAt() time.Time {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lastActiveAt
}

// IsActive returns whether the agent is active
func (m *Manager) IsActive() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}
