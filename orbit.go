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

	_ "modernc.org/sqlite"
)

//go:embed templates/*.html static/*
var embeddedAssets embed.FS

type Item struct {
	ID        string    `json:"id"`
	ContextID string    `json:"contextId,omitempty"`
	Title     string    `json:"title"`
	SubNote   string    `json:"subNote"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Color     string    `json:"color"`
	Hidden    bool      `json:"hidden,omitempty"`
	Slipping  bool      `json:"slipping,omitempty"`
	InCenter  bool      `json:"inCenter,omitempty"`
	UpdatedAt time.Time `json:"updatedAt"`
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

func newStore(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	hadDB := fileExists(dbPath)
	initializedFlag := filepath.Join(filepath.Dir(dbPath), ".orbit_initialized")
	legacyJSON := filepath.Join(filepath.Dir(dbPath), "items.json")

	// Split-brain guard: runtime must not use active JSON alongside SQLite.
	if fileExists(legacyJSON) {
		return nil, errors.New("legacy data/items.json detected; archive it (e.g. items.legacy.json) before running to avoid split-brain")
	}

	if hadDB {
		_ = backupDB(dbPath)
	} else if fileExists(initializedFlag) {
		return nil, errors.New("orbit.db missing after initialization; refusing to reseed and risk state loss")
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA synchronous = FULL`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		return nil, err
	}

	s := &Store{db: db}
	if err := s.ensureSchema(); err != nil {
		return nil, err
	}

	count, err := s.countItems()
	if err != nil {
		return nil, err
	}

	if err := s.ensureDefaultContext(); err != nil {
		return nil, err
	}
	if err := s.ensureItemsContext(); err != nil {
		return nil, err
	}

	if count == 0 {
		if !hadDB && !fileExists(initializedFlag) {
			if err := s.ensureInitialContexts(); err != nil {
				return nil, err
			}
			if err := s.seedDefaults(); err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("sqlite is empty in an initialized environment; refusing silent reset")
		}
	}

	if err := os.WriteFile(initializedFlag, []byte(time.Now().Format(time.RFC3339)), 0o644); err != nil {
		return nil, err
	}

	return s, nil
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
);`)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN context_id TEXT NOT NULL DEFAULT 'main-orbit'`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN slipping INTEGER NOT NULL DEFAULT 0`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return err
	}
	return nil
}

func (s *Store) countItems() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM items`).Scan(&n)
	return n, err
}

func (s *Store) importJSON(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(b) == 0 {
		return nil
	}
	var items []Item
	if err := json.Unmarshal(b, &items); err != nil {
		return err
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
	_ = s.db.QueryRow(`SELECT created_at FROM items WHERE id = ?`, item.ID).Scan(&createdAt)
	_, err := s.db.Exec(`
INSERT INTO items(id,context_id,title,sub_note,x,y,color,hidden,slipping,created_at,updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title,
  sub_note=excluded.sub_note,
  x=excluded.x,
  y=excluded.y,
  color=excluded.color,
  slipping=excluded.slipping,
  updated_at=excluded.updated_at;
`, item.ID, contextOrDefault(item.ContextID), item.Title, item.SubNote, item.X, item.Y, item.Color, 0, boolToInt(item.Slipping), createdAt, now.Format(time.RFC3339Nano))
	return err
}

func (s *Store) delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM items WHERE id = ?`, id)
	return err
}

func (s *Store) hide(id, contextID string) error {
	_, err := s.db.Exec(`UPDATE items SET hidden=1, updated_at=? WHERE id = ? AND context_id = ?`, time.Now().Format(time.RFC3339Nano), id, contextOrDefault(contextID))
	return err
}

func (s *Store) hiddenCount(contextID string) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1 AND context_id=?`, contextOrDefault(contextID)).Scan(&n)
	return n, err
}

func (s *Store) hiddenItems(contextID string) ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,slipping,updated_at FROM items WHERE hidden=1 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Slipping, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) unhideAt(id, contextID string, x, y float64) error {
	_, err := s.db.Exec(`UPDATE items SET hidden=0, x=?, y=?, updated_at=? WHERE id=? AND context_id=?`, x, y, time.Now().Format(time.RFC3339Nano), id, contextOrDefault(contextID))
	return err
}

func (s *Store) revealAllHidden(contextID string) ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,slipping,updated_at FROM items WHERE hidden=1 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Slipping, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	now := time.Now().Format(time.RFC3339Nano)
	if _, err := s.db.Exec(`UPDATE items SET hidden=0, updated_at=? WHERE hidden=1 AND context_id=?`, now, contextOrDefault(contextID)); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) snapshot(contextID string) ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,context_id,title,sub_note,x,y,color,slipping,updated_at FROM items WHERE hidden=0 AND context_id=? ORDER BY updated_at DESC`, contextOrDefault(contextID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.ContextID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &it.Slipping, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		it.InCenter = classifyDesktopBand(it.X, it.Y)
		out = append(out, it)
	}
	return out, rows.Err()
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
	return err
}

func (s *Store) ensureInitialContexts() error {
	now := time.Now().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO contexts(id,title,sub_note,x,y,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, "more-contexts", "Add more contexts", "Each context has its own canvas. Unleash!", 560.0, 500.0, "var(--c2)", now, now)
	if err != nil {
		return err
	}
	return nil
}

func (s *Store) ensureItemsContext() error {
	_, err := s.db.Exec(`UPDATE items SET context_id='main-orbit' WHERE context_id IS NULL OR context_id=''`)
	return err
}

func (s *Store) contexts() ([]Context, error) {
	rows, err := s.db.Query(`SELECT id,title,sub_note,x,y,color,updated_at FROM contexts ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Context{}
	for rows.Next() {
		var c Context
		var updated string
		if err := rows.Scan(&c.ID, &c.Title, &c.SubNote, &c.X, &c.Y, &c.Color, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			c.UpdatedAt = t
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) contextByID(id string) (*Context, error) {
	id = contextOrDefault(id)
	var c Context
	var updated string
	err := s.db.QueryRow(`SELECT id,title,sub_note,x,y,color,updated_at FROM contexts WHERE id=?`, id).Scan(&c.ID, &c.Title, &c.SubNote, &c.X, &c.Y, &c.Color, &updated)
	if err != nil {
		return nil, err
	}
	if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
		c.UpdatedAt = t
	}
	return &c, nil
}

func (s *Store) upsertContext(c Context) error {
	now := time.Now().Format(time.RFC3339Nano)
	created := now
	_ = s.db.QueryRow(`SELECT created_at FROM contexts WHERE id=?`, c.ID).Scan(&created)
	_, err := s.db.Exec(`INSERT INTO contexts(id,title,sub_note,x,y,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,sub_note=excluded.sub_note,x=excluded.x,y=excluded.y,color=excluded.color,updated_at=excluded.updated_at`, c.ID, c.Title, c.SubNote, c.X, c.Y, c.Color, created, now)
	return err
}

func (s *Store) deleteContext(id string) error {
	if id == "main-orbit" {
		return errors.New("cannot delete Main Orbit")
	}
	_, err := s.db.Exec(`DELETE FROM contexts WHERE id=?`, id)
	return err
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
		return nil, err
	}
	tpl := template.Must(template.ParseFS(tplFS, "*.html"))

	dataDir, err := orbitDataDir()
	if err != nil {
		return nil, err
	}
	if err := migrateLegacyData(dataDir); err != nil {
		return nil, err
	}

	store, err := newStore(filepath.Join(dataDir, "orbit.db"))
	if err != nil {
		return nil, err
	}
	app := &App{tpl: tpl, store: store}

	staticFS, err := fs.Sub(embeddedAssets, "static")
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))
	mux.HandleFunc("/", app.home)
	mux.HandleFunc("/api/items", app.itemsAPI)
	mux.HandleFunc("/api/items/delete", app.deleteItemAPI)
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
		return err
	}

	listener, baseURL, err := listenOrbit()
	if err != nil {
		return err
	}
	fmt.Printf("The Orbit running on %s\n", baseURL)
	if autoOpenBrowser {
		go openBrowser(baseURL)
	}
	return http.Serve(listener, mux)
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
		b, _ := json.Marshal(contexts)
		_ = a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b), "HiddenCount": 0, "Mode": "contexts", "CurrentContextID": ctxID, "CurrentContextTitle": "Your Contexts", "MobileMode": mobileMode})
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
	b, _ := json.Marshal(items)
	_ = a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b), "HiddenCount": hiddenN, "Mode": "focus", "CurrentContextID": cur.ID, "CurrentContextTitle": cur.Title, "MobileMode": mobileMode})
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
	w.Write([]byte(`{"ok":true}`))
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, _ := a.store.hiddenCount(in.ContextID)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"ok":true,"hiddenCount":%d}`, hiddenN)))
}

func (a *App) revealAllAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ContextID string `json:"contextId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	items, err := a.store.revealAllHidden(in.ContextID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, _ := json.Marshal(map[string]any{"ok": true, "items": items, "hiddenCount": 0})
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

func (a *App) hiddenItemsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ContextID string `json:"contextId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	items, err := a.store.hiddenItems(in.ContextID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, _ := json.Marshal(map[string]any{"ok": true, "items": items})
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, _ := a.store.hiddenCount(in.ContextID)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"ok":true,"hiddenCount":%d}`, hiddenN)))
}

func (a *App) contextsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ID      string   `json:"id"`
		Title   *string  `json:"title"`
		SubNote *string  `json:"subNote"`
		X       *float64 `json:"x"`
		Y       *float64 `json:"y"`
		Color   *string  `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

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

	existing, err := a.store.contextByID(id)
	if err == nil {
		c = *existing
	} else if !errors.Is(err, sql.ErrNoRows) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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
	if err := a.store.upsertContext(c); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true,"id":"` + id + `"}`))
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
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
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
		return err
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
		return err
	}
	if len(entries) <= keep {
		return nil
	}
	sort.Strings(entries)
	for _, stale := range entries[:len(entries)-keep] {
		if rmErr := os.Remove(stale); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			return rmErr
		}
	}
	return nil
}

func orbitDataDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("ORBIT_DATA_DIR")); override != "" {
		if err := os.MkdirAll(override, 0o755); err != nil {
			return "", err
		}
		return override, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "Orbit")
	if runtime.GOOS == "darwin" {
		home, homeErr := os.UserHomeDir()
		if homeErr == nil {
			dir = filepath.Join(home, "Library", "Application Support", "Orbit")
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
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
		return err
	}
	defer src.Close()
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return dst.Close()
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
		return nil, "", err
	}
	addr := ln.Addr().String()
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		ln.Close()
		return nil, "", err
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
