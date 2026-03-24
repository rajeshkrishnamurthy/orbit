package orbit

import (
	"context"
	"database/sql"
	"fmt"
)

type queryRowScanner interface {
	Scan(dest ...any) error
}

func (s *Store) execContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	result, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("exec query: %w", err)
	}
	return result, nil
}

func (s *Store) queryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query rows: %w", err)
	}
	return rows, nil
}

func (s *Store) queryRowContext(ctx context.Context, query string, args ...any) queryRowScanner {
	return s.db.QueryRowContext(ctx, query, args...)
}

func (s *Store) beginTxContext(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	tx, err := s.db.BeginTx(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	return tx, nil
}
