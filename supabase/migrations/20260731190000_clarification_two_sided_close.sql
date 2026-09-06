-- =============================================================================
-- 20260731190000_clarification_two_sided_close.sql
-- TWO-SIDED CLOSE for re-explanation asks — the Senior Learner records the ACT,
-- the learner keeps the VERDICT. Spec: specs/clarification-act-two-sided-close-
-- 2026-07-30.md (8 Director-locked decisions, 06:1x IST interview).
--
-- THE PROBLEM (verified live 30 Jul): 377 asks in 5 days, 306+ still open.
-- Closure was one-sided: the learner self-reports the outcome
-- (fn_clarification_outcome), but the session lead had no way to record even
-- the act ("I went over it again"), and the learner was never prompted to come
-- back and report. Acts happened invisibly; outcomes piled up unreported.
--
-- THE DESIGN, in one line: acts are CONTEXT, NEVER EVIDENCE. Recording an act
-- cannot improve any score, median, or machine item anywhere (decision 4) —
-- only the learner's own confirmed outcome ever counts. The act's sole powers
-- are (a) honesty in display ("12 asks · 10 acts recorded") and (b) triggering
-- the learner's follow-up question so the loop can actually close (decision 3).
--
-- ⚠️ ONE-TAP INVARIANT — AMENDED BY THE DIRECTOR 2026-07-30 (deliberate, do
-- not "fix" back): on a day when BOTH the learner's own "did it help?"
-- follow-up AND the daily Classroom Practice question are due, the learner
-- sees BOTH, follow-up first. The cap is now: ONE rotation question + (only
-- when due) the learner's OWN follow-up. The follow-up is the learner's own
-- open loop, not an extra survey item — that is why it is exempt from the
-- single-item cap stated in 20260729184500's header.
--
-- WHAT THIS MIGRATION DOES (all additive):
--   1. Widens session_clarification_requests.outcome CHECK with two values:
--      'not_helped'            — the follow-up's honest "Not really" ('refused'
--                                means the lead refused: a different fact);
--      'term_ended_unreported' — decision 7's honest close; excluded from all
--                                rates, counted against no one.
--   2. clarification_acts table (RLS-sealed, RPC-only writes).
--   3. fn_scf_clarification_act        — lead records an act (defensive).
--   4. fn_scf_clarification_sessions_for_me — DROP+CREATE (return shape grows:
--      42P13 forbids CREATE OR REPLACE), now carrying act + not_helped state.
--   5. fn_clarification_outcome        — accepts 'not_helped'.
--   6. fn_clarification_followup_pending — the learner's one due follow-up.
--      Serves each ask AT MOST TWICE (Director interview 2026-07-30 09:5x):
--      a serve is RECORDED (same doctrine as the micro offer — an ignored
--      offer still counts), and past the cap the card goes quiet forever;
--      the auto-close below eventually closes the ask.
--   7. fn_clarification_term_close     — service_role-only weekly close.
--      TWO arms, WHICHEVER COMES FIRST (Director interview 2026-07-30):
--      (a) the ask's academic year ENDED, or (b) the ask has been QUIET for
--      quiet_close_days (default 60) — no answer, and no covering act more
--      recent than that (an act restarts the learner's window to answer).
--      Both arms use the SAME blame-nobody label 'term_ended_unreported'
--      (approved in the interview — one honest bucket, not two).
--   8. Work signal 'clarification_acts_recorded' + fn_work_signals_for REPLACE
--      (body taken VERBATIM from the live prod definition, which was verified
--      byte-identical to 20260730013000 before this file was written).
--   9. Config row classroom_practice.acts — the no-deploy kill switch.
--
-- ATTRIBUTION: acts attribute through v_clarification_ask_attribution — THE
-- shared definition (20260730013000). This file adds NO third copy of the
-- attribution rules; where it needs an ask's exact timestamp it joins
-- session_clarification_requests by the view's ask_id, which is a property of
-- the ask row, not an attribution rule.
--
-- TERM BOUNDARY (build-time verification, 2026-07-30): public.semesters holds
-- NO date columns (semester_order means YEAR in some institutions — never used
-- here). The only dated academic boundary the platform records is
-- public.academic_years (institution_id, start_date, end_date). "Term end"
-- therefore = academic-year end. Verified live: 0 pending asks currently fall
-- in an ended year, so the close is correct-but-inert until a year rolls over.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Outcome CHECK widen — additive, non-breaking. Every existing reader
--    treats unknown outcomes as not-re_explained; the readers this repo owns
--    are ALSO updated explicitly below (sessions_for_me) and in the UI.
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_clarification_requests
  DROP CONSTRAINT IF EXISTS session_clarification_requests_outcome_check;
ALTER TABLE public.session_clarification_requests
  ADD CONSTRAINT session_clarification_requests_outcome_check
  CHECK (outcome IN ('pending','re_explained','refused','unanswered',
                     'not_helped','term_ended_unreported'));

-- How many times the "did it help?" follow-up has been SERVED for this ask.
-- Written only by fn_clarification_followup_pending (SECURITY DEFINER); the
-- cap (followup_max_prompts, default 2) lives in the config row below.
ALTER TABLE public.session_clarification_requests
  ADD COLUMN IF NOT EXISTS followup_prompts int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.session_clarification_requests.followup_prompts IS
  'Times the "did it help?" follow-up card was served to the asking learner for this ask. A serve counts even if ignored (the micro-offer doctrine). At followup_max_prompts (config, default 2) the card goes quiet forever and the term/quiet auto-close eventually closes the ask. Director interview 2026-07-30.';

-- ---------------------------------------------------------------------------
-- 2) clarification_acts — one row per act a session lead records about one
--    session (a second revisit is a second act; multiple rows are the record).
--    NO state column: "open after act" is DERIVED (decision 5 — an act covers
--    only asks with asked_at <= acted_at; a newer ask reopens the session).
--    NO learner identity anywhere in this table, ever.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clarification_acts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL,
  attendance_date  date NOT NULL,
  period_id        text NOT NULL,
  course_code      text,                    -- nullable, mirrors the shared view's key
  lead_email       text NOT NULL,           -- stored lower(); the attribution key
  acted_by         uuid NOT NULL,           -- profiles.id of the actor (audit)
  act_type         text NOT NULL
                     CHECK (act_type IN ('re_explained_in_session','helped_one_on_one',
                                         'shared_material','planned_next_session')),
  note             text CHECK (note IS NULL OR length(note) <= 500),
  acted_at         timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clarification_acts_lead
  ON public.clarification_acts (lead_email, attendance_date);
CREATE INDEX IF NOT EXISTS idx_clarification_acts_session
  ON public.clarification_acts (attendance_date, period_id, institution_id);

COMMENT ON TABLE public.clarification_acts IS
  'A session lead''s own record of acting on re-explanation asks for one session (re_explained_in_session / helped_one_on_one / shared_material / planned_next_session + optional <=500-char note). CONTEXT, NEVER EVIDENCE (spec decision 4): no act touches any score, median, or machine item — only the learner''s own confirmed outcome counts anywhere. No state column: "open after act" is derived as EXISTS pending ask WITH asked_at > max(acted_at) (decision 5). The act''s one active power is triggering the asking learner''s "did it help?" follow-up (decision 3). Carries NO learner identity. Writes only via fn_scf_clarification_act. act_type is a locked CHECK, not a master table: the four options were individually chosen by the Director (spec 2026-07-30) and each drives fixed UI copy + follow-up semantics.';

-- RLS: lead reads OWN rows; leadership reads tenant-scoped. No write policies —
-- writes flow only through the SECURITY DEFINER RPC below.
ALTER TABLE public.clarification_acts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clarification_acts_lead_own ON public.clarification_acts;
CREATE POLICY clarification_acts_lead_own ON public.clarification_acts
  FOR SELECT TO authenticated
  USING (lead_email = (SELECT lower(p.email) FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS clarification_acts_leadership_read ON public.clarification_acts;
CREATE POLICY clarification_acts_leadership_read ON public.clarification_acts
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
    OR (user_has_permission('audit.cycle.view')
        AND role_has_institution_access(institution_id))
  );

-- Strip the Supabase default GRANT ALL back to read-only for authenticated and
-- nothing for anon/PUBLIC, so a direct write fails LOUDLY at the grant layer.
REVOKE ALL ON public.clarification_acts FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.clarification_acts FROM authenticated;
GRANT SELECT ON public.clarification_acts TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) fn_scf_clarification_act — the session lead records an act. DEFENSIVE:
--    returns {success:false, reason} instead of raising, because it feeds a
--    card that must degrade quietly. The caller must be the session's
--    attributed lead PER THE SHARED VIEW — no second copy of the rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_clarification_act(
  p_attendance_date date,
  p_period_id       text,
  p_course_code     text,      -- NULL when the card row shows no course
  p_act_type        text,
  p_note            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text;
  v_enabled   boolean;
  v_note      text := NULLIF(trim(p_note), '');
  v_inst      uuid;
  v_inserted  int  := 0;
  v_acts      int;
  v_last_type text;
  v_last_at   timestamptz;
  v_reopen    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Kill switch (no deploy): platform_policies classroom_practice.acts.
  -- Missing row falls back to enabled, mirroring the l2 doctrine.
  SELECT COALESCE((pp.value ->> 'enabled')::boolean, true) INTO v_enabled
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.acts'
    AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'disabled');
  END IF;

  IF p_act_type NOT IN ('re_explained_in_session','helped_one_on_one',
                        'shared_material','planned_next_session') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_act_type');
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'note_too_long');
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_email');
  END IF;

  -- The caller must be this session's attributed lead per THE shared view.
  -- The view's course_code is already the coalesced display key the card rows
  -- carry, so IS NOT DISTINCT FROM matches exactly what the caller clicked.
  -- Backlog eligibility (decision 6): the view's 90-day horizon is the only
  -- age limit — any attributed open ask inside it can receive an act.
  SELECT a.institution_id INTO v_inst
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.attendance_date = p_attendance_date
    AND a.period_id = p_period_id
    AND a.course_code IS NOT DISTINCT FROM p_course_code
  LIMIT 1;

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_your_session');
  END IF;

  INSERT INTO public.clarification_acts
    (institution_id, attendance_date, period_id, course_code,
     lead_email, acted_by, act_type, note)
  VALUES
    (v_inst, p_attendance_date, p_period_id, p_course_code,
     v_email, auth.uid(), p_act_type, v_note);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Refreshed row state for the card (same derivations as sessions_for_me).
  SELECT count(*)::int,
         (array_agg(ca.act_type ORDER BY ca.acted_at DESC))[1],
         max(ca.acted_at)
    INTO v_acts, v_last_type, v_last_at
  FROM public.clarification_acts ca
  WHERE ca.lead_email = v_email
    AND ca.attendance_date = p_attendance_date
    AND ca.period_id = p_period_id
    AND ca.course_code IS NOT DISTINCT FROM p_course_code;

  SELECT EXISTS (
    SELECT 1
    FROM public.v_clarification_ask_attribution a
    JOIN public.session_clarification_requests c ON c.id = a.ask_id
    WHERE a.lead_email = v_email
      AND a.attendance_date = p_attendance_date
      AND a.period_id = p_period_id
      AND a.course_code IS NOT DISTINCT FROM p_course_code
      AND c.outcome = 'pending'
      AND c.asked_at > v_last_at
  ) INTO v_reopen;

  RETURN jsonb_build_object(
    'success', v_inserted = 1,
    'acts', v_acts,
    'last_act_type', v_last_type,
    'last_acted_at', v_last_at,
    'open_after_act', COALESCE(v_reopen, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_clarification_act(date,text,text,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_clarification_act(date,text,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_clarification_act(date,text,text,text,text) IS
  'Session lead records an act on one session''s re-explanation asks. Caller must be the session''s attributed lead per v_clarification_ask_attribution (the shared definition — no second copy of the rules). Defensive: returns {success:false, reason} instead of raising. CONTEXT, NEVER EVIDENCE: nothing an act writes is read by any score, median, or machine item (spec decision 4). Kill switch: platform_policies classroom_practice.acts -> enabled.';

-- ---------------------------------------------------------------------------
-- 4) fn_scf_clarification_sessions_for_me — DROP+CREATE (the return shape
--    grows by five columns, and CREATE OR REPLACE cannot change a function's
--    OUT row type: 42P13). Same drop-safety argument as 20260730013000: no
--    database object depends on it, PostgREST binds late, grants + COMMENT are
--    re-asserted below, and inside this migration's transaction the gap is
--    invisible. Body otherwise identical to the live version except:
--      • acts state per session row (acts, last_act_type, last_acted_at);
--      • open_after_act derived per decision 5 (pending ask newer than the
--        latest act — needs the ask TIMESTAMP, so the ask row is joined by the
--        view's ask_id; attribution itself still comes only from the view);
--      • not_helped counted explicitly (new outcome bucket);
--      • 'term_ended_unreported' rows are EXCLUDED from every rate-like count
--        (decision 7) — they appear in the volume totals (asks, asked_30d)
--        because the ask did happen, but never as open and never in a bucket.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_scf_clarification_sessions_for_me();

CREATE OR REPLACE FUNCTION public.fn_scf_clarification_sessions_for_me()
 RETURNS TABLE(attendance_date date, period_id text, course_code text,
               course_name text, asks integer, still_open integer,
               re_explained integer, refused integer, unanswered integer,
               not_helped integer, acts integer, last_act_type text,
               last_acted_at timestamptz, open_after_act boolean,
               asked_30d integer, still_open_30d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_email  text;
  v_since  date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_asked  int  := 0;
  v_open   int  := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_clarification_sessions_for_me: not authenticated';
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  -- No email = nothing to key on. Return an empty set, never an error: this
  -- feeds a decorative card that must simply not render.
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- Unbounded 30-day totals — computed over EVERY attributed ask, not just the
  -- <=50 rows below, so the card headline is honest for a heavy teaching load.
  SELECT count(*)::int,
         count(*) FILTER (WHERE a.outcome = 'pending')::int
    INTO v_asked, v_open
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.asked_on_ist >= v_since;

  RETURN QUERY
  SELECT g.ad, g.pid, g.cc, g.cn,
         g.n_asks, g.n_open, g.n_re, g.n_ref, g.n_un, g.n_nh,
         COALESCE(act.n_acts, 0), act.latest_type, act.latest_at,
         -- Decision 5, derived: a pending ask NEWER than the latest act
         -- reopens the session-row. No acts => not "open after act".
         COALESCE(act.latest_at IS NOT NULL AND g.newest_pending_at > act.latest_at, false),
         v_asked, v_open
  FROM (
    SELECT a.attendance_date                                      AS ad,
           a.period_id                                            AS pid,
           a.institution_id                                       AS inst,
           COALESCE(a.course_code, '—')                           AS cc,
           a.course_code                                          AS cc_raw,
           max(a.course_name)                                     AS cn,
           count(*)::int                                          AS n_asks,
           count(*) FILTER (WHERE a.outcome = 'pending')::int      AS n_open,
           count(*) FILTER (WHERE a.outcome = 're_explained')::int AS n_re,
           count(*) FILTER (WHERE a.outcome = 'refused')::int      AS n_ref,
           count(*) FILTER (WHERE a.outcome = 'unanswered')::int   AS n_un,
           count(*) FILTER (WHERE a.outcome = 'not_helped')::int   AS n_nh,
           -- Timestamp of the newest still-pending ask (for the reopen
           -- derivation). The ask row is joined by ask_id for its timestamp
           -- only; attribution remains the view's alone.
           max(c.asked_at) FILTER (WHERE a.outcome = 'pending')    AS newest_pending_at
    FROM public.v_clarification_ask_attribution a
    JOIN public.session_clarification_requests c ON c.id = a.ask_id
    WHERE a.lead_email = v_email
      AND a.asked_on_ist >= v_since
    -- institution_id is grouped but not returned: it keeps one course code
    -- taught in two institutions from collapsing into a single row, without
    -- widening the surface the card renders.
    GROUP BY a.attendance_date, a.period_id, a.institution_id, a.course_code
  ) g
  LEFT JOIN LATERAL (
    SELECT count(*)::int                                        AS n_acts,
           (array_agg(ca.act_type ORDER BY ca.acted_at DESC))[1] AS latest_type,
           max(ca.acted_at)                                      AS latest_at
    FROM public.clarification_acts ca
    WHERE ca.lead_email = v_email
      AND ca.attendance_date = g.ad
      AND ca.period_id = g.pid
      AND ca.institution_id = g.inst
      AND ca.course_code IS NOT DISTINCT FROM g.cc_raw
  ) act ON true
  ORDER BY g.ad DESC, g.cc, g.pid
  LIMIT 50;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() TO authenticated;

COMMENT ON FUNCTION public.fn_scf_clarification_sessions_for_me() IS
  'Self-scoped, COUNT-ONLY per-session view of re-explanation asks for the calling session lead (last 30 IST days, max 50 rows, plus unbounded 30-day scalar totals), now carrying the lead''s own act state (acts / last_act_type / last_acted_at / open_after_act) and the not_helped bucket. Attribution comes entirely from v_clarification_ask_attribution; ask rows are joined by ask_id for their timestamp only. term_ended_unreported asks count in volume totals but never as open and never in any bucket (spec decision 7). Acts shown here are CONTEXT, NEVER EVIDENCE. Never returns student_id or any per-ask row.';

-- ---------------------------------------------------------------------------
-- 5) fn_clarification_outcome — the learner's verdict writer gains
--    'not_helped' (the follow-up's honest "Not really"; 'refused' stays "the
--    lead refused", a different fact). Same signature => CREATE OR REPLACE is
--    safe; grants re-asserted because a REPLACE re-arms nothing but a future
--    DROP would (the DROP-re-arms-default-grant lesson).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clarification_outcome(
  p_attendance_date date,
  p_period_id       text,
  p_outcome         text
)
RETURNS public.session_clarification_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lp  uuid;
  v_row public.session_clarification_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: not authenticated';
  END IF;

  -- 'term_ended_unreported' is deliberately NOT reportable here: it is the
  -- system's own honest close (fn_clarification_term_close), never a person's.
  IF p_outcome NOT IN ('re_explained','refused','unanswered','not_helped') THEN
    RAISE EXCEPTION 'fn_clarification_outcome: invalid outcome "%" — must be re_explained, refused, unanswered, or not_helped', p_outcome;
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: only learners can report a clarification outcome';
  END IF;

  UPDATE public.session_clarification_requests
     SET outcome    = p_outcome,
         outcome_at = now(),
         updated_at = now()
   WHERE student_id = v_lp
     AND attendance_date = p_attendance_date
     AND period_id = p_period_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: no clarification request found for this session — record the ask first';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clarification_outcome(date,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clarification_outcome(date,text,text) TO authenticated;

COMMENT ON FUNCTION public.fn_clarification_outcome(date,text,text) IS
  'Learner-only self-report of what happened after their own clarification ask (re_explained/refused/unanswered/not_helped). not_helped is the "did it help?" follow-up''s honest "Not really" — the topic was covered again but did not land. term_ended_unreported is system-only (fn_clarification_term_close) and is rejected here. Owner-scoped by learners_profiles lookup — a learner can only ever touch their own row.';

-- ---------------------------------------------------------------------------
-- 6) fn_clarification_followup_pending — the ONE follow-up due for the calling
--    learner: their OLDEST pending ask that has an act NEWER than it
--    (decision 3's relevance gate — the lead says it was covered; asks made
--    AFTER the newest act get no follow-up, per decision 5's timeline). The
--    lead's note is shown: it is teacher-authored text about CONTENT, and
--    showing it is humanizing (spec ruling). Defensive: {ask:null} on any gap.
--
--    VOLATILE, deliberately: each serve is RECORDED (followup_prompts += 1),
--    exactly like the micro offer — an ignored offer still counts. An ask is
--    served at most followup_max_prompts times (config, default 2; Director
--    interview 2026-07-30: "ask at most twice, then stop"); past the cap the
--    card goes quiet forever and the auto-close in section 7 eventually
--    closes the ask. Answering stays possible on any serve; the cap only
--    stops REPEAT prompting, never the learner's ability to answer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clarification_followup_pending()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lp      uuid;
  v_enabled boolean;
  v_max     int;
  v_ask     jsonb;
  v_ask_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ask', NULL);
  END IF;

  SELECT COALESCE((pp.value ->> 'enabled')::boolean, true),
         COALESCE((pp.value ->> 'followup_max_prompts')::int, 2)
    INTO v_enabled, v_max
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.acts'
    AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('ask', NULL);
  END IF;
  v_max := COALESCE(v_max, 2);

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('ask', NULL);
  END IF;

  -- Oldest eligible ask first; then the NEWEST act covering it supplies the
  -- copy ("covered again in session"). Acts are matched to the ask through the
  -- SHARED attribution view (act.lead_email = view.lead_email on the same
  -- session key) — never by re-deriving attribution here.
  SELECT x.id,
         jsonb_build_object(
           'attendance_date', x.attendance_date,
           'period_id',       x.period_id,
           'course_code',     x.course_code,
           'course_name',     x.course_name,
           'asked_on',        x.asked_on_ist,
           'act_type',        x.act_type,
           'acted_on',        (x.acted_at AT TIME ZONE 'Asia/Kolkata')::date,
           'note',            x.note
         )
    INTO v_ask_id, v_ask
  FROM (
    SELECT c.id, c.attendance_date, c.period_id, a.course_code, a.course_name,
           a.asked_on_ist, ca.act_type, ca.acted_at, ca.note
    FROM public.session_clarification_requests c
    JOIN public.v_clarification_ask_attribution a ON a.ask_id = c.id
    JOIN public.clarification_acts ca
      ON  ca.lead_email = a.lead_email
      AND ca.attendance_date = a.attendance_date
      AND ca.period_id = a.period_id
      AND ca.institution_id = a.institution_id
      AND ca.course_code IS NOT DISTINCT FROM a.course_code
      AND ca.acted_at > c.asked_at
    WHERE c.student_id = v_lp
      AND c.outcome = 'pending'
      AND c.followup_prompts < v_max
    ORDER BY c.asked_at ASC, ca.acted_at DESC
    LIMIT 1
  ) x;

  -- Record the serve — an ignored offer must still count against the cap.
  IF v_ask_id IS NOT NULL THEN
    UPDATE public.session_clarification_requests
       SET followup_prompts = followup_prompts + 1,
           updated_at = now()
     WHERE id = v_ask_id;
  END IF;

  RETURN jsonb_build_object('ask', v_ask);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clarification_followup_pending() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clarification_followup_pending() TO authenticated;

COMMENT ON FUNCTION public.fn_clarification_followup_pending() IS
  'The ONE "did it help?" follow-up due for the calling learner: their oldest pending ask that has a lead-recorded act newer than it (relevance gate, spec decision 3), served at most followup_max_prompts times (config, default 2 — Director interview 2026-07-30; a serve is recorded like the micro offer, ignored or not). Attribution via v_clarification_ask_attribution only. Returns {ask:null} on any gap, the cap, silence, or the classroom_practice.acts kill switch — this feeds a post-submit card that must simply not render. The answer path is fn_clarification_outcome (re_explained / not_helped); "I was not there" writes nothing.';

-- ---------------------------------------------------------------------------
-- 7) fn_clarification_term_close — decision 7's honest close. service_role
--    ONLY (a weekly cron calls it; no person ever does). Closes pending asks
--    whose session date falls inside an ENDED academic year for the ask''s
--    institution. Those rows are excluded from all rates and counted against
--    no one — the label says exactly what happened: the term ended without a
--    report.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clarification_term_close()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_quiet    int;
  v_by_year  int := 0;
  v_by_quiet int := 0;
BEGIN
  SELECT COALESCE((pp.value ->> 'enabled')::boolean, true),
         COALESCE((pp.value ->> 'quiet_close_days')::int, 60)
    INTO v_enabled, v_quiet
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.acts'
    AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('closed', 0, 'skipped', 'disabled');
  END IF;
  v_quiet := COALESCE(v_quiet, 60);

  -- Arm 1 — the ask's academic year ENDED.
  UPDATE public.session_clarification_requests c
     SET outcome    = 'term_ended_unreported',
         outcome_at = now(),
         updated_at = now()
   WHERE c.outcome = 'pending'
     AND EXISTS (
       SELECT 1 FROM public.academic_years ay
       WHERE ay.institution_id = c.institution_id
         AND c.attendance_date BETWEEN ay.start_date AND ay.end_date
         AND ay.end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     );
  GET DIAGNOSTICS v_by_year = ROW_COUNT;

  -- Arm 2 — QUIET for quiet_close_days: no answer, and no covering act more
  -- recent than that. An act on the ask's session RESTARTS the clock — the
  -- learner was just invited to answer, so their window stays open. The act
  -- match here is by session key only (a freshness signal, not attribution:
  -- it can only ever EXTEND an ask's life, never attribute anything).
  UPDATE public.session_clarification_requests c
     SET outcome    = 'term_ended_unreported',
         outcome_at = now(),
         updated_at = now()
   WHERE c.outcome = 'pending'
     AND GREATEST(
           c.asked_at,
           COALESCE((SELECT max(ca.acted_at)
                     FROM public.clarification_acts ca
                     WHERE ca.attendance_date = c.attendance_date
                       AND ca.period_id = c.period_id
                       AND ca.institution_id = c.institution_id), c.asked_at)
         ) < now() - make_interval(days => v_quiet);
  GET DIAGNOSTICS v_by_quiet = ROW_COUNT;

  RETURN jsonb_build_object(
    'closed', v_by_year + v_by_quiet,
    'by_year_end', v_by_year,
    'by_quiet', v_by_quiet
  );
END;
$$;

-- service_role ONLY — authenticated is deliberately absent.
REVOKE EXECUTE ON FUNCTION public.fn_clarification_term_close() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_clarification_term_close() TO service_role;

COMMENT ON FUNCTION public.fn_clarification_term_close() IS
  'System-only (service_role; weekly cron piggybacked on work-signal-suggestions): closes still-pending re-explanation asks by WHICHEVER COMES FIRST (Director interview 2026-07-30) — (1) the ask''s academic year ENDED (public.academic_years dates; public.semesters carries no dates and semester_order means YEAR in some institutions, so neither is used), or (2) QUIET for quiet_close_days (config, default 60) with no covering act more recent than that (an act restarts the learner''s answer window). Both arms write the SAME blame-nobody label term_ended_unreported (interview-approved single bucket) — never counted as re-explained, never counted against anyone, excluded from all rates (spec decision 7).';

-- ---------------------------------------------------------------------------
-- 8) Work signal clarification_acts_recorded + fn_work_signals_for.
--    The function body below was taken VERBATIM from the live production
--    definition (pg_get_functiondef, verified byte-identical to 20260730013000
--    on 2026-07-30 before this file was written — the stale-body trap). The
--    ONLY changes: one new declared counter, one new count over
--    clarification_acts, and one new VALUES row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_work_signals_for(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_email text;
  v_uid   uuid := auth.uid();
  v_to    date := COALESCE(p_to,   (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_from  date := COALESCE(p_from, (now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_assigned_marked   int := 0;
  v_personal_marked   int := 0;
  v_witnessed         int := 0;
  v_pulses            int := 0;
  v_lessons           int := 0;
  v_notes             int := 0;
  v_verdicts          int := 0;
  v_votes             int := 0;
  v_last              timestamptz;
  v_od_handled        int := 0;
  v_od_waiting        int := 0;
  v_correctives_open  int := 0;
  v_carre_scored      int := 0;
  v_clarifications_open int := 0;
  v_acts_recorded     int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_work_signals_for: not authenticated';
  END IF;
  IF v_from > v_to THEN
    RAISE EXCEPTION 'fn_work_signals_for: p_from (%) is after p_to (%)', v_from, v_to;
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object(
      'window', jsonb_build_object('from', v_from, 'to', v_to),
      'subject_matched', false,
      'signals', '[]'::jsonb
    );
  END IF;

  WITH sess AS (
    SELECT sa.attendance_date AS ad, period.key AS pid, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN v_from AND v_to
  ),
  fac_sess AS (
    SELECT s.ad, s.pid
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE lower(COALESCE(af.el ->> 'faculty_email', '')) = v_email
  )
  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE (SELECT count(*) FROM public.session_feedback f
             WHERE f.attendance_date = fs.ad AND f.period_id = fs.pid
               AND lower(f.faculty_email) = v_email) >= 3
    )::int,
    max(fs.ad)::timestamptz
  INTO v_assigned_marked, v_witnessed, v_last
  FROM fac_sess fs;

  -- "Track both": sessions this caller PERSONALLY marked (marker attribution).
  SELECT count(*)::int INTO v_personal_marked
  FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN v_from AND v_to
    AND period.value->'marked_by_details'->>'marker_id' = v_uid::text;

  SELECT count(*)::int INTO v_pulses FROM public.scf_live_pulse lp
    WHERE lower(lp.faculty_email) = v_email AND lp.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_lessons FROM public.class_session_lesson csl
    JOIN public.profiles lb ON lb.id = csl.linked_by
    WHERE lower(lb.email) = v_email AND csl.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_notes FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.generated_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_verdicts FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.human_verdict_at IS NOT NULL AND sg.human_verdict_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_votes FROM public.scf_note_resolution_votes rv
    JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND rv.created_at::date BETWEEN v_from AND v_to;

  -- CARRE / compliance practice signals (2026-07-25). Deterministic ACTS only,
  -- self-scoped like everything above — never a score, never ranked, and the
  -- Respect pillar is deliberately NOT represented here (human-observed only).
  SELECT count(*)::int INTO v_od_handled
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid
    AND a.status::text IN ('approved','rejected')
    AND a.action_taken_at IS NOT NULL
    AND (a.action_taken_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

  -- "Waiting on you" is a NOW-state (queue depth), independent of the window.
  SELECT count(*)::int INTO v_od_waiting
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid AND a.status::text = 'pending';

  SELECT count(*)::int INTO v_correctives_open
  FROM public.tracker_items i
  JOIN public.tracker_item_assignees ta ON ta.item_id = i.id
  WHERE ta.assignee_id = v_uid AND i.is_active
    AND i.compliance_status NOT IN ('compliant','na');

  SELECT count(DISTINCT s.cycle_id)::int INTO v_carre_scored
  FROM public.care_audit_scores s
  JOIN public.audit_cycles c ON c.id = s.cycle_id
  WHERE s.scorer_id = v_uid
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND s.created_at::date BETWEEN v_from AND v_to;

  -- Re-explanation asks still open. A NOW-state queue depth like
  -- od_requests_waiting on a FIXED 14 IST days, deliberately NOT the caller's
  -- window: an open loop does not stop being open because someone narrowed a
  -- date filter. 'pending' = the learner has not reported back yet; it is never
  -- evidence that anyone refused or ignored the ask.
  -- Attribution comes from the SHARED view, which is the same one the card
  -- reads — the two can no longer disagree (hardening, 2026-07-30).
  SELECT count(*)::int INTO v_clarifications_open
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.outcome    = 'pending'
    AND a.asked_on_ist >= ((now() AT TIME ZONE 'Asia/Kolkata')::date - 14);

  -- Acts recorded on re-explanation asks (two-sided close, 2026-07-31). An
  -- ACT, not a score: counts the caller's own "I acted on this" records in the
  -- window. CONTEXT, NEVER EVIDENCE — this number feeds no evaluation.
  SELECT count(*)::int INTO v_acts_recorded
  FROM public.clarification_acts ca
  WHERE ca.lead_email = v_email
    AND (ca.acted_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

  v_last := GREATEST(
    v_last,
    (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp WHERE lower(lp.faculty_email) = v_email),
    (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg WHERE lower(sg.faculty_email) = v_email)
  );

  RETURN jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'subject_matched', true,
    'last_signal_at', v_last,
    'signals', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', t.signal_key, 'label', t.label, 'category', t.category,
          'unit', t.unit, 'attribution', t.attribution_mode,
          'value', v.value,
          'value_personal', v.value_personal,
          'action_route', t.action_route,
          'action_label', t.action_label
        ) ORDER BY t.sort_order
      )
      FROM public.work_signal_types t
      JOIN (VALUES
        ('sessions_marked',    v_assigned_marked, v_personal_marked),
        ('sessions_witnessed', v_witnessed,       NULL::int),
        ('pulses_run',         v_pulses,          NULL::int),
        ('lessons_linked',     v_lessons,         NULL::int),
        ('notes_received',     v_notes,           NULL::int),
        ('verdicts_given',     v_verdicts,        NULL::int),
        ('votes_received',     v_votes,           NULL::int),
        ('od_requests_handled',  v_od_handled,       NULL::int),
        ('od_requests_waiting',  v_od_waiting,       NULL::int),
        ('correctives_open',     v_correctives_open, NULL::int),
        ('carre_audits_scored',  v_carre_scored,     NULL::int),
        ('clarifications_open',  v_clarifications_open, NULL::int),
        ('clarification_acts_recorded', v_acts_recorded, NULL::int)
      ) AS v(key, value, value_personal) ON v.key = t.signal_key
      WHERE t.is_active
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;

-- Registry row — is_active asserted explicitly (the engine filters on it).
INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider,
   sort_order, action_route, action_label, is_active)
VALUES
  ('clarification_acts_recorded', 'Re-explanation acts recorded',
   'Times you recorded "I acted on this" against your sessions'' open re-explanation asks (went over it again, helped 1-on-1, shared material, or planned it) in the window. Context, never evidence: only the asking learner''s own report ever closes an ask.',
   'feedback', 'single', 'count', 'carre', 95,
   '/academic/session-feedback/faculty', 'Open session feedback', true)
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, is_active=true, updated_at=now();

-- ---------------------------------------------------------------------------
-- 9) Config row — the no-deploy kill switch for the whole two-sided close
--    (act button, follow-up prompts, term-close cron). Ships ENABLED,
--    consistent with the drip's on-from-day-one Director decision.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT
  'classroom_practice.acts', 'global', NULL,
  jsonb_build_object(
    'enabled', true,
    'quiet_close_days', 60,
    'followup_max_prompts', 2
  ),
  'Two-sided close for re-explanation asks. enabled=false is the KILL SWITCH (no deploy): hides the "I acted on this" button (fn_scf_clarification_act refuses), silences the learner "did it help?" follow-up (fn_clarification_followup_pending returns null), and no-ops the weekly term-close (fn_clarification_term_close). quiet_close_days = auto-close an unanswered ask after this many quiet days (no answer, no newer covering act) — the "whichever comes first" partner of the academic-year-end close (Director interview 2026-07-30). followup_max_prompts = serve the "did it help?" card at most this many times per ask, then go quiet forever (same interview). Acts are context, never evidence — see the spec''s decision 4.',
  'object', true, true, 'operational', 'published', 'json', 'Classroom Practice'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'classroom_practice.acts'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

NOTIFY pgrst, 'reload schema';
