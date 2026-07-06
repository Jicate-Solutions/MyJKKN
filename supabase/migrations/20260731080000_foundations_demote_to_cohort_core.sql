-- ============================================================================
-- COHORT CORE — Foundations demote to cohort core (Phase 3 · D5 · D9)
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 3)
-- Mirrors: 20260731060000_sf100_demote_to_extension.sql (the proven template),
--          adapted for the per-STUDENT (not per-team) Foundations shape.
-- ============================================================================
-- WHAT: Fold Startup-Studio Foundations (Level 0) onto the shared cohort spine.
--       public.cohorts (kind='foundations') becomes the canonical SPINE container
--       for a cohort's roster + lifecycle, and public.cohort_memberships
--       (member_type='student') its roster. ss_foundations_enrollments is DEMOTED
--       to a Foundations per-student EXTENSION, LINKED to its cohort membership by
--       ONE nullable FK column (cohort_membership_id). Reached in one hop:
--       enrollment → cohort_membership_id → membership → cohort.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES **NOT** DO (gotcha #2 — largest blast) ─
--   ss_foundations_cohorts stays the AUTHORITATIVE DOMAIN container. It is NOT
--   dropped and its id is NOT repointed, because TWO extension FKs point at it:
--     • ss_foundations_worksheets.cohort_id  (NULL = canon; non-null = override)
--     • ss_foundations_responses.cohort_id   (the context a worksheet was done in)
--   Dropping/re-keying ss_foundations_cohorts would break those FKs AND the
--   listWorksheets cohort-override mechanism. So the fold is ADDITIVE: the service
--   layer mints a public.cohorts (kind='foundations') MIRROR per ss_foundations_
--   cohort (mapped 1:1 via config->>'ss_foundations_cohort_id') for the spine's
--   roster + lifecycle, while ss_foundations_cohorts remains the FK target the UI,
--   worksheets and responses continue to key off. This exactly mirrors the SF100
--   fold, where sf100_programs stayed authoritative (FK target of sf100_enrollments)
--   and only the roster/lifecycle was repointed to the spine.
--
-- ── EMPTY-TABLE SIMPLIFICATION (the one difference vs the SF100 demote) ──────────
--   ss_foundations_cohorts AND ss_foundations_enrollments are BOTH EMPTY (0 rows,
--   verified 2026-07-06). So — unlike SF100 — there is:
--     • NO companion backfill migration (…050000-style) to run first,
--     • NO UPDATE populate step (nothing to attach), and
--     • NO self-check RAISE EXCEPTION (0 rows ⇒ 0 unlinked ⇒ the abort could never
--       fire, and there is no backfill for it to gate on). A NOTICE is emitted.
--   All future rows are linked FORWARD at enroll-time by the service layer
--   (lib/services/startup-studio/foundations-service.ts::enroll), which lazily
--   mints the cohorts mirror + the 'student' membership, back-links the enrollment,
--   and appends an 'enrolled' status event — so this table never needs a backfill.
--
-- TIER: TIER-1 shape, but effectively additive-only (0 rows to touch).
--       ADDITIVE · IDEMPOTENT · NON-DESTRUCTIVE (DROPS NOTHING).
-- ============================================================================

-- ── STEP 1: LINK COLUMN — nullable (matches SF100; no NOT NULL) ───────────────
-- Nullable on purpose: (a) a Foundations cohort created before its cohorts mirror
-- exists has no membership yet, and (b) legacy/self-enrol rows written before the
-- forward-wired service deploys stay NULL until re-linked. Never promote to
-- NOT NULL without first proving COUNT(*) WHERE cohort_membership_id IS NULL = 0
-- in a follow-up (there is no data today, so the promotion is trivially safe later).
ALTER TABLE public.ss_foundations_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;

-- ── STEP 2: FK — ON DELETE SET NULL (this is a LINK, not identity) ────────────
-- SET NULL (never CASCADE): deleting a membership must NEVER cascade-delete the
-- live Foundations enrollment row (which owns responses via student_id). Postgres
-- has no `ADD CONSTRAINT IF NOT EXISTS`, so guard on pg_constraint for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ss_foundations_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.ss_foundations_enrollments'::regclass
  ) THEN
    ALTER TABLE public.ss_foundations_enrollments
      ADD CONSTRAINT ss_foundations_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── STEP 3: reverse-lookup index (membership → enrollment) ────────────────────
-- Name is distinct from the substrate's existing idx_ssf_enroll_cohort /
-- idx_ssf_enroll_student — no collision.
CREATE INDEX IF NOT EXISTS idx_ssf_enroll_cohort_membership
  ON public.ss_foundations_enrollments (cohort_membership_id);

-- ── STEP 4: D9 — the Foundations member links a real student profile ──────────
-- cohort_memberships.member_ref is a POLYMORPHIC untyped uuid (team|student|
-- learner|staff), so a SQL CHECK cannot cross-table-verify it points at a real
-- profiles row — the equality "member_ref == student_id" is SERVICE-enforced
-- (foundations-service.ts::enroll sets member_ref := studentId and rejects a
-- student_id that does not resolve to a profile, returning a clean 400).
-- The DB-side half of D9 is structurally guaranteed upstream: for member_type=
-- 'student', member_ref MUST equal the enrollment's student_id, which is itself
-- `NOT NULL REFERENCES profiles(id)`. We add an EXPLICIT idempotent CHECK that the
-- identity column is non-null as the audit-trail signal of that guarantee (mirrors
-- the SF100 sf100_roster_changes_identity_required guard). Safe: student_id is
-- already NOT NULL and the table has 0 rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ss_foundations_enrollments_student_required'
      AND conrelid = 'public.ss_foundations_enrollments'::regclass
  ) THEN
    ALTER TABLE public.ss_foundations_enrollments
      ADD CONSTRAINT ss_foundations_enrollments_student_required
      CHECK (student_id IS NOT NULL);
  END IF;
END $$;

-- ── STEP 5: SELF-ENROL RLS carve-out on cohort_memberships (gotcha #1) ────────
-- The self-enrol POST (…/foundations/enrollments/my) runs RLS-scoped AS THE
-- STUDENT (withAuth injects the user's session client — never service-role). The
-- spine's cohort_memberships_insert_permission requires user_has_permission
-- ('cohort.create'), which a student does NOT hold, so mirroring their membership
-- would silently 403 the roster half of a self-enrol. This permissive INSERT
-- policy OR-adds a narrow self-insert path — mirroring the existing
-- ssf_responses_insert `submitted_by = auth.uid()` self-policy — scoped to:
--   • member_type='student' AND member_ref = the caller's own uid, AND
--   • the parent cohort is kind='foundations' (never a sf100/cdc/trainer cohort), AND
--   • a non-terminal starting status (graduation stays MENTOR-gated, D5 — a student
--     cannot self-insert a 'graduated' membership).
-- The facilitator-add path is unaffected (it inserts member_ref = the enrolled
-- student, not the caller, so it still runs under the standard cohort.create path).
DROP POLICY IF EXISTS cohort_memberships_foundations_self_insert ON public.cohort_memberships;
CREATE POLICY cohort_memberships_foundations_self_insert ON public.cohort_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    member_type = 'student'
    AND member_ref = (select auth.uid())
    AND status IN ('invited', 'enrolled', 'active')
    AND EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.id = cohort_memberships.cohort_id
        AND c.kind = 'foundations'
    )
  );

-- ── STEP 5b: dedupe guard for the Foundations spine mirror (race + compounding) ─
-- ensureFoundationsCohortMirror() does look-up-then-INSERT on public.cohorts keyed by
-- config->>'ss_foundations_cohort_id'. With no DB uniqueness, two concurrent first-enrols
-- could each miss the lookup and both INSERT, minting DUPLICATE kind='foundations' mirrors —
-- after which every later enrol's single-row lookup errors on multiple rows and mints yet
-- another, fragmenting the spine roster indefinitely. This partial unique index makes the
-- 1:1 mapping a DB invariant: the loser of the race gets a clean 23505, which the service
-- catches and recovers from by re-selecting the winner. Partial (WHERE kind='foundations')
-- so it never constrains sf100/cdc/trainer cohorts. Safe on 0 rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohorts_foundations_ss_id
  ON public.cohorts ((config->>'ss_foundations_cohort_id'))
  WHERE kind = 'foundations';

-- ── STEP 6: POPULATE — INTENTIONALLY OMITTED (empty table) ────────────────────
-- ss_foundations_enrollments has 0 rows, so there is nothing to attach and no
-- backfill migration to depend on. The SF100 template's UPDATE + self-check RAISE
-- are deliberately replaced by this NOTICE. (If this table ever gains rows BEFORE
-- the forward-wired enroll service ships, add a one-off backfill that mirrors the
-- SF100 …050000 pattern: mint public.cohorts kind='foundations' per
-- ss_foundations_cohort, then a member_type='student' membership per enrollment,
-- then UPDATE cohort_membership_id — and re-introduce the abort self-check.)
DO $$
DECLARE v_rows int;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM public.ss_foundations_enrollments;
  IF v_rows = 0 THEN
    RAISE NOTICE 'Foundations demote: ss_foundations_enrollments is empty — link column + D9 check added, no populate needed. Forward rows link at enroll-time.';
  ELSE
    RAISE NOTICE 'Foundations demote: % pre-existing enrollment row(s) present and left UNLINKED (cohort_membership_id IS NULL). Run a Foundations backfill before promoting the column to NOT NULL.', v_rows;
  END IF;
END $$;

-- Reload PostgREST schema cache so the new column/relationship/policy is queryable.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FORWARD WIRING (service layer — NOT this migration; documented here as the
-- contract this column + policy exist to serve). See
-- lib/services/startup-studio/foundations-service.ts.
--
-- ENROLL (mints the cohort-core link for every NEW enrollment):
--   1. Ensure a public.cohorts row of kind='foundations' mirrors the
--      ss_foundations_cohort. Map 1:1 via config->>'ss_foundations_cohort_id';
--      look it up, INSERT if absent (institution_id copied from
--      ss_foundations_cohorts.institution_id — NOT NULL, closes the
--      role_has_institution_access(NULL) tenant hole). enrollment_mode +
--      lead_mentor_id go to cohorts.config (lead_mentor_id is an ss_mentors(id),
--      NOT a profiles(id), so it must NOT go in owner_id).
--   2. UPSERT a cohort_membership:
--        { cohort_id: <mirror>, member_type: 'student',
--          member_ref: <ss_foundations_enrollments.student_id>,   -- D9
--          status: 'enrolled' }
--      (UNIQUE(cohort_id, member_type, member_ref) makes this idempotent.)
--   3. UPDATE ss_foundations_enrollments SET cohort_membership_id = <membership.id>.
--   4. Append cohort_status_events { membership_id, event_type:'enrolled',
--      to_status:'enrolled', actor_id }.  (best-effort — needs cohort.edit)
--
-- WITHDRAW: also flips the linked membership status → 'removed' (best-effort).
--
-- ── D5 COMPLETION — mentor sign-off ⇒ membership status 'graduated' ──────────
--   Foundations completion is per-student-GLOBAL (#12), evaluated at the
--   graduation threshold fn_get_policy_int('startup_studio.foundations_graduation_pct', 80).
--   D5 says a MENTOR SIGN-OFF is the trigger that promotes the membership.
--   foundations-service.ts::signOffGraduation():
--     • asserts required-worksheet completion % >= threshold (getProgress), then
--     • marks ss_foundations_enrollments.status='completed' (authoritative), then
--     • best-effort UPDATE public.cohort_memberships SET status='graduated'
--         WHERE id = <enrollment.cohort_membership_id> AND status <> 'graduated';
--     • appends cohort_status_events { event_type:'graduated', to_status:'graduated',
--         actor_id:<mentor> }.
--   'graduated' is the terminal happy-path value already in the membership CHECK
--   (invited→enrolled→active→graduated|removed|paused) — no new status invented.
--   Route: POST …/foundations/enrollments/[id]/complete, gated by
--   startup_studio.foundations.review (mentor/coordinator), NOT self-serve.
--
-- ── D9 GUARD — a foundations member that links a student profile MUST have one ─
--   For member_type='student', member_ref = the enrollment's student_id (a real
--   profiles(id)), distinct from SF100 where a team member's ref = the enrollment
--   id. enroll() resolves student_id → profiles and REJECTS (clean 400) an id that
--   does not resolve, so no path mints a 'student' membership with a stray/foreign
--   ref. The routes translate that .status=400 into an HTTP 400 (not a masked 500).
-- ============================================================================
