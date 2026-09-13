-- =============================================================================
-- 20261210071700_counselor_briefing_effect.sql
-- Admission-counselor loop (Wave 2, the last loop family) — the MEASUREMENT
-- edge: nightly briefing → counselor action → lead conversion, measured per
-- counselor per week against that counselor's OWN trailing 8 weeks.
--
-- Built exactly per the Director's five tap-answers (2026-09-06, file
-- .claude/admission-counselor-thrash-2026-08-26.md, section ANSWERED):
--   1. an action is briefing-driven ONLY when it is on a lead the briefing
--      NAMED (tight; general behaviour change is deliberately not credited);
--   2. the delta is against the counselor's OWN trailing 8 weeks;
--   3. a "win" = ANY forward stage move of the lead (not admitted, not fee);
--   4. COUNTER-METRIC: a counselor who ignores briefings (zero actions on
--      named leads across the last N briefings) yet moves leads forward at or
--      above their own baseline is FLAGGED 'briefing changed nothing' — the
--      loop's safety gauge, stored as a column, surfaced by the read fn.
--      Director 2026-09-13: this flag is for the super admin ONLY (the
--      /admin/loops audience) — NOT sent to admission team members or the
--      counselor, no notification of any kind. So the results table's SELECT
--      policy is is_super_admin() alone and the read fn's gate is service_role
--      or super admin — narrower than the consultants sibling on purpose.
--      NOTE: no /admin/loops panel reads counselor_briefing_effects yet (the
--      consultants sibling is in the same state); until a follow-up UI PR wires
--      one, the flag is reachable only by a super admin reading the table or
--      calling fn_counselor_briefing_effect_by_college;
--   5. INDEPENDENT of the weekly intake-readiness alarm (#3008) but MAY feed
--      it: fn_counselor_briefing_effect_by_college(institution_id) is the one
--      read fn a future alarm edge can call. The alarm itself is untouched.
--
-- ⛔ RECOMMENDATION-ONLY (same posture as the consultants edge 20261003010000):
-- nothing here writes admission_leads, admission_counselors,
-- admission_daily_briefings, call logs, activities or any money path. The
-- only writes are the loop's own results table and the loop_audits verdict.
--
-- WHERE THE NAMED LEADS LIVE (production sweep 2026-09-06): the briefing
-- generator (lib/services/admission/briefing-delivery-service.ts →
-- generateDailyBriefing) persists STRUCTURED action items in
-- admission_daily_briefings.content->'action_items', and every hot-lead item
-- carries id = 'hot-<admission_leads.id>' plus link '/admission/leads/<id>'.
-- So the named lead ids are ALREADY persisted at generation time — no new
-- column is needed. This file reads them back with a strict regex on that id
-- shape. The 'overdue-batch' item names nobody and is ignored.
--
-- WHAT A "LEAD" IS: a row of public.admission_leads — the briefing generator's
-- own population (it reads every admission_leads row of the institution, no
-- admission-year filter). The intake-readiness alarm (20260825020000) has NO
-- admission_leads definition at all: its population is learners_profiles
-- scoped to admission_years.is_current. The two therefore cannot share a
-- literal predicate; the bridge offered here is named_leads_current_year_n —
-- how many of the week's named leads carry the institution's CURRENT
-- admission_year_id (the alarm's own is_current predicate) — so a future feed
-- can filter on the alarm's terms without this loop changing its own.
--
-- CANONICAL STAGE-CHANGE SOURCE: public.admission_lead_stage_history, written
-- by the BEFORE UPDATE trigger fn on admission_leads whenever funnel_stage
-- changes (supabase/migrations/admission/001_enums_and_functions.sql) and by
-- capture_admission_lead on creation (20260520160000). Columns used:
-- lead_id, from_stage, to_stage, created_at, changed_by — catalog-verified
-- 2026-09-13 against types/supabase.ts (regenerated from production
-- 2026-09-12) — NOT changed_at (does not exist).
--
-- ACTION SOURCES (both, unioned): admission_lead_activities (created_by,
-- lead_id, created_at — no institution_id / performed_by in production, the
-- 002_core_tables.sql shape is stale) and admission_call_logs (counselor_id,
-- lead_id, started_at/created_at — the attribution
-- lib/services/telephony/call-attribution.ts resolves counselor_id to
-- profiles.id, the same id admission_counselors.user_id carries).
--
-- Every column referenced below was checked against types/supabase.ts
-- (regenerated from production 2026-09-12, checked 2026-09-13), and the whole
-- file was EXECUTED on a throwaway Postgres 16 with a production-shaped
-- fixture (the regress sim returned 'measure-verified') — CI parses
-- migrations but never runs plpgsql bodies (see 20261005010000):
-- admission_daily_briefings
-- (institution_id, user_id, briefing_date, content), admission_lead_activities
-- (created_by, lead_id, created_at), admission_call_logs (counselor_id,
-- lead_id, started_at, created_at), admission_lead_stage_history (lead_id,
-- from_stage, to_stage, created_at), admission_counselors (id, user_id,
-- institution_id, name, email, is_active), admission_leads (id,
-- institution_id, admission_year_id), admission_years (id, institution_id,
-- is_current), profiles (id, full_name, created_at), loop_registry
-- (loop_key, name, stack_tier, loop_class, domain, description, gates,
-- routine_id, owner_email, outcome_metric, counter_metric, baseline_window,
-- intervention, verdict_owner, remeasure_window), loop_audits (loop_key,
-- layer, verdict, evidence), ai_routine_schedules (routine_id, enabled,
-- managed, days_of_week, minute_of_day, max_only), platform_policies
-- (policy_key, scope_type, value, data_type, classification,
-- publication_state, is_active, description).
--
-- FILE ONLY / NOT APPLIED — apply is the orchestrator's merge-time step.
-- No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- =============================================================================

-- ── 1. Results table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.counselor_briefing_effects (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id              uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  counselor_id                uuid NOT NULL REFERENCES public.admission_counselors(id) ON DELETE CASCADE,
  counselor_user_id           uuid,                    -- profiles.id the actions were matched on
  week_start                  date NOT NULL,           -- Monday (date_trunc('week'))
  week_end                    date NOT NULL,           -- exclusive
  briefings_n                 integer NOT NULL DEFAULT 0,  -- distinct briefing dates for the institution in the week
  named_leads_n               integer NOT NULL DEFAULT 0,  -- distinct leads those briefings named
  named_leads_current_year_n  integer NOT NULL DEFAULT 0,  -- of those, leads on the institution's CURRENT admission year (the alarm's predicate)
  named_leads_actioned_n      integer NOT NULL DEFAULT 0,  -- named leads THIS counselor acted on within action_window_days of the naming briefing
  named_action_rate           numeric,                 -- % (2 dp) = named_leads_actioned_n / named_leads_n — per-COUNSELOR numerator over the INSTITUTION's named leads (the briefing is one per-institution row); NULL when named_leads_n = 0
  named_forward_n             integer NOT NULL DEFAULT 0,  -- of the actioned named leads, those with a forward stage move within action_window_days after the first action
  named_forward_rate          numeric,                 -- % (2 dp); NULL below min_n_k
  baseline_acted_n            integer NOT NULL DEFAULT 0,  -- distinct leads the counselor acted on in the trailing 8 weeks before week_start
  baseline_forward_n          integer NOT NULL DEFAULT 0,
  baseline_forward_rate       numeric,                 -- % (2 dp); NULL below min_n_k — SAME estimator as named_forward_rate
  forward_delta               numeric,                 -- percentage POINTS (named − baseline); NULL when either side is NULL
  week_acted_all_n            integer NOT NULL DEFAULT 0,  -- ALL distinct leads the counselor acted on in the week (named or not)
  week_forward_all_n          integer NOT NULL DEFAULT 0,
  week_forward_all_rate       numeric,                 -- % (2 dp); NULL below min_n_k — the counter-metric's numerator
  ignored_briefings_n         integer NOT NULL DEFAULT 0,  -- of the last ignore_briefings_n named briefings, how many this counselor took NO named-lead action on
  briefing_changed_nothing    boolean NOT NULL DEFAULT false, -- COUNTER-METRIC flag (Director answer 4)
  action_window_days          integer NOT NULL,        -- the knobs in force when this row was measured
  ignore_briefings_n          integer NOT NULL,
  min_n_k                     integer NOT NULL,
  measured_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (week_end > week_start),
  UNIQUE (counselor_id, week_start)
);

COMMENT ON TABLE public.counselor_briefing_effects IS
  'Admission-counselor loop MEASUREMENT spine (Wave 2, Director answers 2026-09-06). One row per (counselor, ISO week): rate of action on briefing-NAMED leads, forward-move rate on those leads vs the counselor''s OWN trailing-8-week forward-move rate (same estimator both sides; NOT the same population — named leads are the generator''s top-3 hot leads, the baseline is every lead touched, so forward_delta carries hot-lead selection and is not a causal lift), the delta in percentage points, and the counter-metric flag briefing_changed_nothing. READ-ONLY telemetry — nothing consumes these rows to route leads, rate counselors or pay anything.';
COMMENT ON COLUMN public.counselor_briefing_effects.briefing_changed_nothing IS
  'COUNTER-METRIC (Director answer 4): true when the counselor took no action on any named lead across the last ignore_briefings_n named briefings AND still moved leads forward at or above their own 8-week baseline this week. The briefing cost money and changed nothing. Director 2026-09-13: super-admin ONLY (the /admin/loops audience; no /admin/loops panel reads this table yet — follow-up UI PR) — never sent to admission team members or the counselor, no notification of any kind.';
COMMENT ON COLUMN public.counselor_briefing_effects.named_action_rate IS
  'named_leads_actioned_n / named_leads_n as a % (2 dp). NUMERATOR is this counselor''s own actions; DENOMINATOR is every lead the INSTITUTION''s briefings named that week (the briefing is one per-institution row read by every counselor of that institution — useTodaysBriefing(institutionId) has no user filter). Several counselors share one list, so ~100/N% is the practical ceiling for N active counselors — a low value is NOT "ignored most of the briefing". NULL when nothing was named.';
COMMENT ON COLUMN public.counselor_briefing_effects.named_leads_current_year_n IS
  'Bridge to the intake-readiness alarm (#3008): named leads whose admission_year_id is the institution''s admission_years.is_current row — the alarm''s own population predicate. This loop does NOT filter by it.';

CREATE INDEX IF NOT EXISTS idx_cbe_institution_week
  ON public.counselor_briefing_effects (institution_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_cbe_counselor_week
  ON public.counselor_briefing_effects (counselor_id, week_start DESC);

-- ── 2. RLS — super-admin reads ONLY; writes only via the DEFINER measure fn ──
-- Shape mirrors the consultants sibling (20261003010000: ENABLE RLS, one
-- SELECT policy, REVOKE anon/authenticated/PUBLIC, GRANT SELECT authenticated
-- so the policy is what gates). The PREDICATE is deliberately narrower than
-- the sibling's (is_super_admin() OR is_admin() OR admission.leads.view):
-- Director 2026-09-13 — the counter-metric flag is for the super admin only
-- (the /admin/loops audience; /admin/loops gates on profiles.is_super_admin
-- server-side, though no panel there reads this table yet — follow-up UI PR),
-- never for admission team members or the counselor.
-- service_role (the cron / server) bypasses RLS as always.

ALTER TABLE public.counselor_briefing_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cbe_select" ON public.counselor_briefing_effects;
CREATE POLICY "cbe_select" ON public.counselor_briefing_effects
FOR SELECT USING (
  is_super_admin()
);

REVOKE ALL ON public.counselor_briefing_effects FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.counselor_briefing_effects TO authenticated;

-- ── 3. Knobs as config rows (every policy decision = a config row) ───────────
-- Shape mirrors consultants.loop.min_attributions_k (20261003010000):
-- scope_type 'global', data_type 'number', composite-expression conflict
-- target (a bare ON CONFLICT (policy_key) raises 42P10 here).

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('admission.briefing_loop.action_window_days', 'global', '7'::jsonb, 'number', 'major', 'published', true,
   'Days after a briefing within which an action on a lead that briefing NAMED counts as briefing-driven; also the window after the first action within which a forward stage move counts as a win.'),
  ('admission.briefing_loop.ignore_briefings_n', 'global', '5'::jsonb, 'number', 'major', 'published', true,
   'Counter-metric lookback: a counselor with zero named-lead actions across this many consecutive most-recent named briefings is treated as ignoring briefings.'),
  ('admission.briefing_loop.min_n_k', 'global', '3'::jsonb, 'number', 'major', 'published', true,
   'De-noise floor: minimum leads on a side (named-actioned, baseline, or week-all) before a forward-move rate is computed. Below this the rate — and therefore forward_delta — stays NULL.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 4. loop_registry seed ────────────────────────────────────────────────────
-- Owner at birth: the Director, interim (standing ruling 2026-08-26). The
-- constitution (20260726012000) makes owner_email NOT NULL + non-empty, so an
-- ON CONFLICT DO NOTHING cannot rescue a missing owner — it is set here.
-- Charter legs are filled from the five answers, as the lane spec instructs.
-- Feed-forward gate OFF on purpose: outputs are advisory rows a human reads.

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email,
   outcome_metric, counter_metric, baseline_window, intervention, verdict_owner, remeasure_window)
VALUES
  ('counselor-briefing-effect',
   'Counselor Briefing Effect Loop',
   3, 'cadence', 'admission',
   'Nightly counselor briefing names leads → counselor acts on the NAMED leads (activities + call logs) → forward stage move of those leads, measured per counselor per week against that counselor''s own trailing 8 weeks. Advisory rows only (counselor_briefing_effects); nothing routes leads, rates counselors or pays anything.',
   '{"g":"on","a":"on","m":"half","f":"off"}'::jsonb,
   'counselor-briefing-measure',
   'director@jkkn.ac.in',
   'Forward-move rate on briefing-named leads the counselor acted on (any forward funnel_stage move within 7 days of the first action), in percentage points vs own baseline',
   'briefing_changed_nothing: a counselor with zero actions on named leads across the last 5 named briefings whose week forward-move rate on all their leads is at or above their own 8-week baseline — the briefing cost money and changed nothing',
   '8 weeks',
   'The nightly counselor briefing (routine admission-counselor-briefing, 06:00 IST) naming up to 3 hot leads per institution per day',
   'director@jkkn.ac.in',
   'weekly (re-measured daily for the current and previous 2 weeks; action window 7 days)')
ON CONFLICT (loop_key) DO NOTHING;

-- ── 5. Forward-move predicate — the closed vocabulary, one place ─────────────
-- Director answer 3: a win is ANY forward move in the pipeline. The
-- funnel_stage enum's declaration order is NOT a pipeline order
-- (not_reachable sits between contacted and interested; the loss stages come
-- after confirmed), so the rank is explicit here. Legacy aliases map onto
-- their canonical stage (applied ≈ application_submitted, interviewed ≈
-- interview_completed, offered ≈ offer_sent). A move INTO not_reachable or a
-- loss/idle stage is never forward; a move OUT of one back into the pipeline
-- (a revival) is forward. Plain SQL, IMMUTABLE, no data access.

CREATE OR REPLACE FUNCTION public.fn_counselor_briefing_stage_rank(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT CASE p_stage
    WHEN 'new'                   THEN 1
    WHEN 'contacted'             THEN 2
    WHEN 'interested'            THEN 3
    WHEN 'follow_up_scheduled'   THEN 4
    WHEN 'engaged'               THEN 5
    WHEN 'qualified'             THEN 6
    WHEN 'application_started'   THEN 7
    WHEN 'application_submitted' THEN 8
    WHEN 'applied'               THEN 8
    WHEN 'documents_pending'     THEN 9
    WHEN 'documents_verified'    THEN 10
    WHEN 'interview_scheduled'   THEN 11
    WHEN 'interview_completed'   THEN 12
    WHEN 'interviewed'           THEN 12
    WHEN 'offer_sent'            THEN 13
    WHEN 'offered'               THEN 13
    WHEN 'offer_accepted'        THEN 14
    WHEN 'token_paid'            THEN 15
    WHEN 'enrolled'              THEN 16
    WHEN 'confirmed'             THEN 17
    ELSE NULL   -- not_reachable, declined, withdrew, expired, lost, dormant, unknown
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_counselor_briefing_is_forward(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT public.fn_counselor_briefing_stage_rank(p_to) IS NOT NULL
     AND (
       p_from IS NULL
       OR public.fn_counselor_briefing_stage_rank(p_from) IS NULL
       OR public.fn_counselor_briefing_stage_rank(p_to) > public.fn_counselor_briefing_stage_rank(p_from)
     );
$function$;

COMMENT ON FUNCTION public.fn_counselor_briefing_is_forward(text, text) IS
  'Counselor-briefing loop: true when a funnel_stage transition is a forward pipeline move (Director answer 3). Rank table in fn_counselor_briefing_stage_rank; into not_reachable/loss/idle stages is never forward, out of them is.';

-- Pure helpers, not SECURITY DEFINER — still locked to the house pattern.
REVOKE EXECUTE ON FUNCTION public.fn_counselor_briefing_stage_rank(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_counselor_briefing_stage_rank(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_counselor_briefing_is_forward(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_counselor_briefing_is_forward(text, text) TO authenticated, service_role;

-- ── 6. The MEASURE fn ────────────────────────────────────────────────────────
-- INVARIANT: named-forward, baseline-forward and week-all-forward all use the
-- SAME estimator — distinct leads the counselor acted on, anchored at the
-- FIRST qualifying action, a forward stage move within action_window_days
-- after that anchor, rate = round(forward/acted*100, 2), NULL below k.
-- KNOWN CONFOUND (not a bug in the estimator): the two sides of forward_delta
-- are different POPULATIONS. The named side is only the leads the briefing
-- named — the generator's top-3 is_hot_lead by score
-- (lib/services/admission/briefing-delivery-service.ts) — while the baseline
-- (Director answer 2, literal) is EVERY lead the counselor touched in the
-- trailing 8 weeks. Hot leads convert better than average leads whether or
-- not the briefing was read, so forward_delta carries hot-lead SELECTION as
-- well as any briefing effect; a counselor working their own hot list can
-- post the same positive delta as one acting on the briefing. Read it as
-- 'named-lead forward rate vs own all-lead baseline', not as a causal lift.
-- Changing the baseline population (e.g. hot leads only) changes Director
-- answer 2 and is the Director's call, not taken here.
-- p_counselor_id scopes a run to one counselor (used by the regress sim);
-- p_action_window_days / p_ignore_briefings_n / p_min_n override the policy
-- rows (sim only — production callers omit them).

CREATE OR REPLACE FUNCTION public.fn_counselor_briefing_measure(
  p_as_of               date    DEFAULT CURRENT_DATE,
  p_weeks_back          integer DEFAULT 2,
  p_counselor_id        uuid    DEFAULT NULL,
  p_action_window_days  integer DEFAULT NULL,
  p_ignore_briefings_n  integer DEFAULT NULL,
  p_min_n               integer DEFAULT NULL
)
RETURNS TABLE(
  institution_id              uuid,
  counselor_id                uuid,
  week_start                  date,
  week_end                    date,
  briefings_n                 integer,
  named_leads_n               integer,
  named_leads_current_year_n  integer,
  named_leads_actioned_n      integer,
  named_action_rate           numeric,
  named_forward_n             integer,
  named_forward_rate          numeric,
  baseline_acted_n            integer,
  baseline_forward_n          integer,
  baseline_forward_rate       numeric,
  forward_delta               numeric,
  week_acted_all_n            integer,
  week_forward_all_n          integer,
  week_forward_all_rate       numeric,
  ignored_briefings_n         integer,
  briefing_changed_nothing    boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_win   integer;
  v_n     integer;
  v_k     integer;
  v_w     integer;
  v_ws    date;
  v_we    date;
  v_bs    date;
  -- briefing_date is an IST calendar date (the service computes p_as_of in
  -- IST too), so every day/week boundary below is an IST midnight — never a
  -- bare date::timestamptz, which resolves at the server TimeZone (UTC on
  -- Supabase) and would shift 00:00-05:30 IST actions into the previous day.
  v_ws_ts   timestamptz;
  v_we_ts   timestamptz;
  v_bs_ts   timestamptz;
  v_lo_ts   timestamptz;   -- v_ws - 60 days: how far back named briefings / actions / moves are read
  v_hi_ts   timestamptz;   -- v_we + action window: last action that can still be briefing-driven
  v_hi2_ts  timestamptz;   -- v_we + 2 windows: last forward move that can still follow such an action
BEGIN
  IF p_weeks_back IS NULL OR p_weeks_back < 0 THEN
    RAISE EXCEPTION 'p_weeks_back must be >= 0';
  END IF;

  v_win := COALESCE(
    p_action_window_days,
    (SELECT (pp.value #>> '{}')::int FROM public.platform_policies pp
      WHERE pp.policy_key = 'admission.briefing_loop.action_window_days'
        AND pp.scope_type = 'global' AND pp.is_active LIMIT 1),
    7);
  v_n := COALESCE(
    p_ignore_briefings_n,
    (SELECT (pp.value #>> '{}')::int FROM public.platform_policies pp
      WHERE pp.policy_key = 'admission.briefing_loop.ignore_briefings_n'
        AND pp.scope_type = 'global' AND pp.is_active LIMIT 1),
    5);
  v_k := COALESCE(
    p_min_n,
    (SELECT (pp.value #>> '{}')::int FROM public.platform_policies pp
      WHERE pp.policy_key = 'admission.briefing_loop.min_n_k'
        AND pp.scope_type = 'global' AND pp.is_active LIMIT 1),
    3);
  IF v_win < 1 OR v_n < 1 OR v_k < 1 THEN
    RAISE EXCEPTION 'action_window_days, ignore_briefings_n and min_n_k must all be >= 1 (got %, %, %)', v_win, v_n, v_k;
  END IF;

  FOR v_w IN 0..p_weeks_back LOOP
    v_ws := (date_trunc('week', COALESCE(p_as_of, CURRENT_DATE)::timestamp))::date - (v_w * 7);
    v_we := v_ws + 7;
    v_bs := v_ws - 56;   -- Director answer 2: own trailing 8 weeks
    v_ws_ts  := v_ws::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_we_ts  := v_we::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_bs_ts  := v_bs::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_lo_ts  := (v_ws - 60)::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_hi_ts  := (v_we + v_win)::timestamp AT TIME ZONE 'Asia/Kolkata';
    v_hi2_ts := (v_we + (2 * v_win))::timestamp AT TIME ZONE 'Asia/Kolkata';

    RETURN QUERY
    WITH cs AS (
      -- Counselors in scope: must carry a user_id (actions are matched on it).
      -- A scoped run (sim) ignores is_active so a sentinel row is measured.
      -- ONE row per user_id: admission_counselors has no UNIQUE on user_id, and
      -- two counselor rows for the same person would each be credited the same
      -- actions (double-counting every aggregate). Active, then oldest, wins.
      SELECT DISTINCT ON (c.user_id)
             c.id AS cid, c.user_id AS uid, c.institution_id AS iid
      FROM public.admission_counselors c
      WHERE c.user_id IS NOT NULL
        AND c.institution_id IS NOT NULL
        AND (p_counselor_id IS NULL OR c.id = p_counselor_id)
        AND (p_counselor_id IS NOT NULL OR COALESCE(c.is_active, true))
      ORDER BY c.user_id, COALESCE(c.is_active, true) DESC, c.created_at ASC NULLS LAST, c.id ASC
    ),
    named AS (
      -- Director answer 1: the leads a briefing NAMED — read back from the
      -- structured action items the generator persisted (id = 'hot-<lead id>').
      -- Dedup per (institution, date): briefings are per-institution rows even
      -- when more than one user row exists for a date.
      SELECT DISTINCT b.institution_id AS iid, b.briefing_date AS bdate,
             substr(ai ->> 'id', 5)::uuid AS lead_id
      FROM public.admission_daily_briefings b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(b.content -> 'action_items') = 'array'
             THEN b.content -> 'action_items' ELSE '[]'::jsonb END) AS ai
      WHERE b.briefing_date >= v_ws - 60
        AND b.briefing_date <  v_we
        AND b.institution_id IN (SELECT cs.iid FROM cs)
        AND (ai ->> 'id') ~ '^hot-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ),
    acts AS (
      -- Both action sources, unioned; matched on profiles.id.
      SELECT a.created_by AS uid, a.lead_id, a.created_at AS acted_at
      FROM public.admission_lead_activities a
      WHERE a.created_by IS NOT NULL
        AND a.created_at >= v_lo_ts
        AND a.created_at <  v_hi_ts
        AND a.created_by IN (SELECT cs.uid FROM cs)
      UNION ALL
      SELECT l.counselor_id, l.lead_id, COALESCE(l.started_at, l.created_at)
      FROM public.admission_call_logs l
      WHERE l.counselor_id IS NOT NULL
        AND l.lead_id IS NOT NULL
        AND COALESCE(l.started_at, l.created_at) >= v_lo_ts
        AND COALESCE(l.started_at, l.created_at) <  v_hi_ts
        AND l.counselor_id IN (SELECT cs.uid FROM cs)
    ),
    fwd AS (
      -- Director answer 3: any forward stage move, from the canonical history.
      SELECT h.lead_id, h.created_at AS moved_at
      FROM public.admission_lead_stage_history h
      WHERE h.created_at >= v_lo_ts
        AND h.created_at <  v_hi2_ts
        AND public.fn_counselor_briefing_is_forward(h.from_stage::text, h.to_stage::text)
    ),
    wk_named AS (
      SELECT n.iid, n.bdate, n.lead_id FROM named n
      WHERE n.bdate >= v_ws AND n.bdate < v_we
    ),
    wk_named_ct AS (
      SELECT wn.iid,
             count(DISTINCT wn.lead_id)::int AS named_n,
             count(DISTINCT wn.lead_id) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM public.admission_leads al
                 JOIN public.admission_years ay ON ay.id = al.admission_year_id
                 WHERE al.id = wn.lead_id AND ay.is_current AND ay.institution_id = wn.iid))::int AS named_cy_n
      FROM wk_named wn
      GROUP BY wn.iid
    ),
    bcount AS (
      SELECT b.institution_id AS iid, count(DISTINCT b.briefing_date)::int AS bn
      FROM public.admission_daily_briefings b
      WHERE b.briefing_date >= v_ws AND b.briefing_date < v_we
        AND b.institution_id IN (SELECT cs.iid FROM cs)
      GROUP BY b.institution_id
    ),
    na AS (
      -- Named lead × counselor: first action within the window after the naming briefing.
      SELECT cs.cid, wn.lead_id, min(a.acted_at) AS first_at
      FROM cs
      JOIN wk_named wn ON wn.iid = cs.iid
      JOIN acts a ON a.uid = cs.uid AND a.lead_id = wn.lead_id
       AND a.acted_at >= (wn.bdate::timestamp AT TIME ZONE 'Asia/Kolkata')
       AND a.acted_at <  ((wn.bdate + v_win)::timestamp AT TIME ZONE 'Asia/Kolkata')
      GROUP BY cs.cid, wn.lead_id
    ),
    na_ct AS (
      SELECT na.cid, count(*)::int AS acted_n,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM fwd f WHERE f.lead_id = na.lead_id
                 AND f.moved_at >  na.first_at
                 AND f.moved_at <= na.first_at + make_interval(days => v_win)))::int AS fwd_n
      FROM na GROUP BY na.cid
    ),
    base AS (
      -- Baseline: every distinct lead the counselor acted on in the trailing 8 weeks (named or not).
      SELECT cs.cid, a.lead_id, min(a.acted_at) AS first_at
      FROM cs JOIN acts a ON a.uid = cs.uid
      WHERE a.acted_at >= v_bs_ts AND a.acted_at < v_ws_ts
      GROUP BY cs.cid, a.lead_id
    ),
    base_ct AS (
      SELECT b.cid, count(*)::int AS acted_n,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM fwd f WHERE f.lead_id = b.lead_id
                 AND f.moved_at >  b.first_at
                 AND f.moved_at <= b.first_at + make_interval(days => v_win)))::int AS fwd_n
      FROM base b GROUP BY b.cid
    ),
    wk_all AS (
      -- Counter-metric numerator: ALL leads the counselor acted on this week.
      SELECT cs.cid, a.lead_id, min(a.acted_at) AS first_at
      FROM cs JOIN acts a ON a.uid = cs.uid
      WHERE a.acted_at >= v_ws_ts AND a.acted_at < v_we_ts
      GROUP BY cs.cid, a.lead_id
    ),
    wk_all_ct AS (
      SELECT w.cid, count(*)::int AS acted_n,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM fwd f WHERE f.lead_id = w.lead_id
                 AND f.moved_at >  w.first_at
                 AND f.moved_at <= w.first_at + make_interval(days => v_win)))::int AS fwd_n
      FROM wk_all w GROUP BY w.cid
    ),
    lastn AS (
      -- The last v_n NAMED briefings (distinct dates) per institution before week end.
      SELECT d.iid, d.bdate, row_number() OVER (PARTITION BY d.iid ORDER BY d.bdate DESC) AS rn
      FROM (SELECT DISTINCT n.iid, n.bdate FROM named n
            WHERE n.bdate < v_we
              -- Only briefings whose action window has CLOSED by the measurement
              -- date: an in-flight week must never count a briefing the counselor
              -- still has days to act on as 'ignored'. Final stored values are
              -- unchanged — a week's last re-measure runs at ws+14..ws+20, after
              -- its last briefing's window closes at ws+13.
              AND n.bdate + v_win <= COALESCE(p_as_of, CURRENT_DATE)) d
    ),
    ignored AS (
      SELECT cs.cid,
             count(*)::int AS avail_n,
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM named n
               JOIN acts a ON a.uid = cs.uid AND a.lead_id = n.lead_id
                AND a.acted_at >= (n.bdate::timestamp AT TIME ZONE 'Asia/Kolkata')
                AND a.acted_at <  ((n.bdate + v_win)::timestamp AT TIME ZONE 'Asia/Kolkata')
               WHERE n.iid = ln.iid AND n.bdate = ln.bdate))::int AS ignored_n
      FROM cs JOIN lastn ln ON ln.iid = cs.iid AND ln.rn <= v_n
      GROUP BY cs.cid
    ),
    rated AS (
      SELECT
        cs.cid, cs.uid, cs.iid,
        COALESCE(bc.bn, 0)          AS briefings_n,
        COALESCE(wc.named_n, 0)     AS named_n,
        COALESCE(wc.named_cy_n, 0)  AS named_cy_n,
        COALESCE(nc.acted_n, 0)     AS na_n,
        COALESCE(nc.fwd_n, 0)       AS na_f,
        COALESCE(bt.acted_n, 0)     AS b_n,
        COALESCE(bt.fwd_n, 0)       AS b_f,
        COALESCE(wa.acted_n, 0)     AS w_n,
        COALESCE(wa.fwd_n, 0)       AS w_f,
        COALESCE(ig.avail_n, 0)     AS avail_n,
        COALESCE(ig.ignored_n, 0)   AS ignored_n,
        CASE WHEN COALESCE(wc.named_n, 0) > 0
             THEN round(COALESCE(nc.acted_n, 0)::numeric / wc.named_n * 100, 2) END AS na_rate,
        CASE WHEN COALESCE(nc.acted_n, 0) >= v_k
             THEN round(nc.fwd_n::numeric / nc.acted_n * 100, 2) END          AS na_frate,
        CASE WHEN COALESCE(bt.acted_n, 0) >= v_k
             THEN round(bt.fwd_n::numeric / bt.acted_n * 100, 2) END          AS b_frate,
        CASE WHEN COALESCE(wa.acted_n, 0) >= v_k
             THEN round(wa.fwd_n::numeric / wa.acted_n * 100, 2) END          AS w_frate
      FROM cs
      LEFT JOIN bcount      bc ON bc.iid = cs.iid
      LEFT JOIN wk_named_ct wc ON wc.iid = cs.iid
      LEFT JOIN na_ct       nc ON nc.cid = cs.cid
      LEFT JOIN base_ct     bt ON bt.cid = cs.cid
      LEFT JOIN wk_all_ct   wa ON wa.cid = cs.cid
      LEFT JOIN ignored     ig ON ig.cid = cs.cid
      -- A counselor with no briefing this week and no action this week has
      -- nothing to say — no row (never a fabricated zero).
      WHERE COALESCE(bc.bn, 0) > 0 OR COALESCE(wa.acted_n, 0) > 0
    ),
    upserted AS (
      INSERT INTO public.counselor_briefing_effects AS m
        (institution_id, counselor_id, counselor_user_id, week_start, week_end,
         briefings_n, named_leads_n, named_leads_current_year_n,
         named_leads_actioned_n, named_action_rate,
         named_forward_n, named_forward_rate,
         baseline_acted_n, baseline_forward_n, baseline_forward_rate,
         forward_delta,
         week_acted_all_n, week_forward_all_n, week_forward_all_rate,
         ignored_briefings_n, briefing_changed_nothing,
         action_window_days, ignore_briefings_n, min_n_k, measured_at)
      SELECT
        r.iid, r.cid, r.uid, v_ws, v_we,
        r.briefings_n, r.named_n, r.named_cy_n,
        r.na_n, r.na_rate,
        r.na_f, r.na_frate,
        r.b_n, r.b_f, r.b_frate,
        CASE WHEN r.na_frate IS NOT NULL AND r.b_frate IS NOT NULL
             THEN round(r.na_frate - r.b_frate, 2) END,
        r.w_n, r.w_f, r.w_frate,
        r.ignored_n,
        -- Director answer 4, exactly: ignored ALL of the last N named briefings
        -- (and N were available) yet converts at/above own baseline.
        (r.avail_n >= v_n AND r.ignored_n >= v_n
         AND r.w_frate IS NOT NULL AND r.b_frate IS NOT NULL
         AND r.w_frate >= r.b_frate),
        v_win, v_n, v_k, now()
      FROM rated r
      ON CONFLICT (counselor_id, week_start) DO UPDATE SET
        institution_id             = EXCLUDED.institution_id,
        counselor_user_id          = EXCLUDED.counselor_user_id,
        week_end                   = EXCLUDED.week_end,
        briefings_n                = EXCLUDED.briefings_n,
        named_leads_n              = EXCLUDED.named_leads_n,
        named_leads_current_year_n = EXCLUDED.named_leads_current_year_n,
        named_leads_actioned_n     = EXCLUDED.named_leads_actioned_n,
        named_action_rate          = EXCLUDED.named_action_rate,
        named_forward_n            = EXCLUDED.named_forward_n,
        named_forward_rate         = EXCLUDED.named_forward_rate,
        baseline_acted_n           = EXCLUDED.baseline_acted_n,
        baseline_forward_n         = EXCLUDED.baseline_forward_n,
        baseline_forward_rate      = EXCLUDED.baseline_forward_rate,
        forward_delta              = EXCLUDED.forward_delta,
        week_acted_all_n           = EXCLUDED.week_acted_all_n,
        week_forward_all_n         = EXCLUDED.week_forward_all_n,
        week_forward_all_rate      = EXCLUDED.week_forward_all_rate,
        ignored_briefings_n        = EXCLUDED.ignored_briefings_n,
        briefing_changed_nothing   = EXCLUDED.briefing_changed_nothing,
        action_window_days         = EXCLUDED.action_window_days,
        ignore_briefings_n         = EXCLUDED.ignore_briefings_n,
        min_n_k                    = EXCLUDED.min_n_k,
        measured_at                = EXCLUDED.measured_at,
        updated_at                 = now()
      RETURNING m.*
    )
    SELECT
      u.institution_id, u.counselor_id, u.week_start, u.week_end,
      u.briefings_n, u.named_leads_n, u.named_leads_current_year_n,
      u.named_leads_actioned_n, u.named_action_rate,
      u.named_forward_n, u.named_forward_rate,
      u.baseline_acted_n, u.baseline_forward_n, u.baseline_forward_rate,
      u.forward_delta,
      u.week_acted_all_n, u.week_forward_all_n, u.week_forward_all_rate,
      u.ignored_briefings_n, u.briefing_changed_nothing
    FROM upserted u;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_counselor_briefing_measure(date, integer, uuid, integer, integer, integer) IS
  'Counselor-briefing loop MEASURE fn: per counselor per ISO week — named-lead action rate, forward-move rate on named leads vs the counselor''s OWN trailing-8-week forward-move rate (same estimator both sides, >= k floor), the delta in pp, and the counter-metric flag briefing_changed_nothing. Writes/refreshes counselor_briefing_effects rows and returns them. MEASUREMENT ONLY — routes nothing, rates nobody, pays nothing.';

-- Lock: SECURITY DEFINER ⇒ explicit revoke from anon AND PUBLIC in the same
-- file (Supabase default privileges grant anon EXECUTE on every new fn).
REVOKE EXECUTE ON FUNCTION public.fn_counselor_briefing_measure(date, integer, uuid, integer, integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_counselor_briefing_measure(date, integer, uuid, integer, integer, integer) TO service_role;

-- ── 7. The ONE read fn the intake-readiness alarm MAY feed from ──────────────
-- Director answer 5: independent of the alarm, but a future alarm edge can
-- call this for a college's counselor-effect summary. Latest measured week
-- per counselor. Authorization is the results table's own SELECT predicate
-- (super admin only — Director 2026-09-13), re-asserted here because
-- SECURITY DEFINER bypasses RLS; an unauthorized caller gets an explicit
-- error, never a silent empty set (CLAUDE.md #27). service_role (the cron /
-- server, which is how the intake-readiness alarm runs) passes the gate, so
-- the alarm can feed from this without any admission-team-visible surface.

CREATE OR REPLACE FUNCTION public.fn_counselor_briefing_effect_by_college(p_institution_id uuid)
RETURNS TABLE(
  institution_id              uuid,
  counselor_id                uuid,
  counselor_name              text,
  week_start                  date,
  week_end                    date,
  briefings_n                 integer,
  named_leads_n               integer,
  named_leads_current_year_n  integer,
  named_leads_actioned_n      integer,
  named_action_rate           numeric,
  named_forward_rate          numeric,
  baseline_forward_rate       numeric,
  forward_delta               numeric,
  week_forward_all_rate       numeric,
  ignored_briefings_n         integer,
  briefing_changed_nothing    boolean,
  measured_at                 timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'p_institution_id is required';
  END IF;

  IF NOT (
    -- The role claim lives in the request.jwt.claims JSON GUC (PostgREST v9+;
    -- the per-claim request.jwt.claim.role GUC is gone and Supabase never sets
    -- it). Same idiom as fn_max_lane_claim_pending (20260703083900). NULLIF
    -- guards a reset-to-empty GUC before the jsonb cast.
    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'You do not have access to the counselor briefing effect — it is super-admin-only; contact the Director'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (e.counselor_id)
    e.institution_id, e.counselor_id,
    COALESCE(c.name, p.full_name, 'Counselor')::text AS counselor_name,
    e.week_start, e.week_end,
    e.briefings_n, e.named_leads_n, e.named_leads_current_year_n,
    e.named_leads_actioned_n, e.named_action_rate,
    e.named_forward_rate, e.baseline_forward_rate, e.forward_delta,
    e.week_forward_all_rate,
    e.ignored_briefings_n, e.briefing_changed_nothing,
    e.measured_at
  FROM public.counselor_briefing_effects e
  LEFT JOIN public.admission_counselors c ON c.id = e.counselor_id
  LEFT JOIN public.profiles p ON p.id = e.counselor_user_id
  WHERE e.institution_id = p_institution_id
  ORDER BY e.counselor_id, e.week_start DESC;
END;
$function$;

COMMENT ON FUNCTION public.fn_counselor_briefing_effect_by_college(uuid) IS
  'Counselor-briefing loop READ fn (Director answer 5): the latest measured week per counselor for one college, including the counter-metric flag. The single hook the weekly intake-readiness alarm MAY feed from; the alarm is untouched. Authorization re-asserted inside: service_role (read from the request.jwt.claims GUC) or super admin ONLY (Director 2026-09-13 — the flag is never shown to admission team members or the counselor).';

REVOKE EXECUTE ON FUNCTION public.fn_counselor_briefing_effect_by_college(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_counselor_briefing_effect_by_college(uuid) TO authenticated, service_role;

-- ── 8. Dispatcher schedule row — daily, after the 06:00 IST briefing ─────────
-- The briefing routine 'admission-counselor-briefing' fires at minute 360
-- (20260825010000). This measure runs at 07:17 IST (437, off-grid :17) every
-- day and re-measures the current and previous 2 weeks, so an action taken
-- up to 7 days after a briefing lands in that week's row within 24 hours.
-- managed=true → editable on /admin/ai-routines; max_only=false → cloud cron.
-- The registry entry ships in lib/ai-routines/loop-governance.ts in the SAME
-- PR (registry-cron-wiring invariant).

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('counselor-briefing-measure', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 437, false)
ON CONFLICT (routine_id) DO NOTHING;

-- ── 9. The weekly known-delta regress sim ────────────────────────────────────
-- Mould: fn_loops_regress_consultants (20261003030000). Sentinel seeds inside a
-- plpgsql subtransaction → assert through the loop's REAL measure fn (never a
-- re-implementation) → sentinel RAISE rolls every seed back → the only
-- persistent write is the loop_audits verdict row.
--
-- Anchored 1,100 days in the PAST so no real briefing, action or stage move
-- can sit inside the sim's windows (admission_daily_briefings did not exist
-- then) and no live UNIQUE (institution_id, user_id, briefing_date) can
-- collide. Borrows (deterministic, oldest first):
--   * 1 REAL institution (oldest) — admission_counselors.institution_id is NOT NULL;
--   * 3 REAL profiles that have NEVER acted on a lead (no activities, no call
--     logs, no stage changes, not a counselor) — the sentinel counselors'
--     user_ids, so no real action can leak into their numbers;
--   * 20 REAL admission_leads with no activity, call log or stage-history row
--     anywhere near the sim window (± 90 days around the anchor).
-- Seeds: 3 ZZREGRESS counselors A/B/C, 5 named briefings, activities as the
-- actions, stage-history rows as the forward moves. Everything rolls back.
--
-- What it proves against production, weekly:
--   Assert A (no-change): baseline 2-of-4 forward (50.00%), named 1-of-2
--     forward (50.00%) ⇒ forward_delta exactly 0.00; named_action_rate 50.00
--     (2 of the week's 4 named leads acted on).
--   Assert B (known +50pp): baseline 50.00%, named 2-of-2 (100.00%) ⇒ +50.00.
--   Assert C (counter-metric): zero named-lead actions across all 5 named
--     briefings, week-all 2-of-2 forward (100.00%) vs baseline 50.00% ⇒
--     briefing_changed_nothing = TRUE; A and B must read FALSE.
-- k = 2 for the sim (p_min_n) so 2-lead sides clear the floor; window 7; N 5.

CREATE OR REPLACE FUNCTION public.fn_loops_regress_counselor_briefing_effect()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_err      text := NULL;
  v_verdict  text;
  v_as_of    date;
  v_ws       date;
  v_inst     uuid;
  v_users    uuid[];
  v_leads    uuid[];
  v_cons_a   uuid;
  v_cons_b   uuid;
  v_cons_c   uuid;
  v_a_delta  numeric;  v_a_arate numeric;  v_a_flag boolean;
  v_b_delta  numeric;  v_b_frate numeric;  v_b_flag boolean;
  v_c_flag   boolean;  v_c_wrate numeric;  v_c_ign  integer;
  v_content  jsonb;
  i          integer;
BEGIN
  v_as_of := CURRENT_DATE - 1100;
  v_ws    := (date_trunc('week', v_as_of::timestamp))::date;

  BEGIN
    SELECT inst.id INTO v_inst
    FROM public.institutions inst
    ORDER BY inst.created_at ASC NULLS LAST, inst.id ASC
    LIMIT 1;
    IF v_inst IS NULL THEN
      RAISE EXCEPTION 'need one institutions row to anchor the sim';
    END IF;

    SELECT array_agg(x.id ORDER BY x.rn) INTO v_users
    FROM (
      SELECT p.id, row_number() OVER (ORDER BY p.created_at ASC, p.id ASC) AS rn
      FROM public.profiles p
      WHERE NOT EXISTS (SELECT 1 FROM public.admission_lead_activities a WHERE a.created_by = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.admission_call_logs l WHERE l.counselor_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.admission_lead_stage_history h WHERE h.changed_by = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.admission_counselors c WHERE c.user_id = p.id)
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 3
    ) x;
    IF v_users IS NULL OR array_length(v_users, 1) < 3 THEN
      RAISE EXCEPTION 'need 3 profiles that have never acted on a lead to anchor the sim';
    END IF;

    SELECT array_agg(x.id ORDER BY x.rn) INTO v_leads
    FROM (
      SELECT l.id, row_number() OVER (ORDER BY l.created_at ASC, l.id ASC) AS rn
      FROM public.admission_leads l
      WHERE NOT EXISTS (SELECT 1 FROM public.admission_lead_activities a
                         WHERE a.lead_id = l.id
                           AND a.created_at BETWEEN (v_ws - 90)::timestamptz AND (v_ws + 90)::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM public.admission_call_logs cl
                         WHERE cl.lead_id = l.id
                           AND COALESCE(cl.started_at, cl.created_at) BETWEEN (v_ws - 90)::timestamptz AND (v_ws + 90)::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM public.admission_lead_stage_history h
                         WHERE h.lead_id = l.id
                           AND h.created_at BETWEEN (v_ws - 90)::timestamptz AND (v_ws + 90)::timestamptz)
      ORDER BY l.created_at ASC, l.id ASC
      LIMIT 20
    ) x;
    IF v_leads IS NULL OR array_length(v_leads, 1) < 20 THEN
      RAISE EXCEPTION 'need 20 quiet admission_leads rows to anchor the sim';
    END IF;

    -- Sentinel counselors (email is NOT NULL in production).
    INSERT INTO public.admission_counselors (institution_id, user_id, name, email, is_active)
    VALUES (v_inst, v_users[1], 'ZZREGRESS Counselor A (loops-regress sim)', 'zzregress-counselor-a@loops-regress.invalid', false)
    RETURNING id INTO v_cons_a;
    INSERT INTO public.admission_counselors (institution_id, user_id, name, email, is_active)
    VALUES (v_inst, v_users[2], 'ZZREGRESS Counselor B (loops-regress sim)', 'zzregress-counselor-b@loops-regress.invalid', false)
    RETURNING id INTO v_cons_b;
    INSERT INTO public.admission_counselors (institution_id, user_id, name, email, is_active)
    VALUES (v_inst, v_users[3], 'ZZREGRESS Counselor C (loops-regress sim)', 'zzregress-counselor-c@loops-regress.invalid', false)
    RETURNING id INTO v_cons_c;

    -- Five named briefings: four before the week (naming leads 13,14 — nobody
    -- acts on them) and one inside the week at ws+1 naming leads 5,6,11,12.
    -- Same id shape the generator writes: 'hot-<lead id>'.
    v_content := jsonb_build_object('action_items', jsonb_build_array(
      jsonb_build_object('id', 'hot-' || v_leads[13]::text, 'type', 'followup'),
      jsonb_build_object('id', 'hot-' || v_leads[14]::text, 'type', 'followup'),
      jsonb_build_object('id', 'overdue-batch', 'type', 'alert')));
    FOR i IN 1..4 LOOP
      INSERT INTO public.admission_daily_briefings (institution_id, user_id, briefing_date, content)
      VALUES (v_inst, v_users[1], v_ws - 5 + i, v_content);   -- ws-4 .. ws-1
    END LOOP;
    v_content := jsonb_build_object('action_items', jsonb_build_array(
      jsonb_build_object('id', 'hot-' || v_leads[5]::text,  'type', 'followup'),
      jsonb_build_object('id', 'hot-' || v_leads[6]::text,  'type', 'followup'),
      jsonb_build_object('id', 'hot-' || v_leads[11]::text, 'type', 'followup'),
      jsonb_build_object('id', 'hot-' || v_leads[12]::text, 'type', 'followup'),
      jsonb_build_object('id', 'overdue-batch', 'type', 'alert')));
    INSERT INTO public.admission_daily_briefings (institution_id, user_id, briefing_date, content)
    VALUES (v_inst, v_users[1], v_ws + 1, v_content);

    -- Baselines (ws-30d): each counselor acted on 4 leads, 2 moved forward next day.
    INSERT INTO public.admission_lead_activities (lead_id, activity_type, subject, created_by, created_at)
    SELECT v_leads[k], 'call', 'ZZREGRESS sim', u, (v_ws - 30)::timestamptz + interval '10 hours'
    FROM (VALUES
      (1, v_users[1]), (2, v_users[1]), (3, v_users[1]), (4, v_users[1]),
      (7, v_users[2]), (8, v_users[2]), (9, v_users[2]), (10, v_users[2]),
      (15, v_users[3]), (16, v_users[3]), (17, v_users[3]), (18, v_users[3])
    ) AS s(k, u);
    INSERT INTO public.admission_lead_stage_history (lead_id, from_stage, to_stage, created_at)
    SELECT v_leads[k], 'contacted'::public.funnel_stage, 'interested'::public.funnel_stage,
           (v_ws - 29)::timestamptz + interval '10 hours'
    FROM (VALUES (1), (2), (7), (8), (15), (16)) AS s(k);

    -- Week: A acts on named 5,6 (5 moves forward); B acts on named 11,12
    -- (both move forward); C acts on UNNAMED 19,20 (both move forward).
    INSERT INTO public.admission_lead_activities (lead_id, activity_type, subject, created_by, created_at)
    SELECT v_leads[k], 'call', 'ZZREGRESS sim', u, (v_ws + 2)::timestamptz + interval '10 hours'
    FROM (VALUES
      (5, v_users[1]), (6, v_users[1]),
      (11, v_users[2]), (12, v_users[2]),
      (19, v_users[3]), (20, v_users[3])
    ) AS s(k, u);
    INSERT INTO public.admission_lead_stage_history (lead_id, from_stage, to_stage, created_at)
    SELECT v_leads[k], 'contacted'::public.funnel_stage, 'interested'::public.funnel_stage,
           (v_ws + 3)::timestamptz + interval '10 hours'
    FROM (VALUES (5), (11), (12), (19), (20)) AS s(k);
    -- A negative move on lead 6 must NOT count as forward (rank predicate).
    INSERT INTO public.admission_lead_stage_history (lead_id, from_stage, to_stage, created_at)
    VALUES (v_leads[6], 'contacted'::public.funnel_stage, 'not_reachable'::public.funnel_stage,
            (v_ws + 3)::timestamptz + interval '11 hours');

    -- Assert through the REAL measure fn, scoped per sentinel, sim overrides:
    -- window 7, N 5, k 2. Measured AS OF ws+13 with p_weeks_back = 1 — the
    -- anchor week is then a fully-closed previous week (every named briefing's
    -- 7-day window has elapsed, so the counter-metric's closed-window gate
    -- sees all 5), exactly as production re-measures a finished week.
    SELECT r.forward_delta, r.named_action_rate, r.briefing_changed_nothing
      INTO v_a_delta, v_a_arate, v_a_flag
    FROM public.fn_counselor_briefing_measure(v_ws + 13, 1, v_cons_a, 7, 5, 2) r
    WHERE r.week_start = v_ws;

    SELECT r.forward_delta, r.named_forward_rate, r.briefing_changed_nothing
      INTO v_b_delta, v_b_frate, v_b_flag
    FROM public.fn_counselor_briefing_measure(v_ws + 13, 1, v_cons_b, 7, 5, 2) r
    WHERE r.week_start = v_ws;

    SELECT r.briefing_changed_nothing, r.week_forward_all_rate, r.ignored_briefings_n
      INTO v_c_flag, v_c_wrate, v_c_ign
    FROM public.fn_counselor_briefing_measure(v_ws + 13, 1, v_cons_c, 7, 5, 2) r
    WHERE r.week_start = v_ws;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a_delta = 0.00 AND v_a_arate = 50.00 AND v_a_flag = false
         AND v_b_delta = 50.00 AND v_b_frate = 100.00 AND v_b_flag = false
         AND v_c_flag = true AND v_c_wrate = 100.00 AND v_c_ign = 5
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('counselor-briefing-effect', 'sim', v_verdict,
          jsonb_build_object(
            'no_change_delta', v_a_delta, 'a_named_action_rate', v_a_arate, 'a_flag', v_a_flag,
            'known_delta_plus50pp', v_b_delta, 'b_named_forward_rate', v_b_frate, 'b_flag', v_b_flag,
            'c_counter_metric_flag', v_c_flag, 'c_week_forward_all_rate', v_c_wrate, 'c_ignored_briefings', v_c_ign,
            'runner', 'fn_loops_regress_counselor_briefing_effect'));

  RETURN QUERY SELECT 'counselor-briefing-effect'::text, v_verdict, v_a_delta, v_b_delta;
END;
$function$;

-- Lock: SECURITY DEFINER ⇒ explicit revoke from anon AND PUBLIC in the same
-- file; the runner is service_role-only (invoked by /api/cron/loops-regress).
REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_counselor_briefing_effect() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_counselor_briefing_effect() TO service_role;

-- ── 10. End-state guard — RAISE EXCEPTION, never NOTICE ──────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.loop_registry WHERE loop_key = 'counselor-briefing-effect';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'loop_registry row counselor-briefing-effect missing after seed (count=%)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.ai_routine_schedules WHERE routine_id = 'counselor-briefing-measure';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ai_routine_schedules row counselor-briefing-measure missing after seed (count=%)', v_count;
  END IF;
  IF to_regprocedure('public.fn_counselor_briefing_measure(date, integer, uuid, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_counselor_briefing_effect_by_college(uuid)') IS NULL
     OR to_regprocedure('public.fn_loops_regress_counselor_briefing_effect()') IS NULL THEN
    RAISE EXCEPTION 'counselor-briefing-effect functions missing after create';
  END IF;
  IF has_function_privilege('anon', 'public.fn_counselor_briefing_measure(date, integer, uuid, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_counselor_briefing_effect_by_college(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_loops_regress_counselor_briefing_effect()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute a counselor-briefing-effect SECURITY DEFINER fn';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
