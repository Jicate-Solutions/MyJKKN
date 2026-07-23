-- =============================================================================
-- Add 'mess' to billing_category_kind enum
-- Spec: specs/billing-apportionment-spec-2026-06-09.md
-- Created: 2026-06-09
--
-- WHY a separate migration: Postgres forbids using a freshly-added enum value in
-- the SAME transaction that adds it. Keeping ADD VALUE in its own migration (its
-- own transaction) lets the substrate migration insert a kind='mess' category
-- safely afterwards.
--
-- Pattern: hostel and transport each have their own kind; mess gets one too,
-- extending the existing billing_categories catalog (NOT a parallel heads table).
-- =============================================================================

ALTER TYPE billing_category_kind ADD VALUE IF NOT EXISTS 'mess';
