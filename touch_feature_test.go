package orbit

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

type touchCardView struct {
	ID            string `json:"id"`
	Active        bool   `json:"active"`
	Stale         bool   `json:"stale"`
	TouchedToday  bool   `json:"touchedToday"`
	TouchCount7d  int    `json:"touchCount7d"`
	LastTouchedDay string `json:"lastTouchedDay"`
	InCenter      bool   `json:"inCenter"`
	Hidden        bool   `json:"hidden"`
}

func newTouchHomeApp(t *testing.T, s *Store) *App {
	t.Helper()
	tpl := template.Must(template.New("touch-home").Parse(`{{.ItemsJSON}}`))
	return &App{store: s, tpl: tpl}
}

func doJSONRequest(t *testing.T, h http.Handler, method, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if payload != nil {
		var buf bytes.Buffer
		if err := json.NewEncoder(&buf).Encode(payload); err != nil {
			t.Fatalf("encode payload: %v", err)
		}
		body = &buf
	}
	req := httptest.NewRequest(method, path, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func queryTouchFactCount(t *testing.T, db *sql.DB, cardID string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM touch_facts WHERE card_id=?`, cardID).Scan(&n); err != nil {
		t.Fatalf("query touch facts for %s: %v", cardID, err)
	}
	return n
}

func queryTouchFactRow(t *testing.T, db *sql.DB, cardID string) (string, string) {
	t.Helper()
	var localDay, createdAt string
	if err := db.QueryRow(`SELECT local_day, created_at FROM touch_facts WHERE card_id=? ORDER BY created_at DESC LIMIT 1`, cardID).Scan(&localDay, &createdAt); err != nil {
		t.Fatalf("query touch fact row for %s: %v", cardID, err)
	}
	return localDay, createdAt
}

func seedTouchFact(t *testing.T, db *sql.DB, cardID string, day time.Time, createdAt time.Time) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO touch_facts(card_id, local_day, created_at) VALUES(?,?,?)`,
		cardID,
		day.In(time.Local).Format("2006-01-02"),
		createdAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("seed touch fact for %s: %v", cardID, err)
	}
}

func renderTouchCards(t *testing.T, app *App, ctxID string) []touchCardView {
	t.Helper()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/?ctx="+ctxID, nil)
	app.home(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("home render failed: %d %s", rr.Code, rr.Body.String())
	}
	var out []touchCardView
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode home items json: %v (body=%s)", err, rr.Body.String())
	}
	return out
}

func cardViewByID(cards []touchCardView, id string) (touchCardView, bool) {
	for _, c := range cards {
		if c.ID == id {
			return c, true
		}
	}
	return touchCardView{}, false
}

func TestTouchFactsPersistPerLocalDayAndUndoHonorsWindow(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "orbit-data")
	t.Setenv("ORBIT_DATA_DIR", dataDir)

	h, err := newMux()
	if err != nil {
		t.Fatalf("newMux: %v", err)
	}

	cardID := "t_touch_fact_1"
	createRR := doJSONRequest(t, h, http.MethodPost, "/api/items", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"title":     "Touch target",
		"subNote":   "",
		"x":         420,
		"y":         260,
		"color":     "var(--c2)",
	})
	if createRR.Code != http.StatusOK {
		t.Fatalf("create card: %d %s", createRR.Code, createRR.Body.String())
	}

	db, err := sql.Open("sqlite", filepath.Join(dataDir, "orbit.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() { _ = db.Close() }()

	currentLocalDay := time.Now().In(time.Local).Format("2006-01-02")
	if got := queryTouchFactCount(t, db, cardID); got != 0 {
		t.Fatalf("expected no touch facts after create, got %d", got)
	}

	touchRR := doJSONRequest(t, h, http.MethodPost, "/api/items/touch", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
	})
	if touchRR.Code != http.StatusOK {
		t.Fatalf("touch card: %d %s", touchRR.Code, touchRR.Body.String())
	}
	if got := queryTouchFactCount(t, db, cardID); got != 1 {
		t.Fatalf("expected one touch fact after first touch, got %d", got)
	}
	localDay, createdAt := queryTouchFactRow(t, db, cardID)
	if localDay != currentLocalDay {
		t.Fatalf("expected touch fact local_day %q, got %q", currentLocalDay, localDay)
	}
	if createdAt == "" {
		t.Fatal("expected touch fact created_at to be populated")
	}

	againRR := doJSONRequest(t, h, http.MethodPost, "/api/items/touch", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
	})
	if againRR.Code != http.StatusOK {
		t.Fatalf("repeat touch: %d %s", againRR.Code, againRR.Body.String())
	}
	if got := queryTouchFactCount(t, db, cardID); got != 1 {
		t.Fatalf("expected repeat same-day touch to be a no-op, got %d facts", got)
	}

	undoRR := doJSONRequest(t, h, http.MethodPost, "/api/items/touch/undo", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"localDay":  currentLocalDay,
	})
	if undoRR.Code != http.StatusOK {
		t.Fatalf("undo touch in window: %d %s", undoRR.Code, undoRR.Body.String())
	}
	if got := queryTouchFactCount(t, db, cardID); got != 0 {
		t.Fatalf("expected touch fact to be removed by undo, got %d", got)
	}

	touchRR = doJSONRequest(t, h, http.MethodPost, "/api/items/touch", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
	})
	if touchRR.Code != http.StatusOK {
		t.Fatalf("retouch card: %d %s", touchRR.Code, touchRR.Body.String())
	}
	seededDay, seededCreatedAt := queryTouchFactRow(t, db, cardID)
	if seededDay != currentLocalDay {
		t.Fatalf("expected second touch fact local_day %q, got %q", currentLocalDay, seededDay)
	}

	oldCreatedAt := time.Now().Add(-7 * time.Second).UTC().Format(time.RFC3339Nano)
	if _, err := db.Exec(`UPDATE touch_facts SET created_at=? WHERE card_id=? AND local_day=? AND created_at=?`, oldCreatedAt, cardID, seededDay, seededCreatedAt); err != nil {
		t.Fatalf("age touch fact for late undo: %v", err)
	}

	lateUndoRR := doJSONRequest(t, h, http.MethodPost, "/api/items/touch/undo", map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"localDay":  currentLocalDay,
	})
	if got := queryTouchFactCount(t, db, cardID); got != 1 {
		t.Fatalf("late undo must not remove aged touch fact, got %d", got)
	}
	if lateUndoRR.Code == http.StatusInternalServerError {
		t.Fatalf("late undo should fail cleanly, got %d %s", lateUndoRR.Code, lateUndoRR.Body.String())
	}
}

func TestCardMutationsDoNotCreateImplicitTouchFacts(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	cardID := "t_no_implicit_touch"
	createRR := postJSON(t, app.itemsAPI, map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"title":     "Implicit touch guard",
		"subNote":   "",
		"x":         120,
		"y":         140,
		"color":     "var(--c1)",
	})
	if createRR.Code != http.StatusOK {
		t.Fatalf("create card: %d %s", createRR.Code, createRR.Body.String())
	}
	if got := queryTouchFactCount(t, s.db, cardID); got != 0 {
		t.Fatalf("card creation must not create touch facts, got %d", got)
	}

	editRR := postJSON(t, app.itemsAPI, map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"title":     "Implicit touch guard updated",
		"subNote":   "edited",
		"x":         620,
		"y":         380,
		"color":     "var(--c2)",
	})
	if editRR.Code != http.StatusOK {
		t.Fatalf("edit card: %d %s", editRR.Code, editRR.Body.String())
	}
	if got := queryTouchFactCount(t, s.db, cardID); got != 0 {
		t.Fatalf("edit must not create touch facts, got %d", got)
	}

	hideRR := postJSON(t, app.hideItemAPI, map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
	})
	assertJSONResponse(t, hideRR, http.StatusOK)
	if got := queryTouchFactCount(t, s.db, cardID); got != 0 {
		t.Fatalf("hide must not create touch facts, got %d", got)
	}

	unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"x":         660.0,
		"y":         360.0,
	})
	assertJSONResponse(t, unhideRR, http.StatusOK)
	if got := queryTouchFactCount(t, s.db, cardID); got != 0 {
		t.Fatalf("unhide-at must not create touch facts, got %d", got)
	}
}

func TestTouchDerivationUsesPlacementAndRecentTouchContinuity(t *testing.T) {
	s, _ := newTestStore(t)
	app := newTouchHomeApp(t, s)

	today := time.Now().In(time.Local)

	peripheryID := "t_touch_periphery"
	if err := s.update(Item{
		ID:        peripheryID,
		ContextID: "main-orbit",
		Title:     "Periphery touch",
		SubNote:   "",
		X:         1020,
		Y:         560,
		Color:     "var(--c2)",
	}); err != nil {
		t.Fatalf("seed periphery card: %v", err)
	}
	seedTouchFact(t, s.db, peripheryID, today.AddDate(0, 0, -5), today.AddDate(0, 0, -5))
	seedTouchFact(t, s.db, peripheryID, today.AddDate(0, 0, -6), today.AddDate(0, 0, -6))

	centerID := "t_touch_center"
	if err := s.update(Item{
		ID:        centerID,
		ContextID: "main-orbit",
		Title:     "Center touch",
		SubNote:   "",
		X:         620,
		Y:         380,
		Color:     "var(--c3)",
	}); err != nil {
		t.Fatalf("seed center card: %v", err)
	}
	seedTouchFact(t, s.db, centerID, today.AddDate(0, 0, -3), today.AddDate(0, 0, -3))
	seedTouchFact(t, s.db, centerID, today.AddDate(0, 0, -5), today.AddDate(0, 0, -5))
	seedTouchFact(t, s.db, centerID, today.AddDate(0, 0, -6), today.AddDate(0, 0, -6))

	cards := renderTouchCards(t, app, "main-orbit")
	peripheryCard, ok := cardViewByID(cards, peripheryID)
	if !ok {
		t.Fatalf("missing periphery card %q in home payload", peripheryID)
	}
	if !peripheryCard.Active || peripheryCard.Stale {
		t.Fatalf("expected periphery card to be active before move, got %+v", peripheryCard)
	}
	if peripheryCard.TouchCount7d != 2 {
		t.Fatalf("expected periphery 7-day count to be 2, got %+v", peripheryCard)
	}

	centerCard, ok := cardViewByID(cards, centerID)
	if !ok {
		t.Fatalf("missing center card %q in home payload", centerID)
	}
	if !centerCard.Active || centerCard.Stale {
		t.Fatalf("expected center card with 3 touches to be active, got %+v", centerCard)
	}
	if centerCard.TouchCount7d != 3 {
		t.Fatalf("expected center 7-day count to be 3, got %+v", centerCard)
	}

	moveRR := postJSON(t, app.itemsAPI, map[string]any{
		"id":        peripheryID,
		"contextId": "main-orbit",
		"title":     "Periphery touch",
		"subNote":   "",
		"x":         620,
		"y":         380,
		"color":     "var(--c2)",
	})
	if moveRR.Code != http.StatusOK {
		t.Fatalf("move card to center: %d %s", moveRR.Code, moveRR.Body.String())
	}

	cards = renderTouchCards(t, app, "main-orbit")
	peripheryCard, ok = cardViewByID(cards, peripheryID)
	if !ok {
		t.Fatalf("missing moved card %q in home payload", peripheryID)
	}
	if peripheryCard.Active || !peripheryCard.Stale {
		t.Fatalf("expected same touch history to become stale in center, got %+v", peripheryCard)
	}
}

func TestHiddenCardsAreExcludedFromActiveStaleSemantics(t *testing.T) {
	s, _ := newTestStore(t)
	app := newTouchHomeApp(t, s)

	today := time.Now().In(time.Local)
	cardID := "t_hidden_touch"
	if err := s.update(Item{
		ID:        cardID,
		ContextID: "main-orbit",
		Title:     "Hidden touch",
		SubNote:   "",
		X:         1020,
		Y:         560,
		Color:     "var(--c4)",
	}); err != nil {
		t.Fatalf("seed hidden card: %v", err)
	}
	if err := s.hide(cardID, "main-orbit"); err != nil {
		t.Fatalf("hide card: %v", err)
	}
	seedTouchFact(t, s.db, cardID, today, today)

	hiddenRR := postJSON(t, app.hiddenItemsAPI, map[string]any{"contextId": "main-orbit"})
	if hiddenRR.Code != http.StatusOK {
		t.Fatalf("hidden items: %d %s", hiddenRR.Code, hiddenRR.Body.String())
	}
	var hiddenCards []touchCardView
	if err := json.Unmarshal(hiddenRR.Body.Bytes(), &hiddenCards); err != nil {
		t.Fatalf("decode hidden items json: %v (body=%s)", err, hiddenRR.Body.String())
	}
	hiddenCard, ok := cardViewByID(hiddenCards, cardID)
	if !ok {
		t.Fatalf("missing hidden card %q in hidden-items payload", cardID)
	}
	if hiddenCard.Active || hiddenCard.Stale {
		t.Fatalf("hidden cards must not be classified active/stale, got %+v", hiddenCard)
	}
	if !hiddenCard.TouchedToday {
		t.Fatalf("hidden cards should preserve touch history, got %+v", hiddenCard)
	}

	unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{
		"id":        cardID,
		"contextId": "main-orbit",
		"x":         620,
		"y":         380,
	})
	assertJSONResponse(t, unhideRR, http.StatusOK)

	cards := renderTouchCards(t, app, "main-orbit")
	unhidden, ok := cardViewByID(cards, cardID)
	if !ok {
		t.Fatalf("missing unhidden card %q in home payload", cardID)
	}
	if !unhidden.Active || unhidden.Stale {
		t.Fatalf("unhidden card should re-enter active/stale derivation, got %+v", unhidden)
	}
}
