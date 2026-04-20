package orbit

import (
	"context"
)

// refreshForegroundTouchedStateWithContext recomputes touch-derived state across all contexts
// and returns the current context snapshot for UI synchronization.
func (s *Store) refreshForegroundTouchedStateWithContext(ctx context.Context, currentContextID string) ([]Item, error) {
	currentID := contextOrDefault(currentContextID)

	contexts, err := s.contextsWithContext(ctx)
	if err != nil {
		return nil, err
	}

	itemsForCurrent := []Item(nil)
	for _, c := range contexts {
		items, snapErr := s.snapshotWithContext(ctx, c.ID)
		if snapErr != nil {
			return nil, snapErr
		}
		if c.ID == currentID {
			itemsForCurrent = items
		}
	}

	if itemsForCurrent == nil {
		return s.snapshotWithContext(ctx, currentID)
	}

	return itemsForCurrent, nil
}
