package orbit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type AppService struct {
	store *Store
}

func newAppService(store *Store) *AppService {
	return &AppService{store: store}
}

type HomeRequest struct {
	Canvas     string
	ContextID  string
	MobileMode bool
}

type HomeResponse struct {
	Items               []Item
	Contexts            []Context
	HiddenCount         int
	Mode                string
	CurrentContextID    string
	CurrentContextTitle string
	MobileMode          bool
}

func (s *AppService) Home(ctx context.Context, req HomeRequest) (HomeResponse, error) {
	if req.Canvas == "contexts" {
		contexts, err := s.store.contextsWithContext(ctx)
		if err != nil {
			return HomeResponse{}, err
		}
		return HomeResponse{
			Contexts:            contexts,
			HiddenCount:         0,
			Mode:                "contexts",
			CurrentContextID:    contextOrDefault(req.ContextID),
			CurrentContextTitle: "Your Contexts",
			MobileMode:          req.MobileMode,
		}, nil
	}

	ctxID := contextOrDefault(req.ContextID)
	cur, err := s.store.contextByIDWithContext(ctx, ctxID)
	if err != nil {
		return HomeResponse{}, err
	}
	items, err := s.store.snapshotWithContext(ctx, ctxID)
	if err != nil {
		return HomeResponse{}, err
	}
	hiddenN, err := s.store.hiddenCountWithContext(ctx, ctxID)
	if err != nil {
		return HomeResponse{}, err
	}
	return HomeResponse{
		Items:               items,
		HiddenCount:         hiddenN,
		Mode:                "focus",
		CurrentContextID:    cur.ID,
		CurrentContextTitle: cur.Title,
		MobileMode:          req.MobileMode,
	}, nil
}

type UpsertItemRequest struct {
	Item Item
}

type UpsertItemResponse struct {
	State Item
}

func (s *AppService) UpsertItem(ctx context.Context, req UpsertItemRequest) (UpsertItemResponse, error) {
	if err := s.store.updateWithContext(ctx, req.Item); err != nil {
		return UpsertItemResponse{}, err
	}
	state, err := s.store.touchItemStateWithContext(ctx, req.Item.ID)
	if err != nil {
		return UpsertItemResponse{}, err
	}
	return UpsertItemResponse{State: *state}, nil
}

type DeleteItemRequest struct {
	ID string
}

func (s *AppService) DeleteItem(ctx context.Context, req DeleteItemRequest) error {
	return s.store.deleteWithContext(ctx, req.ID)
}

type CompleteItemRequest struct {
	ID        string
	Completed *bool
}

func (s *AppService) SetItemCompleted(ctx context.Context, req CompleteItemRequest) error {
	completed := true
	if req.Completed != nil {
		completed = *req.Completed
	}
	return s.store.setCompletedWithContext(ctx, req.ID, completed)
}

type TouchItemRequest struct {
	ID string
}

type TouchItemResponse struct {
	State   Item
	Touched bool
}

func (s *AppService) TouchItem(ctx context.Context, req TouchItemRequest) (TouchItemResponse, error) {
	item, touched, err := s.store.touchCardWithContext(ctx, req.ID)
	if err != nil {
		return TouchItemResponse{}, err
	}
	return TouchItemResponse{State: *item, Touched: touched}, nil
}

type UndoTouchItemRequest struct {
	ID string
}

type UndoTouchItemResponse struct {
	State  Item
	Undone bool
}

func (s *AppService) UndoTouchItem(ctx context.Context, req UndoTouchItemRequest) (UndoTouchItemResponse, error) {
	item, undone, err := s.store.undoTouchCardWithContext(ctx, req.ID)
	if err != nil {
		return UndoTouchItemResponse{}, err
	}
	return UndoTouchItemResponse{State: *item, Undone: undone}, nil
}

type HideItemRequest struct {
	ID        string
	ContextID string
}

type HideItemResponse struct {
	HiddenCount int
}

func (s *AppService) HideItem(ctx context.Context, req HideItemRequest) (HideItemResponse, error) {
	if err := s.store.hideWithContext(ctx, req.ID, req.ContextID); err != nil {
		return HideItemResponse{}, err
	}
	hiddenN := 0
	count, countErr := s.store.hiddenCountWithContext(ctx, req.ContextID)
	if countErr == nil {
		hiddenN = count
	}
	return HideItemResponse{HiddenCount: hiddenN}, nil
}

type RevealAllHiddenRequest struct {
	ContextID string
}

type RevealAllHiddenResponse struct {
	Items       []Item
	HiddenCount int
}

func (s *AppService) RevealAllHidden(ctx context.Context, req RevealAllHiddenRequest) (RevealAllHiddenResponse, error) {
	items, err := s.store.revealAllHiddenWithContext(ctx, req.ContextID)
	if err != nil {
		return RevealAllHiddenResponse{}, err
	}
	return RevealAllHiddenResponse{Items: items, HiddenCount: 0}, nil
}

type HiddenItemsRequest struct {
	ContextID string
}

type HiddenItemsResponse struct {
	Items []Item
}

func (s *AppService) HiddenItems(ctx context.Context, req HiddenItemsRequest) (HiddenItemsResponse, error) {
	items, err := s.store.hiddenItemsWithContext(ctx, req.ContextID)
	if err != nil {
		return HiddenItemsResponse{}, err
	}
	return HiddenItemsResponse{Items: items}, nil
}

type UnhideAtRequest struct {
	ID        string
	ContextID string
	X         float64
	Y         float64
}

type UnhideAtResponse struct {
	Item        *Item
	HiddenCount int
}

func (s *AppService) UnhideAt(ctx context.Context, req UnhideAtRequest) (UnhideAtResponse, error) {
	if err := s.store.unhideAtWithContext(ctx, req.ID, req.ContextID, req.X, req.Y); err != nil {
		return UnhideAtResponse{}, err
	}
	item, err := s.store.touchItemStateWithContext(ctx, req.ID)
	if err != nil {
		return UnhideAtResponse{}, err
	}
	hiddenN := 0
	count, countErr := s.store.hiddenCountWithContext(ctx, req.ContextID)
	if countErr == nil {
		hiddenN = count
	}
	return UnhideAtResponse{Item: item, HiddenCount: hiddenN}, nil
}

type ContextUpsertRequest struct {
	ID      string
	Title   *string
	SubNote *string
	X       *float64
	Y       *float64
	Color   *string
}

type ContextUpsertResponse struct {
	ID string
}

func (s *AppService) UpsertContext(ctx context.Context, req ContextUpsertRequest) (ContextUpsertResponse, error) {
	id := strings.TrimSpace(req.ID)
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

	existing, err := s.store.contextByIDWithContext(ctx, id)
	if err == nil {
		c = *existing
	} else if !errors.Is(err, sql.ErrNoRows) {
		return ContextUpsertResponse{}, err
	}

	if req.Title != nil {
		c.Title = strings.TrimSpace(*req.Title)
	}
	if c.Title == "" {
		c.Title = "Untitled context"
	}
	if req.SubNote != nil {
		c.SubNote = *req.SubNote
	}
	if req.X != nil {
		c.X = *req.X
	}
	if req.Y != nil {
		c.Y = *req.Y
	}
	if req.Color != nil {
		c.Color = strings.TrimSpace(*req.Color)
	}
	if c.Color == "" {
		c.Color = "var(--c1)"
	}
	if err := s.store.upsertContextWithContext(ctx, c); err != nil {
		return ContextUpsertResponse{}, err
	}
	return ContextUpsertResponse{ID: c.ID}, nil
}

type DeleteContextRequest struct {
	ID string
}

func (s *AppService) DeleteContext(ctx context.Context, req DeleteContextRequest) error {
	return s.store.deleteContextWithContext(ctx, req.ID)
}
