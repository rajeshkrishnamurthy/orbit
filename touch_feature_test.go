package orbit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type touchCardView struct {
	ID             string `json:"id"`
	Active         bool   `json:"active"`
	Stale          bool   `json:"stale"`
	TouchedToday   bool   `json:"touchedToday"`
	TouchCount7d   int    `json:"touchCount7d"`
	LastTouchedDay string `json:"lastTouchedDay"`
	InCenter       bool   `json:"inCenter"`
	Hidden         bool   `json:"hidden"`
}

type touchActionResponse struct {
	Ok             bool   `json:"ok"`
	Touched        bool   `json:"touched"`
	Undone         bool   `json:"undone"`
	ID             string `json:"id"`
	Active         bool   `json:"active"`
	Stale          bool   `json:"stale"`
	TouchedToday   bool   `json:"touchedToday"`
	TouchCount7d   int    `json:"touchCount7d"`
	LastTouchedDay string `json:"lastTouchedDay"`
	InCenter       bool   `json:"inCenter"`
}

func insertTouchFact(t *testing.T, s *Store, cardID string, dayOffset int, createdAt time.Time) {
	t.Helper()
	day := localDayOffset(dayOffset)
	if _, err := s.db.Exec(`INSERT INTO touch_facts(card_id,local_day,created_at) VALUES(?,?,?)`, cardID, day, createdAt.In(time.Local).Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert touch fact for %s @ %s: %v", cardID, day, err)
	}
}

func touchFactCount(t *testing.T, s *Store, cardID string) int {
	t.Helper()
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM touch_facts WHERE card_id=?`, cardID).Scan(&count); err != nil {
		t.Fatalf("count touch facts for %s: %v", cardID, err)
	}
	return count
}

func findTouchView(t *testing.T, items []touchCardView, cardID string) touchCardView {
	t.Helper()
	for _, item := range items {
		if item.ID == cardID {
			return item
		}
	}
	t.Fatalf("card %s not found in view: %#v", cardID, items)
	return touchCardView{}
}

func mustDecodeTouchResponse(t *testing.T, rr *httptest.ResponseRecorder) touchActionResponse {
	t.Helper()
	assertJSONResponse(t, rr, http.StatusOK)
	var out touchActionResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode touch response: %v", err)
	}
	return out
}

func TestTouchFactsPersistPerLocalDayAndUndoHonorsWindow(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	assertTouchCreateAndRepeatNoop(t, s, app, "touch-persist-1", "touch me", 1100, 320, "var(--c1)")
	assertTouchUndoWithinWindow(t, s, app, "touch-persist-2", "undo me", 840, 360, "var(--c2)")
	assertTouchLateUndoNoop(t, s, app, "touch-persist-3", "late undo", 900, 380, "var(--c3)")
}

func TestCardMutationsDoNotCreateImplicitTouchFacts(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	rr := postJSON(t, app.itemsAPI, map[string]any{
		"id":        "touch-implicit-1",
		"contextId": "main-orbit",
		"title":     "created",
		"subNote":   "no touch fact",
		"x":         420.0,
		"y":         360.0,
		"color":     "var(--c4)",
	})
	assertJSONResponse(t, rr, http.StatusOK)
	if got := touchFactCount(t, s, "touch-implicit-1"); got != 0 {
		t.Fatalf("card creation created touch facts unexpectedly: %d", got)
	}

	rr = postJSON(t, app.itemsAPI, map[string]any{
		"id":        "touch-implicit-1",
		"contextId": "main-orbit",
		"title":     "edited",
		"subNote":   "still no touch fact",
		"x":         860.0,
		"y":         390.0,
		"color":     "var(--c5)",
	})
	assertJSONResponse(t, rr, http.StatusOK)
	if got := touchFactCount(t, s, "touch-implicit-1"); got != 0 {
		t.Fatalf("edit created touch facts unexpectedly: %d", got)
	}

	hideRR := postJSON(t, app.hideItemAPI, map[string]any{"id": "touch-implicit-1", "contextId": "main-orbit"})
	assertJSONResponse(t, hideRR, http.StatusOK)
	if got := touchFactCount(t, s, "touch-implicit-1"); got != 0 {
		t.Fatalf("hide created touch facts unexpectedly: %d", got)
	}

	unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{"id": "touch-implicit-1", "contextId": "main-orbit", "x": 620.0, "y": 280.0})
	assertJSONResponse(t, unhideRR, http.StatusOK)
	if got := touchFactCount(t, s, "touch-implicit-1"); got != 0 {
		t.Fatalf("unhide created touch facts unexpectedly: %d", got)
	}
}

func TestTouchDerivationUsesPlacementAndRecentTouchContinuity(t *testing.T) {
	s, _ := newTestStore(t)
	assertTouchDerivationCase(t, s, "touch-center-recent", "center recent", 620, 300, "var(--c1)", []int{2}, true, false, 1)
	assertTouchDerivationCase(t, s, "touch-center-stale", "center stale", 620, 300, "var(--c2)", []int{3}, false, true, 1)
	assertTouchDerivationCase(t, s, "touch-periphery-recent", "periphery recent", 1080, 320, "var(--c3)", []int{4}, true, false, 1)
	assertTouchDerivationCase(t, s, "touch-periphery-count", "periphery count", 1080, 320, "var(--c4)", []int{5, 6}, true, false, 2)
}

func TestHiddenCardsAreExcludedFromActiveStaleSemantics(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.update(Item{
		ID:        "touch-hidden-1",
		ContextID: "main-orbit",
		Title:     "hidden touch",
		X:         1080,
		Y:         320,
		Color:     "var(--c5)",
	}); err != nil {
		t.Fatalf("seed hidden item: %v", err)
	}
	insertTouchFact(t, s, "touch-hidden-1", 0, time.Now())
	insertTouchFact(t, s, "touch-hidden-1", 1, time.Now())
	insertTouchFact(t, s, "touch-hidden-1", 2, time.Now())

	if rr := postJSON(t, app.hideItemAPI, map[string]any{"id": "touch-hidden-1", "contextId": "main-orbit"}); rr.Code != http.StatusOK {
		t.Fatalf("hide item: %d %s", rr.Code, rr.Body.String())
	}

	hiddenRR := postJSON(t, app.hiddenItemsAPI, map[string]any{"contextId": "main-orbit"})
	assertJSONResponse(t, hiddenRR, http.StatusOK)
	var hiddenPayload struct {
		Items []touchCardView `json:"items"`
	}
	if err := json.Unmarshal(hiddenRR.Body.Bytes(), &hiddenPayload); err != nil {
		t.Fatalf("decode hidden items: %v", err)
	}
	hiddenView := findTouchView(t, hiddenPayload.Items, "touch-hidden-1")
	if !hiddenView.Hidden || hiddenView.Active || hiddenView.Stale {
		t.Fatalf("hidden item should not be classified active/stale: %#v", hiddenView)
	}
	if hiddenView.TouchCount7d != 3 || !hiddenView.TouchedToday {
		t.Fatalf("hidden item should preserve touch history: %#v", hiddenView)
	}

	unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{"id": "touch-hidden-1", "contextId": "main-orbit", "x": 1080.0, "y": 320.0})
	assertJSONResponse(t, unhideRR, http.StatusOK)
	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot after unhide: %v", err)
	}
	view := findTouchView(t, mustCastTouchViews(t, items), "touch-hidden-1")
	if !view.Active || view.Stale {
		t.Fatalf("unhidden item should re-enter active/stale semantics using preserved touches: %#v", view)
	}
}

func mustCastTouchViews(t *testing.T, items []Item) []touchCardView {
	t.Helper()
	b, err := json.Marshal(items)
	if err != nil {
		t.Fatalf("marshal items: %v", err)
	}
	var out []touchCardView
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal items as touch views: %v", err)
	}
	return out
}

func assertTouchCreateAndRepeatNoop(t *testing.T, s *Store, app *App, id, title string, x, y float64, color string) {
	t.Helper()
	if err := s.update(Item{
		ID:        id,
		ContextID: "main-orbit",
		Title:     title,
		SubNote:   "",
		X:         x,
		Y:         y,
		Color:     color,
	}); err != nil {
		t.Fatalf("seed item %s: %v", id, err)
	}

	first := mustDecodeTouchResponse(t, postJSON(t, app.touchItemAPI, map[string]any{"id": id}))
	if !first.Touched || !first.TouchedToday || first.TouchCount7d != 1 {
		t.Fatalf("unexpected first touch response: %#v", first)
	}
	if got := touchFactCount(t, s, id); got != 1 {
		t.Fatalf("expected one touch fact after touch, got %d", got)
	}

	repeat := mustDecodeTouchResponse(t, postJSON(t, app.touchItemAPI, map[string]any{"id": id}))
	if repeat.Touched {
		t.Fatalf("repeated same-day touch should be no-op: %#v", repeat)
	}
	if got := touchFactCount(t, s, id); got != 1 {
		t.Fatalf("expected same-day repeat to keep one fact, got %d", got)
	}
}

func assertTouchUndoWithinWindow(t *testing.T, s *Store, app *App, id, title string, x, y float64, color string) {
	t.Helper()
	if err := s.update(Item{
		ID:        id,
		ContextID: "main-orbit",
		Title:     title,
		SubNote:   "",
		X:         x,
		Y:         y,
		Color:     color,
	}); err != nil {
		t.Fatalf("seed item %s: %v", id, err)
	}
	first := mustDecodeTouchResponse(t, postJSON(t, app.touchItemAPI, map[string]any{"id": id}))
	if !first.Touched {
		t.Fatalf("expected %s touch to create a fact: %#v", id, first)
	}
	undo := mustDecodeTouchResponse(t, postJSON(t, app.undoTouchItemAPI, map[string]any{"id": id}))
	if !undo.Undone {
		t.Fatalf("expected undo within window to remove touch fact: %#v", undo)
	}
	if got := touchFactCount(t, s, id); got != 0 {
		t.Fatalf("expected undo to remove touch fact, got %d", got)
	}
}

func assertTouchLateUndoNoop(t *testing.T, s *Store, app *App, id, title string, x, y float64, color string) {
	t.Helper()
	if err := s.update(Item{
		ID:        id,
		ContextID: "main-orbit",
		Title:     title,
		SubNote:   "",
		X:         x,
		Y:         y,
		Color:     color,
	}); err != nil {
		t.Fatalf("seed item %s: %v", id, err)
	}
	first := mustDecodeTouchResponse(t, postJSON(t, app.touchItemAPI, map[string]any{"id": id}))
	if !first.Touched {
		t.Fatalf("expected %s touch to create a fact: %#v", id, first)
	}
	var createdAt string
	if err := s.db.QueryRow(`SELECT created_at FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDayString(time.Now())).Scan(&createdAt); err != nil {
		t.Fatalf("read created_at: %v", err)
	}
	aged, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		t.Fatalf("parse created_at: %v", err)
	}
	if _, err := s.db.Exec(`UPDATE touch_facts SET created_at=? WHERE card_id=? AND local_day=?`, aged.Add(-7*time.Second).In(time.Local).Format(time.RFC3339Nano), id, localDayString(time.Now())); err != nil {
		t.Fatalf("age touch fact: %v", err)
	}
	undo := mustDecodeTouchResponse(t, postJSON(t, app.undoTouchItemAPI, map[string]any{"id": id}))
	if undo.Undone {
		t.Fatalf("late undo should be a clean no-op: %#v", undo)
	}
	if got := touchFactCount(t, s, id); got != 1 {
		t.Fatalf("late undo should not delete the fact, got %d", got)
	}
}

func assertTouchDerivationCase(t *testing.T, s *Store, id, title string, x, y float64, color string, days []int, wantActive, wantStale bool, wantCount int) {
	t.Helper()
	if err := s.update(Item{
		ID:        id,
		ContextID: "main-orbit",
		Title:     title,
		X:         x,
		Y:         y,
		Color:     color,
	}); err != nil {
		t.Fatalf("seed %s: %v", id, err)
	}
	for _, day := range days {
		insertTouchFact(t, s, id, day, time.Now())
	}
	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot %s: %v", id, err)
	}
	view := findTouchView(t, mustCastTouchViews(t, items), id)
	if view.Active != wantActive || view.Stale != wantStale || view.TouchCount7d != wantCount {
		t.Fatalf("unexpected derived touch state: %#v", view)
	}
}
