package orbit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMutationTransportArchitectureRED(t *testing.T) {
	appPath := filepath.Join("static", "app.js")
	appBytes, err := os.ReadFile(appPath)
	if err != nil {
		t.Fatalf("read %s: %v", appPath, err)
	}
	appJS := string(appBytes)

	t.Run("app.js does not keep mutation transport internals", func(t *testing.T) {
		disallowedMutationEndpoints := []string{
			"/api/items",
			"/api/items/hide",
			"/api/items/delete",
			"/api/items/complete",
			"/api/items/touch",
			"/api/items/touch/undo",
			"/api/items/unhide-at",
			"/api/items/reveal-all",
			"/api/contexts",
			"/api/contexts/delete",
		}
		for _, endpoint := range disallowedMutationEndpoints {
			if strings.Contains(appJS, endpoint) {
				t.Fatalf("app.js still contains mutation endpoint %q; extract mutation transport into focused module(s)", endpoint)
			}
		}
		if strings.Contains(appJS, "function logMutationFailure(") {
			t.Fatalf("app.js still defines logMutationFailure; diagnostics helper should live in extracted transport module")
		}
		if strings.Contains(appJS, "function mutationErrorSummary(") {
			t.Fatalf("app.js still defines mutationErrorSummary; diagnostics helper should live in extracted transport module")
		}
	})

	t.Run("extracted mutation transport module exists and owns diagnostics contract", func(t *testing.T) {
		modulePath := filepath.Join("static", "mutation_transport.js")
		moduleBytes, err := os.ReadFile(modulePath)
		if err != nil {
			t.Fatalf("expected extracted mutation transport module at %s: %v", modulePath, err)
		}
		moduleJS := string(moduleBytes)

		requiredSnippets := []string{
			"[mutation-failure]",
			"logMutationFailure",
			"mutationErrorSummary",
		}
		for _, snippet := range requiredSnippets {
			if !strings.Contains(moduleJS, snippet) {
				t.Fatalf("extracted mutation transport module missing %q diagnostics contract snippet", snippet)
			}
		}
	})

	t.Run("playwright mutation-failure regressions remain present", func(t *testing.T) {
		specPath := filepath.Join("e2e", "core-ui.spec.ts")
		specBytes, err := os.ReadFile(specPath)
		if err != nil {
			t.Fatalf("read %s: %v", specPath, err)
		}
		spec := string(specBytes)

		requiredRegressionNames := []string{
			"mutation failure logs include structured context for context-title and pin save",
			"mutation failure logs include structured context for hide failures",
			"mutation failure logs include structured context for delete failures",
			"mutation failure logs include structured context for touch and complete failures",
			"mutation failure logs include structured context for unhide failures",
		}
		for _, name := range requiredRegressionNames {
			if !strings.Contains(spec, name) {
				t.Fatalf("missing mutation-failure regression coverage: %q", name)
			}
		}
	})
}
