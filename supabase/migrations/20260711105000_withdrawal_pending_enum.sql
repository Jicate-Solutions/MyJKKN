-- 20260711105000_withdrawal_pending_enum.sql
-- lifecycle_status is an ENUM type; withdrawal_pending must exist in the type,
-- not just in admission_statuses (which is display/behavior metadata).
ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'withdrawal_pending';
