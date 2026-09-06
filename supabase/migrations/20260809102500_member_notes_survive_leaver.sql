-- ============================================================================
-- MEMBER NOTES SURVIVE A LEAVER — with the author's name still on them.
--
-- Created: 2026-08-05. Version 20260809102500 was allocated to this change.
--
-- *** FILE ONLY — NOT APPLIED to any database. ***
-- Nothing here has been run against production, not even inside a
-- BEGIN..ROLLBACK. Apply is Director-gated. Recorded identically in
-- supabase/SQL_FILE_INDEX.md.
--
-- ── THE DECISION ────────────────────────────────────────────────────────────
--   Director decision 7: "Member notes survive a leaver, with the author's name
--   on them. The record does not change because someone left."
--
-- ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
--   The decision was believed already satisfied. It is not. Read back from the
--   live catalogue on 2026-08-05:
--
--     accreditation_meeting_member_notes
--       (id, meeting_id, author_user_id, note_text, institution_id,
--        created_at, updated_at)
--     accreditation_meeting_member_notes_author_user_id_fkey
--       FOREIGN KEY (author_user_id) REFERENCES profiles(id) ON DELETE CASCADE
--
--   Both halves of the decision fail on that shape:
--     * CASCADE — deleting a departing member's profile DELETES their notes.
--       The record does change because someone left; it disappears.
--     * No stored name — even if the row survived, there is nothing to
--       attribute it to. The panel resolves the author by joining profiles at
--       read time, and after the profile is gone that join returns nothing.
--
--   20260809101600's own header states the CASCADE choice openly ("what
--   disappears is the raw personal note of a person who no longer exists") and
--   invited a reviewer to disagree. The Director did. This file is that
--   disagreement, applied.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
--   1. author_name / author_email — a SNAPSHOT of the author, taken at write
--      time by the existing stamp trigger. These exist PRECISELY so attribution
--      outlives the profile row, so nothing may resolve them by joining
--      profiles at read time; a read-time join is the failure mode being fixed.
--   2. A backfill of that snapshot for every row already written, reporting the
--      row count it touched.
--   3. author_user_id becomes nullable and its FK becomes ON DELETE SET NULL.
--      The note row outlives the person.
--   4. The write path stamps the snapshot — by extending the EXISTING
--      fn_accreditation_meeting_note_stamp_institution() trigger function, not
--      by adding a parallel mechanism beside it.
--
-- ── WHAT THIS DELIBERATELY DOES NOT CHANGE ──────────────────────────────────
--   No policy is created, dropped or altered. The four policies from
--   20260809101600 keep working, and an orphaned note stays readable by exactly
--   the people who need it — see the §5 guard, which refuses to apply if that
--   ceases to be true.
--
--   No permission is granted to any role. Same reasoning as 20260809101600:
--   that is a Role Management decision, not something a migration smuggles in.
-- ============================================================================

-- ── 1) The snapshot columns ─────────────────────────────────────────────────
-- Nullable on purpose: a row written before this migration has no snapshot
-- until §2 backfills it, and a NOT NULL added here would fail on those rows.
ALTER TABLE public.accreditation_meeting_member_notes
  ADD COLUMN IF NOT EXISTS author_name  text,
  ADD COLUMN IF NOT EXISTS author_email text;

COMMENT ON COLUMN public.accreditation_meeting_member_notes.author_name IS
  'Snapshot of the author''s name, taken at write time by '
  'fn_accreditation_meeting_note_stamp_institution(). Deliberately denormalised: '
  'it is what attributes the note after the profile row is gone, so readers MUST '
  'NOT re-resolve it by joining profiles.';
COMMENT ON COLUMN public.accreditation_meeting_member_notes.author_email IS
  'Snapshot of the author''s email at write time. Same reasoning as author_name; '
  'it is the fallback label when the name was blank.';
COMMENT ON COLUMN public.accreditation_meeting_member_notes.author_user_id IS
  'Nullable since 20260809102500. NULL means the author has left the platform '
  'and their profile row was deleted; the note and its author_name snapshot '
  'remain. Never re-use a NULL here to mean "anonymous".';

-- ── 2) Backfill the snapshot for rows already written ───────────────────────
-- Runs while every author_user_id is still NOT NULL, i.e. before §3 relaxes the
-- FK, so nothing needs a fallback branch here.
DO $backfill$
DECLARE
  v_rows bigint;
BEGIN
  UPDATE public.accreditation_meeting_member_notes n
     SET author_name  = NULLIF(btrim(COALESCE(p.full_name, '')), ''),
         author_email = NULLIF(btrim(COALESCE(p.email, '')), '')
    FROM public.profiles p
   WHERE p.id = n.author_user_id
     AND (n.author_name IS NULL AND n.author_email IS NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RAISE NOTICE 'member-notes snapshot backfill: % row(s) stamped from profiles', v_rows;

  -- Rows whose author cannot be resolved would silently ship with no
  -- attribution at all. Say so rather than letting it pass unremarked.
  SELECT count(*) INTO v_rows
    FROM public.accreditation_meeting_member_notes
   WHERE author_name IS NULL AND author_email IS NULL;
  IF v_rows > 0 THEN
    RAISE WARNING 'member-notes snapshot backfill: % row(s) still carry no author snapshot (no matching profiles row)', v_rows;
  END IF;
END
$backfill$;

-- ── 3) The note outlives the profile ────────────────────────────────────────
-- SET NULL requires a nullable column, so the NOT NULL goes first.
--
-- The UNIQUE (meeting_id, author_user_id) constraint is untouched and stays the
-- ON CONFLICT target the UI upserts on. NULLs are distinct in a UNIQUE index,
-- so several departed members' notes coexist on one sitting — which is the
-- wanted behaviour, and the upsert path only ever supplies a non-NULL author.
ALTER TABLE public.accreditation_meeting_member_notes
  ALTER COLUMN author_user_id DROP NOT NULL;

ALTER TABLE public.accreditation_meeting_member_notes
  DROP CONSTRAINT IF EXISTS accreditation_meeting_member_notes_author_user_id_fkey;

ALTER TABLE public.accreditation_meeting_member_notes
  ADD CONSTRAINT accreditation_meeting_member_notes_author_user_id_fkey
  FOREIGN KEY (author_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 4) The write path stamps the snapshot ───────────────────────────────────
-- The EXISTING stamp trigger is extended. Its trigger definition
-- (BEFORE INSERT OR UPDATE OF meeting_id) is deliberately left alone, and that
-- matters twice over:
--   * a member revising note_text does not re-stamp, so the snapshot stays the
--     one taken when they wrote it; and
--   * the UPDATE that ON DELETE SET NULL performs touches author_user_id only,
--     which is not in the trigger's column list, so the departure cannot fire
--     this function and cannot erase the snapshot it is meant to preserve.
-- The ELSE branch below is belt-and-braces for the same hazard.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_note_stamp_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
  v_full_name   text;
  v_email       text;
  v_resolved    boolean := false;
BEGIN
  SELECT m.institution_id
    INTO v_institution
    FROM public.accreditation_committee_meetings m
   WHERE m.id = NEW.meeting_id;

  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'meeting_member_note: meeting % does not exist', NEW.meeting_id;
  END IF;

  NEW.institution_id := v_institution;

  IF NEW.author_user_id IS NOT NULL THEN
    SELECT p.full_name, p.email
      INTO v_full_name, v_email
      FROM public.profiles p
     WHERE p.id = NEW.author_user_id;
    v_resolved := FOUND;
  END IF;

  IF v_resolved THEN
    -- Authoritative, exactly like institution_id: read from the profile here,
    -- never accepted from the client, so a caller cannot file an account under
    -- somebody else's name.
    NEW.author_name  := NULLIF(btrim(COALESCE(v_full_name, '')), '');
    NEW.author_email := NULLIF(btrim(COALESCE(v_email, '')), '');
  ELSE
    -- No profile to read from. Keep whatever snapshot the row already carries
    -- rather than blanking the one piece of attribution that survives.
    NEW.author_name  := NULLIF(btrim(COALESCE(NEW.author_name, '')), '');
    NEW.author_email := NULLIF(btrim(COALESCE(NEW.author_email, '')), '');
  END IF;

  RETURN NEW;
END;
$$;
-- A trigger function is never called directly; the revoke is belt-and-braces
-- against Supabase's ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE TO anon, and is
-- re-asserted here because CREATE OR REPLACE is a fresh grant surface.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_stamp_institution() FROM anon, PUBLIC;

-- ── 5) An orphaned note nobody can read defeats the whole point ─────────────
-- No policy is changed here, because none needs to be. The live SELECT policy is
--
--   author_user_id = auth.uid()
--   OR public.fn_accreditation_meeting_note_can_read_all(meeting_id)
--
-- With author_user_id NULL the first clause evaluates to NULL — never TRUE, so
-- no orphaned note leaks to a member it did not belong to — and the second
-- still admits the committee Chairman, the Coordinator, admins, and holders of
-- accreditation.naac.committees.meetings.manage within their institution scope.
-- Those are exactly the people who compile the minutes, which is what the note
-- has to survive FOR.
--
-- That reasoning is load-bearing, so it is asserted rather than trusted: if the
-- policy is ever renamed or rewritten without the can_read_all clause, this
-- migration refuses instead of quietly producing unreadable orphans. The check
-- is scoped to this one table and this one policy, so it cannot become
-- permanently unsatisfiable for a reason unrelated to what it protects.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'accreditation_meeting_member_notes'
       AND cmd        = 'SELECT'
       AND qual LIKE '%fn_accreditation_meeting_note_can_read_all%'
  ) THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: no SELECT policy on accreditation_meeting_member_notes consults fn_accreditation_meeting_note_can_read_all. Once author_user_id can be NULL, that clause is the ONLY thing that keeps a departed member''s note readable by the Chairman/Coordinator who compiles the minutes.';
  END IF;
END
$guard$;

-- ============================================================================
-- Verification — run AFTER a Director-approved apply.
--
-- -- a) both snapshot columns exist and author_user_id is nullable
-- SELECT column_name, is_nullable, data_type
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'accreditation_meeting_member_notes'
--   AND  column_name IN ('author_user_id', 'author_name', 'author_email');
--
-- -- b) the FK says SET NULL, not CASCADE
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM   pg_constraint
-- WHERE  conrelid = 'public.accreditation_meeting_member_notes'::regclass
--   AND  contype = 'f';
--
-- -- c) the stamp function is still locked away from anon
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public'
--   AND  p.proname = 'fn_accreditation_meeting_note_stamp_institution';
--
-- -- d) BEHAVIOURAL — this is the decision, and it is the only check that tests
-- --    it. Objects can verify perfectly while the behaviour is broken. Inside
-- --    BEGIN ... ROLLBACK on a throwaway cluster (never production):
-- --      1. insert a note as a real member; confirm author_name is stamped and
-- --         matches that member's profiles.full_name;
-- --      2. DELETE that member's profiles row;
-- --      3. re-read the note: the ROW MUST STILL EXIST, author_user_id must be
-- --         NULL, and author_name must still read the departed member's name;
-- --      4. as the committee Chairman (mint a session, do not use service_role)
-- --         read the sitting's notes and confirm the orphaned row is among them;
-- --      5. as an unrelated ordinary member of the same committee, confirm the
-- --         orphaned row is NOT among the rows they read.
-- --    Step 3 failing to return a row is the exact defect this file fixes; a
-- --    check that only looks at the column list would pass while it does.
-- ============================================================================
