-- P2.1a — New allocation statuses for the approval workflow. Must be committed
-- in its own migration before any function/DML references them (Postgres forbids
-- ADD VALUE + use in the same transaction).
ALTER TYPE allocation_status_enum ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE allocation_status_enum ADD VALUE IF NOT EXISTS 'rejected';
