package orbit

import (
	"html/template"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHomeEmbedsCanonicalCenterSemantics(t *testing.T) {
	s, _ := newTestStore(t)
	tplFS, err := fs.Sub(embeddedAssets, "templates")
	if err != nil {
		t.Fatalf("sub templates fs: %v", err)
	}
	app := &App{
		tpl:   template.Must(template.ParseFS(tplFS, "*.html")),
		store: s,
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	app.home(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := rr.Body.String()
	if !strings.Contains(body, `window.__CENTER_SEMANTICS__ = {"desktopWidth":1272,"desktopHeight":740,"radiusScale":0.42,"lensRatio":0.68};`) {
		t.Fatalf("expected center semantics bootstrap in home page, body=%q", body)
	}
}
