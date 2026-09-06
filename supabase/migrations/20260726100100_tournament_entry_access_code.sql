-- ============================================================================
-- Tournament entry ACCESS CODE + school-directory link  (Section 1)
-- Events/Tournament go-live build.
--
-- WHY:
--   1. access_code — a short, human-friendly 6-char code stamped on every
--      tournament entry at registration time so a registrant (especially an
--      EXTERNAL, non-JKKN one who never logs in) can later check their results
--      and passes with just this code. Generated SERVER-SIDE in
--      app/api/events/tournament/[eventId]/public-register/route.ts using an
--      unambiguous uppercase alphabet (no O/0/I/1) with retry-on-collision.
--   2. institution_school_id — when an external registrant PICKS their school
--      from the existing global School Master directory (school_master) instead
--      of free-typing, we keep institution_name as the human label AND record
--      the picked directory row's id here. institution_id is NOT usable for this
--      (it FKs to public.institutions — a JKKN institution — while a
--      school_master row is an external school), so this is a separate nullable
--      FK. Free-typed / unlisted schools leave this NULL and keep only the name.
--
-- Both changes are additive and safe to run on a populated table (all existing
-- rows get NULLs).
--
-- ⚠️ NOT APPLIED to any database by this PR — ships as a migration file only.
--    The orchestrator/human applies it (before/with the code deploy) so the
--    public-register route can write access_code. The route degrades gracefully
--    (returns access_code: null, registration still succeeds) if the column is
--    not yet present, so a code-before-migration deploy will not break signups.
-- ============================================================================

-- 1. access_code -------------------------------------------------------------
ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS access_code TEXT;

COMMENT ON COLUMN public.tournament_entries.access_code IS
  '6-char uppercase login-free code (alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789, '
  'no O/0/I/1) a registrant uses to check results & passes. Generated '
  'server-side on public registration with retry-on-collision.';

-- Unique across all NON-NULL codes. Partial index so legacy rows (access_code
-- NULL) never collide with one another.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_entries_access_code
  ON public.tournament_entries (access_code)
  WHERE access_code IS NOT NULL;

-- 2. institution_school_id (School Master directory link) --------------------
ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS institution_school_id UUID
    REFERENCES public.school_master(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tournament_entries.institution_school_id IS
  'Optional link to the global School Master directory row an EXTERNAL '
  'registrant picked. institution_name still holds the display label. NULL '
  'when the school was free-typed / not in the directory.';
