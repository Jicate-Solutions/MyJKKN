-- ============================================================================
-- Migration: 20260624_hr_termination_workflow
-- Phase: HR Module — T6.3 Termination Workflow (Wave 4-B)
-- ============================================================================
-- T6.3 layers a Director-approved termination workflow on top of the
-- hr_offboarding_cases substrate (PR #890 + #920 + #925).
--
-- Termination is the most-sensitive separation flavour:
--   - Director-initiated (not staff-initiated, unlike resignation)
--   - Requires a documented basis (grounds > 20 chars, link to disciplinary
--     case when available)
--   - Walks a multi-step approval chain: SEDC -> Legal -> Director sign-off
--   - Optional waiver of the notice period (recorded for audit)
--
-- We DO NOT create a parallel hr_terminations table. The substrate is
-- intentionally one-table-per-staff-exit (hr_offboarding_cases) with a
-- separation_type discriminator. T6.3 extends the row with the four columns
-- the termination flavour needs and nothing more.
--
-- TIER-0 safe-additive. No destructive DDL. ALTER ... ADD COLUMN IF NOT
-- EXISTS guards every column. Idempotent re-run safe.
--
-- Companion app code:
--   - lib/services/hr/termination-service.ts
--   - app/(routes)/admin/hr/terminations/page.tsx            list
--   - app/(routes)/admin/hr/terminations/[id]/initiate/...   Director init form
--   - app/(routes)/admin/hr/terminations/[id]/review/...     SEDC + Legal + Dir
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. termination_approval_chain — multi-step approval state (JSONB)
-- ----------------------------------------------------------------------------
-- Shape (typed in TS as TerminationApprovalChain):
--   [
--     { step: 'sedc',     approver_id: 'uuid', status: 'pending'|'approved'|'rejected',
--       acted_at: 'iso?', notes: 'text?' },
--     { step: 'legal',    approver_id: 'uuid', status: 'pending'|'approved'|'rejected', ... },
--     { step: 'director', approver_id: 'uuid', status: 'pending'|'approved'|'rejected', ... }
--   ]
--
-- Default is an empty array so existing non-termination rows aren't affected.
-- T6.3 service populates 3 rows on initiation; status flips as each approver
-- signs off (or rejects, which closes the case).
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS termination_approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hr_offboarding_cases.termination_approval_chain IS
  'T6.3 — Ordered approval chain for separation_type=termination. Array of {step, approver_id, status, acted_at, notes}. Empty array for non-termination separations.';

-- ----------------------------------------------------------------------------
-- 2. legal_review_status — denormalised status for fast list filtering
-- ----------------------------------------------------------------------------
-- The Legal step's status lives in termination_approval_chain[*].status too;
-- this column is a top-level mirror so admin list views can filter without
-- jsonb_path queries. Service keeps the two in sync on every chain mutation.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS legal_review_status TEXT;

-- Drop+recreate so re-runs don't duplicate the constraint.
ALTER TABLE hr_offboarding_cases
  DROP CONSTRAINT IF EXISTS hr_offboarding_cases_legal_review_status_check;
ALTER TABLE hr_offboarding_cases
  ADD CONSTRAINT hr_offboarding_cases_legal_review_status_check
  CHECK (
    legal_review_status IS NULL
    OR legal_review_status IN ('pending','approved','rejected','not_required')
  );

COMMENT ON COLUMN hr_offboarding_cases.legal_review_status IS
  'T6.3 — Top-level mirror of the legal-step status from termination_approval_chain for fast list filtering. NULL for non-termination cases.';

-- ----------------------------------------------------------------------------
-- 3. termination_grounds — narrative basis (CHECK length > 20 chars)
-- ----------------------------------------------------------------------------
-- Forces the Director to commit a documented basis at initiation. The CHECK
-- accepts NULL for non-termination rows; non-NULL rows must have length > 20
-- chars to discourage one-word entries like "misconduct" with no context.
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS termination_grounds TEXT;

ALTER TABLE hr_offboarding_cases
  DROP CONSTRAINT IF EXISTS hr_offboarding_cases_termination_grounds_check;
ALTER TABLE hr_offboarding_cases
  ADD CONSTRAINT hr_offboarding_cases_termination_grounds_check
  CHECK (
    termination_grounds IS NULL
    OR char_length(termination_grounds) > 20
  );

COMMENT ON COLUMN hr_offboarding_cases.termination_grounds IS
  'T6.3 — Documented basis for a termination. NULL for non-termination separations; required (>20 chars) when separation_type=termination. Auto-populated from hr_disciplinary_cases when a case_id is supplied at initiation.';

-- ----------------------------------------------------------------------------
-- 4. notice_period_waived — boolean flag, audit trail in metadata.jsonb
-- ----------------------------------------------------------------------------
ALTER TABLE hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS notice_period_waived BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN hr_offboarding_cases.notice_period_waived IS
  'T6.3 — True if the Director waived the contractual notice period at termination initiation. Default false. Detailed reason lives in metadata.termination_notice_waiver_reason.';

-- ----------------------------------------------------------------------------
-- 5. Indexes for the termination-only list view
-- ----------------------------------------------------------------------------
-- Partial indexes — only rows where separation_type='termination' participate.
-- Keeps the table-size impact near zero for institutions with mostly
-- resignation/retirement rows.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_offboarding_cases_termination_legal_status
  ON hr_offboarding_cases (legal_review_status)
  WHERE separation_type = 'termination';

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_cases_termination_institution
  ON hr_offboarding_cases (institution_id, status)
  WHERE separation_type = 'termination';

-- ----------------------------------------------------------------------------
-- 6. Verification — column + constraint existence checks (SELECT-only)
-- ----------------------------------------------------------------------------
-- No INSERT smoke test (per memory:
-- feedback_smoke_test_must_include_all_not_null_columns) — table has multiple
-- NOT NULL columns that this migration doesn't own and shouldn't have to know
-- about. SELECT-only verification asserts the surface we added is present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  col_count INT;
  constraint_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'hr_offboarding_cases'
    AND column_name IN (
      'termination_approval_chain',
      'legal_review_status',
      'termination_grounds',
      'notice_period_waived'
    );

  IF col_count <> 4 THEN
    RAISE EXCEPTION
      'T6.3 migration verification failed: expected 4 new columns on hr_offboarding_cases, found %.',
      col_count;
  END IF;

  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.check_constraints
  WHERE constraint_name IN (
    'hr_offboarding_cases_legal_review_status_check',
    'hr_offboarding_cases_termination_grounds_check'
  );

  IF constraint_count <> 2 THEN
    RAISE EXCEPTION
      'T6.3 migration verification failed: expected 2 new CHECK constraints, found %.',
      constraint_count;
  END IF;
END $$;
