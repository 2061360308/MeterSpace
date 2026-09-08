package access

import (
	"net"
	"sync"
	"time"
)

// AccessRecord represents a single access from an IP
type AccessRecord struct {
	IP           string    `json:"ip"`
	LastAccessAt time.Time `json:"last_access_at"`
	AccessCount  int       `json:"access_count"`
	UserAgent    string    `json:"user_agent"`
	IsBackendIP  bool      `json:"is_backend_ip"`
}

// AccessSummary provides a summary of recent access
type AccessSummary struct {
	TotalUniqueIPs int            `json:"total_unique_ips"`
	RecentAccess   []AccessRecord `json:"recent_access"`
	SuspiciousIPs  []string       `json:"suspicious_ips"`
	UnknownIPCount int            `json:"unknown_ip_count"`
}

// Tracker tracks access from different IPs
type Tracker struct {
	mu           sync.RWMutex
	recentAccess map[string]*AccessRecord
	windowSize   time.Duration
	allowedIPs   []string
}

// NewTracker creates a new access tracker
func NewTracker(windowSize time.Duration, allowedIPs []string) *Tracker {
	t := &Tracker{
		recentAccess: make(map[string]*AccessRecord),
		windowSize:   windowSize,
		allowedIPs:   allowedIPs,
	}
	go t.cleanupLoop()
	return t
}

// Record records an access from an IP
func (t *Tracker) Record(ip, userAgent string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	if record, exists := t.recentAccess[ip]; exists {
		record.LastAccessAt = now
		record.AccessCount++
		if userAgent != "" {
			record.UserAgent = userAgent
		}
	} else {
		t.recentAccess[ip] = &AccessRecord{
			IP:           ip,
			LastAccessAt: now,
			AccessCount:  1,
			UserAgent:    userAgent,
			IsBackendIP:  t.isAllowedIP(ip),
		}
	}
}

// GetSummary returns a summary of recent access
func (t *Tracker) GetSummary() AccessSummary {
	t.mu.RLock()
	defer t.mu.RUnlock()

	summary := AccessSummary{
		TotalUniqueIPs: len(t.recentAccess),
		RecentAccess:   make([]AccessRecord, 0, len(t.recentAccess)),
		SuspiciousIPs:  make([]string, 0),
		UnknownIPCount: 0,
	}

	for _, record := range t.recentAccess {
		summary.RecentAccess = append(summary.RecentAccess, *record)
		if !record.IsBackendIP {
			summary.SuspiciousIPs = append(summary.SuspiciousIPs, record.IP)
			summary.UnknownIPCount++
		}
	}

	return summary
}

// GetRecentIPs returns a list of recent IPs
func (t *Tracker) GetRecentIPs() []string {
	t.mu.RLock()
	defer t.mu.RUnlock()

	ips := make([]string, 0, len(t.recentAccess))
	for ip := range t.recentAccess {
		ips = append(ips, ip)
	}
	return ips
}

// IsSuspicious checks if an IP is suspicious (not in allowed list)
func (t *Tracker) IsSuspicious(ip string) bool {
	return !t.isAllowedIP(ip)
}

// isAllowedIP checks if an IP is in the allowed list
func (t *Tracker) isAllowedIP(ip string) bool {
	if len(t.allowedIPs) == 0 {
		return true
	}

	for _, allowed := range t.allowedIPs {
		if allowed == ip {
			return true
		}
		// CIDR check
		if _, cidr, err := net.ParseCIDR(allowed); err == nil {
			if cidr.Contains(net.ParseIP(ip)) {
				return true
			}
		}
	}
	return false
}

// cleanupLoop periodically removes old entries
func (t *Tracker) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		t.cleanup()
	}
}

// cleanup removes entries older than windowSize
func (t *Tracker) cleanup() {
	t.mu.Lock()
	defer t.mu.Unlock()

	cutoff := time.Now().Add(-t.windowSize)
	for ip, record := range t.recentAccess {
		if record.LastAccessAt.Before(cutoff) {
			delete(t.recentAccess, ip)
		}
	}
}

// ExtractIP extracts the real IP from a request
func ExtractIP(remoteAddr, xForwardedFor, xRealIP string) string {
	// Try X-Real-IP first
	if xRealIP != "" {
		if ip := net.ParseIP(xRealIP); ip != nil {
			return xRealIP
		}
	}

	// Try X-Forwarded-For (take first IP)
	if xForwardedFor != "" {
		ips := splitAndTrim(xForwardedFor)
		if len(ips) > 0 {
			if ip := net.ParseIP(ips[0]); ip != nil {
				return ips[0]
			}
		}
	}

	// Fall back to RemoteAddr
	if remoteAddr != "" {
		host, _, err := net.SplitHostPort(remoteAddr)
		if err != nil {
			return remoteAddr
		}
		return host
	}

	return ""
}

// splitAndTrim splits a comma-separated string and trims whitespace
func splitAndTrim(s string) []string {
	parts := make([]string, 0)
	for _, part := range splitString(s, ",") {
		trimmed := trimSpace(part)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

func splitString(s, sep string) []string {
	if s == "" {
		return nil
	}
	result := make([]string, 0)
	start := 0
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}
