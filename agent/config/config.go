package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// PortDecl declares a port exposed by the workspace (mirrors Template
// metadata `activity.ports`, see docs/FINAL-PLAN.md §2.5 / §6.2).
type PortDecl struct {
	Port     int    `json:"port"`
	Label    string `json:"label,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Private  bool   `json:"private,omitempty"`
}

// ActivityConfig carries liveness/port declarations (docs/FINAL-PLAN.md §2.5).
type ActivityConfig struct {
	Ports             []PortDecl `json:"ports,omitempty"`
	IdleMinutes       int        `json:"idleMinutes,omitempty"`
	SampleIntervalSec int        `json:"sampleIntervalSec,omitempty"`
}

// Config holds all agent configuration
type Config struct {
	// Instance identification
	InstanceID  string `json:"instance_id"`
	WorkspaceID string `json:"workspace_id,omitempty"`
	Region      string `json:"region,omitempty"`

	// Backend connection
	BackendURL   string `json:"backend_url"`
	BackendToken string `json:"backend_token"`

	// Heartbeat configuration
	HeartbeatInterval time.Duration `json:"heartbeat_interval"`
	HeartbeatJitter   time.Duration `json:"heartbeat_jitter"`
	IdleMinutes       int           `json:"idle_minutes"`

	// Script configuration
	ScriptPath    string        `json:"script_path"`
	ScriptTimeout time.Duration `json:"script_timeout"`

	// === 模板协议（docs/FINAL-PLAN.md §5 / §6）===
	// WorkspaceRoot 载荷落盘根目录，默认 /opt/ws
	WorkspaceRoot string `json:"workspace_root"`
	// WorkspaceDir 持久化业务数据目录（备份到 OSS），默认 /workspace
	WorkspaceDir string `json:"workspace_dir"`
	// Entry 载荷内入口文件相对路径（由后端 /payload 返回，可被配置覆盖）
	Entry string `json:"entry,omitempty"`
	// EntryTimeout 入口执行超时（秒），默认 1800，上限 3600
	EntryTimeout time.Duration `json:"entry_timeout"`
	// Activity 探活 + 端口声明
	Activity ActivityConfig `json:"activity,omitempty"`
	// ExposedPortsFile 端口声明覆盖文件（可选）
	ExposedPortsFile string `json:"exposed_ports_file,omitempty"`

	// API server configuration
	Port int `json:"port"`

	// Logging configuration
	LogPath           string        `json:"log_path"`
	LogUploadInterval time.Duration `json:"log_upload_interval"`

	// Security configuration
	AllowedIPs []string `json:"allowed_ips"`

	// Feature flags
	EnableResourceMonitor bool `json:"enable_resource_monitor"`
}

// DefaultConfig returns a Config with default values
func DefaultConfig() *Config {
	return &Config{
		HeartbeatInterval:     60 * time.Second,
		HeartbeatJitter:       15 * time.Second,
		IdleMinutes:           30,
		ScriptPath:            "/opt/agent/scripts/startup.sh",
		ScriptTimeout:         300 * time.Second,
		WorkspaceRoot:         "/opt/ws",
		WorkspaceDir:          "/workspace",
		Entry:                 "",
		EntryTimeout:          1800 * time.Second,
		ExposedPortsFile:      "/opt/agent/ports.json",
		Port:                  9527,
		LogPath:               "/var/log/agent",
		LogUploadInterval:     30 * time.Second,
		AllowedIPs:            []string{},
		EnableResourceMonitor: true,
	}
}

// LoadConfig loads configuration from environment variables and config file
func LoadConfig() (*Config, error) {
	cfg := DefaultConfig()

	// Try to load from config file first
	if err := loadFromFile(cfg, "/opt/agent/config.json"); err != nil {
		// Config file not found or invalid, continue with env vars
		fmt.Printf("[config] Config file not loaded: %v\n", err)
	}

	// Override with environment variables
	loadFromEnv(cfg)

	// Validate required fields
	if err := validate(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// loadFromFile loads configuration from a JSON file
func loadFromFile(cfg *Config, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var fileCfg struct {
		InstanceID            string          `json:"instance_id"`
		WorkspaceID           string          `json:"workspace_id"`
		Region                string          `json:"region"`
		BackendURL            string          `json:"backend_url"`
		BackendToken          string          `json:"backend_token"`
		HeartbeatInterval     int             `json:"heartbeat_interval"`
		HeartbeatJitter       int             `json:"heartbeat_jitter"`
		IdleMinutes           int             `json:"idle_minutes"`
		ScriptPath            string          `json:"script_path"`
		ScriptTimeout         int             `json:"script_timeout"`
		WorkspaceRoot         string          `json:"workspace_root"`
		WorkspaceDir          string          `json:"workspace_dir"`
		Entry                 string          `json:"entry"`
		EntryTimeout          int             `json:"entry_timeout"`
		Activity              *ActivityConfig `json:"activity"`
		ExposedPortsFile      string          `json:"exposed_ports_file"`
		Port                  int             `json:"port"`
		LogPath               string          `json:"log_path"`
		LogUploadInterval     int             `json:"log_upload_interval"`
		AllowedIPs            []string        `json:"allowed_ips"`
		EnableResourceMonitor bool            `json:"enable_resource_monitor"`
	}

	if err := json.Unmarshal(data, &fileCfg); err != nil {
		return err
	}

	// Apply file config
	if fileCfg.InstanceID != "" {
		cfg.InstanceID = fileCfg.InstanceID
	}
	if fileCfg.WorkspaceID != "" {
		cfg.WorkspaceID = fileCfg.WorkspaceID
	}
	if fileCfg.Region != "" {
		cfg.Region = fileCfg.Region
	}
	if fileCfg.BackendURL != "" {
		cfg.BackendURL = fileCfg.BackendURL
	}
	if fileCfg.BackendToken != "" {
		cfg.BackendToken = fileCfg.BackendToken
	}
	if fileCfg.HeartbeatInterval > 0 {
		cfg.HeartbeatInterval = time.Duration(fileCfg.HeartbeatInterval) * time.Second
	}
	if fileCfg.HeartbeatJitter > 0 {
		cfg.HeartbeatJitter = time.Duration(fileCfg.HeartbeatJitter) * time.Second
	}
	if fileCfg.IdleMinutes > 0 {
		cfg.IdleMinutes = fileCfg.IdleMinutes
	}
	if fileCfg.ScriptPath != "" {
		cfg.ScriptPath = fileCfg.ScriptPath
	}
	if fileCfg.ScriptTimeout > 0 {
		cfg.ScriptTimeout = time.Duration(fileCfg.ScriptTimeout) * time.Second
	}
	if fileCfg.WorkspaceRoot != "" {
		cfg.WorkspaceRoot = fileCfg.WorkspaceRoot
	}
	if fileCfg.WorkspaceDir != "" {
		cfg.WorkspaceDir = fileCfg.WorkspaceDir
	}
	if fileCfg.Entry != "" {
		cfg.Entry = fileCfg.Entry
	}
	if fileCfg.EntryTimeout > 0 {
		cfg.EntryTimeout = time.Duration(fileCfg.EntryTimeout) * time.Second
	}
	if fileCfg.Activity != nil {
		cfg.Activity = *fileCfg.Activity
	}
	if fileCfg.ExposedPortsFile != "" {
		cfg.ExposedPortsFile = fileCfg.ExposedPortsFile
	}
	if fileCfg.Port > 0 {
		cfg.Port = fileCfg.Port
	}
	if fileCfg.LogPath != "" {
		cfg.LogPath = fileCfg.LogPath
	}
	if fileCfg.LogUploadInterval > 0 {
		cfg.LogUploadInterval = time.Duration(fileCfg.LogUploadInterval) * time.Second
	}
	if len(fileCfg.AllowedIPs) > 0 {
		cfg.AllowedIPs = fileCfg.AllowedIPs
	}
	cfg.EnableResourceMonitor = fileCfg.EnableResourceMonitor

	return nil
}

// loadFromEnv loads configuration from environment variables
func loadFromEnv(cfg *Config) {
	if v := os.Getenv("AGENT_INSTANCE_ID"); v != "" {
		cfg.InstanceID = v
	}
	if v := os.Getenv("AGENT_BACKEND_URL"); v != "" {
		cfg.BackendURL = v
	}
	if v := os.Getenv("AGENT_BACKEND_TOKEN"); v != "" {
		cfg.BackendToken = v
	}
	if v := os.Getenv("AGENT_HEARTBEAT_INTERVAL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.HeartbeatInterval = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AGENT_HEARTBEAT_JITTER"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.HeartbeatJitter = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AGENT_IDLE_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.IdleMinutes = n
		}
	}
	if v := os.Getenv("AGENT_SCRIPT_PATH"); v != "" {
		cfg.ScriptPath = v
	}
	if v := os.Getenv("AGENT_SCRIPT_TIMEOUT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.ScriptTimeout = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AGENT_WORKSPACE_ROOT"); v != "" {
		cfg.WorkspaceRoot = v
	}
	if v := os.Getenv("AGENT_WORKSPACE_DIR"); v != "" {
		cfg.WorkspaceDir = v
	}
	if v := os.Getenv("AGENT_ENTRY"); v != "" {
		cfg.Entry = v
	}
	if v := os.Getenv("AGENT_ENTRY_TIMEOUT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.EntryTimeout = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AGENT_WORKSPACE_ID"); v != "" {
		cfg.WorkspaceID = v
	}
	if v := os.Getenv("AGENT_REGION"); v != "" {
		cfg.Region = v
	}
	if v := os.Getenv("AGENT_EXPOSED_PORTS_FILE"); v != "" {
		cfg.ExposedPortsFile = v
	}
	if v := os.Getenv("AGENT_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Port = n
		}
	}
	if v := os.Getenv("AGENT_LOG_PATH"); v != "" {
		cfg.LogPath = v
	}
	if v := os.Getenv("AGENT_LOG_UPLOAD_INTERVAL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.LogUploadInterval = time.Duration(n) * time.Second
		}
	}
	if v := os.Getenv("AGENT_ALLOWED_IPS"); v != "" {
		cfg.AllowedIPs = strings.Split(v, ",")
	}
	if v := os.Getenv("AGENT_ENABLE_RESOURCE_MONITOR"); v != "" {
		cfg.EnableResourceMonitor = v == "true" || v == "1"
	}
}

// validate checks required fields
func validate(cfg *Config) error {
	if cfg.InstanceID == "" {
		return fmt.Errorf("instance_id is required")
	}
	if cfg.BackendURL == "" {
		return fmt.Errorf("backend_url is required")
	}
	if cfg.BackendToken == "" {
		return fmt.Errorf("backend_token is required")
	}
	return nil
}

// EntryPath returns the absolute path of the entry file inside WorkspaceRoot.
// Empty Entry yields "" (caller should fall back to the /payload response).
func (c *Config) EntryPath() string {
	if c.Entry == "" {
		return ""
	}
	return filepath.Join(c.WorkspaceRoot, filepath.Clean("/"+c.Entry))
}

// IdleDuration returns the configured idle window as a Duration.
func (c *Config) IdleDuration() time.Duration {
	m := c.IdleMinutes
	if c.Activity.IdleMinutes > 0 {
		m = c.Activity.IdleMinutes
	}
	if m <= 0 {
		m = 30
	}
	return time.Duration(m) * time.Minute
}

// SampleInterval returns the activity sampling interval.
func (c *Config) SampleInterval() time.Duration {
	s := c.Activity.SampleIntervalSec
	if s <= 0 {
		s = 30
	}
	return time.Duration(s) * time.Second
}

// PortNumbers returns the declared port numbers (may be empty).
func (c *Config) PortNumbers() []int {
	ports := make([]int, 0, len(c.Activity.Ports))
	for _, p := range c.Activity.Ports {
		if p.Port > 0 {
			ports = append(ports, p.Port)
		}
	}
	return ports
}

// WorkspaceEnv returns the WS_* environment variables injected into entry
// processes (docs/FINAL-PLAN.md §6.1).
func (c *Config) WorkspaceEnv() []string {
	return []string{
		"WS_ROOT=" + c.WorkspaceRoot,
		"WS_WORKSPACE=" + c.WorkspaceDir,
		"WS_EXPOSED_PORTS_FILE=" + c.ExposedPortsFile,
		"WS_INSTANCE_ID=" + c.InstanceID,
		"WS_WORKSPACE_ID=" + c.WorkspaceID,
		"WS_REGION=" + c.Region,
	}
}

// IsAllowedIP checks if an IP is in the allowed list
func (c *Config) IsAllowedIP(ip string) bool {
	if len(c.AllowedIPs) == 0 {
		return true // No whitelist means allow all
	}
	for _, allowed := range c.AllowedIPs {
		if allowed == ip {
			return true
		}
		// Simple CIDR check (for exact match, use net package)
		if strings.Contains(allowed, "/") {
			// TODO: Implement proper CIDR matching
			if strings.HasPrefix(ip, strings.Split(allowed, "/")[0]) {
				return true
			}
		}
	}
	return false
}
