package repository

import "github.com/jackc/pgx/v5"

// pgxBatch is a thin wrapper to build a pgx.Batch.
type pgxBatch struct {
	b pgx.Batch
}

func (pb *pgxBatch) Queue(sql string, args ...any) {
	pb.b.Queue(sql, args...)
}

func (pb *pgxBatch) pgxBatch() *pgx.Batch {
	return &pb.b
}
