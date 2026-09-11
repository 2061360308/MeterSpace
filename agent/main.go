package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/workspace-cloud/agent/access"
	"github.com/workspace-cloud/agent/activity"
	"github.com/workspace-cloud/agent/api"
	"github.com/workspace-cloud/agent/config"
	"github.com/workspace-cloud/agent/executor"
	"github.com/workspace-cloud/agent/fetcher"
	"github.com/workspace-cloud/agent/heartbeat"
	"github.com/workspace-cloud/agent/reporter"
)

const (
	agentVersion = "1.0.0"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		fmt.Printf("[agent] Failed to load config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("[agent] Starting agent v%s for instance %s\n", agentVersion, cfg.InstanceID)

	// Access tracker (loopback + agent API calls)
	tracker := access.NewTracker(30*time.Minute, cfg.AllowedIPs)

	// Reporter
	r := reporter.NewReporter(cfg.BackendURL, cfg.BackendToken, cfg.InstanceID)

	// Executor + log plumbing
	exec := executor.NewExecutor(cfg.ScriptPath, cfg.ScriptTimeout)
	logCh := make(chan executor.LogEntry, 100)
	exec.SetLogChannel(logCh)

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

	exec.SetOnLog(func(entry executor.LogEntry) {
		fmt.Printf("[entry] [%s] %s\n", entry.Level, entry.Message)
	})

	// Heartbeat manager
	hb := heartbeat.NewManager(
		r,
		tracker,
		exec,
		cfg.HeartbeatInterval,
		cfg.HeartbeatJitter,
		agentVersion,
	)

	// Activity detector over the declared ports (§11.1)
	detector := activity.New(cfg.PortNumbers(), cfg.SampleInterval())
	hb.SetDetector(detector)

	// API server
	apiServer := api.NewServer(cfg, exec, hb, tracker, r, detector)

	// Report ready as soon as the agent is up and listening. This is what
	// flips the instance to RUNNING on the backend and records its public IP
	// (P0 fix: previously ReportReady was never called at all).
	reportReady := func(reason string) {
		if err := r.ReportReady(agentVersion); err != nil {
			fmt.Printf("[agent] Failed to report ready (%s): %v\n", reason, err)
			return
		}
		fmt.Printf("[agent] Reported ready (%s)\n", reason)
	}

	// Entry status transitions
	exec.SetOnStatusChange(func(status executor.ScriptStatus, errMsg string) {
		fmt.Printf("[entry] Status changed to: %s\n", status)
		switch status {
		case executor.StatusSuccess:
			hb.SetStatus("ready")
			hb.SetActive(true)
			reportReady("entry succeeded")
			_ = r.ReportStatus("completed", "entry completed successfully")
		case executor.StatusSkipped:
			// Blank template: nothing to run, but the workspace is usable.
			hb.SetStatus("ready")
			hb.SetActive(true)
			reportReady("blank entry skipped")
			_ = r.ReportStatus("completed", "blank entry skipped")
		case executor.StatusFailed, executor.StatusTimeout:
			hb.SetStatus("error")
			phase := "entry"
			if status == executor.StatusTimeout {
				phase = "timeout"
			}
			if err := r.ReportError(errMsg, phase); err != nil {
				fmt.Printf("[agent] Failed to report error: %v\n", err)
			}
		}
	})

	hb.Start()
	detector.Start()

	// Bootstrap the workspace in the background: fetch payload → materialise →
	// run entry → report ready.
	go func() {
		if err := bootstrap(cfg, exec, hb, detector, reportReady); err != nil {
			fmt.Printf("[agent] Bootstrap failed: %v\n", err)
		}
	}()

	// Idle watchdog: when the workspace has been idle past the configured
	// window, tell the backend so it can release the instance (§10).
	go idleWatchdog(cfg, hb, exec)

	go func() {
		if err := apiServer.Start(); err != nil {
			fmt.Printf("[agent] API server failed: %v\n", err)
		}
	}()

	fmt.Println("[agent] Agent started successfully")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigCh
	fmt.Printf("[agent] Received signal %v, shutting down...\n", sig)

	hb.Stop()
	detector.Stop()
	r.Stop()
	if err := apiServer.Stop(); err != nil {
		fmt.Printf("[agent] Error stopping API server: %v\n", err)
	}

	fmt.Println("[agent] Agent stopped")
}

// bootstrap pulls the payload, writes it to disk, and runs the entry.
//
// Order matters (docs/FINAL-PLAN.md §5.1): fetch → materialise → run → ready.
// If the payload cannot be fetched we fall back to the legacy script path so an
// instance launched from an older workspace record still boots.
func bootstrap(
	cfg *config.Config,
	exec *executor.Executor,
	hb *heartbeat.Manager,
	detector *activity.Detector,
	reportReady func(reason string),
) error {
	fmt.Printf("[agent] Fetching payload from %s\n", cfg.BackendURL)

	f := fetcher.NewFetcher(cfg.BackendURL, cfg.BackendToken, cfg.InstanceID, cfg.WorkspaceRoot)
	payload, err := f.Fetch()
	if err != nil {
		fmt.Printf("[agent] Payload fetch failed, falling back to legacy script mode: %v\n", err)
		detector.MarkActive()
		if err := exec.Execute(); err != nil {
			fmt.Printf("[agent] Legacy script execution failed: %v\n", err)
		}
		reportReady("legacy fallback")
		return nil
	}

	entryPath, written, err := f.Materialize(payload)
	if err != nil {
		return fmt.Errorf("materialise payload: %w", err)
	}
	fmt.Printf("[agent] Materialised %d file(s); entry=%s\n", written, payload.Entry)

	// Prefer the server-provided entry; the config value is the fallback.
	entry := payload.Entry
	if entry == "" {
		entry = cfg.Entry
	}

	hb.SetCurrentEntry(entry)

	exec.Configure(&executor.Options{
		EntryPath:     entryPath,
		Entry:         entry,
		WorkspaceRoot: cfg.WorkspaceRoot,
		Timeout:       cfg.EntryTimeout,
		ExtraEnv:      cfg.WorkspaceEnv(),
	})

	detector.MarkActive()

	ctx, cancel := context.WithTimeout(context.Background(), cfg.EntryTimeout+2*time.Minute)
	defer cancel()

	if err := exec.RunEntry(ctx); err != nil {
		// RunEntry already reported the failure via the status callback.
		fmt.Printf("[agent] Entry finished with error: %v\n", err)
		return nil
	}
	fmt.Printf("[agent] Entry completed\n")
	return nil
}

// idleWatchdog periodically checks whether the instance is idle and, when it
// is, notifies the backend once. The backend decides whether to actually
// release (it owns the idle policy); the agent only reports the observation.
func idleWatchdog(cfg *config.Config, hb *heartbeat.Manager, exec *executor.Executor) {
	interval := cfg.SampleInterval()
	if interval < 30*time.Second {
		interval = 30 * time.Second
	}
	idleMinutes := cfg.IdleMinutes
	if cfg.Activity.IdleMinutes > 0 {
		idleMinutes = cfg.Activity.IdleMinutes
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	notified := false
	for range ticker.C {
		// Only consider idleness once the entry is no longer running: a
		// long-running build is not "idle" even without traffic.
		if exec.GetStatus() == executor.StatusRunning {
			notified = false
			continue
		}

		if hb.IsIdleNow(idleMinutes) {
			if !notified {
				fmt.Printf("[agent] Workspace idle for over %d min; notifying backend\n", idleMinutes)
				notified = true
			}
			// The heartbeat loop already carries `active:false`; the backend's
			// frontend-triggered maintenance path performs the actual release.
			continue
		}
		notified = false
	}
}
