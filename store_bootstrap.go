package orbit

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var errWriteTargetNotFound = errors.New("write target not found")

const schemaDDL = `
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
  person_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(display_name)) > 0),
  CHECK (length(trim(normalized_name)) > 0)
);
CREATE TABLE IF NOT EXISTS touch_facts (
  card_id TEXT NOT NULL,
  local_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(card_id, local_day),
  FOREIGN KEY(card_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS item_activity_logs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_at_unix_ns INTEGER NOT NULL,
  FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
  CHECK (length(trim(body)) > 0),
  CHECK (length(body) <= 140)
);
CREATE INDEX IF NOT EXISTS idx_item_activity_logs_item_time
  ON item_activity_logs(item_id, created_at_unix_ns DESC, id DESC);
CREATE TABLE IF NOT EXISTS item_snoozes (
  item_id TEXT PRIMARY KEY,
  wake_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS resurfaced_items (
  item_id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  resurfaced_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);`

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
		return nil
	}
	if err := s.ensureInitialContexts(); err != nil {
		return err
	}
	return s.seedDefaults()
}

func (s *Store) ensureSchema() error {
	if err := s.ensureSchemaTables(); err != nil {
		return err
	}

	alterStmts := []struct {
		column string
		stmt   string
	}{
		{column: "context_id", stmt: `ALTER TABLE items ADD COLUMN context_id TEXT NOT NULL DEFAULT 'main-orbit'`},
		{column: "hidden", stmt: `ALTER TABLE items ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`},
		{column: "slipping", stmt: `ALTER TABLE items ADD COLUMN slipping INTEGER NOT NULL DEFAULT 0`},
		{column: "completed", stmt: `ALTER TABLE items ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`},
		{column: "person_ids", stmt: `ALTER TABLE items ADD COLUMN person_ids TEXT NOT NULL DEFAULT '[]'`},
	}
	for _, alter := range alterStmts {
		if err := s.ensureItemsColumn(alter.column, alter.stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ensureSchemaTables() error {
	if _, err := s.db.Exec(schemaDDL); err != nil {
		return fmt.Errorf("create schema tables: %w", err)
	}
	return nil
}

func (s *Store) ensureItemsColumn(column, stmt string) error {
	_, err := s.db.Exec(stmt)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return fmt.Errorf("add items.%s column: %w", column, err)
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
	return nil
}

func (s *Store) ensureItemsContext() error {
	_, err := s.db.Exec(`UPDATE items SET context_id='main-orbit' WHERE context_id IS NULL OR context_id=''`)
	if err != nil {
		return fmt.Errorf("backfill items context_id: %w", err)
	}
	return nil
}
