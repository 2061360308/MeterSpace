package executor

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveEntryKind(t *testing.T) {
	cases := []struct {
		entry string
		want  EntryKind
		ok    bool
	}{
		{"run.sh", KindCommand, true},
		{"scripts/setup.sh", KindCommand, true},
		{"devcontainer.json", KindDevcontainer, true},
		{".devcontainer/devcontainer.json", KindDevcontainer, true},
		{"docker-compose.yml", KindCompose, true},
		{"compose.yaml", KindCompose, true},
		{"notes.txt", "", false},
		{"", "", false},
	}

	for _, c := range cases {
		got, err := ResolveEntryKind(c.entry)
		if c.ok && err != nil {
			t.Errorf("ResolveEntryKind(%q) unexpected error: %v", c.entry, err)
			continue
		}
		if !c.ok {
			if err == nil {
				t.Errorf("ResolveEntryKind(%q) expected error, got %q", c.entry, got)
			}
			continue
		}
		if got != c.want {
			t.Errorf("ResolveEntryKind(%q) = %q, want %q", c.entry, got, c.want)
		}
	}
}

func TestIsBlankScript(t *testing.T) {
	dir := t.TempDir()

	blank := filepath.Join(dir, "blank.sh")
	if err := os.WriteFile(blank, []byte("#!/bin/bash\n\n# nothing to do\n   \n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !isBlankScript(blank) {
		t.Error("isBlankScript(blank) = false, want true")
	}

	real := filepath.Join(dir, "real.sh")
	if err := os.WriteFile(real, []byte("#!/bin/bash\necho hi\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if isBlankScript(real) {
		t.Error("isBlankScript(real) = true, want false")
	}

	if isBlankScript(filepath.Join(dir, "missing.sh")) {
		t.Error("isBlankScript(missing) = true, want false")
	}
}

func TestStatusConstants(t *testing.T) {
	// StatusSkipped must be distinct so main can treat blank entries as ready.
	all := []ScriptStatus{StatusPending, StatusRunning, StatusSuccess, StatusFailed, StatusTimeout, StatusSkipped}
	seen := map[ScriptStatus]bool{}
	for _, s := range all {
		if seen[s] {
			t.Errorf("duplicate status value: %q", s)
		}
		seen[s] = true
	}
}
