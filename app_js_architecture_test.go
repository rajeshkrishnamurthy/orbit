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

	t.Run("app.js imports extracted interaction modules", func(t *testing.T) {
		requiredImports := []string{
			"import('/static/pin_presenter.js')",
			"import('/static/pin_touch_complete.js')",
			"import('/static/pin_destructive.js')",
		}
		for _, snippet := range requiredImports {
			if !strings.Contains(body, snippet) {
				t.Fatalf("app.js must compose extracted runtime modules (%q)", snippet)
			}
		}
	})

	t.Run("app.js no longer owns extracted interaction internals", func(t *testing.T) {
		disallowed := []string{
			"function resolveCssColorToRgb(",
			"function deriveTouchColors(",
			"function syncTouchState(",
			"function applyTouchResponse(",
			"pin.style.setProperty('--pin-touch-accent-rgb'",
			"async function touchPinImmediate(",
			"async function completePinImmediate(",
			"async function hidePinImmediate(",
			"async function deletePinImmediate(",
			"function discardIfEmpty(",
			"transport.touchItem({id: payload.id})",
			"transport.setItemCompleted({id: payload.id, completed: true})",
			"transport.hideItem({id: pin.dataset.id, contextId: currentContextId})",
			"transport.deleteEntity({mode, id: payload.id})",
			"transport.deleteEntityFireAndForget({mode, id: pin.dataset.id, contextId: currentContextId})",
		}
		for _, snippet := range disallowed {
			if strings.Contains(body, snippet) {
				t.Fatalf("app.js still owns extracted interaction concern internals (%q); keep them in extracted runtime modules", snippet)
			}
		}
	})

	t.Run("extracted interaction modules own their controller signatures", func(t *testing.T) {
		requiredModules := []struct {
			path     string
			snippets []string
		}{
			{
				path: filepath.Join("static", "pin_touch_complete.js"),
				snippets: []string{
					"export function createPinTouchCompleteController(",
					"touchPinImmediate",
					"completePinImmediate",
					"transport.touchItem({id: payload.id})",
					"transport.setItemCompleted({id: payload.id, completed: true})",
				},
			},
			{
				path: filepath.Join("static", "pin_destructive.js"),
				snippets: []string{
					"export function createPinDestructiveController(",
					"hidePinImmediate",
					"deletePinImmediate",
					"discardIfEmpty",
					"transport.hideItem({id: pin.dataset.id, contextId: currentContextId})",
					"transport.deleteEntity({mode, id: payload.id})",
					"transport.deleteEntityFireAndForget({mode, id: pin.dataset.id, contextId: currentContextId})",
				},
			},
		}
		for _, module := range requiredModules {
			moduleBytes, err := os.ReadFile(module.path)
			if err != nil {
				t.Fatalf("read %s: %v", module.path, err)
			}
			moduleBody := string(moduleBytes)
			for _, snippet := range module.snippets {
				if !strings.Contains(moduleBody, snippet) {
					t.Fatalf("%s must own extracted interaction snippet %q", module.path, snippet)
				}
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
