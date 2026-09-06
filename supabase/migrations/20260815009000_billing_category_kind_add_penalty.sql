-- =============================================================================
-- Add 'penalty' to billing_category_kind enum
-- Companion to: 20260815010000_late_charge_mechanism.sql
-- Created: 2026-08-07 · 🛑 FILE ONLY — NOT APPLIED. Apply is Director-gated.
--
-- WHY a separate migration: Postgres forbids using a freshly-added enum value
-- in the SAME transaction that adds it (55P04 "unsafe use of new value of enum
-- type"). Keeping ADD VALUE in its own migration (its own transaction) lets the
-- late-charge mechanism migration insert a kind='penalty' category safely
-- afterwards. Exact precedent in this repo:
-- 20260704999000_billing_category_kind_add_mess.sql →
-- 20260705000000_billing_apportionment_substrate.sql.
--
-- The spec expected a CHECK constraint on billing_categories.kind ("widen it if
-- one exists") — in reality the column is this enum type, so the widening takes
-- this form instead.
-- =============================================================================

ALTER TYPE billing_category_kind ADD VALUE IF NOT EXISTS 'penalty';
