package orbit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *Store) createPersonWithContext(ctx context.Context, rawName string, now time.Time) (Person, error) {
	displayName, normalizedName, err := preparePersonNames(rawName)
	if err != nil {
		return Person{}, err
	}

	id := newPersonID(now)
	createdAt := now.UTC().Format(time.RFC3339Nano)
	_, err = s.execContext(ctx, `
INSERT INTO people(id, display_name, normalized_name, created_at, updated_at)
VALUES(?, ?, ?, ?, ?)
`, id, displayName, normalizedName, createdAt, createdAt)
	if err != nil {
		if isPeopleNormalizedNameUniqueViolation(err) {
			return Person{}, duplicatePersonNameError(normalizedName)
		}
		return Person{}, fmt.Errorf("insert person %q: %w", id, err)
	}
	return s.personByIDWithContext(ctx, id)
}

func (s *Store) renamePersonWithContext(ctx context.Context, id, rawName string, now time.Time) (Person, error) {
	displayName, normalizedName, err := preparePersonNames(rawName)
	if err != nil {
		return Person{}, err
	}

	result, err := s.execContext(ctx, `
UPDATE people
SET display_name=?, normalized_name=?, updated_at=?
WHERE id=?
`, displayName, normalizedName, now.UTC().Format(time.RFC3339Nano), id)
	if err != nil {
		if isPeopleNormalizedNameUniqueViolation(err) {
			return Person{}, duplicatePersonNameError(normalizedName)
		}
		return Person{}, fmt.Errorf("rename person %q: %w", id, err)
	}
	if err := requireRowsAffected(result, fmt.Sprintf("rename person %q", id), fmt.Errorf("rename person %q: %w", id, errors.Join(errPersonNotFound, sql.ErrNoRows))); err != nil {
		return Person{}, err
	}
	return s.personByIDWithContext(ctx, id)
}

func (s *Store) listPeopleWithContext(ctx context.Context) ([]Person, error) {
	rows, err := s.queryContext(ctx, `
SELECT id, display_name, normalized_name, updated_at
FROM people
ORDER BY lower(display_name) ASC, id ASC
`)
	if err != nil {
		return nil, fmt.Errorf("query people list: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := make([]Person, 0, 16)
	for rows.Next() {
		var p Person
		var updatedAtRaw string
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.NormalizedName, &updatedAtRaw); err != nil {
			return nil, fmt.Errorf("scan people row: %w", err)
		}
		updatedAt, parseErr := time.Parse(time.RFC3339Nano, updatedAtRaw)
		if parseErr != nil {
			return nil, fmt.Errorf("parse people updated_at: %w", parseErr)
		}
		p.UpdatedAt = updatedAt
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate people rows: %w", err)
	}
	sort.SliceStable(out, func(i, j int) bool {
		left := strings.ToLower(out[i].DisplayName)
		right := strings.ToLower(out[j].DisplayName)
		if left == right {
			return out[i].ID < out[j].ID
		}
		return left < right
	})
	return out, nil
}

func (s *Store) personByIDWithContext(ctx context.Context, id string) (Person, error) {
	var p Person
	var updatedAtRaw string
	err := s.queryRowContext(ctx, `
SELECT id, display_name, normalized_name, updated_at
FROM people
WHERE id=?
`, id).Scan(&p.ID, &p.DisplayName, &p.NormalizedName, &updatedAtRaw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Person{}, fmt.Errorf("person %q lookup: %w", id, errors.Join(errPersonNotFound, sql.ErrNoRows))
		}
		return Person{}, fmt.Errorf("person %q lookup: %w", id, err)
	}
	updatedAt, parseErr := time.Parse(time.RFC3339Nano, updatedAtRaw)
	if parseErr != nil {
		return Person{}, fmt.Errorf("person %q parse updated_at: %w", id, parseErr)
	}
	p.UpdatedAt = updatedAt
	return p, nil
}

func preparePersonNames(rawName string) (string, string, error) {
	displayName := personDisplayName(rawName)
	normalizedName := normalizePersonName(rawName)
	if normalizedName == "" {
		return "", "", fmt.Errorf("normalized person name cannot be blank: %w", errPersonNameBlank)
	}
	return displayName, normalizedName, nil
}

func duplicatePersonNameError(normalizedName string) error {
	return fmt.Errorf("normalized person name %q already exists: %w", normalizedName, errPersonNameDuplicate)
}

func isPeopleNormalizedNameUniqueViolation(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique constraint failed") && strings.Contains(msg, "people.normalized_name")
}
