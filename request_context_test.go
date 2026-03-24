package orbit

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func postJSONWithContext(ctx context.Context, t *testing.T, h http.HandlerFunc, payload any) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		t.Fatalf("encode payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/", &body).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

func TestAppRequestContextUsesGlobalTimeoutPolicy(t *testing.T) {
	app := &App{}
	req := httptest.NewRequest(http.MethodPost, "/", nil)

	ctx, cancel := app.requestContext(req)
	defer cancel()

	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("requestContext should set a deadline")
	}
	remaining := time.Until(deadline)
	if remaining < 4*time.Second || remaining > 6*time.Second {
		t.Fatalf("unexpected request timeout window: got %s around %s", remaining, requestTimeout)
	}
}

func TestHiddenItemsAPICanceledRequestStopsPromptly(t *testing.T) {
	app, _ := newTestApp(t)
	parent, cancel := context.WithCancel(context.Background())
	cancel()

	rr := postJSONWithContext(parent, t, app.hiddenItemsAPI, map[string]any{"contextId": "main-orbit"})
	if rr.Code != http.StatusRequestTimeout {
		t.Fatalf("expected %d for canceled request, got %d: %s", http.StatusRequestTimeout, rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "request canceled") {
		t.Fatalf("expected canceled request message, got %q", rr.Body.String())
	}
}

func TestHideItemAPIDeadlineExceededStopsPromptly(t *testing.T) {
	app, s := newTestApp(t)
	if err := s.update(Item{
		ID:        "t_ctx_timeout_hide",
		ContextID: "main-orbit",
		Title:     "timeout target",
		SubNote:   "",
		X:         320,
		Y:         220,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	parent, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	rr := postJSONWithContext(parent, t, app.hideItemAPI, map[string]any{
		"id":        "t_ctx_timeout_hide",
		"contextId": "main-orbit",
	})
	if rr.Code != http.StatusRequestTimeout {
		t.Fatalf("expected %d for expired request deadline, got %d: %s", http.StatusRequestTimeout, rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "request timed out") {
		t.Fatalf("expected timeout response message, got %q", rr.Body.String())
	}
}

func TestRequestScopedDBArchitectureRED(t *testing.T) {
	read := func(path string) string {
		t.Helper()
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		return string(body)
	}

	orbitSrc := read(filepath.Join("orbit.go"))
	appServiceSrc := read(filepath.Join("app_service.go"))
	storeRepoSrc := read(filepath.Join("store_repository.go"))
	storeTouchSrc := read(filepath.Join("store_touch.go"))
	storeContextSrc := read(filepath.Join("store_context.go"))

	requiredOrbitSnippets := []string{
		"context.WithTimeout(r.Context(), requestTimeout)",
		"a.appService().Home(reqCtx,",
		"a.appService().UpsertItem(reqCtx,",
		"a.appService().HideItem(reqCtx,",
		"a.appService().HiddenItems(reqCtx,",
	}
	for _, snippet := range requiredOrbitSnippets {
		if !strings.Contains(orbitSrc, snippet) {
			t.Fatalf("orbit.go missing request-scoped timeout/context propagation snippet %q", snippet)
		}
	}

	requiredServiceSnippets := []string{
		"func (s *AppService) Home(ctx context.Context, req HomeRequest)",
		"func (s *AppService) UpsertItem(ctx context.Context, req UpsertItemRequest)",
		"func (s *AppService) HideItem(ctx context.Context, req HideItemRequest)",
		"func (s *AppService) HiddenItems(ctx context.Context, req HiddenItemsRequest)",
		"func (s *AppService) DeleteContext(ctx context.Context, req DeleteContextRequest)",
	}
	for _, snippet := range requiredServiceSnippets {
		if !strings.Contains(appServiceSrc, snippet) {
			t.Fatalf("app_service.go missing context-aware service signature %q", snippet)
		}
	}

	requiredStoreSnippets := []string{
		"ExecContext(",
		"QueryContext(",
		"QueryRowContext(",
		"BeginTx(",
	}
	for _, snippet := range requiredStoreSnippets {
		if !strings.Contains(storeRepoSrc, snippet) && !strings.Contains(storeTouchSrc, snippet) && !strings.Contains(storeContextSrc, snippet) {
			t.Fatalf("store layer missing context-aware DB call snippet %q", snippet)
		}
	}

	disallowedStoreSnippets := []string{
		"s.db.Exec(",
		"s.db.Query(",
		"s.db.QueryRow(",
		"s.db.Begin(",
	}
	for _, snippet := range disallowedStoreSnippets {
		if strings.Contains(storeRepoSrc, snippet) || strings.Contains(storeTouchSrc, snippet) {
			t.Fatalf("store layer still contains non-context DB call %q; use context-aware variants instead", snippet)
		}
	}
}
