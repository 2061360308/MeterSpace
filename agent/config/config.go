package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all agent configuration
type Config struct {
	// Workspace identification
	WorkspaceID string `json:"workspace_id"`
	InstanceID  string `json:"instance_id"`

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
		HeartbeatInterval:    60 * time.Second,
		HeartbeatJitter:      15 * time.Second,
		IdleMinutes:          30,
		ScriptPath:           "/opt/agent/scripts/startup.sh",
		ScriptTimeout:        300 * time.Second,
		Port:                 9527,
		LogPath:              "/var/log/agent",
		LogUploadInterval:    30 * time.Second,
		AllowedIPs:           []string{},
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
		WorkspaceID          string   `json:"workspace_id"`
		BackendURL           string   `json:"backend_url"`
		BackendToken         string   `json:"backend_token"`
		HeartbeatInterval    int      `json:"heartbeat_interval"`
		HeartbeatJitter      int      `json:"heartbeat_jitter"`
		IdleMinutes          int      `json:"idle_minutes"`
		ScriptPath           string   `json:"script_path"`
		ScriptTimeout        int      `json:"script_timeout"`
		Port                 int      `json:"port"`
		LogPath              string   `json:"log_path"`
		LogUploadInterval    int      `json:"log_upload_interval"`
		AllowedIPs           []string `json:"allowed_ips"`
		EnableResourceMonitor bool    `json:"enable_resource_monitor"`
	}

	if err := json.Unmarshal(data, &fileCfg); err != nil {
		return err
	}

	// Apply file config
	if fileCfg.WorkspaceID != "" {
		cfg.WorkspaceID = fileCfg.WorkspaceID
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
	if v := os.Getenv("AGENT_WORKSPACE_ID"); v != "" {
		cfg.WorkspaceID = v
	}
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
	if cfg.WorkspaceID == "" {
		return fmt.Errorf("workspace_id is required")
	}
	if cfg.BackendURL == "" {
		return fmt.Errorf("backend_url is required")
	}
	if cfg.BackendToken == "" {
		return fmt.Errorf("backend_token is required")
	}
	return nil
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
