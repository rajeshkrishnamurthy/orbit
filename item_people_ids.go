package orbit

import (
	"encoding/json"
	"fmt"
	"strings"
)

func sanitizePersonIDs(ids []string) []string {
	if len(ids) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func marshalPersonIDs(ids []string) (string, error) {
	normalized := sanitizePersonIDs(ids)
	b, err := json.Marshal(normalized)
	if err != nil {
		return "", fmt.Errorf("marshal person ids: %w", err)
	}
	return string(b), nil
}

func unmarshalPersonIDs(raw string) ([]string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{}, nil
	}
	var ids []string
	if err := json.Unmarshal([]byte(trimmed), &ids); err != nil {
		return nil, fmt.Errorf("unmarshal person ids: %w", err)
	}
	return sanitizePersonIDs(ids), nil
}
