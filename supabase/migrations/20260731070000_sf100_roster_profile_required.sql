-- ============================================================================
-- Migration: SF100 roster members must be profile-linked  (Cohort Core — D9)
-- Date: 2026-07-06
-- Branch: feat/sf100-full-migration  ·  PR #1814  ·  PR-STAGED (NOT applied)
-- ============================================================================
-- D9 (docs/cohort-core/PLAN.md): every cohort member is an EXISTING MyJKKN user,
-- so a roster member's identity MUST resolve to a real profile — either a
-- `profiles` row (profile_id) or a `learners_profiles` row (learner_id).
-- Free-text-only members (an email/full_name with BOTH identity links NULL) are
-- disallowed. `email`/`full_name` remain a DISPLAY cache; the identity columns
-- are the source of truth.
--
-- WHY THIS IS SAFE TO ADD:
--   * `sf100_roster_changes` has 0 rows today (no legacy NULL/NULL rows to break).
--   * The ONLY write path that INSERTs into this table —
--     SF100Service.requestRosterChange (lib/services/startup-studio/sf100-service.ts)
--     — was updated in this same PR to RESOLVE the member's identity
--     (explicit DTO → existing event_team_members row → directory lookup by email)
--     and to REJECT (400) when neither profile_id nor learner_id can be resolved.
--     No code path can therefore reach this INSERT with both identity links NULL,
--     so the CHECK below can never break a live insert.
--   * There are no DB-side seeds, triggers, or bulk-import writers for this table.
--
-- IDEMPOTENT: Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the ADD is guarded
-- on pg_constraint. Additive; drops nothing.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'sf100_roster_changes_identity_required'
      AND conrelid = 'public.sf100_roster_changes'::regclass
  ) THEN
    ALTER TABLE public.sf100_roster_changes
      ADD CONSTRAINT sf100_roster_changes_identity_required
      CHECK (profile_id IS NOT NULL OR learner_id IS NOT NULL);
  END IF;
END $$;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
