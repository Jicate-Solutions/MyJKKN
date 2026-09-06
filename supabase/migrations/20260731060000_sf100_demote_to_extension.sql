-- ============================================================================
-- COHORT CORE — SF100 demote to per-team extension (Phase 2.3 · FULL MIGRATION)
-- Created: 2026-07-05  (plan: docs/cohort-core/PLAN.md, PHASE 2.3)
-- ============================================================================
-- WHAT: Make public.cohorts / public.cohort_memberships the CANONICAL cohort
--       spine for SF100, and DEMOTE public.sf100_enrollments to an SF100
--       per-team EXTENSION that is LINKED to its team membership by a single
--       nullable FK column. The 10 SF100 extension tables (sf100_phase_history,
--       sf100_paid_users, sf100_check_ins, sf100_customer_interviews,
--       sf100_pivots, sf100_roster_changes, sf100_exercises, sf100_exercise_
--       responses, sf100_notifications, and the NIF back-links) keep FK-ing to
--       sf100_enrollments.id UNCHANGED — cohort-core is reached in ONE hop:
--       enrollment → cohort_membership_id → membership → cohort.
--
-- WHY A LINK COLUMN, NOT A RE-KEY: every extension already FKs the ONE hub
--       (sf100_enrollments.id). Re-keying to cohort_memberships would mean
--       altering 10 FK columns, rewriting live data, and rewriting every join —
--       a large, atomic, irreversible blast radius. The link column adds ONE
--       nullable column to the ONE hub table; the 10 extensions are untouched,
--       and the change is reversible by dropping one column. This matches the
--       backfill's own reversibility contract (source untouched).
--
-- TIER: TIER-1 (data-touching, ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE).
--
-- NON-DESTRUCTIVE · DROPS DEFERRED (per D3):
--   • DROPs NOTHING. sf100_programs / sf100_enrollments / all 10 extension
--     tables keep every row and every FK. sf100_enrollments.program_id (FK to
--     sf100_programs) stays as a plain bridge so legacy read paths still work
--     if code deploys before this migration is applied.
--   • The eventual DROP of sf100_programs/sf100_enrollments is a SEPARATE
--     follow-up migration, gated on a live-verify that COUNT(*) WHERE
--     cohort_membership_id IS NULL = 0 and Phase 2.3 sign-off.
--
-- ORDERING: filename timestamp (…060000) sorts AFTER the backfill
--   (…050000_cohort_core_sf100_backfill.sql). If this ran first the memberships
--   would not exist yet and every row would stay NULL — STEP 5's self-check then
--   RAISES (aborts) rather than silently leaving the extension half-linked.
-- ============================================================================

-- ── STEP 1: LINK COLUMN — nullable now; NOT NULL deferred (see gotcha below) ──
-- Nullable on purpose: (a) it must be populated by the UPDATE below before any
-- NOT NULL could hold, and (b) a program created AFTER this backfill has no cohort
-- yet, so enrollTeam cannot mint a membership and its enrollments stay NULL until a
-- later backfill re-run — NOT NULL would hard-fail them. (At MIGRATION time every
-- existing enrollment DOES link — sf100_programs.institution_id and
-- sf100_enrollments.program_id are both NOT NULL — which is why STEP 5 can safely
-- abort on any remaining NULL.) Defer NOT NULL to a later follow-up that first
-- proves COUNT(*) WHERE cohort_membership_id IS NULL = 0.
ALTER TABLE public.sf100_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;

-- ── STEP 2: FK — ON DELETE SET NULL (this is a LINK, not identity) ────────────
-- SET NULL (never CASCADE): deleting a membership must NEVER cascade-delete the
-- live SF100 extension row. Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so
-- guard on pg_constraint for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'sf100_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.sf100_enrollments'::regclass
  ) THEN
    ALTER TABLE public.sf100_enrollments
      ADD CONSTRAINT sf100_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── STEP 3: reverse-lookup index (membership → enrollment) ────────────────────
CREATE INDEX IF NOT EXISTS idx_sf100_enrollments_cohort_membership
  ON public.sf100_enrollments (cohort_membership_id);

-- ── STEP 4: POPULATE — attach each enrollment to its team membership ──────────
-- Scope through the parent cohort (kind='sf100') AND member_type='team', NOT
-- member_ref alone: member_ref is an untyped uuid; scoping by kind+type plus the
-- backfill's UNIQUE(cohort_id, member_type, member_ref) guarantees exactly one
-- deterministic membership per enrollment. ALSO assert the membership's cohort
-- maps to the enrollment's OWN program (config->>'sf100_program_id' =
-- e.program_id) — member_ref is only unique WITHIN a cohort, so this program-
-- agreement predicate makes the link provably consistent with the backfill's
-- STEP-2 mapping key and rules out any cross-program member_ref collision.
-- `IS DISTINCT FROM` makes re-runs a no-op (idempotent).
UPDATE public.sf100_enrollments e
SET cohort_membership_id = m.id
FROM public.cohort_memberships m
JOIN public.cohorts c
  ON c.id   = m.cohort_id
 AND c.kind = 'sf100'
WHERE m.member_type = 'team'
  AND m.member_ref  = e.id
  AND c.config->>'sf100_program_id' = e.program_id::text
  AND e.cohort_membership_id IS DISTINCT FROM m.id;

-- ── STEP 5: self-check — ABORT if any enrollment is left unlinked ──────────────
-- sf100_programs.institution_id and sf100_enrollments.program_id are BOTH NOT NULL,
-- so the backfill maps EVERY program to a cohort and EVERY enrollment to a team
-- membership (its own STEP 3 RAISE EXCEPTIONs otherwise). There is therefore no
-- legitimate "skipped program" that could leave an enrollment permanently NULL at
-- migration time — any row still unlinked after STEP 4 is a real defect (e.g. this
-- migration ran BEFORE the …050000 backfill). Match the backfill STEP-3 strict
-- discipline and abort rather than continue with a half-linked extension.
DO $$
DECLARE v_unlinked int;
BEGIN
  SELECT COUNT(*) INTO v_unlinked
  FROM public.sf100_enrollments
  WHERE cohort_membership_id IS NULL;
  IF v_unlinked > 0 THEN
    RAISE EXCEPTION 'sf100 demote incomplete: % sf100_enrollment(s) still unlinked to a cohort_membership after STEP 4 (run the …050000 backfill first; institution_id/program_id are NOT NULL so every enrollment must link).', v_unlinked;
  END IF;
  RAISE NOTICE 'sf100 demote: all sf100_enrollments linked to a cohort_membership.';
END $$;

-- Reload PostgREST schema cache so the new column/relationship is queryable.
NOTIFY pgrst, 'reload schema';
