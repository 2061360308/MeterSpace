package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/api"
	"github.com/workspace-cloud/agent/config"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/heartbeat"
	"github.com/workspace-cloud/agent/reporter"
)

const (
	agentVersion = "1.0.0"
)

func main() {
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		fmt.Printf("[agent] Failed to load config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("[agent] Starting agent v%s for instance %s\n", agentVersion, cfg.InstanceID)

	// Create access tracker (30 minute window)
	tracker := access.NewTracker(30*time.Minute, cfg.AllowedIPs)

	// Create reporter with instanceId
	r := reporter.NewReporter(cfg.BackendURL, cfg.BackendToken, cfg.InstanceID)

	// Create executor
	exec := executor.NewExecutor(cfg.ScriptPath, cfg.ScriptTimeout)

	// Connect executor log channel to reporter
	logCh := make(chan executor.LogEntry, 100)
	exec.SetLogChannel(logCh)

	// Forward logs from executor to reporter
	go func() {
		for entry := range logCh {
			r.SendLog(reporter.LogEntry{
				Timestamp: entry.Timestamp,
				Level:     entry.Level,
				Phase:     entry.Phase,
				Message:   entry.Message,
			})
		}
	}()

	// Create heartbeat manager
	hb := heartbeat.NewManager(
		r,
		tracker,
		exec,
		cfg.HeartbeatInterval,
		cfg.HeartbeatJitter,
		cfg.WorkspaceID,
		agentVersion,
	)

	// Create API server
	apiServer := api.NewServer(cfg, exec, hb, tracker)

	// Set up executor callbacks
	exec.SetOnLog(func(entry executor.LogEntry) {
		fmt.Printf("[script] [%s] %s\n", entry.Level, entry.Message)
	})

	exec.SetOnStatusChange(func(status executor.ScriptStatus, errMsg string) {
		fmt.Printf("[script] Status changed to: %s\n", status)
		switch status {
		case executor.StatusSuccess:
			hb.SetStatus("ready")
			hb.SetActive(true)
			// Report status to backend
			if err := r.ReportStatus("running", "completed", "startup script completed successfully"); err != nil {
				fmt.Printf("[agent] Failed to report status: %v\n", err)
			}
		case executor.StatusFailed, executor.StatusTimeout:
			hb.SetStatus("error")
			// Report error to backend
			if err := r.ReportError(errMsg, "startup"); err != nil {
				fmt.Printf("[agent] Failed to report error: %v\n", err)
			}
		}
	})

	// Start heartbeat
	hb.Start()

	// Execute startup script in background
	go func() {
		fmt.Printf("[agent] Executing startup script: %s\n", cfg.ScriptPath)
		if err := exec.Execute(); err != nil {
			fmt.Printf("[agent] Script execution failed: %v\n", err)
		}
	}()

	// Start API server in background
	go func() {
		if err := apiServer.Start(); err != nil {
			fmt.Printf("[agent] API server failed: %v\n", err)
		}
	}()

	fmt.Println("[agent] Agent started successfully")

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigCh
	fmt.Printf("[agent] Received signal %v, shutting down...\n", sig)

	// Graceful shutdown
	hb.Stop()
	r.Stop()
	if err := apiServer.Stop(); err != nil {
		fmt.Printf("[agent] Error stopping API server: %v\n", err)
	}

	fmt.Println("[agent] Agent stopped")
}
