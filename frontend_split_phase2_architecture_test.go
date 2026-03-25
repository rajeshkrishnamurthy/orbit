package orbit

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestFrontendSplitPhase2ArchitectureRED(t *testing.T) {
	appPath := filepath.Join("static", "app.js")
	appBytes, err := os.ReadFile(appPath)
	if err != nil {
		t.Fatalf("read %s: %v", appPath, err)
	}
	appJS := string(appBytes)

	t.Run("app.js does not own phase2 interaction internals", func(t *testing.T) {
		disallowed := []string{
			"let lensRatio =",
			"const lensExempt = new Set()",
			"let staleLensSnapshot = new Set()",
			"let trayOpen = false",
			"let hiddenItemsCache = []",
			"const pendingUnhide = new Map()",
			"const DRAG_THRESHOLD_PX =",
			"function openHiddenTray(",
			"function renderHiddenTrayItems(",
		}
		for _, snippet := range disallowed {
			if strings.Contains(appJS, snippet) {
				t.Fatalf("app.js still owns phase2 concern internals (%q); extract this concern into focused static modules", snippet)
			}
		}
	})

	t.Run("app.js composes phase2 concerns from extracted static modules", func(t *testing.T) {
		imports := staticJSImportTargets(appJS)
		nonTransport := filterUnique(imports, func(module string) bool {
			return filepath.Base(module) != "mutation_transport.js"
		})

		if len(nonTransport) < 3 {
			t.Fatalf("app.js must import at least 3 non-transport static modules for phase2 concerns; found %d: %v", len(nonTransport), nonTransport)
		}
	})

	t.Run("app.js keeps one-way drag surface orchestration", func(t *testing.T) {
		required := []string{
			"hiddenTrayState.handleSurfaceDragOver(",
			"hiddenTrayState.handleSurfaceDragLeave(",
			"hiddenTrayState.handleSurfaceDrop(",
		}
		for _, snippet := range required {
			if !strings.Contains(appJS, snippet) {
				t.Fatalf("app.js must keep explicit one-way surface drag orchestration via hidden tray controller (%q)", snippet)
			}
		}
	})

	t.Run("extracted modules own phase2 concern signatures", func(t *testing.T) {
		modules := readStaticJSModules(t)

		excluded := map[string]bool{
			filepath.Join("static", "app.js"):                true,
			filepath.Join("static", "app-mobile.js"):         true,
			filepath.Join("static", "mutation_transport.js"): true,
		}

		concerns := []concernSignature{
			{
				name: "lens/visibility state",
				options: [][]string{
					{"setLensMode(", "isVisible("},
					{"lensRatio", "staleLensSnapshot"},
				},
			},
			{
				name: "hidden-tray + unhide flow",
				options: [][]string{
					{"open()", "pendingUnhide"},
					{"renderHiddenTrayItems(", "unhideItemAt("},
				},
			},
			{
				name: "drag/drop interaction state",
				options: [][]string{
					{"dragThresholdPx", "bindPinDrag("},
					{"handleSurfaceDragOver(", "handleSurfaceDrop("},
				},
			},
		}

		for _, concern := range concerns {
			ownerFound := false
			for path, body := range modules {
				if excluded[path] {
					continue
				}
				if moduleMatchesConcern(body, concern.options) {
					ownerFound = true
					break
				}
			}
			if !ownerFound {
				t.Fatalf("no extracted static module owns %q concern signature; add focused module(s) under static/ and move ownership from app.js", concern.name)
			}
		}
	})
}

type concernSignature struct {
	name    string
	options [][]string
}

func readStaticJSModules(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir("static")
	if err != nil {
		t.Fatalf("read static directory: %v", err)
	}

	out := make(map[string]string, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".js" {
			continue
		}
		path := filepath.Join("static", entry.Name())
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		out[path] = string(body)
	}
	return out
}

func staticJSImportTargets(appJS string) []string {
	re := regexp.MustCompile(`import\((?:'|")/static/([^'"]+\.js)(?:'|")\)`)
	matches := re.FindAllStringSubmatch(appJS, -1)
	out := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) >= 2 {
			out = append(out, match[1])
		}
	}
	return out
}

func filterUnique(in []string, keep func(string) bool) []string {
	set := map[string]struct{}{}
	for _, item := range in {
		if keep != nil && !keep(item) {
			continue
		}
		set[item] = struct{}{}
	}

	out := make([]string, 0, len(set))
	for item := range set {
		out = append(out, item)
	}
	sort.Strings(out)
	return out
}

func moduleMatchesConcern(body string, alternatives [][]string) bool {
	for _, snippets := range alternatives {
		if containsAll(body, snippets) {
			return true
		}
	}
	return false
}

func containsAll(body string, snippets []string) bool {
	for _, snippet := range snippets {
		if !strings.Contains(body, snippet) {
			return false
		}
	}
	return true
}
