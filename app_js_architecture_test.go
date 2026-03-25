package orbit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppJsCompositionGuardrails(t *testing.T) {
	appPath := filepath.Join("static", "app.js")
	bodyBytes, err := os.ReadFile(appPath)
	if err != nil {
		t.Fatalf("read %s: %v", appPath, err)
	}
	body := string(bodyBytes)

	t.Run("app.js imports extracted pin presenter", func(t *testing.T) {
		if !strings.Contains(body, "import('/static/pin_presenter.js')") {
			t.Fatalf("app.js must compose the extracted pin presenter module")
		}
	})

	t.Run("app.js no longer owns pin presentation internals", func(t *testing.T) {
		disallowed := []string{
			"function resolveCssColorToRgb(",
			"function deriveTouchColors(",
			"function syncTouchState(",
			"function applyTouchResponse(",
			"pin.style.setProperty('--pin-touch-accent-rgb'",
		}
		for _, snippet := range disallowed {
			if strings.Contains(body, snippet) {
				t.Fatalf("app.js still owns pin presentation concern internals (%q); keep them in extracted runtime modules", snippet)
			}
		}
	})

	t.Run("app.js stays within thin-shell size budget", func(t *testing.T) {
		lines := strings.Count(body, "\n") + 1
		if lines > 650 {
			t.Fatalf("app.js exceeded thin-shell size budget: got %d lines, want <= 650", lines)
		}
	})
}
