package orbit

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"html/template"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

var chdirMu sync.Mutex

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

func newTestApp(t *testing.T) (*App, *Store) {
	t.Helper()
	s, _ := newTestStore(t)
	tpl := template.Must(template.New("test").Parse(`{{.Mode}}|{{.CurrentContextTitle}}`))
	return &App{store: s, tpl: tpl}, s
}

func withWorkingDir(t *testing.T, dir string, fn func()) {
	t.Helper()
	chdirMu.Lock()
	defer chdirMu.Unlock()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir to %s: %v", dir, err)
	}
	defer func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd to %s: %v", wd, err)
		}
	}()
	fn()
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

func assertJSONResponse(t *testing.T, rr *httptest.ResponseRecorder, wantCode int) {
	t.Helper()
	if rr.Code != wantCode {
		t.Fatalf("expected %d, got %d: %s", wantCode, rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected application/json content-type, got %q", got)
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

func TestCompleteItemAPIMarksItemCompletedAndRemovesFromSnapshot(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.update(Item{
		ID:        "t_item_complete_1",
		ContextID: "main-orbit",
		Title:     "complete me",
		SubNote:   "",
		X:         120,
		Y:         240,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	rr := postJSON(t, app.completeItemAPI, map[string]any{
		"id":        "t_item_complete_1",
		"completed": true,
	})
	assertJSONResponse(t, rr, http.StatusOK)

	var completed, hidden int
	if err := s.db.QueryRow(`SELECT completed,hidden FROM items WHERE id=?`, "t_item_complete_1").Scan(&completed, &hidden); err != nil {
		t.Fatalf("query completed item: %v", err)
	}
	if completed != 1 {
		t.Fatalf("expected completed=1, got %d", completed)
	}
	if hidden != 0 {
		t.Fatalf("expected hidden=0, got %d", hidden)
	}

	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	for _, it := range items {
		if it.ID == "t_item_complete_1" {
			t.Fatalf("completed item remained in live snapshot")
		}
	}
}

func TestCompleteItemAPIUndoRestoresItemInOriginalContext(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_ctx_complete_restore"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Restore Context",
		SubNote: "",
		X:       300,
		Y:       200,
		Color:   "var(--c2)",
	}); err != nil {
		t.Fatalf("seed context: %v", err)
	}
	if err := s.update(Item{
		ID:        "t_item_complete_2",
		ContextID: ctxID,
		Title:     "undo me",
		SubNote:   "",
		X:         222,
		Y:         111,
		Color:     "var(--c3)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	completeRR := postJSON(t, app.completeItemAPI, map[string]any{
		"id":        "t_item_complete_2",
		"completed": true,
	})
	assertJSONResponse(t, completeRR, http.StatusOK)

	restoreRR := postJSON(t, app.completeItemAPI, map[string]any{
		"id":        "t_item_complete_2",
		"completed": false,
	})
	assertJSONResponse(t, restoreRR, http.StatusOK)

	var contextID string
	var completed int
	if err := s.db.QueryRow(`SELECT context_id,completed FROM items WHERE id=?`, "t_item_complete_2").Scan(&contextID, &completed); err != nil {
		t.Fatalf("query restored item: %v", err)
	}
	if contextID != ctxID {
		t.Fatalf("expected context %q, got %q", ctxID, contextID)
	}
	if completed != 0 {
		t.Fatalf("expected completed=0, got %d", completed)
	}

	items, err := s.snapshot(ctxID)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	found := false
	for _, it := range items {
		if it.ID == "t_item_complete_2" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected restored item in original context snapshot")
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

func TestDeleteContextAPIMainOrbitRejected(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	rr := postJSON(t, app.deleteContextAPI, map[string]any{"id": "main-orbit"})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "cannot delete Main Orbit") {
		t.Fatalf("expected main-orbit guard message, got: %s", rr.Body.String())
	}

	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM contexts WHERE id='main-orbit'`).Scan(&n); err != nil {
		t.Fatalf("count main-orbit: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected main-orbit to still exist, count=%d", n)
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
	defer func() { _ = s2.db.Close() }()

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
	if msg := err.Error(); !strings.Contains(msg, "state loss") && !strings.Contains(msg, "missing after initialization") {
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
		OK          bool `json:"ok"`
		HiddenCount int  `json:"hiddenCount"`
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
	createdAt := time.Now().AddDate(0, 0, -8).Format(time.RFC3339Nano)
	if _, err := s.db.Exec(`UPDATE items SET created_at=? WHERE id=?`, createdAt, "t_hide_item_2"); err != nil {
		t.Fatalf("age item before hide: %v", err)
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
	resp := mustDecodeJSON[struct {
		Ok          bool `json:"ok"`
		HiddenCount int  `json:"hiddenCount"`
		Item        Item `json:"item"`
	}](t, rr)
	if !resp.Ok {
		t.Fatalf("expected ok=true, got false")
	}
	if !resp.Item.Stale || resp.Item.Hidden || resp.Item.Active {
		t.Fatalf("expected restored item to be recomputed stale after unhide, got %#v", resp.Item)
	}
	if resp.Item.X != targetX || resp.Item.Y != targetY {
		t.Fatalf("unexpected item coordinates in response: got (%v,%v), want (%v,%v)", resp.Item.X, resp.Item.Y, targetX, targetY)
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
	var hiddenBefore int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1 AND context_id=?`, ctxID).Scan(&hiddenBefore); err != nil {
		t.Fatalf("hidden count before reveal-all: %v", err)
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

func TestHandlersRejectWrongMethodAndInvalidPayload(t *testing.T) {
	app, _ := newTestApp(t)

	tests := []struct {
		name   string
		h      http.HandlerFunc
		method string
		body   string
		code   int
	}{
		{name: "items get 405", h: app.itemsAPI, method: http.MethodGet, body: "", code: http.StatusMethodNotAllowed},
		{name: "items missing id 400", h: app.itemsAPI, method: http.MethodPost, body: `{}`, code: http.StatusBadRequest},
		{name: "delete item missing id 400", h: app.deleteItemAPI, method: http.MethodPost, body: `{}`, code: http.StatusBadRequest},
		{name: "complete item missing id 400", h: app.completeItemAPI, method: http.MethodPost, body: `{}`, code: http.StatusBadRequest},
		{name: "hide item missing id 400", h: app.hideItemAPI, method: http.MethodPost, body: `{"contextId":"main-orbit"}`, code: http.StatusBadRequest},
		{name: "contexts get 405", h: app.contextsAPI, method: http.MethodGet, body: "", code: http.StatusMethodNotAllowed},
		{name: "delete contexts get missing id 400", h: app.deleteContextAPI, method: http.MethodGet, body: "", code: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/", strings.NewReader(tc.body))
			if tc.method == http.MethodPost {
				req.Header.Set("Content-Type", "application/json")
			}
			rr := httptest.NewRecorder()
			tc.h(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("expected %d, got %d, body=%s", tc.code, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestHiddenItemsAPIReturnsHiddenItemsForContext(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_ctx_hidden_read_1"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Hidden Read Context",
		SubNote: "",
		X:       400,
		Y:       260,
		Color:   "var(--c1)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}

	visibleID := "t_visible_item"
	hiddenID := "t_hidden_item"
	if err := s.update(Item{ID: visibleID, ContextID: ctxID, Title: "visible", SubNote: "", X: 100, Y: 100, Color: "var(--c2)"}); err != nil {
		t.Fatalf("seed visible item: %v", err)
	}
	if err := s.update(Item{ID: hiddenID, ContextID: ctxID, Title: "hidden", SubNote: "", X: 120, Y: 140, Color: "var(--c3)"}); err != nil {
		t.Fatalf("seed hidden item: %v", err)
	}
	if err := s.hide(hiddenID, ctxID); err != nil {
		t.Fatalf("hide seeded item: %v", err)
	}

	rr := postJSON(t, app.hiddenItemsAPI, map[string]any{"contextId": ctxID})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	resp := mustDecodeJSON[struct {
		OK    bool   `json:"ok"`
		Items []Item `json:"items"`
	}](t, rr)
	if !resp.OK {
		t.Fatalf("expected ok=true, got false")
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected exactly 1 hidden item, got %d", len(resp.Items))
	}
	if resp.Items[0].ID != hiddenID {
		t.Fatalf("expected hidden item id %q, got %q", hiddenID, resp.Items[0].ID)
	}
}

func TestStoreSnapshotAndContextsReadPaths(t *testing.T) {
	s, _ := newTestStore(t)

	ctxID := "t_ctx_reads_1"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Read Context",
		SubNote: "",
		X:       460,
		Y:       280,
		Color:   "var(--c4)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}
	if err := s.update(Item{ID: "t_read_visible", ContextID: ctxID, Title: "v", SubNote: "", X: 636, Y: 370, Color: "var(--c1)"}); err != nil {
		t.Fatalf("seed visible: %v", err)
	}
	if err := s.update(Item{ID: "t_read_hidden", ContextID: ctxID, Title: "h", SubNote: "", X: 80, Y: 80, Color: "var(--c2)"}); err != nil {
		t.Fatalf("seed hidden: %v", err)
	}
	if err := s.hide("t_read_hidden", ctxID); err != nil {
		t.Fatalf("hide seeded hidden card: %v", err)
	}

	items, err := s.snapshot(ctxID)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if len(items) != 1 || items[0].ID != "t_read_visible" {
		t.Fatalf("snapshot expected only visible item, got %+v", items)
	}
	// InCenter is computed in snapshot path.
	if !items[0].InCenter {
		t.Fatalf("expected visible item near center to be classified InCenter=true")
	}

	contexts, err := s.contexts()
	if err != nil {
		t.Fatalf("contexts: %v", err)
	}
	found := false
	for _, c := range contexts {
		if c.ID == ctxID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected context %q in contexts() output", ctxID)
	}
}

func TestNewStoreSeedsCanonicalDefaults(t *testing.T) {
	s, _ := newTestStore(t)

	mainCtx, err := s.contextByID("main-orbit")
	if err != nil {
		t.Fatalf("contextByID main-orbit: %v", err)
	}
	if mainCtx.Title != "Main Orbit" || mainCtx.X != 560.0 || mainCtx.Y != 320.0 {
		t.Fatalf("unexpected main-orbit context: %+v", *mainCtx)
	}

	moreCtx, err := s.contextByID("more-contexts")
	if err != nil {
		t.Fatalf("contextByID more-contexts: %v", err)
	}
	if moreCtx.Title != "Add more contexts" || moreCtx.X != 560.0 || moreCtx.Y != 500.0 {
		t.Fatalf("unexpected more-contexts context: %+v", *moreCtx)
	}

	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if len(items) != 7 {
		t.Fatalf("expected 7 seeded items, got %d", len(items))
	}

	want := map[string]struct {
		x float64
		y float64
	}{
		"i1": {x: 760, y: 280},
		"i2": {x: 620, y: 380},
		"i5": {x: 360, y: 460},
		"i7": {x: 1020, y: 360},
	}
	for id, pos := range want {
		found := false
		for _, it := range items {
			if it.ID != id {
				continue
			}
			found = true
			if it.X != pos.x || it.Y != pos.y {
				t.Fatalf("unexpected seeded position for %s: got=(%v,%v) want=(%v,%v)", id, it.X, it.Y, pos.x, pos.y)
			}
			break
		}
		if !found {
			t.Fatalf("expected seeded item %s to exist", id)
		}
	}
}

func TestContextByIDDefaultsBlankAndUpsertPreservesCreatedAt(t *testing.T) {
	s, _ := newTestStore(t)

	cur, err := s.contextByID("")
	if err != nil {
		t.Fatalf("contextByID blank: %v", err)
	}
	if cur.ID != "main-orbit" {
		t.Fatalf("expected blank context lookup to default to main-orbit, got %q", cur.ID)
	}

	const id = "t_ctx_created_at"
	if err := s.upsertContext(Context{
		ID:      id,
		Title:   "Created At Test",
		SubNote: "",
		X:       111,
		Y:       222,
		Color:   "var(--c3)",
	}); err != nil {
		t.Fatalf("seed context: %v", err)
	}

	var created1 string
	if err := s.db.QueryRow(`SELECT created_at FROM contexts WHERE id=?`, id).Scan(&created1); err != nil {
		t.Fatalf("query created_at before update: %v", err)
	}

	if err := s.upsertContext(Context{
		ID:      id,
		Title:   "Created At Test Updated",
		SubNote: "Updated note",
		X:       333,
		Y:       444,
		Color:   "var(--c4)",
	}); err != nil {
		t.Fatalf("update context: %v", err)
	}

	var created2, title string
	if err := s.db.QueryRow(`SELECT created_at,title FROM contexts WHERE id=?`, id).Scan(&created2, &title); err != nil {
		t.Fatalf("query created_at after update: %v", err)
	}
	if created1 != created2 {
		t.Fatalf("created_at changed across upsert: before=%q after=%q", created1, created2)
	}
	if title != "Created At Test Updated" {
		t.Fatalf("title not updated: %q", title)
	}
}

func TestImportJSONImportsItemsAndHandlesEdgeCases(t *testing.T) {
	s, _ := newTestStore(t)

	t.Run("empty file is a no-op", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "items.json")
		if err := os.WriteFile(path, nil, 0o644); err != nil {
			t.Fatalf("write empty file: %v", err)
		}
		before, err := s.snapshot("main-orbit")
		if err != nil {
			t.Fatalf("snapshot before import: %v", err)
		}
		if err := s.importJSON(path); err != nil {
			t.Fatalf("importJSON empty file: %v", err)
		}
		after, err := s.snapshot("main-orbit")
		if err != nil {
			t.Fatalf("snapshot after import: %v", err)
		}
		if len(after) != len(before) {
			t.Fatalf("empty import changed item count: before=%d after=%d", len(before), len(after))
		}
	})

	t.Run("malformed json fails", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "items.json")
		if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
			t.Fatalf("write malformed file: %v", err)
		}
		if err := s.importJSON(path); err == nil {
			t.Fatal("expected malformed json to fail")
		}
	})

	t.Run("valid json imports items", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "items.json")
		payload, err := json.Marshal([]map[string]any{
			{
				"id":      "t_import_1",
				"title":   "Imported item",
				"subNote": "from json",
				"x":       444.0,
				"y":       555.0,
				"color":   "var(--c5)",
			},
		})
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		if err := os.WriteFile(path, payload, 0o644); err != nil {
			t.Fatalf("write valid file: %v", err)
		}
		if err := s.importJSON(path); err != nil {
			t.Fatalf("importJSON valid file: %v", err)
		}
		items, err := s.snapshot("main-orbit")
		if err != nil {
			t.Fatalf("snapshot after valid import: %v", err)
		}
		found := false
		for _, it := range items {
			if it.ID != "t_import_1" {
				continue
			}
			found = true
			if it.Title != "Imported item" || it.SubNote != "from json" || it.X != 444.0 || it.Y != 555.0 || it.Color != "var(--c5)" {
				t.Fatalf("unexpected imported item: %+v", it)
			}
		}
		if !found {
			t.Fatal("expected imported item in snapshot")
		}
	})
}

func TestHomeRendersFocusAndContextsModes(t *testing.T) {
	app, s := newTestApp(t)

	ctxID := "t_ctx_home_1"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "Home Context",
		SubNote: "",
		X:       500,
		Y:       320,
		Color:   "var(--c5)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}

	t.Run("focus mode", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/?ctx="+ctxID, nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		body := rr.Body.String()
		if !strings.Contains(body, "focus|Home Context") {
			t.Fatalf("unexpected focus body: %s", body)
		}
	})

	t.Run("contexts mode", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/?canvas=contexts&ctx="+ctxID, nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		body := rr.Body.String()
		if !strings.Contains(body, "contexts|Your Contexts") {
			t.Fatalf("unexpected contexts body: %s", body)
		}
	})
}

func TestNewStoreFailsWhenLegacyItemsJSONPresent(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	legacyJSON := filepath.Join(dir, "items.json")
	if err := os.WriteFile(legacyJSON, []byte("[]"), 0o644); err != nil {
		t.Fatalf("write legacy items.json: %v", err)
	}

	_, err := newStore(dbPath)
	if err == nil {
		t.Fatal("expected split-brain guard error when items.json exists")
	}
	if !strings.Contains(err.Error(), "legacy data/items.json detected") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMigrateLegacyDataCopiesFilesWhenTargetEmpty(t *testing.T) {
	root := t.TempDir()
	legacyDir := filepath.Join(root, "data")
	targetDir := filepath.Join(root, "runtime-data")
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatalf("mkdir legacy: %v", err)
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		t.Fatalf("mkdir target: %v", err)
	}

	files := map[string][]byte{
		"orbit.db":           []byte("db-bytes"),
		"orbit.db.bak":       []byte("bak-bytes"),
		".orbit_initialized": []byte("init-flag"),
		"items.legacy.json":  []byte(`[]`),
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(legacyDir, name), content, 0o644); err != nil {
			t.Fatalf("write legacy file %s: %v", name, err)
		}
	}

	withWorkingDir(t, root, func() {
		if err := migrateLegacyData(targetDir); err != nil {
			t.Fatalf("migrateLegacyData: %v", err)
		}
	})

	for name, want := range files {
		got, err := os.ReadFile(filepath.Join(targetDir, name))
		if err != nil {
			t.Fatalf("read migrated file %s: %v", name, err)
		}
		if string(got) != string(want) {
			t.Fatalf("file %s mismatch: got=%q want=%q", name, string(got), string(want))
		}
	}
}

func TestAPIResponsesUseJSONContentTypeAndExpectedBodies(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	ctxID := "t_api_resp_ctx"
	if err := s.upsertContext(Context{
		ID:      ctxID,
		Title:   "API Response Context",
		SubNote: "",
		X:       500,
		Y:       300,
		Color:   "var(--c2)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}

	t.Run("itemsAPI success body", func(t *testing.T) {
		rr := postJSON(t, app.itemsAPI, map[string]any{
			"id":        "t_api_resp_item_1",
			"contextId": ctxID,
			"title":     "Create",
			"subNote":   "",
			"x":         111.0,
			"y":         222.0,
			"color":     "var(--c3)",
		})
		assertJSONResponse(t, rr, http.StatusOK)
		var body struct {
			Ok             bool   `json:"ok"`
			ID             string `json:"id"`
			Active         bool   `json:"active"`
			Stale          bool   `json:"stale"`
			TouchedToday   bool   `json:"touchedToday"`
			TouchCount7d   int    `json:"touchCount7d"`
			LastTouchedDay string `json:"lastTouchedDay"`
			InCenter       bool   `json:"inCenter"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode itemsAPI body: %v", err)
		}
		if !body.Ok || body.ID != "t_api_resp_item_1" || !body.Active || body.Stale || body.TouchedToday || body.TouchCount7d != 0 || body.LastTouchedDay != "" || body.InCenter {
			t.Fatalf("unexpected body: %#v", body)
		}
	})

	t.Run("hide/unhide/reveal/hidden success bodies", func(t *testing.T) {
		if err := s.update(Item{
			ID:        "t_api_resp_item_2",
			ContextID: ctxID,
			Title:     "Hide me",
			SubNote:   "",
			X:         100,
			Y:         100,
			Color:     "var(--c1)",
		}); err != nil {
			t.Fatalf("seed hide item: %v", err)
		}
		hideRR := postJSON(t, app.hideItemAPI, map[string]any{"id": "t_api_resp_item_2", "contextId": ctxID})
		assertJSONResponse(t, hideRR, http.StatusOK)
		if !strings.Contains(hideRR.Body.String(), `"ok":true`) || !strings.Contains(hideRR.Body.String(), `"hiddenCount"`) {
			t.Fatalf("unexpected hide body: %s", hideRR.Body.String())
		}

		hiddenRR := postJSON(t, app.hiddenItemsAPI, map[string]any{"contextId": ctxID})
		assertJSONResponse(t, hiddenRR, http.StatusOK)
		if !strings.Contains(hiddenRR.Body.String(), `"ok":true`) || !strings.Contains(hiddenRR.Body.String(), `"items"`) {
			t.Fatalf("unexpected hidden body: %s", hiddenRR.Body.String())
		}

		unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{
			"id":        "t_api_resp_item_2",
			"contextId": ctxID,
			"x":         333.0,
			"y":         444.0,
		})
		assertJSONResponse(t, unhideRR, http.StatusOK)
		if !strings.Contains(unhideRR.Body.String(), `"ok":true`) || !strings.Contains(unhideRR.Body.String(), `"hiddenCount"`) {
			t.Fatalf("unexpected unhide body: %s", unhideRR.Body.String())
		}

		_ = postJSON(t, app.hideItemAPI, map[string]any{"id": "t_api_resp_item_2", "contextId": ctxID})
		revealRR := postJSON(t, app.revealAllAPI, map[string]any{"contextId": ctxID})
		assertJSONResponse(t, revealRR, http.StatusOK)
		if !strings.Contains(revealRR.Body.String(), `"ok":true`) || !strings.Contains(revealRR.Body.String(), `"hiddenCount":0`) {
			t.Fatalf("unexpected reveal body: %s", revealRR.Body.String())
		}
	})

	t.Run("complete success body", func(t *testing.T) {
		if err := s.update(Item{
			ID:        "t_api_resp_item_complete",
			ContextID: ctxID,
			Title:     "Complete me",
			SubNote:   "",
			X:         140,
			Y:         120,
			Color:     "var(--c4)",
		}); err != nil {
			t.Fatalf("seed complete item: %v", err)
		}
		rr := postJSON(t, app.completeItemAPI, map[string]any{
			"id":        "t_api_resp_item_complete",
			"completed": true,
		})
		assertJSONResponse(t, rr, http.StatusOK)
		if got := strings.TrimSpace(rr.Body.String()); got != `{"ok":true}` {
			t.Fatalf("unexpected body: %q", got)
		}
	})

	t.Run("contexts and delete context success bodies", func(t *testing.T) {
		createRR := postJSON(t, app.contextsAPI, map[string]any{
			"id":      "t_api_resp_ctx_delete",
			"title":   "Temp",
			"subNote": "",
			"x":       400.0,
			"y":       240.0,
			"color":   "var(--c4)",
		})
		assertJSONResponse(t, createRR, http.StatusOK)
		if !strings.Contains(createRR.Body.String(), `"ok":true`) || !strings.Contains(createRR.Body.String(), `"id":"t_api_resp_ctx_delete"`) {
			t.Fatalf("unexpected contexts body: %s", createRR.Body.String())
		}

		deleteCtxRR := postJSON(t, app.deleteContextAPI, map[string]any{"id": "t_api_resp_ctx_delete"})
		assertJSONResponse(t, deleteCtxRR, http.StatusOK)
		if got := strings.TrimSpace(deleteCtxRR.Body.String()); got != `{"ok":true}` {
			t.Fatalf("unexpected delete context body: %q", got)
		}
	})

	t.Run("delete item success body", func(t *testing.T) {
		if err := s.update(Item{
			ID:        "t_api_resp_item_3",
			ContextID: ctxID,
			Title:     "Delete me",
			SubNote:   "",
			X:         90,
			Y:         90,
			Color:     "var(--c1)",
		}); err != nil {
			t.Fatalf("seed delete item: %v", err)
		}

		rr := postJSON(t, app.deleteItemAPI, map[string]any{"id": "t_api_resp_item_3"})
		assertJSONResponse(t, rr, http.StatusOK)
		if got := strings.TrimSpace(rr.Body.String()); got != `{"ok":true}` {
			t.Fatalf("unexpected body: %q", got)
		}
	})
}

func TestAPIsRejectMalformedJSONAndWrongMethods(t *testing.T) {
	app, _ := newTestApp(t)

	badJSONHandlers := []struct {
		name string
		h    http.HandlerFunc
	}{
		{name: "items bad json", h: app.itemsAPI},
		{name: "delete item bad json", h: app.deleteItemAPI},
		{name: "complete item bad json", h: app.completeItemAPI},
		{name: "hide item bad json", h: app.hideItemAPI},
		{name: "unhide-at bad json", h: app.unhideAtAPI},
		{name: "contexts bad json", h: app.contextsAPI},
		{name: "delete context bad json", h: app.deleteContextAPI},
	}

	for _, tc := range badJSONHandlers {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{"))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			tc.h(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
			}
			if !strings.Contains(strings.ToLower(rr.Body.String()), "eof") {
				t.Fatalf("expected decode error body, got: %s", rr.Body.String())
			}
		})
	}

	methodHandlers := []struct {
		name   string
		h      http.HandlerFunc
		method string
	}{
		{name: "delete item method", h: app.deleteItemAPI, method: http.MethodGet},
		{name: "complete item method", h: app.completeItemAPI, method: http.MethodGet},
		{name: "hide item method", h: app.hideItemAPI, method: http.MethodGet},
		{name: "reveal all method", h: app.revealAllAPI, method: http.MethodGet},
		{name: "hidden items method", h: app.hiddenItemsAPI, method: http.MethodGet},
		{name: "unhide-at method", h: app.unhideAtAPI, method: http.MethodGet},
		{name: "contexts method", h: app.contextsAPI, method: http.MethodGet},
		{name: "delete context method", h: app.deleteContextAPI, method: http.MethodPut},
	}

	for _, tc := range methodHandlers {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/", nil)
			rr := httptest.NewRecorder()
			tc.h(rr, req)
			if rr.Code != http.StatusMethodNotAllowed {
				t.Fatalf("expected 405, got %d: %s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestHomeNotFoundAndErrorBranches(t *testing.T) {
	t.Run("not found path", func(t *testing.T) {
		app, _ := newTestApp(t)
		req := httptest.NewRequest(http.MethodGet, "/not-found", nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rr.Code)
		}
	})

	t.Run("contexts mode store error", func(t *testing.T) {
		app, s := newTestApp(t)
		if _, err := s.db.Exec(`DROP TABLE contexts`); err != nil {
			t.Fatalf("drop contexts table: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/?canvas=contexts", nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("focus mode context lookup error", func(t *testing.T) {
		app, s := newTestApp(t)
		if err := s.db.Close(); err != nil {
			t.Fatalf("close db: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/?ctx=main-orbit", nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("focus mode snapshot error", func(t *testing.T) {
		app, s := newTestApp(t)
		if _, err := s.db.Exec(`DROP TABLE items`); err != nil {
			t.Fatalf("drop items table: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/?ctx=main-orbit", nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("focus mode hiddenCount error", func(t *testing.T) {
		app, s := newTestApp(t)
		if _, err := s.db.Exec(`ALTER TABLE items RENAME TO items_real`); err != nil {
			t.Fatalf("rename items table: %v", err)
		}
		if _, err := s.db.Exec(`CREATE VIEW items AS SELECT id,context_id,title,sub_note,x,y,color,slipping,updated_at FROM items_real`); err != nil {
			t.Fatalf("create items view: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/?ctx=main-orbit", nil)
		rr := httptest.NewRecorder()
		app.home(rr, req)
		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}

func TestContextsAPIGeneratedIDDefaultsAndFieldFallbacks(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	t.Run("generated id and defaults", func(t *testing.T) {
		rr := postJSON(t, app.contextsAPI, map[string]any{})
		assertJSONResponse(t, rr, http.StatusOK)
		resp := mustDecodeJSON[struct {
			OK bool   `json:"ok"`
			ID string `json:"id"`
		}](t, rr)
		if !resp.OK {
			t.Fatalf("expected ok=true")
		}
		if !strings.HasPrefix(resp.ID, "c_") {
			t.Fatalf("expected generated id prefix c_, got %q", resp.ID)
		}

		c, err := s.contextByID(resp.ID)
		if err != nil {
			t.Fatalf("contextByID generated: %v", err)
		}
		if c.Title != "Untitled context" || c.X != 560.0 || c.Y != 320.0 || c.Color != "var(--c1)" {
			t.Fatalf("unexpected defaults: %+v", *c)
		}
	})

	t.Run("field updates and empty fallbacks", func(t *testing.T) {
		id := "t_ctx_fallbacks_1"
		if err := s.upsertContext(Context{
			ID:      id,
			Title:   "Old Title",
			SubNote: "Old Note",
			X:       700,
			Y:       500,
			Color:   "var(--c4)",
		}); err != nil {
			t.Fatalf("seed context: %v", err)
		}

		rr := postJSON(t, app.contextsAPI, map[string]any{
			"id":      id,
			"title":   "   ",
			"subNote": "New note",
			"x":       321.0,
			"y":       123.0,
			"color":   "   ",
		})
		assertJSONResponse(t, rr, http.StatusOK)
		c, err := s.contextByID(id)
		if err != nil {
			t.Fatalf("contextByID updated: %v", err)
		}
		if c.Title != "Untitled context" {
			t.Fatalf("expected title fallback, got %q", c.Title)
		}
		if c.SubNote != "New note" || c.X != 321.0 || c.Y != 123.0 || c.Color != "var(--c1)" {
			t.Fatalf("unexpected updated context: %+v", *c)
		}
	})
}

func TestDeleteContextAPIGetDeletesContext(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.upsertContext(Context{
		ID:      "t_ctx_delete_get",
		Title:   "Delete via GET",
		SubNote: "",
		X:       200,
		Y:       220,
		Color:   "var(--c2)",
	}); err != nil {
		t.Fatalf("upsertContext: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/?id=t_ctx_delete_get", nil)
	rr := httptest.NewRecorder()
	app.deleteContextAPI(rr, req)
	assertJSONResponse(t, rr, http.StatusOK)
	if got := strings.TrimSpace(rr.Body.String()); got != `{"ok":true}` {
		t.Fatalf("unexpected body: %q", got)
	}

	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM contexts WHERE id='t_ctx_delete_get'`).Scan(&n); err != nil {
		t.Fatalf("count deleted context: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected deleted context count=0, got %d", n)
	}
}

func TestClassifyDesktopBandBoundaryGeometry(t *testing.T) {
	const cx = 1272.0 / 2.0
	const cy = 740.0 / 2.0
	const radius = 740.0 * 0.42 * 0.68

	if !classifyDesktopBand(cx, cy) {
		t.Fatalf("center point must classify as in-center")
	}
	if !classifyDesktopBand(cx+radius-0.001, cy) {
		t.Fatalf("just-inside boundary should classify as in-center")
	}
	if classifyDesktopBand(cx+radius+0.001, cy) {
		t.Fatalf("just-outside boundary should classify as periphery")
	}
	if classifyDesktopBand(0, 0) {
		t.Fatalf("far corner should classify as periphery")
	}
}

func TestPruneBackupsGuardsAndRetention(t *testing.T) {
	dir := t.TempDir()
	prefix := filepath.Join(dir, "orbit.db")
	files := []string{
		prefix + ".20260101-000001.bak",
		prefix + ".20260101-000002.bak",
		prefix + ".20260101-000003.bak",
		prefix + ".20260101-000004.bak",
	}
	for _, p := range files {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatalf("write backup %s: %v", p, err)
		}
	}

	if err := pruneBackups(prefix, 0); err != nil {
		t.Fatalf("prune keep=0: %v", err)
	}
	for _, p := range files {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected file to remain when keep=0: %s (%v)", p, err)
		}
	}

	if err := pruneBackups(prefix, 2); err != nil {
		t.Fatalf("prune keep=2: %v", err)
	}
	remaining, err := filepath.Glob(prefix + ".*.bak")
	if err != nil {
		t.Fatalf("glob remaining: %v", err)
	}
	if len(remaining) != 2 {
		t.Fatalf("expected 2 backups remaining, got %d (%v)", len(remaining), remaining)
	}
	if !strings.Contains(remaining[0], "000003") || !strings.Contains(remaining[1], "000004") {
		t.Fatalf("expected newest backups to remain, got %v", remaining)
	}
}

func TestMigrateLegacyDataSkipAndPartialCopyCases(t *testing.T) {
	root := t.TempDir()

	withWorkingDir(t, root, func() {
		targetNoLegacy := filepath.Join(root, "target-no-legacy")
		if err := os.MkdirAll(targetNoLegacy, 0o755); err != nil {
			t.Fatalf("mkdir target-no-legacy: %v", err)
		}
		if err := migrateLegacyData(targetNoLegacy); err != nil {
			t.Fatalf("migrateLegacyData without legacy dir: %v", err)
		}
	})

	withWorkingDir(t, root, func() {
		legacyDir := filepath.Join(root, "data")
		targetDir := filepath.Join(root, "target-existing")
		if err := os.MkdirAll(legacyDir, 0o755); err != nil {
			t.Fatalf("mkdir legacy: %v", err)
		}
		if err := os.MkdirAll(targetDir, 0o755); err != nil {
			t.Fatalf("mkdir target-existing: %v", err)
		}
		if err := os.WriteFile(filepath.Join(legacyDir, "orbit.db"), []byte("legacy-db"), 0o644); err != nil {
			t.Fatalf("write legacy orbit.db: %v", err)
		}
		if err := os.WriteFile(filepath.Join(targetDir, "orbit.db"), []byte("current-db"), 0o644); err != nil {
			t.Fatalf("write target orbit.db: %v", err)
		}
		if err := migrateLegacyData(targetDir); err != nil {
			t.Fatalf("migrateLegacyData with existing target db: %v", err)
		}
		got, err := os.ReadFile(filepath.Join(targetDir, "orbit.db"))
		if err != nil {
			t.Fatalf("read target orbit.db: %v", err)
		}
		if string(got) != "current-db" {
			t.Fatalf("target orbit.db should not be overwritten, got %q", string(got))
		}
	})

	withWorkingDir(t, root, func() {
		legacyDir := filepath.Join(root, "data")
		targetDir := filepath.Join(root, "target-partial-copy")
		if err := os.RemoveAll(legacyDir); err != nil {
			t.Fatalf("remove legacy: %v", err)
		}
		if err := os.MkdirAll(legacyDir, 0o755); err != nil {
			t.Fatalf("mkdir legacy partial: %v", err)
		}
		if err := os.MkdirAll(targetDir, 0o755); err != nil {
			t.Fatalf("mkdir target partial: %v", err)
		}
		if err := os.WriteFile(filepath.Join(legacyDir, "orbit.db"), []byte("only-db"), 0o644); err != nil {
			t.Fatalf("write partial legacy orbit.db: %v", err)
		}
		if err := migrateLegacyData(targetDir); err != nil {
			t.Fatalf("migrateLegacyData partial copy: %v", err)
		}
		if _, err := os.Stat(filepath.Join(targetDir, "orbit.db")); err != nil {
			t.Fatalf("expected orbit.db to copy in partial migration: %v", err)
		}
		if _, err := os.Stat(filepath.Join(targetDir, "orbit.db.bak")); !os.IsNotExist(err) {
			t.Fatalf("expected orbit.db.bak to remain absent in partial migration, stat err=%v", err)
		}
	})
}

func TestNewStoreExistingDBCreatesBackupFiles(t *testing.T) {
	s, dbPath := newTestStore(t)
	if err := s.db.Close(); err != nil {
		t.Fatalf("close original store: %v", err)
	}

	backupDir := filepath.Join(filepath.Dir(dbPath), "backups")
	_ = os.RemoveAll(backupDir)

	s2, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("newStore reopen with existing db: %v", err)
	}
	defer func() { _ = s2.db.Close() }()

	if _, err := os.Stat(filepath.Join(backupDir, "orbit.db.bak")); err != nil {
		t.Fatalf("expected latest backup file, stat err=%v", err)
	}
	versioned, err := filepath.Glob(filepath.Join(backupDir, "orbit.db.*.bak"))
	if err != nil {
		t.Fatalf("glob versioned backups: %v", err)
	}
	if len(versioned) == 0 {
		t.Fatalf("expected at least one versioned backup, got none")
	}
}

func TestExistingDataSurvivesStartupAndCreatesBackup(t *testing.T) {
	s, dbPath := newTestStore(t)
	if err := s.update(Item{
		ID:        "t_update_retention_1",
		ContextID: "main-orbit",
		Title:     "Retained Title",
		SubNote:   "Retained note",
		X:         240,
		Y:         360,
		Color:     "var(--c4)",
	}); err != nil {
		t.Fatalf("seed retained item: %v", err)
	}
	if err := s.db.Close(); err != nil {
		t.Fatalf("close original store: %v", err)
	}

	backupDir := filepath.Join(filepath.Dir(dbPath), "backups")
	_ = os.RemoveAll(backupDir)

	reopened, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("newStore reopen with existing db: %v", err)
	}
	defer func() { _ = reopened.db.Close() }()

	var title, subNote string
	var x, y float64
	if err := reopened.db.QueryRow(`SELECT title, sub_note, x, y FROM items WHERE id=?`, "t_update_retention_1").Scan(&title, &subNote, &x, &y); err != nil {
		t.Fatalf("query retained item after restart: %v", err)
	}
	if title != "Retained Title" || subNote != "Retained note" || x != 240 || y != 360 {
		t.Fatalf("retained item changed unexpectedly: title=%q sub=%q x=%v y=%v", title, subNote, x, y)
	}

	if _, err := os.Stat(filepath.Join(backupDir, "orbit.db.bak")); err != nil {
		t.Fatalf("expected latest backup file, stat err=%v", err)
	}
	versioned, err := filepath.Glob(filepath.Join(backupDir, "orbit.db.*.bak"))
	if err != nil {
		t.Fatalf("glob versioned backups: %v", err)
	}
	if len(versioned) == 0 {
		t.Fatalf("expected at least one versioned backup, got none")
	}
}

func TestOpenConfiguredDBFailsWhenParentDirectoryIsMissing(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "missing", "orbit.db")

	db, err := openConfiguredDB(dbPath)
	if db != nil {
		defer func() { _ = db.Close() }()
	}
	if err == nil {
		t.Fatal("expected openConfiguredDB to fail when parent directory is missing")
	}
}

func TestOpenConfiguredDBFailsWhenDatabasePathIsDirectory(t *testing.T) {
	dbPath := t.TempDir()

	db, err := openConfiguredDB(dbPath)
	if db != nil {
		defer func() { _ = db.Close() }()
	}
	if err == nil {
		t.Fatal("expected openConfiguredDB to fail when database path is a directory")
	}
}

func TestNewStoreFailsWhenInitFlagCannotBeWritten(t *testing.T) {
	s, dbPath := newTestStore(t)
	if err := s.update(Item{
		ID:        "t_init_flag_write_failure",
		ContextID: "main-orbit",
		Title:     "init flag failure",
		SubNote:   "",
		X:         101,
		Y:         202,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	if err := s.db.Close(); err != nil {
		t.Fatalf("close original store: %v", err)
	}

	initFlag := filepath.Join(filepath.Dir(dbPath), ".orbit_initialized")
	if err := os.Remove(initFlag); err != nil {
		t.Fatalf("remove init flag file: %v", err)
	}
	if err := os.MkdirAll(initFlag, 0o755); err != nil {
		t.Fatalf("mkdir init flag dir: %v", err)
	}

	_, err := newStore(dbPath)
	if err == nil {
		t.Fatal("expected newStore to fail when init flag cannot be written")
	}
}

func TestNewStoreRejectsInvalidPath(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bad\x00path", "orbit.db")
	_, err := newStore(dbPath)
	if err == nil {
		t.Fatal("expected newStore to fail on invalid db path")
	}
}

func TestNewStoreRejectsInitializedEmptySQLite(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sub_note TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`); err != nil {
		t.Fatalf("create contexts schema: %v", err)
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sub_note TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  color TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  slipping INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`); err != nil {
		t.Fatalf("create items schema: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close sqlite: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".orbit_initialized"), []byte("init"), 0o644); err != nil {
		t.Fatalf("write init flag: %v", err)
	}

	_, err = newStore(dbPath)
	if err == nil {
		t.Fatal("expected newStore to reject initialized empty sqlite")
	}
	if !strings.Contains(err.Error(), "sqlite is empty in an initialized environment") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestItemsAndActionAPIsErrorResponsesDoNotEmitSuccessPayload(t *testing.T) {
	app, s := newTestApp(t)
	if err := s.db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	tests := []struct {
		name string
		h    http.HandlerFunc
		body map[string]any
	}{
		{
			name: "items update error",
			h:    app.itemsAPI,
			body: map[string]any{"id": "x1", "title": "t", "subNote": "", "x": 1.0, "y": 2.0, "color": "var(--c1)"},
		},
		{
			name: "delete item error",
			h:    app.deleteItemAPI,
			body: map[string]any{"id": "x2"},
		},
		{
			name: "hide item error",
			h:    app.hideItemAPI,
			body: map[string]any{"id": "x3", "contextId": "main-orbit"},
		},
		{
			name: "unhide-at error",
			h:    app.unhideAtAPI,
			body: map[string]any{"id": "x4", "contextId": "main-orbit", "x": 1.0, "y": 1.0},
		},
		{
			name: "reveal-all error",
			h:    app.revealAllAPI,
			body: map[string]any{"contextId": "main-orbit"},
		},
		{
			name: "hidden-items error",
			h:    app.hiddenItemsAPI,
			body: map[string]any{"contextId": "main-orbit"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rr := postJSON(t, tc.h, tc.body)
			if rr.Code != http.StatusInternalServerError {
				t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
			}
			if strings.Contains(rr.Body.String(), `{"ok":true`) {
				t.Fatalf("error response must not include success payload, got: %s", rr.Body.String())
			}
		})
	}
}

func TestUnhideAtMissingIDDoesNotSucceed(t *testing.T) {
	app, _ := newTestApp(t)
	rr := postJSON(t, app.unhideAtAPI, map[string]any{
		"contextId": "main-orbit",
		"x":         10.0,
		"y":         20.0,
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(strings.ToLower(rr.Body.String()), "id required") {
		t.Fatalf("expected id required message, got: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `{"ok":true`) {
		t.Fatalf("missing-id response must not include success payload: %s", rr.Body.String())
	}
}

func TestContextsAPIPreservesExistingFieldsOnPartialUpdateForCustomContext(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	const id = "t_ctx_existing_merge"
	if err := s.upsertContext(Context{
		ID:      id,
		Title:   "Original Title",
		SubNote: "Original note",
		X:       777,
		Y:       111,
		Color:   "var(--c4)",
	}); err != nil {
		t.Fatalf("seed context: %v", err)
	}

	rr := postJSON(t, app.contextsAPI, map[string]any{
		"id":    id,
		"title": "Updated Title",
	})
	assertJSONResponse(t, rr, http.StatusOK)

	got, err := s.contextByID(id)
	if err != nil {
		t.Fatalf("contextByID: %v", err)
	}
	if got.Title != "Updated Title" {
		t.Fatalf("title not updated: %q", got.Title)
	}
	if got.SubNote != "Original note" || got.X != 777 || got.Y != 111 || got.Color != "var(--c4)" {
		t.Fatalf("expected existing fields to be preserved, got %+v", *got)
	}
}

func TestContextsAPIContextLookupErrorDoesNotReturnSuccess(t *testing.T) {
	app, s := newTestApp(t)
	if err := s.db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	rr := postJSON(t, app.contextsAPI, map[string]any{
		"id":    "ctx-err-1",
		"title": "X",
	})
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `{"ok":true`) {
		t.Fatalf("error response must not contain success payload: %s", rr.Body.String())
	}
}

func TestContextsAPIUpsertErrorDoesNotReturnSuccess(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}
	if _, err := s.db.Exec(`PRAGMA query_only = ON`); err != nil {
		t.Fatalf("set query_only pragma: %v", err)
	}
	rr := postJSON(t, app.contextsAPI, map[string]any{
		"id":    "ctx-readonly-1",
		"title": "Readonly",
	})
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `{"ok":true`) {
		t.Fatalf("error response must not contain success payload: %s", rr.Body.String())
	}
}

func TestHomeContextsHiddenCountContract(t *testing.T) {
	s, _ := newTestStore(t)
	tpl := template.Must(template.New("test").Parse(`{{.Mode}}|{{.CurrentContextTitle}}|{{.HiddenCount}}`))
	app := &App{store: s, tpl: tpl}

	req := httptest.NewRequest(http.MethodGet, "/?canvas=contexts&ctx=main-orbit", nil)
	rr := httptest.NewRecorder()
	app.home(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if got := rr.Body.String(); got != "contexts|Your Contexts|0" {
		t.Fatalf("unexpected contexts render payload: %q", got)
	}
}

func TestHomeUnknownContextReturns500WithoutPanic(t *testing.T) {
	app, _ := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/?ctx=context-does-not-exist", nil)
	rr := httptest.NewRecorder()
	app.home(rr, req)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "focus|") {
		t.Fatalf("error path must not render focus template payload: %s", rr.Body.String())
	}
}

func TestPruneBackupsKeepOnePrunesToSingleNewest(t *testing.T) {
	dir := t.TempDir()
	prefix := filepath.Join(dir, "orbit.db")
	for _, name := range []string{
		"orbit.db.20260101-000001.bak",
		"orbit.db.20260101-000002.bak",
		"orbit.db.20260101-000003.bak",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write backup %s: %v", name, err)
		}
	}

	if err := pruneBackups(prefix, 1); err != nil {
		t.Fatalf("prune keep=1: %v", err)
	}
	remaining, err := filepath.Glob(prefix + ".*.bak")
	if err != nil {
		t.Fatalf("glob remaining: %v", err)
	}
	if len(remaining) != 1 {
		t.Fatalf("expected one backup remaining, got %d (%v)", len(remaining), remaining)
	}
	if !strings.Contains(remaining[0], "000003") {
		t.Fatalf("expected newest backup to remain, got %v", remaining)
	}
}

func TestPruneBackupsReturnsErrorsForBadPatternAndRemoveFailure(t *testing.T) {
	t.Run("bad glob pattern returns error", func(t *testing.T) {
		dir := t.TempDir()
		badPrefix := filepath.Join(dir, "[bad")
		if err := pruneBackups(badPrefix, 1); err == nil {
			t.Fatal("expected bad pattern error from pruneBackups")
		}
	})

	t.Run("remove failure returns error", func(t *testing.T) {
		dir := t.TempDir()
		prefix := filepath.Join(dir, "orbit.db")
		staleDir := prefix + ".20260101-000001.bak"
		if err := os.MkdirAll(staleDir, 0o755); err != nil {
			t.Fatalf("mkdir stale dir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(staleDir, "nested"), []byte("x"), 0o644); err != nil {
			t.Fatalf("write nested file: %v", err)
		}
		if err := os.WriteFile(prefix+".20260101-000002.bak", []byte("x"), 0o644); err != nil {
			t.Fatalf("write backup file: %v", err)
		}
		if err := os.WriteFile(prefix+".20260101-000003.bak", []byte("x"), 0o644); err != nil {
			t.Fatalf("write backup file: %v", err)
		}
		if err := pruneBackups(prefix, 1); err == nil {
			t.Fatal("expected pruneBackups to return remove error for non-empty directory")
		}
	})
}

func TestMigrateLegacyDataInitFlagGuardAndMissingFirstEntryHandling(t *testing.T) {
	root := t.TempDir()

	t.Run("target with init flag should skip migration", func(t *testing.T) {
		withWorkingDir(t, root, func() {
			legacyDir := filepath.Join(root, "data")
			targetDir := filepath.Join(root, "target-init-skip")
			if err := os.RemoveAll(legacyDir); err != nil {
				t.Fatalf("remove legacy: %v", err)
			}
			if err := os.MkdirAll(legacyDir, 0o755); err != nil {
				t.Fatalf("mkdir legacy: %v", err)
			}
			if err := os.MkdirAll(targetDir, 0o755); err != nil {
				t.Fatalf("mkdir target: %v", err)
			}
			if err := os.WriteFile(filepath.Join(legacyDir, "orbit.db"), []byte("legacy-db"), 0o644); err != nil {
				t.Fatalf("write legacy orbit.db: %v", err)
			}
			if err := os.WriteFile(filepath.Join(targetDir, ".orbit_initialized"), []byte("init"), 0o644); err != nil {
				t.Fatalf("write target init flag: %v", err)
			}
			if err := migrateLegacyData(targetDir); err != nil {
				t.Fatalf("migrateLegacyData: %v", err)
			}
			if _, err := os.Stat(filepath.Join(targetDir, "orbit.db")); !os.IsNotExist(err) {
				t.Fatalf("target orbit.db should not be copied when init flag exists, stat err=%v", err)
			}
		})
	})

	t.Run("missing first entry should not block later entry copies", func(t *testing.T) {
		withWorkingDir(t, root, func() {
			legacyDir := filepath.Join(root, "data")
			targetDir := filepath.Join(root, "target-missing-first")
			if err := os.RemoveAll(legacyDir); err != nil {
				t.Fatalf("remove legacy: %v", err)
			}
			if err := os.MkdirAll(legacyDir, 0o755); err != nil {
				t.Fatalf("mkdir legacy: %v", err)
			}
			if err := os.MkdirAll(targetDir, 0o755); err != nil {
				t.Fatalf("mkdir target: %v", err)
			}
			// No orbit.db present, but later list entries are present.
			if err := os.WriteFile(filepath.Join(legacyDir, ".orbit_initialized"), []byte("init"), 0o644); err != nil {
				t.Fatalf("write legacy init flag: %v", err)
			}
			if err := migrateLegacyData(targetDir); err != nil {
				t.Fatalf("migrateLegacyData: %v", err)
			}
			if _, err := os.Stat(filepath.Join(targetDir, ".orbit_initialized")); err != nil {
				t.Fatalf("expected .orbit_initialized to be copied even if first entry is missing: %v", err)
			}
		})
	})
}

func TestMigrateLegacyDataCopyFailuresAndLogging(t *testing.T) {
	root := t.TempDir()

	t.Run("copy failure returns error", func(t *testing.T) {
		withWorkingDir(t, root, func() {
			legacyDir := filepath.Join(root, "data")
			targetDir := filepath.Join(root, "target-copy-fail")
			if err := os.RemoveAll(legacyDir); err != nil {
				t.Fatalf("remove legacy: %v", err)
			}
			if err := os.MkdirAll(legacyDir, 0o755); err != nil {
				t.Fatalf("mkdir legacy: %v", err)
			}
			if err := os.MkdirAll(targetDir, 0o755); err != nil {
				t.Fatalf("mkdir target: %v", err)
			}
			if err := os.WriteFile(filepath.Join(legacyDir, "items.legacy.json"), []byte("[]"), 0o644); err != nil {
				t.Fatalf("write legacy items.legacy.json: %v", err)
			}
			if err := os.MkdirAll(filepath.Join(targetDir, "items.legacy.json"), 0o755); err != nil {
				t.Fatalf("mkdir conflicting target items.legacy.json path: %v", err)
			}
			if err := migrateLegacyData(targetDir); err == nil {
				t.Fatal("expected migrateLegacyData to return copy error")
			}
		})
	})

	t.Run("successful copy writes migration log", func(t *testing.T) {
		withWorkingDir(t, root, func() {
			legacyDir := filepath.Join(root, "data")
			targetDir := filepath.Join(root, "target-log-check")
			if err := os.RemoveAll(legacyDir); err != nil {
				t.Fatalf("remove legacy: %v", err)
			}
			if err := os.MkdirAll(legacyDir, 0o755); err != nil {
				t.Fatalf("mkdir legacy: %v", err)
			}
			if err := os.MkdirAll(targetDir, 0o755); err != nil {
				t.Fatalf("mkdir target: %v", err)
			}
			if err := os.WriteFile(filepath.Join(legacyDir, "orbit.db"), []byte("db"), 0o644); err != nil {
				t.Fatalf("write legacy orbit.db: %v", err)
			}

			if err := migrateLegacyData(targetDir); err != nil {
				t.Fatalf("migrateLegacyData: %v", err)
			}
			if _, err := os.Stat(filepath.Join(targetDir, "orbit.db")); err != nil {
				t.Fatalf("expected orbit.db to copy during migration: %v", err)
			}
		})
	})
}

func TestOrbitDataDirUsesOverrideAndCreatesDirectory(t *testing.T) {
	override := filepath.Join(t.TempDir(), "orbit data")
	t.Setenv("ORBIT_DATA_DIR", override)

	got, err := orbitDataDir()
	if err != nil {
		t.Fatalf("orbitDataDir: %v", err)
	}
	if got != override {
		t.Fatalf("unexpected data dir: got %q want %q", got, override)
	}
	if fi, err := os.Stat(override); err != nil {
		t.Fatalf("expected override dir to exist: %v", err)
	} else if !fi.IsDir() {
		t.Fatalf("expected override path to be a directory")
	}
}

func TestOrbitDataDirUsesDefaultConfigPathWhenOverrideUnset(t *testing.T) {
	home := t.TempDir()
	t.Setenv("ORBIT_DATA_DIR", "")
	t.Setenv("HOME", home)

	got, err := orbitDataDir()
	if err != nil {
		t.Fatalf("orbitDataDir: %v", err)
	}

	want := ""
	if runtime.GOOS == "darwin" {
		want = filepath.Join(home, "Library", "Application Support", "Orbit")
	} else {
		configDir, err := os.UserConfigDir()
		if err != nil {
			t.Fatalf("UserConfigDir: %v", err)
		}
		want = filepath.Join(configDir, "Orbit")
	}
	if got != want {
		t.Fatalf("unexpected data dir: got %q want %q", got, want)
	}
	if fi, err := os.Stat(want); err != nil {
		t.Fatalf("expected default dir to exist: %v", err)
	} else if !fi.IsDir() {
		t.Fatalf("expected default path to be a directory")
	}
}

func TestBackupDBCreatesVersionedAndLatestCopies(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	source := []byte("orbit-db-backup-test")
	if err := os.WriteFile(dbPath, source, 0o644); err != nil {
		t.Fatalf("write source db: %v", err)
	}

	if err := backupDB(dbPath); err != nil {
		t.Fatalf("backupDB: %v", err)
	}

	latest := filepath.Join(dir, "backups", "orbit.db.bak")
	if !fileExists(latest) {
		t.Fatalf("expected latest backup to exist at %s", latest)
	}
	latestBytes, err := os.ReadFile(latest)
	if err != nil {
		t.Fatalf("read latest backup: %v", err)
	}
	if !bytes.Equal(latestBytes, source) {
		t.Fatalf("latest backup contents do not match source")
	}

	versioned, err := filepath.Glob(filepath.Join(dir, "backups", "orbit.db.*.bak"))
	if err != nil {
		t.Fatalf("glob versioned backups: %v", err)
	}
	if len(versioned) != 1 {
		t.Fatalf("expected exactly one versioned backup, got %d (%v)", len(versioned), versioned)
	}
	versionedBytes, err := os.ReadFile(versioned[0])
	if err != nil {
		t.Fatalf("read versioned backup: %v", err)
	}
	if !bytes.Equal(versionedBytes, source) {
		t.Fatalf("versioned backup contents do not match source")
	}
}

func TestNewHandlerBootstrapsAndServesHome(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("ORBIT_DATA_DIR", dataDir)

	handler, err := NewHandler()
	if err != nil {
		t.Fatalf("NewHandler: %v", err)
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	if !fileExists(filepath.Join(dataDir, "orbit.db")) {
		t.Fatalf("expected handler bootstrap to create orbit.db in %s", dataDir)
	}
}

func TestNewHandlerPreservesExistingDataOnStartup(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("ORBIT_DATA_DIR", dataDir)

	dbPath := filepath.Join(dataDir, "orbit.db")
	s, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("seed newStore: %v", err)
	}
	if err := s.update(Item{
		ID:        "t_update_item_1",
		ContextID: "main-orbit",
		Title:     "Persist through update",
		SubNote:   "keep me",
		X:         420,
		Y:         260,
		Color:     "var(--c2)",
	}); err != nil {
		t.Fatalf("seed update-retention item: %v", err)
	}
	if err := s.db.Close(); err != nil {
		t.Fatalf("close seeded store: %v", err)
	}

	handler, err := NewHandler()
	if err != nil {
		t.Fatalf("NewHandler: %v", err)
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 from startup handler, got %d: %s", rr.Code, rr.Body.String())
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite after startup: %v", err)
	}
	defer func() { _ = db.Close() }()

	var title, subNote string
	var x, y float64
	if err := db.QueryRow(`SELECT title,sub_note,x,y FROM items WHERE id=?`, "t_update_item_1").Scan(&title, &subNote, &x, &y); err != nil {
		t.Fatalf("query retained item: %v", err)
	}
	if title != "Persist through update" || subNote != "keep me" || x != 420 || y != 260 {
		t.Fatalf("unexpected retained row: title=%q subNote=%q x=%v y=%v", title, subNote, x, y)
	}

	if !fileExists(filepath.Join(dataDir, "backups", "orbit.db.bak")) {
		t.Fatalf("expected startup backup to exist in %s", dataDir)
	}
}

func TestOrbitDataDirRejectsNonDirectoryOverride(t *testing.T) {
	root := t.TempDir()
	override := filepath.Join(root, "orbit-data")
	if err := os.WriteFile(override, []byte("not-a-directory"), 0o644); err != nil {
		t.Fatalf("write override file: %v", err)
	}
	t.Setenv("ORBIT_DATA_DIR", override)

	if _, err := orbitDataDir(); err == nil {
		t.Fatal("expected orbitDataDir to fail when override path is a file")
	}
}

func TestBackupDBReturnsErrorWhenBackupDirCannotBeCreated(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "orbit.db")
	if err := os.WriteFile(dbPath, []byte("db"), 0o644); err != nil {
		t.Fatalf("write db: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("file blocking backup dir"), 0o644); err != nil {
		t.Fatalf("write blocking backups file: %v", err)
	}

	if err := backupDB(dbPath); err == nil {
		t.Fatal("expected backupDB to fail when backups path is not a directory")
	}
}

func TestListenOrbitPrefers8080AndFallsBackWhenBusy(t *testing.T) {
	t.Setenv("PORT", "")

	occupied, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		t.Skipf("8080 unavailable for test setup: %v", err)
	}
	defer func() { _ = occupied.Close() }()

	ln, baseURL, err := listenOrbit()
	if err != nil {
		t.Fatalf("listenOrbit: %v", err)
	}
	defer func() { _ = ln.Close() }()

	if strings.HasSuffix(baseURL, ":8080") {
		t.Fatalf("expected fallback away from busy 8080, got %s", baseURL)
	}
}

func TestOpenConfiguredDBAppliesForeignKeyPragma(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "orbit.db")
	db, err := openConfiguredDB(dbPath)
	if err != nil {
		t.Fatalf("openConfiguredDB: %v", err)
	}
	defer func() { _ = db.Close() }()

	var foreignKeys int
	if err := db.QueryRow(`PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil {
		t.Fatalf("query foreign_keys pragma: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("expected foreign_keys pragma to be enabled, got %d", foreignKeys)
	}
}
