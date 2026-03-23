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
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
