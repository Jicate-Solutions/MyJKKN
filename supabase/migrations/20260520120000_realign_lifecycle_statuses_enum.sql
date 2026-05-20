-- Phase 1.1: Extend lifecycle_status ENUM with new workflow states.
-- Postgres requires ALTER TYPE ... ADD VALUE in a separate transaction from any DML
-- that references the new value (see CLAUDE.md memory on enum extension).
--
-- New states:
--   'enquiry'           — Lead just moved to counselor; entry point of learner module
--   'enquiry_submitted' — Learner completed the QR-form; awaiting officer verification
--   'reserved'          — Application Fee + Tuition (universal categories) fully paid

ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'enquiry';
ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'enquiry_submitted';
ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'reserved';
