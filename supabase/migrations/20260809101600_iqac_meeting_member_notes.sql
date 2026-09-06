-- ============================================================================
-- IQAC MEETING — MEMBER NOTES. Each committee member writes their OWN account
-- of a sitting; the Chairman / Coordinator reads every account side by side and
-- compiles them into the official minutes.
--
-- Created: 2026-08-04.  Version 20260809101600 was allocated to this change.
--
-- *** FILE ONLY — NOT APPLIED to any database. ***
-- Nothing in this file has been run against production, not even inside a
-- rollback. Apply is Director-gated. Recorded identically in
-- supabase/SQL_FILE_INDEX.md — if that tracker and this header ever disagree,
-- the tracker is the one to fix, because a header claiming APPLIED beside a
-- tracker claiming NOT APPLIED is exactly the defect a reviewer caught on this
-- repo on 2026-08-04.
--
-- ── THE GAP (measured live on prod 2026-08-04) ──────────────────────────────
--   accreditation_committee_meetings has ONE minutes_summary text column and
--   nothing else. There is no per-member surface at all:
--     * 1 committee, 1 member row, 2 meetings, 0 meetings with any minutes text.
--     * The only writer of minutes_summary is CommitteeMeetingService.closeMeeting
--       — one person, one box, at close time.
--   So "several members each write their own account, the Coordinator compiles"
--   is not merely unbuilt, it has nowhere to be stored. This migration adds the
--   store; the compile step stays a human action in the UI and still lands in
--   the SAME minutes_summary column, so every downstream reader (the NAAC 7.3.e
--   rollup, the Control Tower, the minuted-meeting view) is untouched.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--   1. accreditation_meeting_member_notes — one row per (meeting, author).
--   2. A BEFORE trigger that DERIVES institution_id from the parent meeting, so
--      a client never supplies it and cannot file a note under a college it
--      does not belong to.
--   3. Two STABLE SECURITY DEFINER predicates used by the policies. They exist
--      because the policies must consult accreditation_committee_meetings /
--      _committees / _members, and those tables are themselves RLS-protected by
--      accreditation.naac.committees.view — a plain member does not hold that
--      key, so an inline EXISTS(...) would silently evaluate FALSE and lock a
--      member out of their OWN note. A SECURITY DEFINER predicate reads the
--      parent rows as owner and answers the membership question honestly.
--      Neither takes a caller-supplied "acting user" — both derive the caller
--      from auth.uid(), so there is no IDOR to pass.
--   4. Four policies: a member reads/writes ONLY their own note; the committee
--      Chairman / Coordinator and admins read ALL notes for meetings of their
--      own institution.
--
-- ── POLICY STYLE ────────────────────────────────────────────────────────────
--   The is_super_admin() OR is_admin() OR (user_has_permission(...) AND
--   role_has_institution_access(...)) shape is lifted from the live policies on
--   accreditation_committee_members / _meetings (read back from pg_policies on
--   2026-08-04), and the permission family is the GRANTABLE
--   accreditation.naac.committees.* one — the same realignment
--   20260808210001 made. The self-scoped `author_user_id = auth.uid()` clause
--   mirrors the existing accreditation_metric_narratives SELECT policy.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
--   No permission is granted to any role here. Measured live 2026-08-04, only
--   `accreditation_officer` and `ceo` hold accreditation.naac.committees.view,
--   and the committee detail page gates on it — so an ordinary member cannot
--   reach the page that hosts their notes box yet. Granting .view to member-
--   bearing roles is a Director decision in Role Management, not something a
--   migration should smuggle in. The table's own RLS is written so that the
--   moment the page is reachable, a member's self-read/self-write works with no
--   further DB change.
--
-- ── FK CHOICE, stated so a reviewer can disagree ────────────────────────────
--   author_user_id is NOT NULL (the self-read policy has nothing to compare
--   against otherwise) and therefore CASCADEs on profile delete. The compiled
--   OFFICIAL record lives in accreditation_committee_meetings.minutes_summary
--   and survives independently; what disappears is the raw personal note of a
--   person who no longer exists on the platform — which no longer satisfies its
--   own self-read policy in any case. This does add one more table to the
--   profile→auth CASCADE set.
-- ============================================================================

-- ── 1) The store ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accreditation_meeting_member_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid NOT NULL
                   REFERENCES public.accreditation_committee_meetings(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL
                   REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_text      text NOT NULL DEFAULT '',
  -- Derived by the trigger below from the parent meeting; never client-supplied.
  -- Present so admin reads can be institution-scoped without a join, matching
  -- every other accreditation table.
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One account per member per sitting. This is also the ON CONFLICT target the
  -- UI upserts on, and the two must match exactly (a mismatched target raises
  -- 42P10 at runtime, not at deploy time).
  CONSTRAINT accreditation_meeting_member_notes_one_per_author
    UNIQUE (meeting_id, author_user_id)
);

-- The self-read path ("show me my note across meetings") and the compile path
-- ("show me every note for this meeting") are the only two access patterns.
CREATE INDEX IF NOT EXISTS idx_accred_meeting_member_notes_author
  ON public.accreditation_meeting_member_notes(author_user_id);

-- ── 2) institution_id is derived, not declared ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_note_stamp_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
BEGIN
  SELECT m.institution_id
    INTO v_institution
    FROM public.accreditation_committee_meetings m
   WHERE m.id = NEW.meeting_id;

  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'meeting_member_note: meeting % does not exist', NEW.meeting_id;
  END IF;

  NEW.institution_id := v_institution;
  RETURN NEW;
END;
$$;
-- A trigger function is never called directly; the revoke is belt-and-braces
-- against Supabase's ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE TO anon.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_stamp_institution() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS stamp_institution ON public.accreditation_meeting_member_notes;
CREATE TRIGGER stamp_institution
  BEFORE INSERT OR UPDATE OF meeting_id
  ON public.accreditation_meeting_member_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_accreditation_meeting_note_stamp_institution();

-- Same helper the sibling committee tables use.
DROP TRIGGER IF EXISTS set_updated_at ON public.accreditation_meeting_member_notes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.accreditation_meeting_member_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3) The two predicates the policies consult ──────────────────────────────
-- Who may author a note on this sitting: an ACTIVE member of the committee that
-- owns the meeting, or someone who already records this committee's meetings
-- (the Coordinator's own account of the sitting is a note like any other).
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_note_can_author(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.accreditation_committee_meetings m
     WHERE m.id = p_meeting_id
       AND (
         EXISTS (
           SELECT 1
             FROM public.accreditation_committee_members mem
            WHERE mem.committee_id = m.committee_id
              AND mem.user_id = auth.uid()
              AND mem.is_active
         )
         OR public.is_super_admin()
         OR public.is_admin()
         OR (public.user_has_permission('accreditation.naac.committees.meetings.manage')
             AND public.role_has_institution_access(m.institution_id))
       )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_can_author(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_can_author(uuid) TO authenticated;

-- Who may read EVERY account of this sitting: the committee's Chairman (either
-- the committees.chair_user_id or an active member holding role 'chair'), the
-- Coordinator, and admins / holders of the meetings.manage key within their own
-- institution scope. An ordinary member is NOT here — they see only their own.
CREATE OR REPLACE FUNCTION public.fn_accreditation_meeting_note_can_read_all(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.accreditation_committee_meetings m
      JOIN public.accreditation_committees c ON c.id = m.committee_id
     WHERE m.id = p_meeting_id
       AND (
         public.is_super_admin()
         OR public.is_admin()
         OR (public.user_has_permission('accreditation.naac.committees.meetings.manage')
             AND public.role_has_institution_access(m.institution_id))
         OR c.chair_user_id = auth.uid()
         OR EXISTS (
              SELECT 1
                FROM public.accreditation_committee_members mem
               WHERE mem.committee_id = m.committee_id
                 AND mem.user_id = auth.uid()
                 AND mem.is_active
                 AND mem.role IN ('chair', 'coordinator')
            )
       )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_can_read_all(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_meeting_note_can_read_all(uuid) TO authenticated;

-- ── 4) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.accreditation_meeting_member_notes ENABLE ROW LEVEL SECURITY;

-- Self-read first and unconditional: it is the clause that must never depend on
-- a permission key, and putting it first means the common case short-circuits
-- before either SECURITY DEFINER predicate runs.
CREATE POLICY accred_meeting_member_notes_select
  ON public.accreditation_meeting_member_notes
  FOR SELECT USING (
    author_user_id = auth.uid()
    OR public.fn_accreditation_meeting_note_can_read_all(meeting_id)
  );

CREATE POLICY accred_meeting_member_notes_insert
  ON public.accreditation_meeting_member_notes
  FOR INSERT WITH CHECK (
    author_user_id = auth.uid()
    AND public.fn_accreditation_meeting_note_can_author(meeting_id)
  );

-- A member may revise their own account. Nobody may edit somebody else's — the
-- Coordinator compiles the accounts into the minutes, they do not rewrite them.
CREATE POLICY accred_meeting_member_notes_update
  ON public.accreditation_meeting_member_notes
  FOR UPDATE
  USING (author_user_id = auth.uid())
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.fn_accreditation_meeting_note_can_author(meeting_id)
  );

CREATE POLICY accred_meeting_member_notes_delete
  ON public.accreditation_meeting_member_notes
  FOR DELETE USING (author_user_id = auth.uid());

-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, so a
-- new table is born reachable by the anon key embedded in every page of
-- https://www.jkkn.ai. Shut it explicitly; RLS above is the second lock.
REVOKE ALL ON TABLE public.accreditation_meeting_member_notes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.accreditation_meeting_member_notes TO authenticated;
GRANT ALL ON TABLE public.accreditation_meeting_member_notes TO service_role;

-- ============================================================================
-- Verification — run AFTER a Director-approved apply.
--
-- -- a) the table is locked and RLS is on
-- SELECT relrowsecurity, relacl
-- FROM   pg_class WHERE oid = 'public.accreditation_meeting_member_notes'::regclass;
--
-- -- b) four policies, the SELECT one carrying the self-read clause
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  tablename = 'accreditation_meeting_member_notes' ORDER BY policyname;
--
-- -- c) neither predicate is anon-executable
-- SELECT p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public'
--   AND  p.proname LIKE 'fn_accreditation_meeting_note_%';
--
-- -- d) the ON CONFLICT target the UI upserts on exists with exactly these cols
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM   pg_constraint
-- WHERE  conrelid = 'public.accreditation_meeting_member_notes'::regclass
--   AND  contype = 'u';
--
-- -- e) BEHAVIOURAL, not structural: objects can verify perfectly while the
-- --    behaviour is broken. As a real ordinary member (mint a session, do not
-- --    use service_role): insert a note on their committee's meeting, read it
-- --    back, then confirm they read 0 rows for a note authored by someone else
-- --    on the same meeting, and that an insert naming another author_user_id is
-- --    refused with 42501.
-- ============================================================================
