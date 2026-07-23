-- ============================================================================
-- Migration: 20260515_bos_external_experts_add_startup_category.sql
-- Description: Allow 'startup' as a valid bos_external_experts.category value.
--
-- Context: The TypeScript union `BosExpertCategory`, the Zod schema in
-- expert-form.tsx, and `BOS_EXPERT_CATEGORY_LABELS` already list 'startup',
-- but the CHECK constraint created in 20260306_create_bos_tables.sql still
-- only allows the original four UGC categories. Inserts with
-- category = 'startup' are rejected with Postgres 23514 (check_violation)
-- and the BOS /api/bos/experts POST handler surfaces the generic
-- 500 "Failed to create expert" message.
-- ============================================================================

BEGIN;

ALTER TABLE bos_external_experts
  DROP CONSTRAINT IF EXISTS bos_external_experts_category_check;

ALTER TABLE bos_external_experts
  ADD CONSTRAINT bos_external_experts_category_check
    CHECK (category IN (
      'university_nominee',
      'subject_expert',
      'industry_expert',
      'alumni',
      'startup'
    ));

COMMIT;
