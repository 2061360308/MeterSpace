package heartbeat

import (
	"math/rand"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/reporter"
)

// Manager handles heartbeat sending
type Manager struct {
	reporter      *reporter.Reporter
	accessTracker *access.Tracker
	executor      *executor.Executor
	interval      time.Duration
	jitter        time.Duration
	agentVersion  string
	startTime     time.Time
	lastActiveAt  time.Time
	active        bool
	status        string
	mu            sync.RWMutex
	stopCh        chan struct{}
}

// NewManager creates a new heartbeat manager
func NewManager(
	r *reporter.Reporter,
	at *access.Tracker,
	e *executor.Executor,
	interval, jitter time.Duration,
	agentVersion string,
) *Manager {
	return &Manager{
		reporter:      r,
		accessTracker: at,
		executor:      e,
		interval:      interval,
		jitter:        jitter,
		agentVersion:  agentVersion,
		startTime:     time.Now(),
		lastActiveAt:  time.Now(),
		active:        false,
		status:        "starting",
		stopCh:        make(chan struct{}),
	}
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

// getResourceUsage gets current CPU, memory, and disk usage
func getResourceUsage() *reporter.ResourceUsage {
	// CPU usage
	cpuPercent := 0.0
	if percents, err := cpu.Percent(time.Second, false); err == nil && len(percents) > 0 {
		cpuPercent = percents[0]
	}

	// Memory usage
	var memoryMB, memoryTotalMB int64
	if v, err := mem.VirtualMemory(); err == nil {
		memoryMB = int64(v.Used / 1024 / 1024)
		memoryTotalMB = int64(v.Total / 1024 / 1024)
	}

	// Disk usage
	var diskMB, diskTotalMB int64
	if u, err := disk.Usage("/workspace"); err == nil {
		diskMB = int64(u.Used / 1024 / 1024)
		diskTotalMB = int64(u.Total / 1024 / 1024)
	}

	return &reporter.ResourceUsage{
		CPUPercent:    cpuPercent,
		MemoryMB:      memoryMB,
		MemoryTotalMB: memoryTotalMB,
		DiskMB:        diskMB,
		DiskTotalMB:   diskTotalMB,
	}
}

// sendHeartbeat sends a single heartbeat
func (m *Manager) sendHeartbeat() {
	m.mu.RLock()
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

	// Get resource usage
	resourceUsage := getResourceUsage()

	// Build heartbeat payload
	payload := &reporter.HeartbeatPayload{
		Token:         m.reporter.GetToken(),
		Status:        status,
		Active:        active,
		Uptime:        int64(time.Since(m.startTime).Seconds()),
		LastActiveAt:  lastActiveAt,
		ScriptStatus:  scriptStatus,
		ScriptError:   scriptError,
		ResourceUsage: resourceUsage,
		AccessSummary: accessSummary,
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
