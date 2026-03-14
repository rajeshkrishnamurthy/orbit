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

func mustDecodeJSON[T any](t *testing.T, rr *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response json: %v (body=%q)", err, rr.Body.String())
	}
	return out
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

func TestItemsAPICreatesCardAndPersistsPayload(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	rr := postJSON(t, app.itemsAPI, map[string]any{
		"id":        "t_item_create_1",
		"contextId": "main-orbit",
		"title":     "Created via API",
		"subNote":   "persist all fields",
		"x":         456.0,
		"y":         321.0,
		"color":     "var(--c4)",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var (
		contextID string
		title     string
		subNote   string
		x         float64
		y         float64
		color     string
	)
	if err := s.db.QueryRow(`SELECT context_id,title,sub_note,x,y,color FROM items WHERE id=?`, "t_item_create_1").Scan(&contextID, &title, &subNote, &x, &y, &color); err != nil {
		t.Fatalf("query created item: %v", err)
	}
	if contextID != "main-orbit" || title != "Created via API" || subNote != "persist all fields" || x != 456.0 || y != 321.0 || color != "var(--c4)" {
		t.Fatalf("unexpected persisted row: context=%q title=%q sub=%q x=%v y=%v color=%q", contextID, title, subNote, x, y, color)
	}
}

func TestDeleteItemAPIRemovesCard(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.update(Item{
		ID:        "t_item_delete_1",
		ContextID: "main-orbit",
		Title:     "delete me",
		SubNote:   "",
		X:         123,
		Y:         234,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	rr := postJSON(t, app.deleteItemAPI, map[string]any{"id": "t_item_delete_1"})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE id=?`, "t_item_delete_1").Scan(&n); err != nil {
		t.Fatalf("count deleted item: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected item to be deleted, count=%d", n)
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

func TestHideItemAPIUpdatesHiddenFlagAndCount(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_ctx_hidden_1"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Hidden Test Context",
		SubNote: "",
		X:       500,
		Y:       300,
		Color:   "var(--c2)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}
	if err := s.update(Item{
		ID:        "t_hide_item_1",
		ContextID: ctxID,
		Title:     "hide-me",
		SubNote:   "",
		X:         111,
		Y:         222,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	rr := postJSON(t, app.hideItemAPI, map[string]any{
		"id":        "t_hide_item_1",
		"contextId": ctxID,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	resp := mustDecodeJSON[struct {
		OK         bool `json:"ok"`
		HiddenCount int `json:"hiddenCount"`
	}](t, rr)
	if !resp.OK {
		t.Fatalf("expected ok=true, got false")
	}

	var hidden int
	if err := s.db.QueryRow(`SELECT hidden FROM items WHERE id=?`, "t_hide_item_1").Scan(&hidden); err != nil {
		t.Fatalf("query hidden flag: %v", err)
	}
	if hidden != 1 {
		t.Fatalf("expected hidden=1, got %d", hidden)
	}

	var dbHiddenCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1 AND context_id=?`, ctxID).Scan(&dbHiddenCount); err != nil {
		t.Fatalf("query hidden count: %v", err)
	}
	if resp.HiddenCount != dbHiddenCount {
		t.Fatalf("response hiddenCount %d != db hidden count %d", resp.HiddenCount, dbHiddenCount)
	}
}

func TestUnhideAtAPIRestoresVisibilityAndPosition(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_ctx_hidden_2"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Unhide Test Context",
		SubNote: "",
		X:       520,
		Y:       320,
		Color:   "var(--c3)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}
	if err := s.update(Item{
		ID:        "t_hide_item_2",
		ContextID: ctxID,
		Title:     "unhide-me",
		SubNote:   "",
		X:         10,
		Y:         20,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	if err := s.hide("t_hide_item_2", ctxID); err != nil {
		t.Fatalf("hide item before unhide-at: %v", err)
	}

	targetX, targetY := 333.0, 444.0
	rr := postJSON(t, app.unhideAtAPI, map[string]any{
		"id":        "t_hide_item_2",
		"contextId": ctxID,
		"x":         targetX,
		"y":         targetY,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var hidden int
	var gotX, gotY float64
	if err := s.db.QueryRow(`SELECT hidden,x,y FROM items WHERE id=?`, "t_hide_item_2").Scan(&hidden, &gotX, &gotY); err != nil {
		t.Fatalf("query item after unhide-at: %v", err)
	}
	if hidden != 0 {
		t.Fatalf("expected hidden=0 after unhide-at, got %d", hidden)
	}
	if gotX != targetX || gotY != targetY {
		t.Fatalf("unexpected coordinates after unhide-at: got (%v,%v), want (%v,%v)", gotX, gotY, targetX, targetY)
	}
}

func TestRevealAllAPIReturnsItemsAndClearsHiddenSet(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_ctx_hidden_3"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Reveal Test Context",
		SubNote: "",
		X:       540,
		Y:       340,
		Color:   "var(--c4)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}

	for _, id := range []string{"t_reveal_item_1", "t_reveal_item_2"} {
		if err := s.update(Item{
			ID:        id,
			ContextID: ctxID,
			Title:     id,
			SubNote:   "",
			X:         100,
			Y:         120,
			Color:     "var(--c5)",
		}); err != nil {
			t.Fatalf("seed item %s: %v", id, err)
		}
		if err := s.hide(id, ctxID); err != nil {
			t.Fatalf("hide item %s: %v", id, err)
		}
	}

	rr := postJSON(t, app.revealAllAPI, map[string]any{"contextId": ctxID})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	resp := mustDecodeJSON[struct {
		OK          bool   `json:"ok"`
		Items       []Item `json:"items"`
		HiddenCount int    `json:"hiddenCount"`
	}](t, rr)
	if !resp.OK {
		t.Fatalf("expected ok=true, got false")
	}
	if len(resp.Items) != 2 {
		t.Fatalf("expected 2 revealed items in response, got %d", len(resp.Items))
	}
	if resp.HiddenCount != 0 {
		t.Fatalf("expected hiddenCount=0 in response, got %d", resp.HiddenCount)
	}

	var dbHiddenCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1 AND context_id=?`, ctxID).Scan(&dbHiddenCount); err != nil {
		t.Fatalf("query hidden count after reveal-all: %v", err)
	}
	if dbHiddenCount != 0 {
		t.Fatalf("expected 0 hidden items after reveal-all, got %d", dbHiddenCount)
	}
}
