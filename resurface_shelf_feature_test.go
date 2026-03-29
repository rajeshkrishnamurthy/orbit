package orbit

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func seedFocusItem(t *testing.T, s *Store, id, contextID, title string) {
	t.Helper()
	if err := s.update(Item{
		ID:        id,
		ContextID: contextID,
		Title:     title,
		SubNote:   "",
		X:         240,
		Y:         180,
		Color:     "var(--c1)",
	}); err != nil {
		t.Fatalf("seed item %q: %v", id, err)
	}
}

func hideWithSnooze(t *testing.T, app *App, id, contextID string, snoozeUntil time.Time) {
	t.Helper()
	rr := postJSON(t, app.hideItemAPI, map[string]any{
		"id":          id,
		"contextId":   contextID,
		"snoozeUntil": snoozeUntil.UTC().Format(time.RFC3339Nano),
	})
	assertJSONResponse(t, rr, http.StatusOK)
}

func TestResurfacedItemsRequireSnoozeExpiry(t *testing.T) {
	app, s := newTestApp(t)
	seedFocusItem(t, s, "resurface_not_due", "main-orbit", "Not due")
	hideWithSnooze(t, app, "resurface_not_due", "main-orbit", time.Now().Add(2*time.Hour))

	rr := postJSON(t, app.resurfacedItemsAPI, map[string]any{"contextId": "main-orbit"})
	assertJSONResponse(t, rr, http.StatusOK)
	resp := mustDecodeJSON[struct {
		OK    bool   `json:"ok"`
		Items []Item `json:"items"`
	}](t, rr)
	if !resp.OK {
		t.Fatalf("expected ok=true")
	}
	if len(resp.Items) != 0 {
		t.Fatalf("expected no resurfaced items before expiry, got %d", len(resp.Items))
	}
}

func TestHomeTriggerMarksExpiredGloballyAndShowsContextLocally(t *testing.T) {
	app, s := newTestApp(t)

	if err := s.upsertContext(Context{
		ID:      "ctx-b",
		Title:   "Context B",
		SubNote: "",
		X:       400,
		Y:       240,
		Color:   "var(--c2)",
	}); err != nil {
		t.Fatalf("seed context: %v", err)
	}

	seedFocusItem(t, s, "resurface_main", "main-orbit", "Main overdue")
	seedFocusItem(t, s, "resurface_ctx_b", "ctx-b", "B overdue")

	past := time.Now().Add(-2 * time.Hour)
	hideWithSnooze(t, app, "resurface_main", "main-orbit", past)
	hideWithSnooze(t, app, "resurface_ctx_b", "ctx-b", past)

	homeResp, err := app.appService().Home(context.Background(), HomeRequest{ContextID: "main-orbit"})
	if err != nil {
		t.Fatalf("home response: %v", err)
	}
	if len(homeResp.ResurfacedItems) != 1 || homeResp.ResurfacedItems[0].ID != "resurface_main" {
		t.Fatalf("expected only main-orbit resurfaced item in local home response, got %#v", homeResp.ResurfacedItems)
	}

	var globalEligible int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM resurfaced_items`).Scan(&globalEligible); err != nil {
		t.Fatalf("count resurfaced_items: %v", err)
	}
	if globalEligible != 2 {
		t.Fatalf("expected global evaluation to mark both overdue cards, got %d", globalEligible)
	}
}

func TestResurfacedItemsAreUniqueAcrossRepeatedEvaluations(t *testing.T) {
	app, s := newTestApp(t)
	seedFocusItem(t, s, "resurface_once", "main-orbit", "One card")
	hideWithSnooze(t, app, "resurface_once", "main-orbit", time.Now().Add(-30*time.Minute))

	for i := 0; i < 3; i++ {
		rr := postJSON(t, app.resurfacedItemsAPI, map[string]any{"contextId": "main-orbit"})
		assertJSONResponse(t, rr, http.StatusOK)
		resp := mustDecodeJSON[struct {
			Items []Item `json:"items"`
		}](t, rr)
		if len(resp.Items) != 1 || resp.Items[0].ID != "resurface_once" {
			t.Fatalf("expected exactly one resurfaced cardlet each pass, got %#v", resp.Items)
		}
	}

	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM resurfaced_items WHERE item_id=?`, "resurface_once").Scan(&n); err != nil {
		t.Fatalf("count resurfaced rows: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected one persisted resurfaced row for uniqueness, got %d", n)
	}
}

func TestManualUnhideClearsSnoozeAndResurfacedState(t *testing.T) {
	app, s := newTestApp(t)
	seedFocusItem(t, s, "resurface_unhide_clear", "main-orbit", "Manual unhide")
	hideWithSnooze(t, app, "resurface_unhide_clear", "main-orbit", time.Now().Add(3*time.Hour))

	rr := postJSON(t, app.unhideAtAPI, map[string]any{
		"id":        "resurface_unhide_clear",
		"contextId": "main-orbit",
		"x":         480.0,
		"y":         260.0,
	})
	assertJSONResponse(t, rr, http.StatusOK)

	var snoozeRows int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM item_snoozes WHERE item_id=?`, "resurface_unhide_clear").Scan(&snoozeRows); err != nil {
		t.Fatalf("count snooze rows: %v", err)
	}
	if snoozeRows != 0 {
		t.Fatalf("expected manual unhide to clear snooze, got %d rows", snoozeRows)
	}
	var resurfacedRows int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM resurfaced_items WHERE item_id=?`, "resurface_unhide_clear").Scan(&resurfacedRows); err != nil {
		t.Fatalf("count resurfaced rows: %v", err)
	}
	if resurfacedRows != 0 {
		t.Fatalf("expected manual unhide to clear resurfaced state, got %d rows", resurfacedRows)
	}
}

func TestHideItemAPIRejectsInvalidSnoozeTimestamp(t *testing.T) {
	app, s := newTestApp(t)
	seedFocusItem(t, s, "resurface_bad_snooze", "main-orbit", "Bad snooze")

	rr := postJSON(t, app.hideItemAPI, map[string]any{
		"id":          "resurface_bad_snooze",
		"contextId":   "main-orbit",
		"snoozeUntil": "invalid-ts",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid snooze timestamp, got %d: %s", rr.Code, rr.Body.String())
	}
}
