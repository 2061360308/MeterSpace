package fetcher

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestValidateRelPath(t *testing.T) {
	bad := []string{"", "/etc/passwd", "..", "../evil.sh", "a/../../b", "a//b", `a\b`, "./a"}
	for _, p := range bad {
		if err := validateRelPath(p); err == nil {
			t.Errorf("validateRelPath(%q) = nil, want error", p)
		}
	}

	good := []string{"run.sh", "scripts/setup.py", "a/b/c.txt", "files/nginx.conf"}
	for _, p := range good {
		if err := validateRelPath(p); err != nil {
			t.Errorf("validateRelPath(%q) = %v, want nil", p, err)
		}
	}
}

func TestParseMode(t *testing.T) {
	cases := map[string]os.FileMode{
		"":     os.FileMode(0o644),
		"0644": os.FileMode(0o644),
		"0755": os.FileMode(0o755),
		"0600": os.FileMode(0o600),
		"junk": os.FileMode(0o644),
	}
	for in, want := range cases {
		if got := parseMode(in); got != want {
			t.Errorf("parseMode(%q) = %o, want %o", in, got, want)
		}
	}
}

func TestMaterialize(t *testing.T) {
	root := t.TempDir()

	f := NewFetcher("http://unused", "tok", "inst", root)
	p := &Payload{
		Entry: "run.sh",
		Files: []PayloadFile{
			{Path: "run.sh", Content: "#!/bin/bash\necho hi\n", Mode: "0755", Size: 20},
			{Path: "scripts/setup.py", Content: "print(1)\n", Mode: "0644", Size: 9},
		},
	}

	entryPath, written, err := f.Materialize(p)
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if written != 2 {
		t.Errorf("written = %d, want 2", written)
	}
	if entryPath != filepath.Join(root, "run.sh") {
		t.Errorf("entryPath = %q", entryPath)
	}

	// Mode must be applied. NTFS cannot store Unix permission bits, so this
	// assertion is only meaningful on the Linux target (or a Unix host).
	if runtime.GOOS != "windows" {
		fi, err := os.Stat(filepath.Join(root, "run.sh"))
		if err != nil {
			t.Fatal(err)
		}
		if fi.Mode().Perm() != 0o755 {
			t.Errorf("run.sh mode = %o, want 755", fi.Mode().Perm())
		}
	}

	// nested file must exist
	if _, err := os.Stat(filepath.Join(root, "scripts", "setup.py")); err != nil {
		t.Errorf("nested file missing: %v", err)
	}

	// no .tmp leftovers
	var tmps []string
	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err == nil && filepath.Ext(p) == ".tmp" {
			tmps = append(tmps, p)
		}
		return nil
	})
	if len(tmps) != 0 {
		t.Errorf("leftover temp files: %v", tmps)
	}
}

func TestMaterializeRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	f := NewFetcher("http://unused", "tok", "inst", root)

	p := &Payload{
		Entry: "run.sh",
		Files: []PayloadFile{
			{Path: "../escape.sh", Content: "evil", Mode: "0644"},
			{Path: "run.sh", Content: "ok", Mode: "0644"},
		},
	}
	if _, _, err := f.Materialize(p); err == nil {
		t.Fatal("Materialize accepted traversal path")
	}
}

func TestMaterializeRequiresEntry(t *testing.T) {
	root := t.TempDir()
	f := NewFetcher("http://unused", "tok", "inst", root)

	p := &Payload{
		Entry: "missing.sh",
		Files: []PayloadFile{{Path: "run.sh", Content: "x", Mode: "0644"}},
	}
	if _, _, err := f.Materialize(p); err == nil {
		t.Fatal("Materialize accepted payload without entry file")
	}
}

func TestFetchAndMaterialize(t *testing.T) {
	root := t.TempDir()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("Authorization = %q, want Bearer secret", got)
		}
		if r.URL.Path != "/api/instances/inst-1/payload" {
			t.Errorf("path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Payload{
			Entry: "run.sh",
			Files: []PayloadFile{{Path: "run.sh", Content: "echo ok\n", Mode: "0755", Size: 8}},
		})
	}))
	defer srv.Close()

	f := NewFetcher(srv.URL, "secret", "inst-1", root)
	entryPath, entry, written, err := f.FetchAndMaterialize()
	if err != nil {
		t.Fatalf("FetchAndMaterialize: %v", err)
	}
	if entry != "run.sh" || written != 1 {
		t.Errorf("entry=%q written=%d", entry, written)
	}
	if entryPath != filepath.Join(root, "run.sh") {
		t.Errorf("entryPath = %q", entryPath)
	}
}

func TestFetchErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "工作区载荷为�?", http.StatusConflict)
	}))
	defer srv.Close()

	f := NewFetcher(srv.URL, "tok", "inst", t.TempDir())
	if _, err := f.Fetch(); err == nil {
		t.Fatal("Fetch accepted a 409 response")
	}
}
