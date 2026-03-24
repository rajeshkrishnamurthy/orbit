package orbit

import (
	"context"
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
	tpl     *template.Template
	store   *Store
	service *AppService
}

const requestTimeout = 5 * time.Second

func (a *App) appService() *AppService {
	if a.service == nil {
		a.service = newAppService(a.store)
	}
	return a.service
}

func (a *App) requestContext(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), requestTimeout)
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
	app := &App{tpl: tpl, store: store, service: newAppService(store)}

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

type apiErrorPolicy struct {
	notFoundErr     error
	notFoundMessage string
	defaultStatus   int
}

type apiErrorBody struct {
	OK    bool         `json:"ok"`
	Error apiErrorInfo `json:"error"`
}

type apiErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func classifyAPIError(err error, p apiErrorPolicy) (int, apiErrorInfo, bool) {
	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusRequestTimeout, apiErrorInfo{Code: "request_timeout", Message: "request timed out"}, false
	}
	if errors.Is(err, context.Canceled) {
		return http.StatusRequestTimeout, apiErrorInfo{Code: "request_canceled", Message: "request canceled"}, false
	}
	if p.notFoundErr != nil && errors.Is(err, p.notFoundErr) {
		return http.StatusNotFound, apiErrorInfo{Code: "not_found", Message: p.notFoundMessage}, false
	}
	status := p.defaultStatus
	if status == 0 {
		status = http.StatusInternalServerError
	}
	switch status {
	case http.StatusBadRequest:
		return status, apiErrorInfo{Code: "bad_request", Message: strings.TrimSpace(err.Error())}, false
	default:
		return status, apiErrorInfo{Code: "internal_error", Message: "internal server error"}, true
	}
}

func writeAPIError(w http.ResponseWriter, err error, p apiErrorPolicy) {
	status, body, shouldLog := classifyAPIError(err, p)
	if shouldLog {
		log.Printf("api error: %v", err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if encodeErr := json.NewEncoder(w).Encode(apiErrorBody{OK: false, Error: body}); encodeErr != nil {
		log.Printf("encode api error response: %v", encodeErr)
	}
}

func writePageError(w http.ResponseWriter, err error, p apiErrorPolicy) {
	status, body, shouldLog := classifyAPIError(err, p)
	if shouldLog {
		log.Printf("page error: %v", err)
	}
	http.Error(w, body.Message, status)
}

func (a *App) home(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	resp, err := a.appService().Home(reqCtx, HomeRequest{
		Canvas:     r.URL.Query().Get("canvas"),
		ContextID:  r.URL.Query().Get("ctx"),
		MobileMode: isMobileRequest(r),
	})
	if err != nil {
		writePageError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	var (
		itemsJSONBytes []byte
		itemsJSON      template.JS
	)
	if resp.Mode == "contexts" {
		itemsJSONBytes, err = json.Marshal(resp.Contexts)
		if err != nil {
			writePageError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
			return
		}
	} else {
		itemsJSONBytes, err = json.Marshal(resp.Items)
		if err != nil {
			writePageError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
			return
		}
	}
	itemsJSON = template.JS(itemsJSONBytes)
	semanticsJSONBytes, err := json.Marshal(centerPeripherySemantics())
	if err != nil {
		writePageError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	semanticsJSON := template.JS(semanticsJSONBytes)
	if err := a.tpl.Execute(w, map[string]any{
		"ItemsJSON":           itemsJSON,
		"HiddenCount":         resp.HiddenCount,
		"Mode":                resp.Mode,
		"CurrentContextID":    resp.CurrentContextID,
		"CurrentContextTitle": resp.CurrentContextTitle,
		"CenterSemanticsJSON": semanticsJSON,
		"MobileMode":          resp.MobileMode,
	}); err != nil {
		log.Printf("render focus home: %v", err)
	}
}

func (a *App) itemsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var item Item
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if item.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	resp, err := a.appService().UpsertItem(reqCtx, UpsertItemRequest{Item: item})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	state := resp.State
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if err := a.appService().DeleteItem(reqCtx, DeleteItemRequest{ID: in.ID}); err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     errWriteTargetNotFound,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID        string `json:"id"`
		Completed *bool  `json:"completed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if err := a.appService().SetItemCompleted(reqCtx, CompleteItemRequest{
		ID:        in.ID,
		Completed: in.Completed,
	}); err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     errWriteTargetNotFound,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	resp, err := a.appService().TouchItem(reqCtx, TouchItemRequest{ID: in.ID})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     sql.ErrNoRows,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	item := resp.State
	if err := json.NewEncoder(w).Encode(touchItemAPIResponse{
		Ok:             true,
		Touched:        resp.Touched,
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	resp, err := a.appService().UndoTouchItem(reqCtx, UndoTouchItemRequest{ID: in.ID})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     sql.ErrNoRows,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	item := resp.State
	if err := json.NewEncoder(w).Encode(touchItemAPIResponse{
		Ok:             true,
		Undone:         resp.Undone,
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID        string `json:"id"`
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	resp, err := a.appService().HideItem(reqCtx, HideItemRequest{
		ID:        in.ID,
		ContextID: in.ContextID,
	})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     errWriteTargetNotFound,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(fmt.Sprintf(`{"ok":true,"hiddenCount":%d}`, resp.HiddenCount))); err != nil {
		log.Printf("write hideItemAPI response: %v", err)
	}
}

func (a *App) revealAllAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil && !errors.Is(err, io.EOF) {
		log.Printf("decode revealAllAPI request: %v", err)
	}
	resp, err := a.appService().RevealAllHidden(reqCtx, RevealAllHiddenRequest{ContextID: in.ContextID})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	b, err := json.Marshal(map[string]any{"ok": true, "items": resp.Items, "hiddenCount": resp.HiddenCount})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ContextID string `json:"contextId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil && !errors.Is(err, io.EOF) {
		log.Printf("decode hiddenItemsAPI request: %v", err)
	}
	resp, err := a.appService().HiddenItems(reqCtx, HiddenItemsRequest{ContextID: in.ContextID})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	b, err := json.Marshal(map[string]any{"ok": true, "items": resp.Items})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
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
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	var in struct {
		ID        string  `json:"id"`
		ContextID string  `json:"contextId"`
		X         float64 `json:"x"`
		Y         float64 `json:"y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	if in.ID == "" {
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	resp, err := a.appService().UnhideAt(reqCtx, UnhideAtRequest{
		ID:        in.ID,
		ContextID: in.ContextID,
		X:         in.X,
		Y:         in.Y,
	})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     errWriteTargetNotFound,
			notFoundMessage: "item not found",
			defaultStatus:   http.StatusInternalServerError,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	b, err := json.Marshal(map[string]any{"ok": true, "hiddenCount": resp.HiddenCount, "item": resp.Item})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
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

func (a *App) contextsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	in, err := decodeContextUpsertInput(r)
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}

	resp, err := a.appService().UpsertContext(reqCtx, ContextUpsertRequest{
		ID:      in.ID,
		Title:   in.Title,
		SubNote: in.SubNote,
		X:       in.X,
		Y:       in.Y,
		Color:   in.Color,
	})
	if err != nil {
		writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusInternalServerError})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"ok":true,"id":"` + resp.ID + `"}`)); err != nil {
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
			writeAPIError(w, err, apiErrorPolicy{defaultStatus: http.StatusBadRequest})
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
		writeAPIError(w, errors.New("id required"), apiErrorPolicy{defaultStatus: http.StatusBadRequest})
		return
	}
	reqCtx, cancel := a.requestContext(r)
	defer cancel()
	if err := a.appService().DeleteContext(reqCtx, DeleteContextRequest{ID: id}); err != nil {
		writeAPIError(w, err, apiErrorPolicy{
			notFoundErr:     errWriteTargetNotFound,
			notFoundMessage: "context not found",
			defaultStatus:   http.StatusBadRequest,
		})
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
