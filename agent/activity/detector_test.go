package activity

import (
	"testing"
	"time"
)

func TestParseAddr(t *testing.T) {
	cases := []struct {
		in     string
		wantOK bool
		port   int
	}{
		{"0100007F:1F90", true, 8080},
		{"00000000:0050", true, 80},
		{"00000000000000000000000000000000:1F90", true, 8080},
		{"garbage", false, 0},
		{"0100007F:ZZZZ", false, 0},
		{"0100007F:0000", false, 0}, // port 0 is invalid
	}

	for _, c := range cases {
		_, port, ok := parseAddr(c.in)
		if ok != c.wantOK {
			t.Errorf("parseAddr(%q) ok = %v, want %v", c.in, ok, c.wantOK)
			continue
		}
		if ok && port != c.port {
			t.Errorf("parseAddr(%q) port = %d, want %d", c.in, port, c.port)
		}
	}
}

func TestIsLoopback(t *testing.T) {
	if !isLoopback("0100007F") {
		t.Error("IPv4 127.0.0.1 not detected as loopback")
	}
	if !isLoopback("00000000000000000000000001000000") {
		t.Error("IPv6 ::1 not detected as loopback")
	}
	if isLoopback("0A000001") {
		t.Error("10.0.0.1 wrongly detected as loopback")
	}
	if isLoopback("") {
		t.Error("empty string wrongly detected as loopback")
	}
}

func TestDetectorIdle(t *testing.T) {
	d := New([]int{8000}, 0)
	if d.interval != 30*time.Second {
		t.Errorf("default interval = %v, want 30s", d.interval)
	}

	// Fresh detector counts as active.
	if d.IsIdle(30) {
		t.Error("fresh detector reported idle")
	}

	// Backdate lastActive past the window.
	d.mu.Lock()
	d.lastActive = time.Now().Add(-45 * time.Minute)
	d.mu.Unlock()

	if !d.IsIdle(30) {
		t.Error("detector with 45m idle reported active")
	}
	if d.IsIdle(60) {
		t.Error("45m idle should not exceed a 60m window")
	}

	// MarkActive resets it.
	d.MarkActive()
	if d.IsIdle(30) {
		t.Error("MarkActive did not reset idleness")
	}
}

func TestDetectorStopIdempotent(t *testing.T) {
	d := New(nil, 10*time.Millisecond)
	d.Start()
	d.Stop()
	d.Stop() // must not panic on double close
}

func TestConnectionsSnapshot(t *testing.T) {
	d := New([]int{8000, 3000}, time.Second)
	d.mu.Lock()
	d.lastSample = map[int]int{8000: 2, 3000: 0}
	d.mu.Unlock()

	got := d.Connections()
	if len(got) != 2 || got[8000] != 2 || got[3000] != 0 {
		t.Errorf("Connections() = %v", got)
	}

	// Mutating the snapshot must not affect the detector.
	got[8000] = 99
	if d.Connections()[8000] != 2 {
		t.Error("Connections() leaked internal map")
	}
}
