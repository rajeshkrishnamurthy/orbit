package orbit

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

var activityLogSequence uint64

func newActivityLogID(now time.Time) string {
	seq := atomic.AddUint64(&activityLogSequence, 1)
	return fmt.Sprintf("al_%019d_%012d", now.UTC().UnixNano(), seq)
}

func (s *Store) appendActivityLogWithContext(ctx context.Context, itemID, body string, now time.Time) (ActivityLogEntry, error) {
	id := newActivityLogID(now)
	createdAt := now.UTC()
	result, err := s.execContext(ctx, `
INSERT INTO item_activity_logs(id, item_id, body, created_at, created_at_unix_ns)
VALUES(?, ?, ?, ?, ?)
`, id, itemID, body, createdAt.Format(time.RFC3339Nano), createdAt.UnixNano())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "foreign key constraint") {
			return ActivityLogEntry{}, writeTargetNotFoundError("append activity log", itemID, "")
		}
		return ActivityLogEntry{}, fmt.Errorf("insert activity log for item %q: %w", itemID, err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("append activity log for item %q", itemID), writeTargetNotFoundError("append activity log", itemID, "")); err != nil {
		return ActivityLogEntry{}, err
	}
	return ActivityLogEntry{
		ID:        id,
		ItemID:    itemID,
		Body:      body,
		CreatedAt: createdAt,
	}, nil
}

func (s *Store) latestActivityLogWithContext(ctx context.Context, itemID string, limit int) ([]ActivityLogEntry, error) {
	if limit <= 0 {
		limit = 5
	}
	rows, err := s.queryContext(ctx, `
SELECT id, item_id, body, created_at
FROM item_activity_logs
WHERE item_id=?
ORDER BY created_at_unix_ns DESC, id DESC
LIMIT ?
`, itemID, limit)
	if err != nil {
		return nil, fmt.Errorf("query latest activity logs for item %q: %w", itemID, err)
	}
	defer func() { _ = rows.Close() }()

	entries := []ActivityLogEntry{}
	for rows.Next() {
		var entry ActivityLogEntry
		var createdAtRaw string
		if err := rows.Scan(&entry.ID, &entry.ItemID, &entry.Body, &createdAtRaw); err != nil {
			return nil, fmt.Errorf("scan activity log row for item %q: %w", itemID, err)
		}
		createdAt, err := time.Parse(time.RFC3339Nano, createdAtRaw)
		if err != nil {
			return nil, fmt.Errorf("parse activity log created_at for item %q: %w", itemID, err)
		}
		entry.CreatedAt = createdAt
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate latest activity logs for item %q: %w", itemID, err)
	}
	return entries, nil
}
