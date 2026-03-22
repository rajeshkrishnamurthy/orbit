package orbit

import (
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func TestOrbitDataDirHonorsOverrideAndDefaultLocation(t *testing.T) {
	t.Run("override", func(t *testing.T) {
		override := filepath.Join(t.TempDir(), "orbit-data")
		t.Setenv("ORBIT_DATA_DIR", override)

		got, err := orbitDataDir()
		if err != nil {
			t.Fatalf("orbitDataDir override: %v", err)
		}
		if got != override {
			t.Fatalf("unexpected override path: got %q want %q", got, override)
		}
		if info, err := os.Stat(got); err != nil {
			t.Fatalf("override dir missing: %v", err)
		} else if !info.IsDir() {
			t.Fatalf("override path is not a directory: %s", got)
		}
	})

	t.Run("default", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("ORBIT_DATA_DIR", "")
		t.Setenv("HOME", home)
		t.Setenv("XDG_CONFIG_HOME", "")

		got, err := orbitDataDir()
		if err != nil {
			t.Fatalf("orbitDataDir default: %v", err)
		}

		want := filepath.Join(home, ".config", "Orbit")
		if runtime.GOOS == "darwin" {
			want = filepath.Join(home, "Library", "Application Support", "Orbit")
		}
		if got != want {
			t.Fatalf("unexpected default path: got %q want %q", got, want)
		}
		if info, err := os.Stat(got); err != nil {
			t.Fatalf("default dir missing: %v", err)
		} else if !info.IsDir() {
			t.Fatalf("default path is not a directory: %s", got)
		}
	})
}

func TestListenOrbitUsesPreferredPortAndFallsBackWhenBusy(t *testing.T) {
	t.Run("preferred port", func(t *testing.T) {
		seed, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("reserve seed port: %v", err)
		}
		_, portStr, err := net.SplitHostPort(seed.Addr().String())
		if err != nil {
			_ = seed.Close()
			t.Fatalf("split seed addr: %v", err)
		}
		err = seed.Close()
		if err != nil {
			t.Fatalf("close seed listener: %v", err)
		}

		t.Setenv("PORT", portStr)

		ln, baseURL, err := listenOrbit()
		if err != nil {
			t.Fatalf("listenOrbit preferred: %v", err)
		}
		defer func() { _ = ln.Close() }()

		if !strings.HasSuffix(baseURL, ":"+portStr) {
			t.Fatalf("unexpected baseURL: got %q want port %q", baseURL, portStr)
		}
		if _, gotPort, err := net.SplitHostPort(ln.Addr().String()); err != nil {
			t.Fatalf("split listener addr: %v", err)
		} else if gotPort != portStr {
			t.Fatalf("listener bound to wrong port: got %q want %q", gotPort, portStr)
		}
	})

	t.Run("fallback when preferred busy", func(t *testing.T) {
		busy, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("reserve busy port: %v", err)
		}
		defer func() { _ = busy.Close() }()

		_, busyPort, err := net.SplitHostPort(busy.Addr().String())
		if err != nil {
			t.Fatalf("split busy addr: %v", err)
		}

		t.Setenv("PORT", busyPort)

		ln, baseURL, err := listenOrbit()
		if err != nil {
			t.Fatalf("listenOrbit fallback: %v", err)
		}
		defer func() { _ = ln.Close() }()

		_, gotPort, err := net.SplitHostPort(ln.Addr().String())
		if err != nil {
			t.Fatalf("split fallback addr: %v", err)
		}
		if gotPort == busyPort {
			t.Fatalf("fallback reused busy port %q", busyPort)
		}
		if !strings.Contains(baseURL, ":"+gotPort) {
			t.Fatalf("baseURL %q does not include listener port %q", baseURL, gotPort)
		}
	})
}

func TestListenOrbitDefaultPortIsNumeric(t *testing.T) {
	t.Setenv("PORT", "")

	ln, baseURL, err := listenOrbit()
	if err != nil {
		t.Fatalf("listenOrbit default: %v", err)
	}
	defer func() { _ = ln.Close() }()

	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatalf("split default listener addr: %v", err)
	}
	if _, convErr := strconv.Atoi(portStr); convErr != nil {
		t.Fatalf("expected numeric port, got %q", portStr)
	}
	if !strings.Contains(baseURL, ":"+portStr) {
		t.Fatalf("baseURL %q does not include listener port %q", baseURL, portStr)
	}
}
