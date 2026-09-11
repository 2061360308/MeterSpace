// Package devcontainer runs a DevContainer entry via the official
// `devcontainer` CLI (docs/FINAL-PLAN.md §5.2).
//
// The CLI bundle is pulled from the backend's public/ directory by entrypoint.sh
// (`${CALLBACK_URL}/devcontainer-cli.tar.gz`); this package only invokes it and
// makes sure a root-level `devcontainer.json` lands where the CLI expects it.
package devcontainer

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// CLIName is the executable looked up on PATH.
const CLIName = "devcontainer"

// LocalBin is where entrypoint.sh extracts the bundle.
const LocalBin = "/usr/local/bin/devcontainer"

// Runner executes `devcontainer up`.
type Runner struct {
	// WorkspaceFolder is the folder passed to --workspace-folder.
	WorkspaceFolder string
	// Log receives combined stdout/stderr line by line.
	Log func(level, message string)
}

// New builds a Runner rooted at workspaceFolder.
func New(workspaceFolder string, log func(level, message string)) *Runner {
	return &Runner{WorkspaceFolder: workspaceFolder, Log: log}
}

// Available reports whether the CLI can be found.
func (r *Runner) Available() bool {
	if _, err := exec.LookPath(CLIName); err == nil {
		return true
	}
	if _, err := os.Stat(LocalBin); err == nil {
		return true
	}
	return false
}

// binary returns the CLI path to invoke.
func (r *Runner) binary() string {
	if p, err := exec.LookPath(CLIName); err == nil {
		return p
	}
	return LocalBin
}

// PrepareConfig moves a root-level devcontainer.json into .devcontainer/ when
// needed. The CLI accepts either location, but normalising keeps the workspace
// layout predictable and matches what the template payload ships.
func (r *Runner) PrepareConfig() error {
	rootCfg := filepath.Join(r.WorkspaceFolder, "devcontainer.json")
	dirCfg := filepath.Join(r.WorkspaceFolder, ".devcontainer", "devcontainer.json")

	if _, err := os.Stat(dirCfg); err == nil {
		return nil // already in place
	}
	if _, err := os.Stat(rootCfg); err != nil {
		return fmt.Errorf("devcontainer.json not found in %s", r.WorkspaceFolder)
	}

	if err := os.MkdirAll(filepath.Dir(dirCfg), 0o755); err != nil {
		return fmt.Errorf("create .devcontainer dir: %w", err)
	}
	if err := os.Rename(rootCfg, dirCfg); err != nil {
		return fmt.Errorf("move devcontainer.json: %w", err)
	}
	r.logf("info", "moved devcontainer.json into .devcontainer/")
	return nil
}

// Up runs `devcontainer up --workspace-folder <dir>` and streams its output.
//
// The CLI's exit code is authoritative: a non-zero exit surfaces as an error
// carrying the trailing stderr, which the backend shows to the user verbatim
// (§5.2 失败处理).
func (r *Runner) Up() error {
	if !r.Available() {
		return fmt.Errorf("devcontainer CLI not found (expected %s on PATH)", CLIName)
	}
	if err := r.PrepareConfig(); err != nil {
		return err
	}

	cmd := exec.Command(r.binary(), "up", "--workspace-folder", r.WorkspaceFolder)
	cmd.Dir = r.WorkspaceFolder
	cmd.Env = append(os.Environ(),
		"HOME=/root",
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"DEBIAN_FRONTEND=noninteractive",
	)

	return runStreaming(cmd, r.Log)
}

// runStreaming runs cmd, forwarding combined output to log line by line.
func runStreaming(cmd *exec.Cmd, log func(level, message string)) error {
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
	go streamLines(stdout, "info", log, done)
	go streamLines(stderr, "warning", log, done)

	// Drain both pipes before Wait(), otherwise Wait may close them early.
	<-done
	<-done

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("devcontainer up failed: %w", err)
	}
	return nil
}

func streamLines(r io.Reader, level string, log func(level, message string), done chan<- struct{}) {
	defer func() { done <- struct{}{} }()
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := r.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			for {
				idx := indexByte(buf, '\n')
				if idx < 0 {
					break
				}
				if log != nil {
					log(level, string(buf[:idx]))
				}
				buf = buf[idx+1:]
			}
		}
		if err != nil {
			if len(buf) > 0 && log != nil {
				log(level, string(buf))
			}
			return
		}
	}
}

func indexByte(b []byte, c byte) int {
	for i := range b {
		if b[i] == c {
			return i
		}
	}
	return -1
}

func (r *Runner) logf(level, msg string) {
	if r.Log != nil {
		r.Log(level, msg)
	}
}
