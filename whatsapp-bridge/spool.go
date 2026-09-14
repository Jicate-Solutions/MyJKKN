package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Spool is a durable local queue for inbound messages. When MyJKKN is
// unreachable — campus internet down, Vercel deploy in flight — messages land
// here and are replayed in order once it answers again. Nothing is dropped.
//
// It shares the same SQLite file as the WhatsApp session so the operator only
// ever has one file to back up or delete.
type Spool struct {
	db  *sql.DB
	log *Logger
}

// SpooledRow is one queued inbound message.
type SpooledRow struct {
	ID      int64
	Payload []byte
}

func NewSpool(ctx context.Context, db *sql.DB, log *Logger) (*Spool, error) {
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS bridge_inbound_spool (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			payload     TEXT    NOT NULL,
			attempts    INTEGER NOT NULL DEFAULT 0,
			created_at  TEXT    NOT NULL,
			last_error  TEXT
		)`)
	if err != nil {
		return nil, fmt.Errorf("create inbound spool table: %w", err)
	}
	return &Spool{db: db, log: log}, nil
}

// Enqueue stores a message for later delivery.
func (s *Spool) Enqueue(ctx context.Context, msg InboundMessage) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("encode inbound message: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO bridge_inbound_spool (payload, created_at) VALUES (?, ?)`,
		string(payload), ISOTimestamp(time.Now()))
	return err
}

// Next returns up to limit queued rows, oldest first.
func (s *Spool) Next(ctx context.Context, limit int) ([]SpooledRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, payload FROM bridge_inbound_spool ORDER BY id ASC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SpooledRow
	for rows.Next() {
		var r SpooledRow
		var payload string
		if err := rows.Scan(&r.ID, &payload); err != nil {
			return nil, err
		}
		r.Payload = []byte(payload)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Delete removes a row that has been delivered (or is unrecoverably malformed).
func (s *Spool) Delete(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM bridge_inbound_spool WHERE id = ?`, id)
	return err
}

// RecordFailure bumps the attempt counter so the log can show a row that is stuck.
func (s *Spool) RecordFailure(ctx context.Context, id int64, cause string) {
	_, err := s.db.ExecContext(ctx,
		`UPDATE bridge_inbound_spool SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
		truncate(cause, 500), id)
	if err != nil {
		s.log.Warnf("spool: could not record failure for row %d: %v", id, err)
	}
}

// Depth is how many messages are waiting. Surfaced on /health.
func (s *Spool) Depth(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bridge_inbound_spool`).Scan(&n)
	return n, err
}
