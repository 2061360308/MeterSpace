// Package compose runs a Docker Compose entry (docs/FINAL-PLAN.md §5.3).
package compose

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Runner executes `docker compose up -d`.
type Runner struct {
	// WorkspaceFolder is the directory holding the compose file.
	WorkspaceFolder string
	// File is the compose file name relative to WorkspaceFolder.
	File string
	// Log receives output lines.
	Log func(level, message string)
}

// New builds a Runner. file is the entry file name (e.g. docker-compose.yml).
func New(workspaceFolder, file string, log func(level, message string)) *Runner {
	return &Runner{WorkspaceFolder: workspaceFolder, File: file, Log: log}
}

// Available reports whether the docker CLI is present.
func (r *Runner) Available() bool {
	_, err := exec.LookPath("docker")
	return err == nil
}

// Up runs `docker compose -f <file> up -d`.
func (r *Runner) Up() error {
	if !r.Available() {
		return fmt.Errorf("docker CLI not found on PATH")
	}

	abs := filepath.Join(r.WorkspaceFolder, filepath.FromSlash(r.File))
	if _, err := os.Stat(abs); err != nil {
		return fmt.Errorf("compose file not found: %s", abs)
	}

	cmd := exec.Command("docker", "compose", "-f", abs, "up", "-d")
	cmd.Dir = r.WorkspaceFolder
	cmd.Env = append(os.Environ(),
		"HOME=/root",
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"DEBIAN_FRONTEND=noninteractive",
	)

	return run(cmd, r.Log)
}

func run(cmd *exec.Cmd, log func(level, message string)) error {
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

	done := make(chan struct{}, 2)
	go func() { defer func() { done <- struct{}{} }(); scan(stdout, "info", log) }()
	go func() { defer func() { done <- struct{}{} }(); scan(stderr, "warning", log) }()
	<-done
	<-done

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("docker compose up failed: %w", err)
	}
	return nil
}

func scan(r interface{ Read([]byte) (int, error) }, level string, log func(level, message string)) {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for s.Scan() {
		if log != nil {
			log(level, s.Text())
		}
	}
}
