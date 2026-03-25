package orbit

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestFrontendRuntimeSingleSourceArchitectureRED(t *testing.T) {
	t.Run("runtime javascript entrypoint exists", func(t *testing.T) {
		path := filepath.Join("static", "app.js")
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("expected authoritative runtime JS entrypoint at %s: %v", path, err)
		}
		if info.IsDir() {
			t.Fatalf("expected %s to be a file, got directory", path)
		}
	})

	t.Run("typescript runtime shadow file does not exist", func(t *testing.T) {
		path := filepath.Join("static", "app.ts")
		_, err := os.Stat(path)
		if err == nil {
			t.Fatalf("dual frontend source-of-truth detected: %s must not exist once runtime JS is authoritative", path)
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("stat %s: %v", path, err)
		}
	})
}
