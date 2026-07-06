-- ============================================================================
-- Fresher Induction — link session resource-persons to real MyJKKN users
-- File: 20260628161000_induction_session_speakers.sql | Date: 2026-06-28
--
-- Today a session's resource person is FREE TEXT (event_sessions.speaker_text),
-- so "Mr.K.Ranjith" or a student presenter is just a string — not tied to the
-- user record, no credit, typo-prone. Every induction resource person IS a MyJKKN
-- user (staff and students both have a profiles row). This adds a structured
-- link so a session can credit the real user(s) who led it — staff or student —
-- while keeping speaker_text as a fallback for genuine groups with no single user.
--
-- Identity: profiles.id is the universal user key (a student's profile also points
-- to learners_profiles via profiles.learner_id). One link type covers both.
--
-- Phase A (this migration): the join table + the three RPCs the UI/credit need.
--   1. event_session_speakers          — the link (session ↔ user), RLS-read
--   2. fn_induction_set_session_speakers — authored write path (replace-set)
--   3. fn_induction_department_members   — roster a department ("add all members")
--   4. fn_induction_sessions_led         — "sessions I led" credit reader
-- ============================================================================

-- ── 1. The link table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_session_speakers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  -- optional provenance: e.g. the group this member was added from ("English Department")
  source_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  CONSTRAINT uq_session_speaker UNIQUE (session_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_ess_session ON public.event_session_speakers(session_id);
CREATE INDEX IF NOT EXISTS idx_ess_profile ON public.event_session_speakers(profile_id);

ALTER TABLE public.event_session_speakers ENABLE ROW LEVEL SECURITY;

-- Read: super/admin, anyone with induction.view + access to the session's
-- institution, OR the user themselves (you can always see sessions you led).
-- Writes go ONLY through the SECURITY DEFINER RPC below (no write policy).
DROP POLICY IF EXISTS ess_select ON public.event_session_speakers;
CREATE POLICY ess_select ON public.event_session_speakers
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR profile_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.event_sessions es
    JOIN public.induction_programs ip ON ip.event_id = es.event_id
    WHERE es.id = event_session_speakers.session_id
      AND (user_has_permission('induction.view') OR user_has_permission('induction.manage'))
      AND role_has_institution_access(ip.institution_id)
  )
);

-- ── 2. Authored write path — replace the speaker set for one session ─────────
-- Replace-set semantics: pass the full list of user ids for the session; the
-- function clears + re-inserts. Manager-gated (induction.manage + institution
-- access), mirroring fn_induction_upsert_session. Only real profiles are linked.
CREATE OR REPLACE FUNCTION public.fn_induction_set_session_speakers(
  p_session_id   uuid,
  p_profile_ids  uuid[],
  p_source_label text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authenticated';
  END IF;
  SELECT ip.institution_id INTO v_inst
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not an induction session';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authorized';
  END IF;

  DELETE FROM public.event_session_speakers WHERE session_id = p_session_id;

  INSERT INTO public.event_session_speakers (session_id, profile_id, source_label, created_by)
  SELECT p_session_id, pid, p_source_label, auth.uid()
  FROM unnest(COALESCE(p_profile_ids, ARRAY[]::uuid[])) AS pid
  -- only real users the caller can access: prevents linking a profile from an
  -- institution the coordinator has no access to (cross-tenant link injection).
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pid
                AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id)))
  ON CONFLICT (session_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) TO authenticated;

-- ── 3. Department roster reader — to SCOPE a speaker search to a department ──
-- NOTE: selection is always INDIVIDUAL (a department is never itself a speaker);
-- this only narrows the candidate list to people in a department. No bulk-add.
CREATE OR REPLACE FUNCTION public.fn_induction_department_members(
  p_department_id uuid
)
RETURNS TABLE (profile_id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.department_id = p_department_id
    AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id))
  ORDER BY p.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_department_members(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_department_members(uuid) TO authenticated;

-- ── 4. "Sessions I led" — the credit reader ─────────────────────────────────
-- Defaults to the caller (self-view); super/admin may read any profile's record.
CREATE OR REPLACE FUNCTION public.fn_induction_sessions_led(
  p_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  session_id   uuid,
  event_id     uuid,
  event_name   text,
  title        text,
  day_number   integer,
  start_at     timestamptz,
  venue_text   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT es.id, es.event_id, ev.name, es.title, es.day_number, es.start_at, es.venue_text
  FROM public.event_session_speakers sp
  JOIN public.event_sessions es ON es.id = sp.session_id
  JOIN public.events ev         ON ev.id = es.event_id
  WHERE sp.profile_id = COALESCE(p_profile_id, auth.uid())
    AND (
      COALESCE(p_profile_id, auth.uid()) = auth.uid()   -- self-view always allowed
      OR is_super_admin() OR is_admin()
    )
  ORDER BY es.start_at DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_sessions_led(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_sessions_led(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
