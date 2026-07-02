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
  -- A concern is per-CLASS state ("this class currently has a lone unaddressed voice"),
  -- NOT per feedback window. The cron re-scans a rolling window daily, so if the window
  -- dates were in the key a persistent class would accrue a duplicate row every day.
  -- One row per (institution, course, faculty); window_* just record the latest window
  -- evaluated. NULLS NOT DISTINCT so a null institution/faculty still dedupes.
  CONSTRAINT scf_leadership_concerns_uniq
    UNIQUE NULLS NOT DISTINCT (institution_id, course_code, faculty_email)
);

-- Migrate a table created by an earlier run of THIS migration cycle (which keyed on the
-- window dates) to the per-class key. Safe on a fresh install too (drops the just-made
-- constraint and re-adds the per-class one).
ALTER TABLE public.scf_leadership_concerns DROP CONSTRAINT IF EXISTS scf_leadership_concerns_uniq;
-- Collapse any pre-existing per-class duplicates (from the old window-keyed table) to the
-- most-recent row before adding the per-class constraint, so ADD CONSTRAINT can't abort.
DELETE FROM public.scf_leadership_concerns c
  USING public.scf_leadership_concerns newer
 WHERE c.institution_id IS NOT DISTINCT FROM newer.institution_id
   AND c.course_code = newer.course_code
   AND c.faculty_email IS NOT DISTINCT FROM newer.faculty_email
   AND (c.updated_at, c.id) < (newer.updated_at, newer.id);
ALTER TABLE public.scf_leadership_concerns
  ADD CONSTRAINT scf_leadership_concerns_uniq
  UNIQUE NULLS NOT DISTINCT (institution_id, course_code, faculty_email);

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
  ON CONFLICT (institution_id, course_code, faculty_email) DO UPDATE SET
    window_from     = EXCLUDED.window_from,
    window_to       = EXCLUDED.window_to,
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

-- ── CLEAR RPC (service_role — supersede/resolve a class's concern) ───────────────
-- Called by the cron when a class escalates to a teacher tip (superseded — a bigger,
-- teacher-facing issue) or comes back with zero genuine asks (resolved). Keeps the
-- table to at most one CURRENT concern per class with no stale/contradictory rows.
CREATE OR REPLACE FUNCTION public.fn_scf_clear_leadership_concern(
  p_institution_id uuid, p_course_code text, p_faculty_email text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.scf_leadership_concerns c
  WHERE c.course_code = p_course_code
    AND (c.institution_id IS NOT DISTINCT FROM p_institution_id)
    AND (c.faculty_email  IS NOT DISTINCT FROM nullif(lower(btrim(p_faculty_email)), ''));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_clear_leadership_concern(uuid,text,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_clear_leadership_concern(uuid,text,text) TO service_role;

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
    -- Freshness backstop: only surface a concern the daily cron re-confirmed recently.
    -- The cron re-records a genuine concern every day (self-healing: it clears on escalation
    -- to a tip or on an all-praise run), so an ongoing concern's updated_at stays fresh. Only
    -- when a class stops being a widened candidate (comments drop below the threshold, becomes
    -- a standout, or falls under the response floor) does its concern stop being re-confirmed;
    -- this window then ages it off. The window is 8 days — comfortably longer than the 7-day
    -- feedback/candidate window (WINDOW_DAYS), so a class that goes quiet ages off ~a week
    -- after its last feedback, AND a multi-day cron gap (deploy freeze / holiday / outage)
    -- does NOT wrongly blank the card into a false "no concerns" for leadership.
    AND c.updated_at >= now() - interval '8 days'
    -- Defensive only: the cron always writes a non-null summary for a real concern (a genuine
    -- 0-ask deletes the row rather than nulling it), so this never excludes a live row — it
    -- just guards against a future path ever leaving a summary-less row visible.
    AND c.concern_summary IS NOT NULL
  ORDER BY c.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_leadership_concerns(date,date) TO authenticated;

NOTIFY pgrst, 'reload schema';
