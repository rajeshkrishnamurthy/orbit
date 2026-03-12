package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Item struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	SubNote   string    `json:"subNote"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Color     string    `json:"color"`
	Hidden    bool      `json:"hidden,omitempty"`
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

	s := &Store{db: db}
	if err := s.ensureSchema(); err != nil {
		return nil, err
	}

	count, err := s.countItems()
	if err != nil {
		return nil, err
	}

	if count == 0 {
		if !hadDB && !fileExists(initializedFlag) {
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
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sub_note TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  color TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE items ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
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
INSERT INTO items(id,title,sub_note,x,y,color,hidden,created_at,updated_at)
VALUES(?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title,
  sub_note=excluded.sub_note,
  x=excluded.x,
  y=excluded.y,
  color=excluded.color,
  updated_at=excluded.updated_at;
`, item.ID, item.Title, item.SubNote, item.X, item.Y, item.Color, 0, createdAt, now.Format(time.RFC3339Nano))
	return err
}

func (s *Store) delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM items WHERE id = ?`, id)
	return err
}

func (s *Store) hide(id string) error {
	_, err := s.db.Exec(`UPDATE items SET hidden=1, updated_at=? WHERE id = ?`, time.Now().Format(time.RFC3339Nano), id)
	return err
}

func (s *Store) hiddenCount() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE hidden=1`).Scan(&n)
	return n, err
}

func (s *Store) revealAllHidden() ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,title,sub_note,x,y,color,updated_at FROM items WHERE hidden=1 ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	now := time.Now().Format(time.RFC3339Nano)
	if _, err := s.db.Exec(`UPDATE items SET hidden=0, updated_at=? WHERE hidden=1`, now); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) snapshot() ([]Item, error) {
	rows, err := s.db.Query(`SELECT id,title,sub_note,x,y,color,updated_at FROM items WHERE hidden=0 ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		var updated string
		if err := rows.Scan(&it.ID, &it.Title, &it.SubNote, &it.X, &it.Y, &it.Color, &updated); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339Nano, updated); err == nil {
			it.UpdatedAt = t
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

type App struct {
	tpl   *template.Template
	store *Store
}

func seedItems() []Item {
	now := time.Now()
	return []Item{
		{ID: "i1", Title: "Equitas upgrade", SubNote: "Capital decision window", X: 760, Y: 280, Color: "var(--c1)", UpdatedAt: now},
		{ID: "i2", Title: "DBS rate negotiation", SubNote: "Call when treasury opens", X: 620, Y: 380, Color: "var(--c2)", UpdatedAt: now},
		{ID: "i3", Title: "Credit line reset", SubNote: "After DBS close", X: 880, Y: 430, Color: "var(--c3)", UpdatedAt: now},
		{ID: "i4", Title: "Insurance reshuffle", SubNote: "Risk optimization", X: 480, Y: 280, Color: "var(--c4)", UpdatedAt: now},
		{ID: "i5", Title: "Family trust structure", SubNote: "Long-horizon architecture", X: 360, Y: 460, Color: "var(--c5)", UpdatedAt: now},
	}
}

func main() {
	tpl := template.Must(template.ParseFiles("templates/index.html"))
	store, err := newStore("data/orbit.db")
	if err != nil {
		log.Fatal(err)
	}
	app := &App{tpl: tpl, store: store}

	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
	mux.HandleFunc("/", app.home)
	mux.HandleFunc("/api/items", app.itemsAPI)
	mux.HandleFunc("/api/items/delete", app.deleteItemAPI)
	mux.HandleFunc("/api/items/hide", app.hideItemAPI)
	mux.HandleFunc("/api/items/reveal-all", app.revealAllAPI)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	fmt.Println("The Orbit running on http://localhost" + addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (a *App) home(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	items, err := a.store.snapshot()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, err := a.store.hiddenCount()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, _ := json.Marshal(items)
	_ = a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b), "HiddenCount": hiddenN})
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
	var in struct { ID string `json:"id"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := a.store.hide(in.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hiddenN, _ := a.store.hiddenCount()
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"ok":true,"hiddenCount":%d}`, hiddenN)))
}

func (a *App) revealAllAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	items, err := a.store.revealAllHidden()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	b, _ := json.Marshal(map[string]any{"ok": true, "items": items, "hiddenCount": 0})
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func backupDB(path string) error {
	src, err := os.Open(path)
	if err != nil {
		return err
	}
	defer src.Close()
	backupPath := path + ".bak"
	dst, err := os.Create(backupPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}
