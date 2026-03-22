package orbit

import (
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite" // Registers the SQLite driver with database/sql.
)

//go:embed templates/*.html static/*
var embeddedAssets embed.FS

type Item struct {
	ID             string    `json:"id"`
	ContextID      string    `json:"contextId,omitempty"`
	Title          string    `json:"title"`
	SubNote        string    `json:"subNote"`
	X              float64   `json:"x"`
	Y              float64   `json:"y"`
	Color          string    `json:"color"`
	Hidden         bool      `json:"hidden,omitempty"`
	Slipping       bool      `json:"slipping,omitempty"`
	Completed      bool      `json:"completed,omitempty"`
	InCenter       bool      `json:"inCenter,omitempty"`
	Active         bool      `json:"active"`
	Stale          bool      `json:"stale"`
	TouchedToday   bool      `json:"touchedToday"`
	TouchCount7d   int       `json:"touchCount7d"`
	LastTouchedDay string    `json:"lastTouchedDay"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type Context struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	SubNote   string    `json:"subNote"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Color     string    `json:"color"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

var errWriteTargetNotFound = errors.New("write target not found")

func writeTargetNotFoundError(action, id, contextID string) error {
	if contextID == "" {
		return fmt.Errorf("%s item %q: %w", action, id, errors.Join(errWriteTargetNotFound, sql.ErrNoRows))
	}
	return fmt.Errorf("%s item %q in context %q: %w", action, id, contextOrDefault(contextID), errors.Join(errWriteTargetNotFound, sql.ErrNoRows))
}

func requireRowsAffected(result sql.Result, operation string, onZero error) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s rows affected: %w", operation, err)
	}
	if rowsAffected == 0 {
		return onZero
	}
	return nil
}

func newStore(dbPath string) (*Store, error) {
	hadDB, initializedFlag, err := prepareStorePath(dbPath)
	if err != nil {
		return nil, fmt.Errorf("prepare store path: %w", err)
	}

	db, err := openConfiguredDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open configured db: %w", err)
	}

	s := &Store{db: db}
	err = s.ensureSchema()
	if err != nil {
		return nil, fmt.Errorf("ensure schema: %w", err)
	}

	count, err := s.countItems()
	if err != nil {
		return nil, fmt.Errorf("count items: %w", err)
	}

	if err := s.ensureDefaultContext(); err != nil {
		return nil, fmt.Errorf("ensure default context: %w", err)
	}
	if err := s.ensureItemsContext(); err != nil {
		return nil, fmt.Errorf("ensure items context: %w", err)
	}

	if err := s.seedIfNeeded(count, hadDB, initializedFlag); err != nil {
		return nil, fmt.Errorf("seed if needed: %w", err)
	}

	if err := os.WriteFile(initializedFlag, []byte(time.Now().Format(time.RFC3339)), 0o644); err != nil {
		return nil, fmt.Errorf("write initialized flag: %w", err)
	}

	return s, nil
}

func prepareStorePath(dbPath string) (bool, string, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, "", fmt.Errorf("create store directory: %w", err)
	}

	hadDB := fileExists(dbPath)
	initializedFlag := filepath.Join(dir, ".orbit_initialized")
	legacyJSON := filepath.Join(dir, "items.json")

	// Split-brain guard: runtime must not use active JSON alongside SQLite.
	if fileExists(legacyJSON) {
		return false, "", errors.New("legacy data/items.json detected; archive it (e.g. items.legacy.json) before running to avoid split-brain")
	}
	if hadDB {
		if err := backupDB(dbPath); err != nil {
			return false, "", fmt.Errorf("backup db: %w", err)
		}
		return true, initializedFlag, nil
	}
	if fileExists(initializedFlag) {
		return false, "", errors.New("orbit.db missing after initialization; refusing to reseed and risk state loss")
	}
	return false, initializedFlag, nil
}

func openConfiguredDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	for _, pragma := range []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = FULL`,
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA foreign_keys = ON`,
	} {
		if _, err := db.Exec(pragma); err != nil {
			return nil, fmt.Errorf("set sqlite pragma %q: %w", pragma, err)
		}
	}
	return db, nil
}

func (s *Store) seedIfNeeded(count int, hadDB bool, initializedFlag string) error {
	if count != 0 {
		return nil
	}
	if hadDB || fileExists(initializedFlag) {
		return errors.New("sqlite is empty in an initialized environment; refusing silent reset")
	}
	if err := s.ensureInitialContexts(); err != nil {
		return err
	}
	return s.seedDefaults()
}

func (s *Store) ensureSchema() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sub_note TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS touch_facts (
  card_id TEXT NOT NULL,
  local_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(card_id, local_day),
  FOREIGN KEY(card_id) REFERENCES items(id) ON DELETE CASCADE
);`)
	if err != nil {
		return fmt.Errorf("create schema tables: %w", err)
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN context_id TEXT NOT NULL DEFAULT 'main-orbit'`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return fmt.Errorf("add items.context_id column: %w", err)
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return fmt.Errorf("add items.hidden column: %w", err)
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN slipping INTEGER NOT NULL DEFAULT 0`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return fmt.Errorf("add items.slipping column: %w", err)
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return fmt.Errorf("add items.completed column: %w", err)
	}
	return nil
}

func (s *Store) countItems() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM items`).Scan(&n)
	if err != nil {
		return n, fmt.Errorf("count items query: %w", err)
	}
	return n, nil
}

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

type touchSummary struct {
	lastTouchedDay string
	touchCount7d   int
	touchedToday   bool
}

func (s *Store) createdLocalDay(id string) (string, error) {
	var createdAt string
	if err := s.db.QueryRow(`SELECT created_at FROM items WHERE id = ?`, id).Scan(&createdAt); err != nil {
		return "", fmt.Errorf("load item %q created_at: %w", id, err)
	}
	created, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return "", fmt.Errorf("parse item %q created_at: %w", id, err)
	}
	return localDayString(created), nil
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
	rows, err := s.db.Query(`SELECT local_day FROM touch_facts WHERE card_id=? ORDER BY local_day DESC`, id)
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

func (s *Store) applyTouchState(it *Item) error {
	summary, err := s.touchSummary(it.ID)
	if err != nil {
		return err
	}
	createdDay, err := s.createdLocalDay(it.ID)
	if err != nil {
		return err
	}
	it.TouchedToday = summary.touchedToday
	it.TouchCount7d = summary.touchCount7d
	it.LastTouchedDay = summary.lastTouchedDay
	if it.Hidden {
		it.Active = false
		it.Stale = false
		return nil
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
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,updated_at FROM items WHERE hidden=1 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, fmt.Errorf("query hidden items for context %q: %w", contextOrDefault(contextID), err)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &updated); err != nil {
			return nil, fmt.Errorf("scan hidden item row for context %q: %w", contextOrDefault(contextID), err)
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hidden items for context %q: %w", contextOrDefault(contextID), err)
	}
	for i := range out {
		out[i].InCenter = classifyDesktopBand(out[i].X, out[i].Y)
		if err := s.applyTouchState(&out[i]); err != nil {
			return nil, err
		}
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
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,updated_at FROM items WHERE hidden=1 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, fmt.Errorf("query hidden items to reveal for context %q: %w", contextOrDefault(contextID), err)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &updated); err != nil {
			return nil, fmt.Errorf("scan reveal-all row for context %q: %w", contextOrDefault(contextID), err)
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		it.Hidden = false
		if err := s.applyTouchState(&it); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reveal-all rows for context %q: %w", contextOrDefault(contextID), err)
	}
	now := time.Now().Format(time.RFC3339Nano)
	if _, err := s.db.Exec(`UPDATE items SET hidden=0, updated_at=? WHERE hidden=1 AND context_id=?`, now, contextOrDefault(contextID)); err != nil {
		return nil, fmt.Errorf("mark all hidden items revealed in context %q: %w", contextOrDefault(contextID), err)
	}
	return out, nil
}

func (s *Store) snapshot(contextID string) ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,hidden,slipping,completed,updated_at FROM items WHERE hidden=0 AND completed=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, fmt.Errorf("query visible items for context %q: %w", contextOrDefault(contextID), err)
	}
	defer func() { _ = rows.Close() }()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Hidden, &it.Slipping, &it.Completed, &updated); err != nil {
			return nil, fmt.Errorf("scan visible item row for context %q: %w", contextOrDefault(contextID), err)
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		if err := s.applyTouchState(&it); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("iterate visible items for context %q: %w", contextOrDefault(contextID), err)
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

func (s *Store) touchCard(id string) (*Item, bool, error) {
	now := time.Now().In(time.Local)
	localDay := now.Format("2006-01-02")
	createdAt := now.Format(time.RFC3339Nano)
	tx, err := s.db.Begin()
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
	err = tx.QueryRow(`SELECT COUNT(*) FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay).Scan(&existing)
	if err != nil {
		return nil, false, fmt.Errorf("count touch facts for item %q on %s: %w", id, localDay, err)
	}
	if existing > 0 {
		err = tx.Commit()
		if err != nil {
			return nil, false, fmt.Errorf("commit no-op touch tx for item %q: %w", id, err)
		}
		committed = true
		item, stateErr := s.touchItemState(id)
		if stateErr != nil {
			return nil, false, stateErr
		}
		return item, false, nil
	}
	_, err = tx.Exec(`INSERT INTO touch_facts(card_id,local_day,created_at) VALUES(?,?,?)`, id, localDay, createdAt)
	if err != nil {
		return nil, false, fmt.Errorf("insert touch fact for item %q on %s: %w", id, localDay, err)
	}
	err = tx.Commit()
	if err != nil {
		return nil, false, fmt.Errorf("commit touch tx for item %q: %w", id, err)
	}
	committed = true
	item, err := s.touchItemState(id)
	if err != nil {
		return nil, false, err
	}
	return item, true, nil
}

func (s *Store) undoTouchCard(id string) (*Item, bool, error) {
	now := time.Now().In(time.Local)
	localDay := now.Format("2006-01-02")
	var createdAt string
	err := s.db.QueryRow(`SELECT created_at FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay).Scan(&createdAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			item, stateErr := s.touchItemState(id)
			return item, false, stateErr
		}
		return nil, false, fmt.Errorf("load touch fact for item %q on %s: %w", id, localDay, err)
	}
	created, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return nil, false, fmt.Errorf("parse touch fact timestamp for item %q: %w", id, err)
	}
	if now.Sub(created) > 6*time.Second {
		item, stateErr := s.touchItemState(id)
		return item, false, stateErr
	}
	_, err = s.db.Exec(`DELETE FROM touch_facts WHERE card_id=? AND local_day=?`, id, localDay)
	if err != nil {
		return nil, false, fmt.Errorf("delete touch fact for item %q on %s: %w", id, localDay, err)
	}
	item, err := s.touchItemState(id)
	if err != nil {
		return nil, false, err
	}
	return item, true, nil
}

func contextOrDefault(id string) string {
	if id == "" {
		return "main-orbit"
	}
	return id
}

func (s *Store) ensureDefaultContext() error {
	now := time.Now().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO contexts(id,title,sub_note,x,y,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, "main-orbit", "Main Orbit", "", 560.0, 320.0, "var(--c1)", now, now)
	if err != nil {
		return fmt.Errorf("ensure default context row: %w", err)
	}
	return nil
}

func (s *Store) ensureInitialContexts() error {
	now := time.Now().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO contexts(id,title,sub_note,x,y,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, "more-contexts", "Add more contexts", "Each context has its own canvas. Unleash!", 560.0, 500.0, "var(--c2)", now, now)
	if err != nil {
		return fmt.Errorf("ensure initial contexts row: %w", err)
	}
	return nil
}

func (s *Store) ensureItemsContext() error {
	_, err := s.db.Exec(`UPDATE items SET context_id='main-orbit' WHERE context_id IS NULL OR context_id=''`)
	if err != nil {
		return fmt.Errorf("backfill items context_id: %w", err)
	}
	return nil
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

type App struct {
	tpl   *template.Template
	store *Store
}

func seedItems() []Item {
	now := time.Now()
	return []Item{
		{ID: "i1", Title: "A peripheral priority", SubNote: "Important, but not as much as core", X: 760, Y: 280, Color: "var(--c1)", UpdatedAt: now},
		{ID: "i2", Title: "Position signals focus", SubNote: "Move closer to center for higher attention", X: 620, Y: 380, Color: "var(--c2)", UpdatedAt: now},
		{ID: "i3", Title: "Two lenses", SubNote: "Try Center and Periphery next to the colour bar", X: 880, Y: 430, Color: "var(--c3)", UpdatedAt: now},
		{ID: "i4", Title: "Add entire contexts", SubNote: "Try clicking the small icon next to Main Orbit :)", X: 980, Y: 560, Color: "var(--c4)", UpdatedAt: now},
		{ID: "i5", Title: "Drag and move", SubNote: "Move cards in canvas to reflect their current attention level", X: 360, Y: 460, Color: "var(--c5)", UpdatedAt: now},
		{ID: "i6", Title: "Click anywhere to add", SubNote: "Use controls on card to delete, hide or mark for attention", X: 150, Y: 350, Color: "var(--c2)", UpdatedAt: now},
		{ID: "i7", Title: "There's more hidden", SubNote: "Tap around, its fairly intuitive. You will figure it out.", X: 1020, Y: 360, Color: "var(--c3)", UpdatedAt: now},
	}
}

func newMux() (*http.ServeMux, error) {
	tplFS, err := fs.Sub(embeddedAssets, "templates")
	if err != nil {
		return nil, fmt.Errorf("open embedded templates fs: %w", err)
	}
	tpl := template.Must(template.ParseFS(tplFS, "*.html"))

	dataDir, err := orbitDataDir()
	if err != nil {
		return nil, fmt.Errorf("resolve orbit data dir: %w", err)
	}
	err = migrateLegacyData(dataDir)
	if err != nil {
		return nil, fmt.Errorf("migrate legacy data: %w", err)
	}

	store, err := newStore(filepath.Join(dataDir, "orbit.db"))
	if err != nil {
		return nil, fmt.Errorf("create store: %w", err)
	}
	app := &App{tpl: tpl, store: store}

	staticFS, err := fs.Sub(embeddedAssets, "static")
	if err != nil {
		return nil, fmt.Errorf("open embedded static fs: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))
	mux.HandleFunc("/", app.home)
	mux.HandleFunc("/api/items", app.itemsAPI)
	mux.HandleFunc("/api/items/delete", app.deleteItemAPI)
	mux.HandleFunc("/api/items/complete", app.completeItemAPI)
	mux.HandleFunc("/api/items/touch", app.touchItemAPI)
	mux.HandleFunc("/api/items/touch/undo", app.undoTouchItemAPI)
	mux.HandleFunc("/api/items/hide", app.hideItemAPI)
	mux.HandleFunc("/api/items/hidden", app.hiddenItemsAPI)
	mux.HandleFunc("/api/items/unhide-at", app.unhideAtAPI)
	mux.HandleFunc("/api/items/reveal-all", app.revealAllAPI)
	mux.HandleFunc("/api/contexts", app.contextsAPI)
	mux.HandleFunc("/api/contexts/delete", app.deleteContextAPI)
	return mux, nil
}

func NewHandler() (http.Handler, error) {
	return newMux()
}

func RunWeb(autoOpenBrowser bool) error {
	mux, err := newMux()
	if err != nil {
		return fmt.Errorf("build http mux: %w", err)
	}

	listener, baseURL, err := listenOrbit()
	if err != nil {
		return fmt.Errorf("listen orbit: %w", err)
	}
	fmt.Printf("The Orbit running on %s\n", baseURL)
	if autoOpenBrowser {
		go openBrowser(baseURL)
	}
	if err := http.Serve(listener, mux); err != nil {
		return fmt.Errorf("serve orbit http: %w", err)
	}
	return nil
}

func (a *App) home(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	mobileMode := isMobileRequest(r)
	canvas := r.URL.Query().Get("canvas")
	ctxID := contextOrDefault(r.URL.Query().Get("ctx"))
	if canvas == "contexts" {
		contexts, err := a.store.contexts()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		b, err := json.Marshal(contexts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b), "HiddenCount": 0, "Mode": "contexts", "CurrentContextID": ctxID, "CurrentContextTitle": "Your Contexts", "MobileMode": mobileMode}); err != nil {
			log.Printf("render contexts home: %v", err)
		}
		return
	}
	cur, err := a.store.contextByID(ctxID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	items, err := a.store.snapshot(ctxID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, err := a.store.hiddenCount(ctxID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, err := json.Marshal(items)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b), "HiddenCount": hiddenN, "Mode": "focus", "CurrentContextID": cur.ID, "CurrentContextTitle": cur.Title, "MobileMode": mobileMode}); err != nil {
		log.Printf("render focus home: %v", err)
	}
}

func (a *App) itemsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var item Item
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if item.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.update(item); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	state, err := a.store.touchItemState(item.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"id":             state.ID,
		"active":         state.Active,
		"stale":          state.Stale,
		"touchedToday":   state.TouchedToday,
		"touchCount7d":   state.TouchCount7d,
		"lastTouchedDay": state.LastTouchedDay,
		"inCenter":       state.InCenter,
	}); err != nil {
		log.Printf("encode itemsAPI response: %v", err)
	}
}

func (a *App) deleteItemAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.delete(in.ID); err != nil {
		if errors.Is(err, errWriteTargetNotFound) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
		log.Printf("write deleteItemAPI response: %v", err)
	}
}

func (a *App) completeItemAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID        string `json:"id"`
		Completed *bool  `json:"completed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	completed := true
	if in.Completed != nil {
		completed = *in.Completed
	}
	if err := a.store.setCompleted(in.ID, completed); err != nil {
		if errors.Is(err, errWriteTargetNotFound) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
		log.Printf("write completeItemAPI response: %v", err)
	}
}

type touchItemAPIResponse struct {
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

func (a *App) touchItemAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	item, touched, err := a.store.touchCard(in.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(touchItemAPIResponse{
		Ok:             true,
		Touched:        touched,
		ID:             item.ID,
		Active:         item.Active,
		Stale:          item.Stale,
		TouchedToday:   item.TouchedToday,
		TouchCount7d:   item.TouchCount7d,
		LastTouchedDay: item.LastTouchedDay,
		InCenter:       item.InCenter,
	}); err != nil {
		log.Printf("encode touchItemAPI response: %v", err)
	}
}

func (a *App) undoTouchItemAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	item, undone, err := a.store.undoTouchCard(in.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(touchItemAPIResponse{
		Ok:             true,
		Undone:         undone,
		ID:             item.ID,
		Active:         item.Active,
		Stale:          item.Stale,
		TouchedToday:   item.TouchedToday,
		TouchCount7d:   item.TouchCount7d,
		LastTouchedDay: item.LastTouchedDay,
		InCenter:       item.InCenter,
	}); err != nil {
		log.Printf("encode undoTouchItemAPI response: %v", err)
	}
}

func (a *App) hideItemAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID        string `json:"id"`
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.hide(in.ID, in.ContextID); err != nil {
		if errors.Is(err, errWriteTargetNotFound) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, err := a.store.hiddenCount(in.ContextID)
	if err != nil {
		log.Printf("hiddenCount after hide failed: %v", err)
		hiddenN = 0
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(fmt.Sprintf(`{"ok":true,"hiddenCount":%d}`, hiddenN))); err != nil {
		log.Printf("write hideItemAPI response: %v", err)
	}
}

func (a *App) revealAllAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil && !errors.Is(err, io.EOF) {
		log.Printf("decode revealAllAPI request: %v", err)
	}
	items, err := a.store.revealAllHidden(in.ContextID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, err := json.Marshal(map[string]any{"ok": true, "items": items, "hiddenCount": 0})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(b); err != nil {
		log.Printf("write revealAllAPI response: %v", err)
	}
}

func (a *App) hiddenItemsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil && !errors.Is(err, io.EOF) {
		log.Printf("decode hiddenItemsAPI request: %v", err)
	}
	items, err := a.store.hiddenItems(in.ContextID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, err := json.Marshal(map[string]any{"ok": true, "items": items})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(b); err != nil {
		log.Printf("write hiddenItemsAPI response: %v", err)
	}
}

func (a *App) unhideAtAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID        string  `json:"id"`
		ContextID string  `json:"contextId"`
		X         float64 `json:"x"`
		Y         float64 `json:"y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.unhideAt(in.ID, in.ContextID, in.X, in.Y); err != nil {
		if errors.Is(err, errWriteTargetNotFound) {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	item, err := a.store.touchItemState(in.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, err := a.store.hiddenCount(in.ContextID)
	if err != nil {
		log.Printf("hiddenCount after unhide failed: %v", err)
		hiddenN = 0
	}
	w.Header().Set("Content-Type", "application/json")
	b, err := json.Marshal(map[string]any{"ok": true, "hiddenCount": hiddenN, "item": item})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := w.Write(b); err != nil {
		log.Printf("write unhideAtAPI response: %v", err)
	}
}

type contextUpsertInput struct {
	ID      string   `json:"id"`
	Title   *string  `json:"title"`
	SubNote *string  `json:"subNote"`
	X       *float64 `json:"x"`
	Y       *float64 `json:"y"`
	Color   *string  `json:"color"`
}

func decodeContextUpsertInput(r *http.Request) (contextUpsertInput, error) {
	var in contextUpsertInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		return contextUpsertInput{}, fmt.Errorf("decode context upsert input: %w", err)
	}
	return in, nil
}

func buildContextForUpsert(store *Store, in contextUpsertInput) (Context, error) {
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id = fmt.Sprintf("c_%d", time.Now().UnixNano())
	}

	c := Context{
		ID:      id,
		Title:   "Untitled context",
		SubNote: "",
		X:       560.0,
		Y:       320.0,
		Color:   "var(--c1)",
	}

	existing, err := store.contextByID(id)
	if err == nil {
		c = *existing
	} else if !errors.Is(err, sql.ErrNoRows) {
		return Context{}, err
	}

	if in.Title != nil {
		c.Title = strings.TrimSpace(*in.Title)
	}
	if c.Title == "" {
		c.Title = "Untitled context"
	}
	if in.SubNote != nil {
		c.SubNote = *in.SubNote
	}
	if in.X != nil {
		c.X = *in.X
	}
	if in.Y != nil {
		c.Y = *in.Y
	}
	if in.Color != nil {
		c.Color = strings.TrimSpace(*in.Color)
	}
	if c.Color == "" {
		c.Color = "var(--c1)"
	}

	return c, nil
}

func (a *App) contextsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	in, err := decodeContextUpsertInput(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	c, err := buildContextForUpsert(a.store, in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := a.store.upsertContext(c); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"ok":true,"id":"` + c.ID + `"}`)); err != nil {
		log.Printf("write contextsAPI response: %v", err)
	}
}

func (a *App) deleteContextAPI(w http.ResponseWriter, r *http.Request) {
	var id string
	switch r.Method {
	case http.MethodPost:
		var in struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		id = in.ID
	case http.MethodGet:
		id = strings.TrimSpace(r.URL.Query().Get("id"))
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.deleteContext(id); err != nil {
		if errors.Is(err, errWriteTargetNotFound) {
			http.Error(w, "context not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
		log.Printf("write deleteContextAPI response: %v", err)
	}
}

func isMobileRequest(r *http.Request) bool {
	if r.URL.Query().Get("mobile") == "1" {
		return true
	}
	ua := strings.ToLower(r.Header.Get("User-Agent"))
	return strings.Contains(ua, "iphone") || strings.Contains(ua, "android") || strings.Contains(ua, "mobile")
}

func classifyDesktopBand(x, y float64) bool {
	// Desktop source-of-truth classification (matches Orbit desktop geometry baseline)
	const desktopW = 1272.0
	const desktopH = 740.0
	const lensRatio = 0.68
	cx, cy := desktopW/2, desktopH/2
	maxR := min(desktopW, desktopH) * 0.42
	dx, dy := x-cx, y-cy
	d := math.Hypot(dx, dy)
	return d <= (maxR * lensRatio)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func backupDB(path string) error {
	backupDir := filepath.Join(filepath.Dir(path), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return fmt.Errorf("create backup directory %q: %w", backupDir, err)
	}
	base := filepath.Base(path)
	timestamp := time.Now().UTC().Format("20060102-150405")
	versionedBackup := filepath.Join(backupDir, fmt.Sprintf("%s.%s.bak", base, timestamp))
	if err := copyFile(path, versionedBackup); err != nil {
		return err
	}
	// Keep a stable "latest" backup pointer.
	latestBackup := filepath.Join(backupDir, base+".bak")
	if err := copyFile(path, latestBackup); err != nil {
		return err
	}
	return pruneBackups(filepath.Join(backupDir, base), 10)
}

func pruneBackups(path string, keep int) error {
	if keep <= 0 {
		return nil
	}
	entries, err := filepath.Glob(path + ".*.bak")
	if err != nil {
		return fmt.Errorf("glob backup files for %q: %w", path, err)
	}
	if len(entries) <= keep {
		return nil
	}
	sort.Strings(entries)
	for _, stale := range entries[:len(entries)-keep] {
		if rmErr := os.Remove(stale); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			return fmt.Errorf("remove stale backup %q: %w", stale, rmErr)
		}
	}
	return nil
}

func orbitDataDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("ORBIT_DATA_DIR")); override != "" {
		if err := os.MkdirAll(override, 0o755); err != nil {
			return "", fmt.Errorf("create override data dir %q: %w", override, err)
		}
		return override, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}
	dir := filepath.Join(base, "Orbit")
	if runtime.GOOS == "darwin" {
		home, homeErr := os.UserHomeDir()
		if homeErr == nil {
			dir = filepath.Join(home, "Library", "Application Support", "Orbit")
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create orbit data dir %q: %w", dir, err)
	}
	return dir, nil
}

func migrateLegacyData(dataDir string) error {
	legacyDir := filepath.Join("data")
	if !fileExists(legacyDir) || legacyDir == dataDir {
		return nil
	}
	if fileExists(filepath.Join(dataDir, "orbit.db")) || fileExists(filepath.Join(dataDir, ".orbit_initialized")) {
		return nil
	}
	entries := []string{"orbit.db", "orbit.db.bak", ".orbit_initialized", "items.legacy.json"}
	copiedAny := false
	for _, name := range entries {
		src := filepath.Join(legacyDir, name)
		if !fileExists(src) {
			continue
		}
		if err := copyFile(src, filepath.Join(dataDir, name)); err != nil {
			return err
		}
		copiedAny = true
	}
	if copiedAny {
		log.Printf("migrated legacy runtime data from %s to %s", legacyDir, dataDir)
	}
	return nil
}

func copyFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open source file %q: %w", srcPath, err)
	}
	defer func() { _ = src.Close() }()
	err = os.MkdirAll(filepath.Dir(dstPath), 0o755)
	if err != nil {
		return fmt.Errorf("create destination directory for %q: %w", dstPath, err)
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("create destination file %q: %w", dstPath, err)
	}
	defer func() { _ = dst.Close() }()
	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("copy %q to %q: %w", srcPath, dstPath, err)
	}
	if err := dst.Close(); err != nil {
		return fmt.Errorf("close destination file %q: %w", dstPath, err)
	}
	return nil
}

func listenOrbit() (net.Listener, string, error) {
	preferred := strings.TrimSpace(os.Getenv("PORT"))
	if preferred == "" {
		preferred = "8080"
	}
	ports := []string{preferred}
	if preferred == "8080" {
		ports = append(ports, "8081", "8082", "8083", "8084", "8085")
	}
	for _, port := range ports {
		ln, err := net.Listen("tcp", "127.0.0.1:"+port)
		if err == nil {
			return ln, "http://127.0.0.1:" + port, nil
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, "", fmt.Errorf("listen on ephemeral orbit port: %w", err)
	}
	addr := ln.Addr().String()
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		_ = ln.Close()
		return nil, "", fmt.Errorf("split listener address %q: %w", addr, err)
	}
	return ln, "http://127.0.0.1:" + port, nil
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("open browser: %v", err)
	}
}
