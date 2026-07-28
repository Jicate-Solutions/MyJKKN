-- ============================================================================
-- Migration: 20260723120000_drop_bos_experts_category_check.sql
-- Description: Drop the static CHECK constraint on bos_external_experts.category.
--
-- Context: Same evolution as bos_members.member_type (20260710150000) — the
-- category value is moving away from a fixed 5-value enum, so a static CHECK
-- rejects any new category with Postgres 23514 (check_violation), surfaced by
-- POST /api/bos/experts as the generic 500 "Failed to create expert".
-- Validation of allowed categories now lives at the application layer.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS.
-- ============================================================================

ALTER TABLE public.bos_external_experts
  DROP CONSTRAINT IF EXISTS bos_external_experts_category_check;
