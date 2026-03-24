package orbit

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"modernc.org/sqlite"
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

func ageItemCreatedAt(t *testing.T, s *Store, cardID string, daysAgo int) {
	t.Helper()
	createdAt := time.Now().AddDate(0, 0, -daysAgo).In(time.Local).Format(time.RFC3339Nano)
	if _, err := s.db.Exec(`UPDATE items SET created_at=? WHERE id=?`, createdAt, cardID); err != nil {
		t.Fatalf("age created_at for %s by %d days: %v", cardID, daysAgo, err)
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

func TestTouchSummaryReturnsMostRecentLocalDay(t *testing.T) {
	s, _ := newTestStore(t)

	if err := s.update(Item{
		ID:        "touch-summary-1",
		ContextID: "main-orbit",
		Title:     "summary",
		X:         1080,
		Y:         320,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	insertTouchFact(t, s, "touch-summary-1", 5, time.Now())
	insertTouchFact(t, s, "touch-summary-1", 2, time.Now())
	insertTouchFact(t, s, "touch-summary-1", 0, time.Now())

	summary, err := s.touchSummary("touch-summary-1")
	if err != nil {
		t.Fatalf("touchSummary: %v", err)
	}
	if summary.lastTouchedDay != localDayOffset(0) {
		t.Fatalf("expected most recent local day %q, got %q", localDayOffset(0), summary.lastTouchedDay)
	}
	if summary.touchCount7d != 3 {
		t.Fatalf("expected 7d count 3, got %d", summary.touchCount7d)
	}
	if !summary.touchedToday {
		t.Fatalf("expected touchedToday to be true: %#v", summary)
	}
}

func TestTouchSummaryReturnsErrorWhenTouchFactQueryFails(t *testing.T) {
	s, _ := newTestStore(t)

	if err := s.db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	if _, err := s.touchSummary("touch-summary-error"); err == nil {
		t.Fatal("expected touchSummary to return an error when the query fails")
	}
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
	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot after create: %v", err)
	}
	view := findTouchView(t, mustCastTouchViews(t, items), "touch-implicit-1")
	if !view.Active || view.Stale || view.TouchedToday || view.TouchCount7d != 0 || view.LastTouchedDay != "" {
		t.Fatalf("new card should be active immediately without touch facts: %#v", view)
	}
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

func TestTouchDerivationUsesCreationAnchorAndTouchContinuity(t *testing.T) {
	s, _ := newTestStore(t)
	assertTouchDerivationCase(t, s, "touch-center-recent", "center recent", 620, 300, "var(--c1)", 0, []int{2}, true, false, 1)
	assertTouchDerivationCase(t, s, "touch-center-stale", "center stale", 620, 300, "var(--c2)", 5, []int{3}, false, true, 1)
	assertTouchDerivationCase(t, s, "touch-periphery-recent", "periphery recent", 1080, 320, "var(--c3)", 0, []int{4}, true, false, 1)
	assertTouchDerivationCase(t, s, "touch-periphery-count", "periphery count", 1080, 320, "var(--c4)", 0, []int{5, 6}, true, false, 2)
}

func TestTouchDerivationPinsThresholdBoundaries(t *testing.T) {
	s, _ := newTestStore(t)

	t.Run("center activates on three touches even when none are recent", func(t *testing.T) {
		assertTouchDerivationCase(t, s, "touch-center-count", "center count", 620, 300, "var(--c5)", 8, []int{3, 4, 5}, true, false, 3)
	})

	t.Run("center excludes day-seven touch from seven-day count", func(t *testing.T) {
		assertTouchDerivationCase(t, s, "touch-center-seven-day-boundary", "center seven day boundary", 620, 300, "var(--c1)", 8, []int{5, 6, 7}, false, true, 2)
	})

	t.Run("periphery stays stale once the four-day window is exceeded", func(t *testing.T) {
		assertTouchDerivationCase(t, s, "touch-periphery-boundary", "periphery boundary", 1080, 320, "var(--c2)", 8, []int{5}, false, true, 1)
	})
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

func TestUndoTouchOnUntouchedExistingItemIsNoOp(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.update(Item{
		ID:        "touch-undo-noop",
		ContextID: "main-orbit",
		Title:     "untouched",
		SubNote:   "",
		X:         1080,
		Y:         320,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	rr := postJSON(t, app.undoTouchItemAPI, map[string]any{"id": "touch-undo-noop"})
	resp := mustDecodeTouchResponse(t, rr)
	if resp.Undone {
		t.Fatalf("expected untouched item undo to be a no-op: %#v", resp)
	}
	if resp.TouchCount7d != 0 || resp.LastTouchedDay != "" || resp.TouchedToday {
		t.Fatalf("untouched item should not gain touch metadata: %#v", resp)
	}
	if got := touchFactCount(t, s, "touch-undo-noop"); got != 0 {
		t.Fatalf("untouched item undo should not create touch facts, got %d", got)
	}
}

func TestHiddenTouchCardsPreserveLastTouchedDayThroughUnhide(t *testing.T) {
	s, _ := newTestStore(t)
	app := &App{store: s}

	if err := s.update(Item{
		ID:        "touch-hidden-preserve",
		ContextID: "main-orbit",
		Title:     "hidden preserve",
		X:         1080,
		Y:         320,
		Color:     "var(--c2)",
	}); err != nil {
		t.Fatalf("seed hidden item: %v", err)
	}
	insertTouchFact(t, s, "touch-hidden-preserve", 2, time.Now())
	insertTouchFact(t, s, "touch-hidden-preserve", 0, time.Now())

	hideRR := postJSON(t, app.hideItemAPI, map[string]any{"id": "touch-hidden-preserve", "contextId": "main-orbit"})
	assertJSONResponse(t, hideRR, http.StatusOK)

	hiddenRR := postJSON(t, app.hiddenItemsAPI, map[string]any{"contextId": "main-orbit"})
	assertJSONResponse(t, hiddenRR, http.StatusOK)
	var hiddenPayload struct {
		Items []touchCardView `json:"items"`
	}
	if err := json.Unmarshal(hiddenRR.Body.Bytes(), &hiddenPayload); err != nil {
		t.Fatalf("decode hidden items: %v", err)
	}
	hiddenView := findTouchView(t, hiddenPayload.Items, "touch-hidden-preserve")
	if hiddenView.LastTouchedDay != localDayOffset(0) {
		t.Fatalf("hidden item lost lastTouchedDay: %#v", hiddenView)
	}
	if hiddenView.TouchCount7d != 2 {
		t.Fatalf("hidden item lost touchCount7d: %#v", hiddenView)
	}

	unhideRR := postJSON(t, app.unhideAtAPI, map[string]any{"id": "touch-hidden-preserve", "contextId": "main-orbit", "x": 1080.0, "y": 320.0})
	assertJSONResponse(t, unhideRR, http.StatusOK)

	items, err := s.snapshot("main-orbit")
	if err != nil {
		t.Fatalf("snapshot after unhide: %v", err)
	}
	view := findTouchView(t, mustCastTouchViews(t, items), "touch-hidden-preserve")
	if view.LastTouchedDay != localDayOffset(0) {
		t.Fatalf("unhidden item lost lastTouchedDay: %#v", view)
	}
	if view.TouchCount7d != 2 {
		t.Fatalf("unhidden item lost touchCount7d: %#v", view)
	}
}

func TestListReadersUseSetBasedTouchDerivationWithoutConnectionFanout(t *testing.T) {
	t.Run("snapshot", func(t *testing.T) {
		s := newOwnedTestStore(t)
		s.db.SetMaxOpenConns(1)
		s.db.SetMaxIdleConns(1)
		seedTouchListReadFixture(t, s)

		items, err := mustCompleteListReadWithin(t, s, "snapshot", 300*time.Millisecond, func() ([]Item, error) {
			return s.snapshot("main-orbit")
		})
		if err != nil {
			t.Fatalf("snapshot: %v", err)
		}
		assertTouchView(t, items, touchCardView{
			ID:             "touch-list-visible-active",
			Active:         true,
			Stale:          false,
			TouchedToday:   true,
			TouchCount7d:   3,
			LastTouchedDay: localDayOffset(0),
			Hidden:         false,
		})
		assertTouchView(t, items, touchCardView{
			ID:             "touch-list-visible-stale",
			Active:         false,
			Stale:          true,
			TouchedToday:   false,
			TouchCount7d:   0,
			LastTouchedDay: localDayOffset(7),
			Hidden:         false,
		})
	})

	t.Run("hidden items", func(t *testing.T) {
		s := newOwnedTestStore(t)
		s.db.SetMaxOpenConns(1)
		s.db.SetMaxIdleConns(1)
		seedTouchListReadFixture(t, s)

		items, err := mustCompleteListReadWithin(t, s, "hiddenItems", 300*time.Millisecond, func() ([]Item, error) {
			return s.hiddenItems("main-orbit")
		})
		if err != nil {
			t.Fatalf("hiddenItems: %v", err)
		}
		assertTouchView(t, items, touchCardView{
			ID:             "touch-list-hidden",
			Active:         false,
			Stale:          false,
			TouchedToday:   true,
			TouchCount7d:   2,
			LastTouchedDay: localDayOffset(0),
			Hidden:         true,
		})
	})

	t.Run("reveal all hidden", func(t *testing.T) {
		s := newOwnedTestStore(t)
		s.db.SetMaxOpenConns(1)
		s.db.SetMaxIdleConns(1)
		seedTouchListReadFixture(t, s)

		items, err := mustCompleteListReadWithin(t, s, "revealAllHidden", 300*time.Millisecond, func() ([]Item, error) {
			return s.revealAllHidden("main-orbit")
		})
		if err != nil {
			t.Fatalf("revealAllHidden: %v", err)
		}
		assertTouchView(t, items, touchCardView{
			ID:             "touch-list-hidden",
			Active:         true,
			Stale:          false,
			TouchedToday:   true,
			TouchCount7d:   2,
			LastTouchedDay: localDayOffset(0),
			Hidden:         false,
		})
	})
}

func TestListReadersUseDeterministicConstantQueryBudgets(t *testing.T) {
	// These budgets intentionally encode the set-based contract:
	// one base list query + one aggregate touch summary query (+ one reveal update).
	const (
		smallCardinality = 1
		largeCardinality = 16
	)
	t.Run("snapshot", func(t *testing.T) {
		small := measureListReadQueryBudget(t, "snapshot", smallCardinality)
		large := measureListReadQueryBudget(t, "snapshot", largeCardinality)
		assertConstantBudget(t, "snapshot", small, large, sqlBudget{queries: 2, execs: 0})
	})
	t.Run("hidden items", func(t *testing.T) {
		small := measureListReadQueryBudget(t, "hiddenItems", smallCardinality)
		large := measureListReadQueryBudget(t, "hiddenItems", largeCardinality)
		assertConstantBudget(t, "hiddenItems", small, large, sqlBudget{queries: 2, execs: 0})
	})
	t.Run("reveal all hidden", func(t *testing.T) {
		small := measureListReadQueryBudget(t, "revealAllHidden", smallCardinality)
		large := measureListReadQueryBudget(t, "revealAllHidden", largeCardinality)
		assertConstantBudget(t, "revealAllHidden", small, large, sqlBudget{queries: 2, execs: 1})
	})
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

func assertTouchDerivationCase(t *testing.T, s *Store, id, title string, x, y float64, color string, createdDaysAgo int, days []int, wantActive, wantStale bool, wantCount int) {
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
	ageItemCreatedAt(t, s, id, createdDaysAgo)
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

func newOwnedTestStore(t *testing.T) *Store {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "orbit.db")
	s, err := newStore(dbPath)
	if err != nil {
		t.Fatalf("newStore: %v", err)
	}
	t.Cleanup(func() {
		_ = s.db.Close()
	})
	return s
}

func seedTouchListReadFixture(t *testing.T, s *Store) {
	t.Helper()
	now := time.Now()
	if err := s.update(Item{
		ID:        "touch-list-visible-active",
		ContextID: "main-orbit",
		Title:     "visible active",
		X:         620,
		Y:         300,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed visible active: %v", err)
	}
	ageItemCreatedAt(t, s, "touch-list-visible-active", 8)
	insertTouchFact(t, s, "touch-list-visible-active", 0, now)
	insertTouchFact(t, s, "touch-list-visible-active", 1, now)
	insertTouchFact(t, s, "touch-list-visible-active", 2, now)

	if err := s.update(Item{
		ID:        "touch-list-visible-stale",
		ContextID: "main-orbit",
		Title:     "visible stale",
		X:         1080,
		Y:         320,
		Color:     "var(--c2)",
	}); err != nil {
		t.Fatalf("seed visible stale: %v", err)
	}
	ageItemCreatedAt(t, s, "touch-list-visible-stale", 8)
	insertTouchFact(t, s, "touch-list-visible-stale", 7, now)

	if err := s.update(Item{
		ID:        "touch-list-hidden",
		ContextID: "main-orbit",
		Title:     "hidden",
		X:         620,
		Y:         300,
		Color:     "var(--c3)",
	}); err != nil {
		t.Fatalf("seed hidden: %v", err)
	}
	if err := s.hide("touch-list-hidden", "main-orbit"); err != nil {
		t.Fatalf("hide seeded hidden card: %v", err)
	}
	ageItemCreatedAt(t, s, "touch-list-hidden", 8)
	insertTouchFact(t, s, "touch-list-hidden", 0, now)
	insertTouchFact(t, s, "touch-list-hidden", 1, now)
}

func assertTouchView(t *testing.T, items []Item, want touchCardView) {
	t.Helper()
	got := findTouchView(t, mustCastTouchViews(t, items), want.ID)
	if got.Active != want.Active || got.Stale != want.Stale || got.TouchedToday != want.TouchedToday ||
		got.TouchCount7d != want.TouchCount7d || got.LastTouchedDay != want.LastTouchedDay || got.Hidden != want.Hidden {
		t.Fatalf("unexpected touch view for %s: got=%#v want=%#v", want.ID, got, want)
	}
}

func mustCompleteListReadWithin(t *testing.T, s *Store, label string, timeout time.Duration, fn func() ([]Item, error)) ([]Item, error) {
	t.Helper()
	type result struct {
		items []Item
		err   error
	}
	done := make(chan result, 1)
	go func() {
		items, err := fn()
		done <- result{items: items, err: err}
	}()

	select {
	case res := <-done:
		return res.items, res.err
	case <-time.After(timeout):
		s.db.SetMaxOpenConns(4)
		s.db.SetMaxIdleConns(4)
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
		t.Fatalf("%s did not finish within %s with max_open_conns=1; likely per-item nested DB reads in list derivation", label, timeout)
		return nil, nil
	}
}

type sqlBudget struct {
	queries int64
	execs   int64
}

func (b sqlBudget) String() string {
	return fmt.Sprintf("{queries=%d execs=%d}", b.queries, b.execs)
}

func assertConstantBudget(t *testing.T, label string, small, large, want sqlBudget) {
	t.Helper()
	if small != large {
		t.Fatalf("%s query budget scaled with cardinality: small=%s large=%s", label, small.String(), large.String())
	}
	if small != want {
		t.Fatalf("%s query budget mismatch: got=%s want=%s", label, small.String(), want.String())
	}
}

func measureListReadQueryBudget(t *testing.T, path string, itemCount int) sqlBudget {
	t.Helper()
	s, counter := newCountedTestStore(t)
	switch path {
	case "snapshot":
		seedQueryBudgetFixture(t, s, itemCount, false)
		counter.reset()
		if _, err := s.snapshot("main-orbit"); err != nil {
			t.Fatalf("snapshot: %v", err)
		}
	case "hiddenItems":
		seedQueryBudgetFixture(t, s, itemCount, true)
		counter.reset()
		if _, err := s.hiddenItems("main-orbit"); err != nil {
			t.Fatalf("hiddenItems: %v", err)
		}
	case "revealAllHidden":
		seedQueryBudgetFixture(t, s, itemCount, true)
		counter.reset()
		if _, err := s.revealAllHidden("main-orbit"); err != nil {
			t.Fatalf("revealAllHidden: %v", err)
		}
	default:
		t.Fatalf("unsupported path %q", path)
	}
	return counter.snapshot()
}

func seedQueryBudgetFixture(t *testing.T, s *Store, itemCount int, hidden bool) {
	t.Helper()
	now := time.Now()
	for i := 0; i < itemCount; i++ {
		id := fmt.Sprintf("touch-query-budget-%t-%d", hidden, i)
		x := 1080.0
		if i%2 == 0 {
			x = 620.0
		}
		if err := s.update(Item{
			ID:        id,
			ContextID: "main-orbit",
			Title:     id,
			X:         x,
			Y:         320,
			Color:     "var(--c1)",
		}); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
		ageItemCreatedAt(t, s, id, 8)
		insertTouchFact(t, s, id, i%5, now)
		if hidden {
			if err := s.hide(id, "main-orbit"); err != nil {
				t.Fatalf("hide seeded %s: %v", id, err)
			}
		}
	}
}

type countedSQLDriver struct {
	base    driver.Driver
	counter *sqlCounter
}

func (d *countedSQLDriver) Open(name string) (driver.Conn, error) {
	conn, err := d.base.Open(name)
	if err != nil {
		return nil, fmt.Errorf("open counted connection %q: %w", name, err)
	}
	return &countedConn{Conn: conn, counter: d.counter}, nil
}

type countedConn struct {
	driver.Conn
	counter *sqlCounter
}

func (c *countedConn) Prepare(query string) (driver.Stmt, error) {
	stmt, err := c.Conn.Prepare(query)
	if err != nil {
		return nil, fmt.Errorf("prepare counted statement: %w", err)
	}
	return &countedStmt{Stmt: stmt, counter: c.counter}, nil
}

func (c *countedConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	if prepCtx, ok := c.Conn.(driver.ConnPrepareContext); ok {
		stmt, err := prepCtx.PrepareContext(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("prepare counted statement with context: %w", err)
		}
		return &countedStmt{Stmt: stmt, counter: c.counter}, nil
	}
	return c.Prepare(query)
}

func (c *countedConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if beginTx, ok := c.Conn.(driver.ConnBeginTx); ok {
		tx, err := beginTx.BeginTx(ctx, opts)
		if err != nil {
			return nil, fmt.Errorf("begin counted transaction: %w", err)
		}
		return tx, nil
	}
	return nil, fmt.Errorf("counted connection does not implement ConnBeginTx")
}

func (c *countedConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	queryCtx, ok := c.Conn.(driver.QueryerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	c.counter.incQuery()
	rows, err := queryCtx.QueryContext(ctx, query, args)
	if err != nil {
		return nil, fmt.Errorf("query counted context statement: %w", err)
	}
	return rows, nil
}

func (c *countedConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	execCtx, ok := c.Conn.(driver.ExecerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	c.counter.incExec()
	result, err := execCtx.ExecContext(ctx, query, args)
	if err != nil {
		return nil, fmt.Errorf("exec counted context statement: %w", err)
	}
	return result, nil
}

type countedStmt struct {
	driver.Stmt
	counter *sqlCounter
}

type countedStmtExecer interface {
	Exec(args []driver.Value) (driver.Result, error)
}

type countedStmtQueryer interface {
	Query(args []driver.Value) (driver.Rows, error)
}

func (s *countedStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.counter.incExec()
	stmtExecer, ok := s.Stmt.(countedStmtExecer)
	if !ok {
		return nil, driver.ErrSkip
	}
	result, err := stmtExecer.Exec(args)
	if err != nil {
		return nil, fmt.Errorf("exec counted stmt: %w", err)
	}
	return result, nil
}

func (s *countedStmt) Query(args []driver.Value) (driver.Rows, error) {
	s.counter.incQuery()
	stmtQueryer, ok := s.Stmt.(countedStmtQueryer)
	if !ok {
		return nil, driver.ErrSkip
	}
	rows, err := stmtQueryer.Query(args)
	if err != nil {
		return nil, fmt.Errorf("query counted stmt: %w", err)
	}
	return rows, nil
}

func (s *countedStmt) ExecContext(ctx context.Context, args []driver.NamedValue) (driver.Result, error) {
	stmtExecCtx, ok := s.Stmt.(driver.StmtExecContext)
	if ok {
		s.counter.incExec()
		result, err := stmtExecCtx.ExecContext(ctx, args)
		if err != nil {
			return nil, fmt.Errorf("exec counted stmt with context: %w", err)
		}
		return result, nil
	}
	return nil, driver.ErrSkip
}

func (s *countedStmt) QueryContext(ctx context.Context, args []driver.NamedValue) (driver.Rows, error) {
	stmtQueryCtx, ok := s.Stmt.(driver.StmtQueryContext)
	if ok {
		s.counter.incQuery()
		rows, err := stmtQueryCtx.QueryContext(ctx, args)
		if err != nil {
			return nil, fmt.Errorf("query counted stmt with context: %w", err)
		}
		return rows, nil
	}
	return nil, driver.ErrSkip
}

type sqlCounter struct {
	queries atomic.Int64
	execs   atomic.Int64
}

func (c *sqlCounter) incQuery() {
	c.queries.Add(1)
}

func (c *sqlCounter) incExec() {
	c.execs.Add(1)
}

func (c *sqlCounter) reset() {
	c.queries.Store(0)
	c.execs.Store(0)
}

func (c *sqlCounter) snapshot() sqlBudget {
	return sqlBudget{
		queries: c.queries.Load(),
		execs:   c.execs.Load(),
	}
}

var countedDriverID atomic.Int64

func newCountedTestStore(t *testing.T) (*Store, *sqlCounter) {
	t.Helper()
	driverName := fmt.Sprintf("sqlite-counted-%d", countedDriverID.Add(1))
	counter := &sqlCounter{}
	sql.Register(driverName, &countedSQLDriver{base: &sqlite.Driver{}, counter: counter})
	dbPath := filepath.Join(t.TempDir(), "orbit.db")
	db, err := sql.Open(driverName, dbPath)
	if err != nil {
		t.Fatalf("open counted sqlite database: %v", err)
	}
	for _, pragma := range []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = FULL`,
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA foreign_keys = ON`,
	} {
		if _, err := db.Exec(pragma); err != nil {
			t.Fatalf("set sqlite pragma %q: %v", pragma, err)
		}
	}
	s := &Store{db: db}
	if err := s.ensureSchema(); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	if err := s.ensureDefaultContext(); err != nil {
		t.Fatalf("ensure default context: %v", err)
	}
	if err := s.ensureItemsContext(); err != nil {
		t.Fatalf("ensure items context: %v", err)
	}
	t.Cleanup(func() {
		_ = s.db.Close()
	})
	return s, counter
}
