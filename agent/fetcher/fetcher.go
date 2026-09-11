// Package fetcher pulls the workspace payload (rendered files) from the
// backend and materialises it on disk.
//
// Contract: GET /api/instances/{id}/payload with `Authorization: Bearer <token>`
// (docs/FINAL-PLAN.md §9.2). The response is:
//
//	{ "entry": "run.sh", "workspace": "/opt/ws", "vars": {},
//	  "files": [ { "path": "run.sh", "content": "...", "mode": "0755", "size": 1234 } ] }
//
// Files are written under WorkspaceRoot; every path is validated again here as
// defence in depth (the backend already rejected traversal at upload time).
package fetcher

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// PayloadFile mirrors the backend's PayloadFile.
type PayloadFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Mode    string `json:"mode"`
	Size    int    `json:"size"`
}

// Payload is the backend response.
type Payload struct {
	Entry     string            `json:"entry"`
	Workspace string            `json:"workspace"`
	Vars      map[string]string `json:"vars"`
	Files     []PayloadFile     `json:"files"`
}

// Fetcher downloads and materialises the workspace payload.
type Fetcher struct {
	backendURL string
	token      string
	instanceID string
	root       string
	client     *http.Client
}

// NewFetcher builds a fetcher. root is the on-disk workspace root (typically /opt/ws).
func NewFetcher(backendURL, token, instanceID, root string) *Fetcher {
	return &Fetcher{
		backendURL: strings.TrimRight(backendURL, "/"),
		token:      token,
		instanceID: instanceID,
		root:       root,
		client:     &http.Client{Timeout: 60 * time.Second},
	}
}

// Fetch downloads the payload JSON.
func (f *Fetcher) Fetch() (*Payload, error) {
	url := fmt.Sprintf("%s/api/instances/%s/payload", f.backendURL, f.instanceID)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build payload request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.Header.Set("User-Agent", "workspace-agent/1.0.0")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch payload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("payload request failed %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload Payload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	return &payload, nil
}

// validateRelPath rejects absolute paths, traversal segments and illegal chars.
func validateRelPath(p string) error {
	if p == "" {
		return fmt.Errorf("empty path")
	}
	if strings.HasPrefix(p, "/") || strings.Contains(p, "\\") {
		return fmt.Errorf("absolute or backslash path: %s", p)
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return fmt.Errorf("illegal path segment in %s", p)
		}
	}
	if filepath.IsAbs(p) {
		return fmt.Errorf("absolute path: %s", p)
	}
	return nil
}

// parseMode converts an octal mode string ("0755") to os.FileMode.
func parseMode(s string) os.FileMode {
	if s == "" {
		return 0o644
	}
	n, err := strconv.ParseUint(strings.TrimPrefix(s, "0o"), 8, 32)
	if err != nil || n == 0 {
		return 0o644
	}
	return os.FileMode(n).Perm()
}

// Materialize writes every payload file under f.root and returns the absolute
// path of the entry file.
//
// Files are written to a temp name then renamed, so a partially written file is
// never left in place if the process dies mid-write.
func (f *Fetcher) Materialize(p *Payload) (entryPath string, written int, err error) {
	if len(p.Files) == 0 {
		return "", 0, fmt.Errorf("payload contains no files")
	}
	if p.Entry == "" {
		return "", 0, fmt.Errorf("payload has no entry")
	}

	entryFound := false
	for _, file := range p.Files {
		if err := validateRelPath(file.Path); err != nil {
			return "", written, err
		}

		abs := filepath.Join(f.root, filepath.FromSlash(file.Path))

		// Belt-and-braces: the joined path must stay under root.
		rel, err := filepath.Rel(f.root, abs)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return "", written, fmt.Errorf("path escapes workspace root: %s", file.Path)
		}

		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return "", written, fmt.Errorf("mkdir %s: %w", filepath.Dir(abs), err)
		}

		mode := parseMode(file.Mode)
		tmp := abs + ".tmp"

		if err := os.WriteFile(tmp, []byte(file.Content), mode); err != nil {
			return "", written, fmt.Errorf("write %s: %w", file.Path, err)
		}
		// WriteFile only applies the mode on create; chmod covers re-runs.
		if err := os.Chmod(tmp, mode); err != nil {
			_ = os.Remove(tmp)
			return "", written, fmt.Errorf("chmod %s: %w", file.Path, err)
		}
		if err := os.Rename(tmp, abs); err != nil {
			_ = os.Remove(tmp)
			return "", written, fmt.Errorf("rename %s: %w", file.Path, err)
		}

		written++
		if file.Path == p.Entry {
			entryFound = true
			entryPath = abs
		}
	}

	if !entryFound {
		return "", written, fmt.Errorf("entry %q not present in payload", p.Entry)
	}
	return entryPath, written, nil
}

// FetchAndMaterialize is the convenience path used by main.
func (f *Fetcher) FetchAndMaterialize() (entryPath string, entry string, written int, err error) {
	payload, err := f.Fetch()
	if err != nil {
		return "", "", 0, err
	}
	entryPath, written, err = f.Materialize(payload)
	if err != nil {
		return "", payload.Entry, written, err
	}
	return entryPath, payload.Entry, written, nil
}
