package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Item struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	SubNote   string    `json:"subNote"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Color     string    `json:"color"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	mu    sync.Mutex
	Items []Item
	Path  string
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, err := os.ReadFile(s.Path)
	if err != nil {
		if os.IsNotExist(err) {
			s.Items = seedItems()
			return s.saveLocked()
		}
		return err
	}
	if len(b) == 0 {
		s.Items = seedItems()
		return s.saveLocked()
	}
	return json.Unmarshal(b, &s.Items)
}

func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.Items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.Path, b, 0o644)
}

func (s *Store) update(item Item) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item.UpdatedAt = time.Now()
	for i := range s.Items {
		if s.Items[i].ID == item.ID {
			s.Items[i] = item
			return s.saveLocked()
		}
	}
	s.Items = append(s.Items, item)
	return s.saveLocked()
}

func (s *Store) snapshot() []Item {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Item, len(s.Items))
	copy(out, s.Items)
	return out
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
	store := &Store{Path: "data/items.json"}
	if err := store.load(); err != nil {
		log.Fatal(err)
	}
	app := &App{tpl: tpl, store: store}

	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
	mux.HandleFunc("/", app.home)
	mux.HandleFunc("/api/items", app.itemsAPI)

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
	items := a.store.snapshot()
	b, _ := json.Marshal(items)
	_ = a.tpl.Execute(w, map[string]any{"ItemsJSON": template.JS(b)})
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
