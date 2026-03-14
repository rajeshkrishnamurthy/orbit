package orbit

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	s, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("newStore: %v", err)
	}
	t.Cleanup(func() {
		_ = s.db.Close()
	})
	return s, dbPath
}

func postJSON(t *testing.T, h http.HandlerFunc, payload any) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		t.Fatalf("encode payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/", &body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

func TestContextsAPIPartialUpdatePreservesCoordinates(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	before, err := s.contextByID("main-orbit")
	if err != nil {
		t.Fatalf("contextByID before: %v", err)
	}
	beforeX, beforeY := before.X, before.Y

	rr := postJSON(t, app.contextsAPI, map[string]any{
		"id":    "main-orbit",
		"title": "Renamed Main Orbit",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	after, err := s.contextByID("main-orbit")
	if err != nil {
		t.Fatalf("contextByID after: %v", err)
	}
	if after.Title != "Renamed Main Orbit" {
		t.Fatalf("unexpected title: %q", after.Title)
	}
	if after.X != beforeX || after.Y != beforeY {
		t.Fatalf("coordinates changed unexpectedly: before=(%v,%v) after=(%v,%v)", beforeX, beforeY, after.X, after.Y)
	}
}

func TestDeleteContextAPICascadesItems(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctx := Context{
		ID:      "t_ctx_1",
		Title:   "Temp Context",
		SubNote: "",
		X:       420,
		Y:       260,
		Color:   "var(--c2)",
	}
	if err := s.upsertContext(ctx); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}
	for _, id := range []string{"t_item_a", "t_item_b"} {
		if err := s.update(Item{
			ID:        id,
			ContextID: ctx.ID,
			Title:     "tmp",
			SubNote:   "",
			X:         120,
			Y:         140,
			Color:     "var(--c1)",
		}); err != nil {
			t.Fatalf("update item %s: %v", id, err)
		}
	}

	rr := postJSON(t, app.deleteContextAPI, map[string]any{"id": ctx.ID})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var contextRows int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM contexts WHERE id=?`, ctx.ID).Scan(&contextRows); err != nil {
		t.Fatalf("count context: %v", err)
	}
	if contextRows != 0 {
		t.Fatalf("expected context to be deleted, still have %d rows", contextRows)
	}

	var itemRows int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE context_id=?`, ctx.ID).Scan(&itemRows); err != nil {
		t.Fatalf("count items by context: %v", err)
	}
	if itemRows != 0 {
		t.Fatalf("expected cascade delete of items, still have %d rows", itemRows)
	}
}

func TestStoreRestartKeepsExistingData(t *testing.T) {
	s, dbPath := newTestStore(t)

	if err := s.update(Item{
		ID:        "custom-item-1",
		ContextID: "main-orbit",
		Title:     "Persistent Title",
		SubNote:   "Keep me",
		X:         333,
		Y:         222,
		Color:     "var(--c3)",
	}); err != nil {
		t.Fatalf("seed custom item: %v", err)
	}
	if err := s.db.Close(); err != nil {
		t.Fatalf("close first store: %v", err)
	}

	s2, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("reopen newStore: %v", err)
	}
	defer s2.db.Close()

	var title string
	if err := s2.db.QueryRow(`SELECT title FROM items WHERE id=?`, "custom-item-1").Scan(&title); err != nil {
		t.Fatalf("select custom item after restart: %v", err)
	}
	if title != "Persistent Title" {
		t.Fatalf("title changed after restart, got %q", title)
	}

	var n int
	if err := s2.db.QueryRow(`SELECT COUNT(*) FROM items WHERE id=?`, "custom-item-1").Scan(&n); err != nil {
		t.Fatalf("count custom item after restart: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected custom item to persist exactly once, got %d", n)
	}
}

func TestNewStoreFailsWhenInitializedButDBMissing(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	initFlag := filepath.Join(dir, ".orbit_initialized")
	if err := os.WriteFile(initFlag, []byte("already-initialized"), 0o644); err != nil {
		t.Fatalf("write init flag: %v", err)
	}

	_, err := newStore(dbPath)
	if err == nil {
		t.Fatal("expected error when initialized flag exists but db is missing")
	}
	if !strings.Contains(err.Error(), "orbit.db missing after initialization") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(dbPath); statErr == nil {
		t.Fatalf("unexpected db created at %s", dbPath)
	}
}
