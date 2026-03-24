package orbit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
)

type touchSummary struct {
	lastTouchedDay string
	touchCount7d   int
	touchedToday   bool
}

func deriveTouchState(it *Item, createdDay string, summary touchSummary) {
	it.TouchedToday = summary.touchedToday
	it.TouchCount7d = summary.touchCount7d
	it.LastTouchedDay = summary.lastTouchedDay
	if it.Hidden {
		it.Active = false
		it.Stale = false
		return
	}
	activityAnchorDay := createdDay
	if summary.lastTouchedDay > activityAnchorDay {
		activityAnchorDay = summary.lastTouchedDay
	}
	if it.InCenter {
		it.Active = withinLocalDays(activityAnchorDay, 2) || summary.touchCount7d >= 3
	} else {
		it.Active = withinLocalDays(activityAnchorDay, 4) || summary.touchCount7d >= 2
	}
	it.Stale = !it.Active
}

func parseCreatedLocalDay(id, createdAt string) (string, error) {
	created, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return "", fmt.Errorf("parse item %q created_at: %w", id, err)
	}
	return localDayString(created), nil
}

func (s *Store) touchSummariesWithContext(ctx context.Context, ids []string) (map[string]touchSummary, error) {
	summaries := make(map[string]touchSummary, len(ids))
	if len(ids) == 0 {
		return summaries, nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	today := localDayString(time.Now())
	weekStart := localDayOffset(6)
	query := fmt.Sprintf(`
SELECT
	card_id,
	MAX(local_day) AS last_touched_day,
	SUM(CASE WHEN local_day >= ? THEN 1 ELSE 0 END) AS touch_count_7d,
	MAX(CASE WHEN local_day = ? THEN 1 ELSE 0 END) AS touched_today
FROM touch_facts
WHERE card_id IN (%s)
GROUP BY card_id
`, placeholders)
	args := make([]any, 0, len(ids)+2)
	args = append(args, weekStart, today)
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := s.queryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query touch summaries: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var (
			id            string
			lastTouched   sql.NullString
			touchCount7d  int
			touchedTodayI int
		)
		if err := rows.Scan(&id, &lastTouched, &touchCount7d, &touchedTodayI); err != nil {
			return nil, fmt.Errorf("scan touch summary row: %w", err)
		}
		summary := touchSummary{
			touchCount7d: touchCount7d,
			touchedToday: touchedTodayI > 0,
		}
		if lastTouched.Valid {
			summary.lastTouchedDay = lastTouched.String
		}
		summaries[id] = summary
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate touch summaries: %w", err)
	}
	return summaries, nil
}

func (s *Store) createdLocalDayWithContext(ctx context.Context, id string) (string, error) {
	var createdAt string
	if err := s.queryRowContext(ctx, `SELECT created_at FROM items WHERE id = ?`, id).Scan(&createdAt); err != nil {
		return "", fmt.Errorf("load item %q created_at: %w", id, err)
	}
	return parseCreatedLocalDay(id, createdAt)
}

func localDayString(t time.Time) string {
	return t.In(time.Local).Format("2006-01-02")
}

func localDayOffset(days int) string {
	return localDayString(time.Now().AddDate(0, 0, -days))
}

func withinLocalDays(day string, days int) bool {
	if day == "" {
		return false
	}
	return day >= localDayOffset(days)
}

func (s *Store) touchSummary(id string) (touchSummary, error) {
	return s.touchSummaryWithContext(context.Background(), id)
}

func (s *Store) touchSummaryWithContext(ctx context.Context, id string) (touchSummary, error) {
	rows, err := s.queryContext(ctx, `SELECT local_day FROM touch_facts WHERE card_id=? ORDER BY local_day DESC`, id)
	if err != nil {
		return touchSummary{}, fmt.Errorf("query touch facts for %q: %w", id, err)
	}
	defer func() { _ = rows.Close() }()
	out := touchSummary{}
	today := localDayString(time.Now())
	weekStart := localDayOffset(6)
	for rows.Next() {
		var day string
		if err := rows.Scan(&day); err != nil {
			return touchSummary{}, fmt.Errorf("scan touch fact for %q: %w", id, err)
		}
		if out.lastTouchedDay == "" {
			out.lastTouchedDay = day
		}
		if day == today {
			out.touchedToday = true
		}
		if day >= weekStart {
			out.touchCount7d++
		}
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("iterate touch facts for %q: %w", id, err)
	}
	return out, nil
}

func (s *Store) applyTouchStateWithContext(ctx context.Context, it *Item) error {
	summary, err := s.touchSummaryWithContext(ctx, it.ID)
	if err != nil {
		return err
	}
	createdDay, err := s.createdLocalDayWithContext(ctx, it.ID)
	if err != nil {
		return err
	}
	deriveTouchState(it, createdDay, summary)
	return nil
}

func (s *Store) touchCardWithContext(ctx context.Context, id string) (*Item, bool, error) {
	now := time.Now().In(time.Local)
	localDay := now.Format("2006-01-02")
	createdAt := now.Format(time.RFC3339Nano)
	tx, err := s.beginTxContext(ctx, nil)
	if err != nil {
		return nil, false, fmt.Errorf("begin touch tx for item %q: %w", id, err)
	}
	committed := false
	defer func() {
		if committed {
			return
		}
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			log.Printf("touchCard rollback failed: %v", rbErr)
		}
	}()

	var existing int
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay).Scan(&existing)
	if err != nil {
		return nil, false, fmt.Errorf("count touch facts for item %q on %s: %w", id, localDay, err)
	}
	if existing > 0 {
		err = tx.Commit()
		if err != nil {
			return nil, false, fmt.Errorf("commit no-op touch tx for item %q: %w", id, err)
		}
		committed = true
		item, stateErr := s.touchItemStateWithContext(ctx, id)
		if stateErr != nil {
			return nil, false, stateErr
		}
		return item, false, nil
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO touch_facts(card_id,local_day,created_at) VALUES(?,?,?)`, id, localDay, createdAt)
	if err != nil {
		return nil, false, fmt.Errorf("insert touch fact for item %q on %s: %w", id, localDay, err)
	}
	err = tx.Commit()
	if err != nil {
		return nil, false, fmt.Errorf("commit touch tx for item %q: %w", id, err)
	}
	committed = true
	item, err := s.touchItemStateWithContext(ctx, id)
	if err != nil {
		return nil, false, err
	}
	return item, true, nil
}

func (s *Store) undoTouchCardWithContext(ctx context.Context, id string) (*Item, bool, error) {
	now := time.Now().In(time.Local)
	localDay := now.Format("2006-01-02")
	var createdAt string
	err := s.queryRowContext(ctx, `SELECT created_at FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay).Scan(&createdAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			item, stateErr := s.touchItemStateWithContext(ctx, id)
			return item, false, stateErr
		}
		return nil, false, fmt.Errorf("load touch fact for item %q on %s: %w", id, localDay, err)
	}
	created, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return nil, false, fmt.Errorf("parse touch fact timestamp for item %q: %w", id, err)
	}
	if now.Sub(created) > 6*time.Second {
		item, stateErr := s.touchItemStateWithContext(ctx, id)
		return item, false, stateErr
	}
	_, err = s.execContext(ctx, `DELETE FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay)
	if err != nil {
		return nil, false, fmt.Errorf("delete touch fact for item %q on %s: %w", id, localDay, err)
	}
	item, err := s.touchItemStateWithContext(ctx, id)
	if err != nil {
		return nil, false, err
	}
	return item, true, nil
}
