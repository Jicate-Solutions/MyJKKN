-- Migration: pre-session materials + objective opens trace (Rank 3, slice a).
-- Spec: specs/session-feedback-pre-session-resources-2026-07-24.md
--
-- A Senior Learner posts the NotebookLM link/material for a session (any time ahead);
-- learners open it and the platform logs WHICH learners opened it — the objective
-- "was it used" trace that pairs with the Rank 2 self-report checklist.
--
-- Authority reuses public._fn_curriculum_class_ctx(tt, date, period, require_manage) —
-- the SAME "assigned Senior Learner OR HOD/admin of the institution" check the
-- curriculum topic-linking uses ("a topic can be set BEFORE the poll opens"). So a
-- resource can be posted before the poll/feedback exists, for any session that exists
-- in the attendance/timetable substrate.
--
-- Tables are RLS-on with NO permissive policies: the SECDEF RPCs (function owner) are
-- the ONLY access path — same pattern as public.class_session_lesson.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_resource (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid,
  timetable_id    uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id       text NOT NULL,                                  -- text, matches class_session_lesson
  course_id       uuid,
  kind            text NOT NULL DEFAULT 'notebooklm'
                    CHECK (kind IN ('notebooklm','material','other')),
  title           text NOT NULL,
  url             text NOT NULL,
  posted_by       uuid NOT NULL DEFAULT auth.uid(),
  posted_at       timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_session_resource_anchor
  ON public.session_resource (timetable_id, attendance_date, period_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.session_resource_open (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id      uuid NOT NULL REFERENCES public.session_resource(id) ON DELETE CASCADE,
  learner_id       uuid NOT NULL,                                 -- learners_profiles.id
  first_opened_at  timestamptz NOT NULL DEFAULT now(),
  last_opened_at   timestamptz NOT NULL DEFAULT now(),
  open_count       int NOT NULL DEFAULT 1,
  UNIQUE (resource_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_session_resource_open_resource
  ON public.session_resource_open (resource_id);

ALTER TABLE public.session_resource      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_resource_open ENABLE ROW LEVEL SECURITY;
-- No permissive policies: SECDEF RPCs below are the only read/write path.

-- ---------------------------------------------------------------------------
-- 2) RPCs
-- ---------------------------------------------------------------------------

-- Post a resource. Authority: assigned Senior Learner OR HOD/admin of the institution.
CREATE OR REPLACE FUNCTION public.fn_scf_post_session_resource(
  p_timetable_id uuid, p_attendance_date date, p_period_id text,
  p_kind text, p_title text, p_url text)
RETURNS public.session_resource
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ctx record; v_row public.session_resource;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_post_session_resource: not authenticated'; END IF;
  IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'title is required'; END IF;
  IF coalesce(btrim(p_url), '')   = '' THEN RAISE EXCEPTION 'url is required'; END IF;
  IF btrim(p_url) !~* '^https?://' THEN RAISE EXCEPTION 'url must start with http:// or https://'; END IF;
  IF coalesce(p_kind, 'notebooklm') NOT IN ('notebooklm','material','other') THEN
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  -- Raises if the caller lacks manage authority on this session (or it doesn't exist).
  SELECT * INTO v_ctx
  FROM public._fn_curriculum_class_ctx(p_timetable_id, p_attendance_date, p_period_id, true);

  INSERT INTO public.session_resource
    (institution_id, timetable_id, attendance_date, period_id, course_id, kind, title, url)
  VALUES
    (v_ctx.institution_id, p_timetable_id, p_attendance_date, p_period_id, v_ctx.course_id,
     coalesce(p_kind, 'notebooklm'), btrim(p_title), btrim(p_url))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- List active resources for a session + the caller-learner's own opened flag + total opens.
-- Authenticated read: study links are class-shared material, not sensitive, so no
-- attendance-blob presence gate (documented choice — keeps the read simple + robust).
CREATE OR REPLACE FUNCTION public.fn_scf_resources_for_session(
  p_timetable_id uuid, p_attendance_date date, p_period_id text)
RETURNS TABLE (id uuid, kind text, title text, url text, posted_at timestamptz,
               opened boolean, open_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_resources_for_session: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();

  RETURN QUERY
  SELECT r.id, r.kind, r.title, r.url, r.posted_at,
         (v_lp IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.session_resource_open o
            WHERE o.resource_id = r.id AND o.learner_id = v_lp))::boolean AS opened,
         (SELECT count(*)::int FROM public.session_resource_open o2 WHERE o2.resource_id = r.id) AS open_count
  FROM public.session_resource r
  WHERE r.timetable_id = p_timetable_id
    AND r.attendance_date = p_attendance_date
    AND r.period_id = p_period_id
    AND r.is_active = true
  ORDER BY r.posted_at DESC;
END;
$$;

-- Learner logs an open (idempotent upsert; increments count on re-open).
CREATE OR REPLACE FUNCTION public.fn_scf_log_resource_open(p_resource_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_log_resource_open: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RAISE EXCEPTION 'only a learner can log an open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_resource r WHERE r.id = p_resource_id AND r.is_active = true) THEN
    RAISE EXCEPTION 'no such active resource';
  END IF;

  INSERT INTO public.session_resource_open (resource_id, learner_id)
  VALUES (p_resource_id, v_lp)
  ON CONFLICT (resource_id, learner_id)
  DO UPDATE SET last_opened_at = now(),
               open_count = public.session_resource_open.open_count + 1;
END;
$$;

-- Deactivate (mis-post cleanup). Manage authority on that session.
CREATE OR REPLACE FUNCTION public.fn_scf_deactivate_session_resource(p_resource_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_r public.session_resource; v_ctx record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_deactivate_session_resource: not authenticated'; END IF;
  SELECT * INTO v_r FROM public.session_resource WHERE id = p_resource_id;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'no such resource'; END IF;
  -- Raises if the caller lacks manage authority on that session.
  SELECT * INTO v_ctx
  FROM public._fn_curriculum_class_ctx(v_r.timetable_id, v_r.attendance_date, v_r.period_id, true);
  UPDATE public.session_resource SET is_active = false WHERE id = p_resource_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Lock anon (mandatory — Supabase default-grants EXECUTE to anon on new fns).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_scf_post_session_resource(uuid, date, text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_post_session_resource(uuid, date, text, text, text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_resources_for_session(uuid, date, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_resources_for_session(uuid, date, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_log_resource_open(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_log_resource_open(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_deactivate_session_resource(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_deactivate_session_resource(uuid) TO authenticated, service_role;
