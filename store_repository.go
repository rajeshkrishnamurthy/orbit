package orbit

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

func (s *Store) importJSON(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read json import file %q: %w", path, err)
	}
	if len(b) == 0 {
		return nil
	}
	var items []Item
	if err := json.Unmarshal(b, &items); err != nil {
		return fmt.Errorf("decode json import file %q: %w", path, err)
	}
	for _, it := range items {
		if it.UpdatedAt.IsZero() {
			it.UpdatedAt = time.Now()
		}
		if err := s.update(it); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) seedDefaults() error {
	for _, it := range seedItems() {
		if err := s.update(it); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) update(item Item) error {
	now := time.Now()
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = now
	}
	createdAt := now.Format(time.RFC3339Nano)
	scanErr := s.db.QueryRow(`SELECT created_at FROM items WHERE id = ?`, item.ID).Scan(&createdAt)
	if scanErr != nil && !errors.Is(scanErr, sql.ErrNoRows) {
		return fmt.Errorf("load item created_at %q: %w", item.ID, scanErr)
	}
	_, err := s.db.Exec(`
INSERT INTO items(id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,created_at,updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title,
  sub_note=excluded.sub_note,
  x=excluded.x,
  y=excluded.y,
  color=excluded.color,
  slipping=excluded.slipping,
  completed=excluded.completed,
  updated_at=excluded.updated_at;
`, item.ID, contextOrDefault(item.ContextID), item.Title, item.SubNote, item.X, item.Y, item.Color, 0, boolToInt(item.Slipping), boolToInt(item.Completed), createdAt, now.Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("upsert item %q: %w", item.ID, err)
	}
	return nil
}

func (s *Store) delete(id string) error {
	result, err := s.db.Exec(`DELETE FROM items WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete item %q: %w", id, err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("delete item %q", id), writeTargetNotFoundError("delete", id, "")); err != nil {
		return err
	}
	return nil
}

func (s *Store) setCompleted(id string, completed bool) error {
	result, err := s.db.Exec(`UPDATE items SET completed=?, updated_at=? WHERE id=?`, boolToInt(completed), time.Now().Format(time.RFC3339Nano), id)
	if err != nil {
		return fmt.Errorf("set item %q completed=%t: %w", id, completed, err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("set item %q completed=%t", id, completed), writeTargetNotFoundError("set completed", id, "")); err != nil {
		return err
	}
	return nil
}
func (s *Store) hide(id, contextID string) error {
	result, err := s.db.Exec(`UPDATE items SET hidden=1, updated_at=? WHERE id = ? AND context_id = ?`, time.Now().Format(time.RFC3339Nano), id, contextOrDefault(contextID))
	if err != nil {
		return fmt.Errorf("hide item %q in context %q: %w", id, contextOrDefault(contextID), err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("hide item %q in context %q", id, contextOrDefault(contextID)), writeTargetNotFoundError("hide", id, contextID)); err != nil {
		return err
	}
	return nil
}

func (s *Store) hiddenCount(contextID string) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1 AND context_id=?`, contextOrDefault(contextID)).Scan(&n)
	if err != nil {
		return n, fmt.Errorf("count hidden items in context %q: %w", contextOrDefault(contextID), err)
	}
	return n, nil
}

func (s *Store) hiddenItems(contextID string) ([]Item, error) {
	rows, queryErr := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,created_at,updated_at FROM items WHERE hidden=1 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if queryErr != nil {
		return nil, fmt.Errorf("query hidden items for context %q: %w", contextOrDefault(contextID), queryErr)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	createdByID := map[string]string{}
	for rows.Next() {
		var it Item
		var created string
		var updated string
		if scanErr := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &created, &updated); scanErr != nil {
			return nil, fmt.Errorf("scan hidden item row for context %q: %w", contextOrDefault(contextID), scanErr)
		}
		createdDay, parseErr := parseCreatedLocalDay(it.ID, created)
		if parseErr != nil {
			return nil, parseErr
		}
		createdByID[it.ID] = createdDay
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate hidden items for context %q: %w", contextOrDefault(contextID), rowsErr)
	}
	ids := make([]string, 0, len(out))
	for i := range out {
		ids = append(ids, out[i].ID)
	}
	summaries, summaryErr := s.touchSummaries(ids)
	if summaryErr != nil {
		return nil, summaryErr
	}
	for i := range out {
		out[i].InCenter = classifyDesktopBand(out[i].X, out[i].Y)
		deriveTouchState(&out[i], createdByID[out[i].ID], summaries[out[i].ID])
	}
	return out, nil
}

func (s *Store) unhideAt(id, contextID string, x, y float64) error {
	result, err := s.db.Exec(`UPDATE items SET hidden=0, x=?, y=?, updated_at=? WHERE id=? AND context_id=?`, x, y, time.Now().Format(time.RFC3339Nano), id, contextOrDefault(contextID))
	if err != nil {
		return fmt.Errorf("unhide item %q in context %q: %w", id, contextOrDefault(contextID), err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("unhide item %q in context %q", id, contextOrDefault(contextID)), writeTargetNotFoundError("unhide", id, contextID)); err != nil {
		return err
	}
	return nil
}

func (s *Store) revealAllHidden(contextID string) ([]Item, error) {
	rows, queryErr := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,created_at,updated_at FROM items WHERE hidden=1 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if queryErr != nil {
		return nil, fmt.Errorf("query hidden items to reveal for context %q: %w", contextOrDefault(contextID), queryErr)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	createdByID := map[string]string{}
	for rows.Next() {
		var it Item
		var created string
		var updated string
		if scanErr := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &created, &updated); scanErr != nil {
			return nil, fmt.Errorf("scan reveal-all row for context %q: %w", contextOrDefault(contextID), scanErr)
		}
		createdDay, parseErr := parseCreatedLocalDay(it.ID, created)
		if parseErr != nil {
			return nil, parseErr
		}
		createdByID[it.ID] = createdDay
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		it.Hidden = false
		out = append(out, it)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("iterate reveal-all rows for context %q: %w", contextOrDefault(contextID), rowsErr)
	}
	ids := make([]string, 0, len(out))
	for i := range out {
		ids = append(ids, out[i].ID)
	}
	summaries, summaryErr := s.touchSummaries(ids)
	if summaryErr != nil {
		return nil, summaryErr
	}
	for i := range out {
		deriveTouchState(&out[i], createdByID[out[i].ID], summaries[out[i].ID])
	}
	now := time.Now().Format(time.RFC3339Nano)
	if _, updateErr := s.db.Exec(`UPDATE items SET hidden=0, updated_at=? WHERE hidden=1 AND context_id=?`, now, contextOrDefault(contextID)); updateErr != nil {
		return nil, fmt.Errorf("mark all hidden items revealed in context %q: %w", contextOrDefault(contextID), updateErr)
	}
	return out, nil
}

func (s *Store) snapshot(contextID string) ([]Item, error) {
	rows, queryErr := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,created_at,updated_at FROM items WHERE hidden=0 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if queryErr != nil {
		return nil, fmt.Errorf("query visible items for context %q: %w", contextOrDefault(contextID), queryErr)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	createdByID := map[string]string{}
	for rows.Next() {
		var it Item
		var created string
		var updated string
		if scanErr := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &created, &updated); scanErr != nil {
			return nil, fmt.Errorf("scan visible item row for context %q: %w", contextOrDefault(contextID), scanErr)
		}
		createdDay, parseErr := parseCreatedLocalDay(it.ID, created)
		if parseErr != nil {
			return nil, parseErr
		}
		createdByID[it.ID] = createdDay
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		out = append(out, it)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return out, fmt.Errorf("iterate visible items for context %q: %w", contextOrDefault(contextID), rowsErr)
	}
	ids := make([]string, 0, len(out))
	for i := range out {
		ids = append(ids, out[i].ID)
	}
	summaries, summaryErr := s.touchSummaries(ids)
	if summaryErr != nil {
		return nil, summaryErr
	}
	for i := range out {
		deriveTouchState(&out[i], createdByID[out[i].ID], summaries[out[i].ID])
	}
	return out, nil
}

func (s *Store) touchItemState(id string) (*Item, error) {
	var it Item
	var updated string
	err := s.db.QueryRow(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,updated_at FROM items WHERE id=?`, id).Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &updated)
	if err != nil {
		return nil, fmt.Errorf("load item %q state: %w", id, err)
	}
	if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
		it.UpdatedAt = t
	}
	it.InCenter = classifyDesktopBand(it.X, it.Y)
	if err := s.applyTouchState(&it); err != nil {
		return nil, err
	}
	return &it, nil
}
func (s *Store) contexts() ([]Context, error) {
	rows, err := s.db.Query(`SELECT id,title,sub_note,x,y,color,updated_at FROM contexts ORDER BY updated_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("query contexts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []Context{}
	for rows.Next() {
		var c Context
		var updated string
		if err := rows.Scan(&c.ID, &c.Title, &c.SubNote, &c.X, &c.Y, &c.Color, &updated); err != nil {
			return nil, fmt.Errorf("scan context row: %w", err)
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			c.UpdatedAt = t
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("iterate contexts: %w", err)
	}
	return out, nil
}

func (s *Store) contextByID(id string) (*Context, error) {
	id = contextOrDefault(id)
	var c Context
	var updated string
	err := s.db.QueryRow(`SELECT id,title,sub_note,x,y,color,updated_at FROM contexts WHERE id=?`, id).Scan(&c.ID, &c.Title, &c.SubNote, &c.X, &c.Y, &c.Color, &updated)
	if err != nil {
		return nil, fmt.Errorf("load context %q: %w", id, err)
	}
	if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
		c.UpdatedAt = t
	}
	return &c, nil
}

func (s *Store) upsertContext(c Context) error {
	now := time.Now().Format(time.RFC3339Nano)
	created := now
	scanErr := s.db.QueryRow(`SELECT created_at FROM contexts WHERE id=?`, c.ID).Scan(&created)
	if scanErr != nil && !errors.Is(scanErr, sql.ErrNoRows) {
		return fmt.Errorf("load context %q created_at: %w", c.ID, scanErr)
	}
	_, err := s.db.Exec(`INSERT INTO contexts(id,title,sub_note,x,y,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,sub_note=excluded.sub_note,x=excluded.x,y=excluded.y,color=excluded.color,updated_at=excluded.updated_at`, c.ID, c.Title, c.SubNote, c.X, c.Y, c.Color, created, now)
	if err != nil {
		return fmt.Errorf("upsert context %q: %w", c.ID, err)
	}
	return nil
}

func (s *Store) deleteContext(id string) error {
	if id == "main-orbit" {
		return errors.New("cannot delete Main Orbit")
	}
	result, err := s.db.Exec(`DELETE FROM contexts WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete context %q: %w", id, err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("delete context %q", id), fmt.Errorf("delete context %q: %w", id, errors.Join(errWriteTargetNotFound, sql.ErrNoRows))); err != nil {
		return err
	}
	return nil
}
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
