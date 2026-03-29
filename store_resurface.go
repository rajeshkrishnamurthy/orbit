package orbit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func formatWakeAt(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseWakeAt(raw string) (time.Time, error) {
	value := raw
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed, nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}
	return time.Time{}, fmt.Errorf("parse wake_at %q: invalid timestamp", raw)
}

func (s *Store) hideWithContextAndSnooze(ctx context.Context, id, contextID string, snoozeUntil *time.Time) error {
	tx, err := s.beginTxContext(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		rollbackTx(tx)
	}()

	now := time.Now().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `UPDATE items SET hidden=1, updated_at=? WHERE id = ? AND context_id = ?`, now, id, contextOrDefault(contextID))
	if err != nil {
		return fmt.Errorf("hide item %q in context %q: %w", id, contextOrDefault(contextID), err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("hide item %q in context %q", id, contextOrDefault(contextID)), writeTargetNotFoundError("hide", id, contextID)); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM resurfaced_items WHERE item_id = ?`, id); err != nil {
		return fmt.Errorf("clear resurfaced state for item %q: %w", id, err)
	}

	if snoozeUntil != nil {
		wakeAt := formatWakeAt(*snoozeUntil)
		if _, err := tx.ExecContext(ctx, `
INSERT INTO item_snoozes(item_id, wake_at, created_at, updated_at)
VALUES(?, ?, ?, ?)
ON CONFLICT(item_id) DO UPDATE SET wake_at=excluded.wake_at, updated_at=excluded.updated_at
`, id, wakeAt, now, now); err != nil {
			return fmt.Errorf("upsert snooze for item %q: %w", id, err)
		}
	} else {
		if _, err := tx.ExecContext(ctx, `DELETE FROM item_snoozes WHERE item_id = ?`, id); err != nil {
			return fmt.Errorf("clear snooze for item %q: %w", id, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit hide with snooze for item %q: %w", id, err)
	}
	tx = nil
	return nil
}

func rollbackTx(tx *sql.Tx) {
	if tx == nil {
		return
	}
	err := tx.Rollback()
	if err == nil || errors.Is(err, sql.ErrTxDone) {
		return
	}
}

func (s *Store) clearSnoozeAndResurfacedForItemWithContext(ctx context.Context, id string) error {
	if _, err := s.execContext(ctx, `DELETE FROM item_snoozes WHERE item_id = ?`, id); err != nil {
		return fmt.Errorf("clear snooze for item %q: %w", id, err)
	}
	if _, err := s.execContext(ctx, `DELETE FROM resurfaced_items WHERE item_id = ?`, id); err != nil {
		return fmt.Errorf("clear resurfaced state for item %q: %w", id, err)
	}
	return nil
}

func (s *Store) markExpiredSnoozesResurfacedWithContext(ctx context.Context, now time.Time) error {
	tx, err := s.beginTxContext(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		rollbackTx(tx)
	}()

	nowValue := formatWakeAt(now)
	if _, err := tx.ExecContext(ctx, `
INSERT INTO resurfaced_items(item_id, context_id, resurfaced_at)
SELECT i.id, i.context_id, ?
FROM item_snoozes s
JOIN items i ON i.id = s.item_id
WHERE i.hidden = 1
  AND i.completed = 0
  AND s.wake_at <= ?
ON CONFLICT(item_id) DO NOTHING
`, nowValue, nowValue); err != nil {
		return fmt.Errorf("mark expired snoozes as resurfaced: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
DELETE FROM item_snoozes
WHERE item_id IN (
  SELECT id FROM items WHERE hidden = 0 OR completed = 1
)
`); err != nil {
		return fmt.Errorf("prune snoozes for visible/completed items: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
DELETE FROM resurfaced_items
WHERE item_id IN (
  SELECT id FROM items WHERE hidden = 0 OR completed = 1
)
`); err != nil {
		return fmt.Errorf("prune resurfaced items for visible/completed items: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit mark expired snoozes: %w", err)
	}
	tx = nil
	return nil
}

func (s *Store) resurfacedItemsForContextWithContext(ctx context.Context, contextID string) ([]Item, error) {
	rows, queryErr := s.queryContext(ctx, `
SELECT i.id,i.context_id,i.title,i.sub_note,i.x,i.y,i.color,i.hidden,i.slipping,i.completed,i.created_at,i.updated_at
FROM resurfaced_items r
JOIN items i ON i.id = r.item_id
WHERE r.context_id = ? AND i.hidden = 1 AND i.completed = 0
ORDER BY r.resurfaced_at ASC
`, contextOrDefault(contextID))
	if queryErr != nil {
		return nil, fmt.Errorf("query resurfaced items for context %q: %w", contextOrDefault(contextID), queryErr)
	}
	defer rows.Close()

	out := []Item{}
	ids := make([]string, 0, 8)
	for rows.Next() {
		var it Item
		var created, updated string
		if scanErr := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &created, &updated); scanErr != nil {
			return nil, fmt.Errorf("scan resurfaced item row for context %q: %w", contextOrDefault(contextID), scanErr)
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
		ids = append(ids, it.ID)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return out, fmt.Errorf("iterate resurfaced items for context %q: %w", contextOrDefault(contextID), rowsErr)
	}
	summaries, summaryErr := s.touchSummariesWithContext(ctx, ids)
	if summaryErr != nil {
		if !errors.Is(summaryErr, sql.ErrNoRows) {
			return out, summaryErr
		}
	}
	for i := range out {
		if err := s.applyTouchStateWithContext(ctx, &out[i]); err != nil {
			return out, err
		}
		if summary, ok := summaries[out[i].ID]; ok {
			out[i].TouchCount7d = summary.touchCount7d
			out[i].TouchedToday = summary.touchedToday
			out[i].LastTouchedDay = summary.lastTouchedDay
		}
	}
	return out, nil
}
