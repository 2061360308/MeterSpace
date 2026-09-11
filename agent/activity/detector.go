// Package activity detects whether a workspace is actually being used, by
// sampling ESTABLISHED TCP connections on the declared ports.
//
// Rationale (docs/FINAL-PLAN.md §11.1): the backend cannot poll (serverless),
// so the agent reports liveness in its heartbeat. HTTP requests to the agent's
// own API are a weak signal (a user may interact with the app on :8000 without
// ever touching the agent). Watching /proc/net/tcp for real connections to the
// app ports is a far better proxy for "someone is using this workspace".
package activity

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// tcpStateEstablished is the hex state for ESTABLISHED in /proc/net/tcp.
const tcpStateEstablished = "01"

// procFiles are sampled in order. tcp6 exists when IPv6 is enabled.
var procFiles = []string{"/proc/net/tcp", "/proc/net/tcp6"}

// Detector samples connection counts on a set of ports.
type Detector struct {
	ports      []int
	interval   time.Duration
	lastActive time.Time
	lastSample map[int]int
	mu         sync.RWMutex
	stopCh     chan struct{}
	stopped    bool
}

// New creates a Detector. A non-positive interval defaults to 30s.
func New(ports []int, interval time.Duration) *Detector {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &Detector{
		ports:      ports,
		interval:   interval,
		lastActive: time.Now(),
		lastSample: make(map[int]int),
		stopCh:     make(chan struct{}),
	}
}

// Start begins the sampling loop.
func (d *Detector) Start() {
	go d.loop()
}

// Stop halts the sampling loop. Safe to call more than once.
func (d *Detector) Stop() {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.stopped {
		return
	}
	d.stopped = true
	close(d.stopCh)
}

func (d *Detector) loop() {
	// Sample immediately so a workspace already in use is detected at boot.
	d.sample()

	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-d.stopCh:
			return
		case <-ticker.C:
			d.sample()
		}
	}
}

// sample checks each declared port and bumps lastActive on any live connection.
func (d *Detector) sample() {
	// Read the tables once per sample, not once per port.
	counts := readEstablishedCounts()

	active := false
	local := make(map[int]int, len(d.ports))
	for _, port := range d.ports {
		n := counts[port]
		local[port] = n
		if n > 0 {
			active = true
		}
	}

	d.mu.Lock()
	d.lastSample = local
	if active {
		d.lastActive = time.Now()
	}
	d.mu.Unlock()
}

// MarkActive records activity immediately (e.g. an agent API call).
func (d *Detector) MarkActive() {
	d.mu.Lock()
	d.lastActive = time.Now()
	d.mu.Unlock()
}

// LastActive returns the most recent observed activity time.
func (d *Detector) LastActive() time.Time {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.lastActive
}

// IdleFor returns how long the workspace has been idle.
func (d *Detector) IdleFor() time.Duration {
	return time.Since(d.LastActive())
}

// IsIdle reports whether the workspace has been idle longer than idleMinutes.
func (d *Detector) IsIdle(idleMinutes int) bool {
	if idleMinutes <= 0 {
		idleMinutes = 30
	}
	return d.IdleFor() > time.Duration(idleMinutes)*time.Minute
}

// Connections returns the last sampled connection count per port.
func (d *Detector) Connections() map[int]int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make(map[int]int, len(d.lastSample))
	for k, v := range d.lastSample {
		out[k] = v
	}
	return out
}

// readEstablishedCounts parses /proc/net/tcp{,6} and returns, per local port,
// the number of ESTABLISHED connections that are not loopback-only.
//
// /proc/net/tcp format (space-separated, header on line 1):
//
//	sl  local_address rem_address st tx_queue:rx_queue tr:tm->when retrnsmt uid timeout inode
//	0:  0100007F:1F90 00000000:0000 0A ...
//
// Addresses are little-endian hex (IPv4) or 32-hex-char words (IPv6), port is
// the last 4 hex chars of the address field.
func readEstablishedCounts() map[int]int {
	counts := make(map[int]int)

	for _, path := range procFiles {
		f, err := os.Open(path)
		if err != nil {
			continue // tcp6 may be absent; that is fine
		}

		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		first := true
		for sc.Scan() {
			if first {
				first = false
				continue // header
			}
			fields := strings.Fields(sc.Text())
			if len(fields) < 4 {
				continue
			}
			if fields[3] != tcpStateEstablished {
				continue
			}

			localIP, localPort, ok := parseAddr(fields[1])
			if !ok {
				continue
			}
			remoteIP, _, ok2 := parseAddr(fields[2])
			if !ok2 {
				continue
			}

			// Ignore connections that are loopback on both ends — those are
			// internal (agent health checks, proxies) and do not indicate a user.
			if isLoopback(localIP) && isLoopback(remoteIP) {
				continue
			}

			counts[localPort]++
		}
		_ = f.Close()
	}

	return counts
}

// parseAddr splits "0100007F:1F90" into (ip, port).
func parseAddr(s string) (string, int, bool) {
	i := strings.LastIndex(s, ":")
	if i < 0 {
		return "", 0, false
	}
	portHex := s[i+1:]
	ipHex := s[:i]

	p, err := strconv.ParseInt(portHex, 16, 32)
	if err != nil || p <= 0 || p > 65535 {
		return "", 0, false
	}
	return ipHex, int(p), true
}

// isLoopback detects loopback for both IPv4 and IPv6 hex encodings.
//
// IPv4 127.0.0.1 is stored little-endian as "0100007F".
// IPv6 ::1 is stored as four little-endian 32-bit words: "00000000000000000000000001000000".
func isLoopback(ipHex string) bool {
	switch len(ipHex) {
	case 8: // IPv4
		return strings.EqualFold(ipHex, "0100007F")
	case 32: // IPv6
		return strings.EqualFold(ipHex, "00000000000000000000000001000000")
	default:
		return false
	}
}
