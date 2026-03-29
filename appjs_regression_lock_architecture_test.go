package orbit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppJSSimplificationRegressionLockRED(t *testing.T) {
	specPath := filepath.Join("e2e", "core-ui.spec.ts")
	specBytes, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("read %s: %v", specPath, err)
	}
	spec := string(specBytes)

	requiredRegressions := []string{
		"blank context cards are discarded when left empty",
		"card note height increases from one line to two lines",
		"touch control stays explicit, toggles today state, and supports undo",
		"complete shows acknowledgment, supports undo, and expires after 6s",
		"hide/unhide updates hidden tray count accurately",
		"drag/drop persists card position after reload",
		"center/periphery lens updates membership when slider cutoff changes",
		"mutation failure logs include structured context for context-title and pin save",
	}

	for _, name := range requiredRegressions {
		t.Run(name, func(t *testing.T) {
			testDecl := "test('" + name + "'"
			if !strings.Contains(spec, testDecl) {
				t.Fatalf("required regression test missing from %s: %q", specPath, name)
			}
			if strings.Contains(spec, "test.skip('"+name+"'") {
				t.Fatalf("required regression test is skipped in %s: %q", specPath, name)
			}
			if strings.Contains(spec, "test.fixme('"+name+"'") {
				t.Fatalf("required regression test is marked fixme in %s: %q", specPath, name)
			}
		})
	}
}
