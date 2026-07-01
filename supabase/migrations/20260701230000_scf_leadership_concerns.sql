-- =====================================================================
-- SCF loop — lone-voice leadership concern signal
-- Migration: 2026-07-01
-- =====================================================================
-- Companion to the scf-generate-suggestions gate widening. The teacher-tip gate
-- now fires on (avg_understood < 3) OR (>= 2 AI-judged genuine help-asks in the
-- free-text), so a good-average class with a real pocket of confusion gets a
-- coaching tip. But when a good-average class has EXACTLY ONE genuine help-ask,
-- generating a teacher tip would over-react to n=1 — and that single learner is
-- already supported by the struggling-note routine (scf-learner-notes). Instead
-- we record a LEADERSHIP-ONLY concern here: principal/dean/HOD/admin can see the
-- single voice without the teacher getting a tip.
--
-- Privacy: concern_summary is an AI one-line AGGREGATE reason — never a verbatim
-- quote, never a student identity. Same stance as the Support-Notes-Sent card.
--
-- Access: RLS-enabled with NO policies (RPC-only). The reader RPC mirrors
-- fn_scf_escalation_followups' leadership role gate + institution scope. The
-- writer is service_role-only (the cron). Both anon-locked per the standing rule.
-- =====================================================================

-- ── TABLE (RLS-locked, RPC-only access) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scf_leadership_concerns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid,
  course_code     text NOT NULL,
  faculty_email   text,
  window_from     date NOT NULL,
  window_to       date NOT NULL,
  responses       integer,
  avg_understood  numeric,
  concern_summary text,        -- AI one-line, AGGREGATE only: no verbatim quote, no student identity
  model           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT so a null institution/faculty still dedupes idempotently
  CONSTRAINT scf_leadership_concerns_uniq
    UNIQUE NULLS NOT DISTINCT (institution_id, course_code, faculty_email, window_from, window_to)
);

ALTER TABLE public.scf_leadership_concerns ENABLE ROW LEVEL SECURITY;
-- No policies: anon + authenticated get deny-all on direct access; all access via the RPCs below.
REVOKE ALL ON public.scf_leadership_concerns FROM anon, authenticated;

COMMENT ON TABLE public.scf_leadership_concerns IS
  'Lone-voice SCF concerns (good-average class, exactly one genuine help-ask). '
  'Leadership-only signal; teacher gets no tip. RLS-enabled, no policies (RPC-only access).';

-- ── WRITE RPC (service_role only — called by the scf-generate-suggestions cron) ─
CREATE OR REPLACE FUNCTION public.fn_scf_record_leadership_concern(
  p_institution_id uuid, p_course_code text, p_faculty_email text,
  p_window_from date, p_window_to date, p_responses integer,
  p_avg numeric, p_summary text, p_model text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.scf_leadership_concerns
    (institution_id, course_code, faculty_email, window_from, window_to,
     responses, avg_understood, concern_summary, model, updated_at)
  VALUES
    (p_institution_id, p_course_code, nullif(lower(btrim(p_faculty_email)), ''),
     p_window_from, p_window_to, p_responses, p_avg, p_summary, p_model, now())
  ON CONFLICT (institution_id, course_code, faculty_email, window_from, window_to) DO UPDATE SET
    responses       = EXCLUDED.responses,
    avg_understood  = EXCLUDED.avg_understood,
    concern_summary = EXCLUDED.concern_summary,
    model           = EXCLUDED.model,
    updated_at      = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_record_leadership_concern(uuid,text,text,date,date,integer,numeric,text,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_leadership_concern(uuid,text,text,date,date,integer,numeric,text,text) TO service_role;

-- ── READ RPC (leadership-gated — mirrors fn_scf_escalation_followups' role gate) ─
CREATE OR REPLACE FUNCTION public.fn_scf_leadership_concerns(p_from date, p_to date)
RETURNS TABLE(
  institution_id uuid, course_code text, faculty_email text,
  window_from date, window_to date, responses integer,
  avg_understood numeric, concern_summary text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_leadership_concerns: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_leadership_concerns: not authorized';
  END IF;

  RETURN QUERY
  SELECT c.institution_id, c.course_code, c.faculty_email, c.window_from, c.window_to,
         c.responses, c.avg_understood, c.concern_summary, c.created_at
  FROM public.scf_leadership_concerns c
  WHERE c.window_to >= p_from AND c.window_from <= p_to
    AND (v_super OR c.institution_id = v_inst)
    -- Defensive: a row with no summary is not a real concern; never surface a
    -- blank/uninformative leadership row. (The cron coerces an empty judge
    -- summary to a generic line, so in practice every written row has a summary.)
    AND c.concern_summary IS NOT NULL
  ORDER BY c.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(date,date) TO authenticated;

NOTIFY pgrst, 'reload schema';
