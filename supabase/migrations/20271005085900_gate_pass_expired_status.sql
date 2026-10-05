-- A hostel leave gate pass that was approved but never scanned OUT inside its
-- 12-hour window is 'expired' (distinct from 'overdue', which means a learner is
-- OUT past expected_return, and from 'cancelled', which is a decision).
-- Kept in its own file: a new enum value cannot be used until the transaction
-- that adds it commits, and 20271005090100 reads it.
ALTER TYPE public.gate_pass_status_enum ADD VALUE IF NOT EXISTS 'expired';
