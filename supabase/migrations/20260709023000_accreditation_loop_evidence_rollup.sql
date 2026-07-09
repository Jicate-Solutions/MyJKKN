-- ============================================================================
-- Accreditation — Loop → AQAR evidence rollup (IQAC bridge, PR 1/2)
-- File: 20260709023000_accreditation_loop_evidence_rollup.sql | Date: 2026-07-09
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework.
--   IQAC/quality-loop evidence lives at Attribute 7: Governance and
--   Administration → Metric 7.3 "Quality Assurance System", facets lettered a–f.
--   (Legacy note: maps to Criterion 6.5 (IQAC) under the outgoing framework.)
--
-- WHAT THIS ADDS
--   MyJKKN's self-improving quality loops (SCF teaching, induction session +
--   playbook, mess Choose-Your-Menu) measure outcomes vs baselines but emitted
--   NOTHING into the accreditation evidence junction. This migration turns every
--   MEASURED loop cycle into a quality_evidence_mappings row tagged NAAC
--   Metric 7.3 (Quality Assurance System), so the AQAR/IQAC narrative is backed
--   by live, machine-measured quality-loop evidence — extending the CANONICAL
--   fan-out mechanism (same junction the induction/anti-ragging fan-outs write
--   to), NOT a parallel mechanism.
--
--   1. Seed three NAAC Metric-7.3 facet rows (idempotent; style copied from the
--      induction 5.1.3/7.2.1 seed in 20260628120000). The existing prod row
--      7.3.1 ('IQAC meeting frequency + AQAR submission timeliness', category
--      'Attribute 7: Governance') is NOT touched; new rows use the SAME category.
--   2. fn_accreditation_ay_label(timestamptz) — 'AY 2026-27' label, June cutoff,
--      computed in IST (a July-2026 measurement belongs to AY 2026-27; a
--      May-2026 one to AY 2025-26).
--   3. fn_accreditation_rollup_loop_evidence() — idempotent rollup: one evidence
--      row PER MEASURED OUTCOME ROW across the four loops, upserted on the
--      junction's natural key (source_table, source_id, body_code, metric_code)
--      with metadata + mapped_at refreshed on re-run. Manually-curated
--      (is_auto=false) rows are never clobbered (same guard as the induction
--      precedent). Returns a jsonb per-loop count summary the dispatcher records.
--   4. ai_routine_schedules seed row 'accreditation-loop-evidence' (daily,
--      04:23 IST) — fired by the AI-routine dispatcher, day/time editable in
--      /admin/ai-routines; NOT a raw vercel.json cron.
--
-- LOOP → METRIC CONTRACT (PINNED — PR-2 renders by these loop_key values):
--   scf_ai_suggestions (domain='session_feedback') → 7.3.f, loop_key 'scf_teaching'
--     (students rate → facilitator note → next class → Better/Same/Worse re-vote
--      = periodic stakeholder satisfaction survey WITH feedback provided — facet f)
--   induction_session_effectiveness               → 7.3.d, loop_key 'induction_session'
--     (session performance assessed vs baseline, fed back to the system — facet d)
--   scf_ai_suggestions (domain='induction')       → 7.3.d, loop_key 'induction_playbook'
--   mess_menu_recommendations                     → 7.3.f, loop_key 'mess_menu'
--     (mess loop is currently DARK — 0 measured rows is fine; the rollup emits
--      evidence the day the loop produces its first measured cycle.)
--   7.3.e is seeded RESERVED (the quality-circle PRACTICE itself — the
--   /admin/loops Control Tower); no per-row emission yet.
--   Decisions-Verdict / ARPS are NOT included (no clean measured-outcome table;
--   ARPS admission_action_log is admissions-marketing domain, out of IQAC scope
--   for this bridge — documented in the PR body).
--
--   metadata jsonb (PINNED): { "loop_key", "loop_name", "outcome": {...loop-
--   specific numbers...}, "delta_summary": improved|no_change|worse|n/a,
--   "measured_at": "<iso>" }
--
-- "MEASURED" per loop (only measured cycles become evidence):
--   scf_teaching / induction_playbook → outcome_measured_at IS NOT NULL
--   induction_session                 → outcome_measured_at IS NOT NULL
--                                       AND measure_status <> 'insufficient_rtm_data'
--                                       (r2: net_effect NULL = a non-measurement —
--                                        it must not count as measured evidence)
--   mess_menu                         → measured_at IS NOT NULL
--   Rows whose institution cannot be derived are SKIPPED
--   (quality_evidence_mappings.institution_id is NOT NULL): only
--   scf_ai_suggestions has a nullable institution_id — its rows carry the
--   institution directly (backfilled 2026-07-08, dedupe weld), which is MORE
--   reliable than a course_code→institution re-derivation.
--
-- SECURITY (CLAUDE.md + SCF service-role-only pattern, 20260630160000):
--   fn_accreditation_rollup_loop_evidence is VOLATILE SECURITY DEFINER
--   SET search_path=public and is locked to service_role ONLY (cron-only; the
--   gate is GRANT-level exactly like the SCF loop RPCs — no auth.uid() check,
--   so the dispatcher's service-role client and a Management-API validation
--   context both work). REVOKE FROM anon, authenticated, PUBLIC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed NAAC Metric 7.3 "Quality Assurance System" facet rows — idempotent on
--    (metric_type, metric_code). 7.3.d/e/f verified unseeded in prod; the
--    existing 7.3.1 row is not touched or renamed, and the category matches it
--    exactly ('Attribute 7: Governance').
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '7.3.d',
   'Quality Assurance System — audits & performance assessment with feedback to the system (Metric 7.3 facet d)',
   'Attribute 7: Governance', true, true,
   'Auto-rolled from self-improving loop outcome measurements (induction session-effectiveness + annual playbook loops etc.): performance assessed vs baseline, fed back to the system. One evidence row per measured cycle, refreshed daily by fn_accreditation_rollup_loop_evidence. Legacy mapping: Criterion 6.5 (IQAC) under the outgoing framework.'),
  ('NAAC', '7.3.e',
   'Quality Assurance System — practice of quality circles / self-improving loops (facet e)',
   'Attribute 7: Governance', true, true,
   'RESERVED; represents the loop practice itself (/admin/loops Control Tower); no per-row emission yet. Legacy mapping: Criterion 6.5 (IQAC) under the outgoing framework.'),
  ('NAAC', '7.3.f',
   'Quality Assurance System — periodic stakeholder satisfaction survey with feedback provided (facet f)',
   'Attribute 7: Governance', true, true,
   'Auto-rolled from stakeholder-feedback loops (SCF session-feedback teaching loop, mess Choose-Your-Menu loop): periodic stakeholder satisfaction measured, acted on, and re-measured with feedback provided. One evidence row per measured cycle, refreshed daily by fn_accreditation_rollup_loop_evidence. Legacy mapping: Criterion 6.5 (IQAC) under the outgoing framework.')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. fn_accreditation_ay_label — 'AY 2026-27' from a measured timestamp.
--    Indian academic year, June cutoff, computed in IST: month >= June → the AY
--    that STARTS this calendar year; Jan–May → the AY that started last year.
--    Pure computation (no data access); locked like the other loop helpers.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_ay_label(p_ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    WHEN extract(month FROM (p_ts AT TIME ZONE 'Asia/Kolkata')) >= 6
      THEN 'AY ' || extract(year FROM (p_ts AT TIME ZONE 'Asia/Kolkata'))::int::text
           || '-' || right((extract(year FROM (p_ts AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    ELSE 'AY ' || (extract(year FROM (p_ts AT TIME ZONE 'Asia/Kolkata'))::int - 1)::text
         || '-' || right(extract(year FROM (p_ts AT TIME ZONE 'Asia/Kolkata'))::int::text, 2)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_ay_label(timestamptz) FROM anon, authenticated, PUBLIC;  -- deep-review r2 LOW: match the rollup fn's lockdown exactly
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_ay_label(timestamptz) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. fn_accreditation_rollup_loop_evidence — the idempotent rollup.
--    One quality_evidence_mappings row per measured loop-cycle row; conflict on
--    the junction's natural key refreshes metadata/period/mapped_at (re-runnable
--    daily). Never clobbers a manually-curated (is_auto=false) mapping.
--    Returns {"scf_teaching": n, "induction_session": n, "induction_playbook": n,
--    "mess_menu": n, "count": total} — the dispatcher records this summary.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_rollup_loop_evidence()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scf      integer := 0;
  v_ise      integer := 0;
  v_playbook integer := 0;
  v_mess     integer := 0;
  -- deep-review r3 MEDIUM (consensus): each loop runs in its own BEGIN/EXCEPTION
  -- subtransaction — one poison source row (deleted-institution FK, future
  -- constraint, type surprise) darkens ONE loop's night, not all four. Errors
  -- surface in the returned jsonb instead of a silent all-loop rollback.
  v_errors   jsonb := '{}'::jsonb;
BEGIN
  -- ── (a) SCF teaching loop → 7.3.f (stakeholder satisfaction + feedback) ────
  -- Students rate → facilitator note → next class re-measured → Better/Same/
  -- Worse re-vote = a periodic stakeholder satisfaction survey WITH feedback
  -- provided (facet f, verbatim). One row per MEASURED suggestion
  -- (domain='session_feedback'). Institution comes straight off the row
  -- (nullable → NULL-institution rows are skipped; the junction's
  -- institution_id is NOT NULL). Student Better/Same/Worse resolution votes are
  -- folded in as counts (k-anonymous aggregate only — never voter identities).
  -- faculty_email is deliberately NOT copied into evidence metadata (identity
  -- hygiene; the source row remains linked via source_table/source_id for
  -- auditors with access).
  BEGIN
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'scf_ai_suggestions', s.id, s.institution_id, 'NAAC', '7.3.f',
    public.fn_accreditation_ay_label(s.outcome_measured_at),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'scf_teaching',
      'loop_name', 'Session-Feedback Teaching Loop',
      'outcome', jsonb_build_object(
        'kind',                   s.kind,
        'course_code',            s.course_code,
        'window_from',            s.window_from,
        'window_to',              s.window_to,
        'input_avg_understood',   s.input_avg_understood,
        'input_responses',        s.input_responses,
        'outcome_avg_understood', s.outcome_avg_understood,
        'outcome_responses',      s.outcome_responses,
        'outcome_lift',           s.outcome_lift,
        'human_verdict',          s.human_verdict,
        'votes_better',           COALESCE(v.n_better, 0),
        'votes_same',             COALESCE(v.n_same, 0),
        'votes_worse',            COALESCE(v.n_worse, 0)
      ),
      'delta_summary', CASE
        WHEN s.outcome_lift IS NULL THEN 'n/a'
        WHEN s.outcome_lift > 0     THEN 'improved'
        WHEN s.outcome_lift < 0     THEN 'worse'
        ELSE 'no_change' END,
      'measured_at', s.outcome_measured_at
    ),
    now()
  FROM public.scf_ai_suggestions s
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE rv.vote = 'better') AS n_better,
           count(*) FILTER (WHERE rv.vote = 'same')   AS n_same,
           count(*) FILTER (WHERE rv.vote = 'worse')  AS n_worse
    FROM public.scf_note_resolution_votes rv
    WHERE rv.suggestion_id = s.id
  ) v ON true
  WHERE s.domain = 'session_feedback'
    AND s.outcome_measured_at IS NOT NULL
    AND s.institution_id IS NOT NULL
    -- deep-review rounds 1+2 disposition (window oscillation — r1: "unbounded
    -- sweep, bound it"; r2: "fixed window silently loses cycles after a >45d
    -- outage"). Resolution = junction presence IS the state: a row is swept if
    -- measured recently (bounded WRITE churn — only these re-upsert nightly)
    -- OR never emitted at all (catch-up after any outage, backfill, or late
    -- institution_id heal — a cheap indexed anti-join READ). Neither pole
    -- loses: no unbounded rewrite, no permanent exclusion.
    -- Accepted residuals (r2 LOWs, by design): votes/metadata arriving >45d
    -- after measurement stay stale on the evidence row (votes are cast inside
    -- the 48h feedback window — a 45-day refresh horizon exceeds any
    -- legitimate arrival by an order of magnitude); mapped_at = LAST-refreshed
    -- semantics; returned counts = rows TOUCHED this run (dispatcher summary
    -- is operational, not an audit ledger).
    AND (s.outcome_measured_at >= now() - interval '45 days'
         OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                        WHERE qem.source_table = 'scf_ai_suggestions'
                          AND qem.source_id = s.id
                          AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.f'))
  -- deep-review 2026-07-09 dispositions: (a) the arbiter UNIQUE constraint is
  -- VERIFIED present on prod — quality_evidence_mappings_source_table_source_id_
  -- body_code__key UNIQUE (source_table, source_id, body_code, metric_code);
  -- (b) is_auto is NOT NULL DEFAULT false on prod, so "NULL is_auto blocks
  -- refresh" cannot occur — bare WHERE is_auto is exact, and conservatively
  -- treats unknown provenance as never-clobber by design.
  LIMIT 5000   -- deep-review r3 MEDIUM: bound per-run emission so a giant
               -- post-outage backlog makes forward progress across nights
               -- instead of timing out wholesale (real volume: single digits/day)
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    -- never clobber a manually-curated (is_auto=false) mapping for this key
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_scf = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('scf_teaching', SQLERRM);
  END;

  -- ── (b) Induction session-effectiveness loop → 7.3.d (performance assessed
  --        vs baseline, fed back to the system) ──────────────────────────────
  -- One row per measured topic (RTM-corrected net effect; institution_id is
  -- NOT NULL by DDL). measure_status='insufficient_rtm_data' rows are honest
  -- measurement attempts — included, with the status visible in metadata and
  -- delta_summary='n/a' (net_effect NULL).
  BEGIN
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'induction_session_effectiveness', e.id, e.institution_id, 'NAAC', '7.3.d',
    public.fn_accreditation_ay_label(e.outcome_measured_at),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'induction_session',
      'loop_name', 'Induction Session-Effectiveness Loop',
      'outcome', jsonb_build_object(
        'event_id',         e.event_id,
        'topic_key',        e.topic_key,
        'input_avg',        e.input_avg,
        'input_responses',  e.input_responses,
        'rerun_avg',        e.rerun_avg,
        'rerun_responses',  e.rerun_responses,
        'raw_lift',         e.raw_lift,
        'rtm_expected_avg', e.rtm_expected_avg,
        'net_effect',       e.net_effect,
        'measure_status',   e.measure_status
      ),
      'delta_summary', CASE
        WHEN e.net_effect IS NULL THEN 'n/a'
        WHEN e.net_effect > 0     THEN 'improved'
        WHEN e.net_effect < 0     THEN 'worse'
        ELSE 'no_change' END,
      'measured_at', e.outcome_measured_at
    ),
    now()
  FROM public.induction_session_effectiveness e
  WHERE e.outcome_measured_at IS NOT NULL
    -- deep-review 2026-07-09 MEDIUM (consensus): quality_evidence_mappings.
    -- institution_id is NOT NULL — one NULL source row would abort the WHOLE
    -- nightly txn (all four loops), so guard here, not just on the SCF paths.
    AND e.institution_id IS NOT NULL
    -- deep-review r2 MEDIUM: insufficient_rtm_data has outcome_measured_at set
    -- but NO usable measurement (net_effect NULL) — a non-measurement must not
    -- be recorded as measured quality-loop evidence.
    AND e.measure_status IS DISTINCT FROM 'insufficient_rtm_data'
    AND (e.outcome_measured_at >= now() - interval '45 days'   -- bounded sweep + catch-up, see teaching path
         OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                        WHERE qem.source_table = 'induction_session_effectiveness'
                          AND qem.source_id = e.id
                          AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.d'))
  LIMIT 5000   -- deep-review r3 MEDIUM: bound per-run emission so a giant
               -- post-outage backlog makes forward progress across nights
               -- instead of timing out wholesale (real volume: single digits/day)
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_ise = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('induction_session', SQLERRM);
  END;

  -- ── (c) Induction annual playbook loop → 7.3.d ─────────────────────────────
  -- The ONE-memory induction cohort loop (scf_ai_suggestions domain='induction',
  -- 20260628130000): per-domain reuse of the numeric columns —
  -- outcome_avg_understood holds the cohort's VALUE-BALANCED JOIN SCORE and
  -- outcome_responses the cohort size. Same source_table as (a) but disjoint row
  -- sets (domain partition) AND a different metric_code, so keys never collide.
  BEGIN
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'scf_ai_suggestions', s.id, s.institution_id, 'NAAC', '7.3.d',
    public.fn_accreditation_ay_label(s.outcome_measured_at),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'induction_playbook',
      'loop_name', 'Induction Annual Playbook Loop',
      'outcome', jsonb_build_object(
        'academic_year_id',          s.academic_year_id,
        'prior_cohort_score',        s.input_avg_understood,
        'value_balanced_join_score', s.outcome_avg_understood,
        'cohort_enrolled',           s.outcome_responses,
        'outcome_lift',              s.outcome_lift,
        'human_verdict',             s.human_verdict
      ),
      'delta_summary', CASE
        WHEN s.outcome_lift IS NULL THEN 'n/a'
        WHEN s.outcome_lift > 0     THEN 'improved'
        WHEN s.outcome_lift < 0     THEN 'worse'
        ELSE 'no_change' END,
      'measured_at', s.outcome_measured_at
    ),
    now()
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'induction'
    AND s.outcome_measured_at IS NOT NULL
    AND s.institution_id IS NOT NULL
    AND (s.outcome_measured_at >= now() - interval '45 days'   -- bounded sweep + catch-up, see teaching path
         OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                        WHERE qem.source_table = 'scf_ai_suggestions'
                          AND qem.source_id = s.id
                          AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.d'))
  LIMIT 5000   -- deep-review r3 MEDIUM: bound per-run emission so a giant
               -- post-outage backlog makes forward progress across nights
               -- instead of timing out wholesale (real volume: single digits/day)
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_playbook = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('induction_playbook', SQLERRM);
  END;

  -- ── (d) Mess Choose-Your-Menu loop → 7.3.f ─────────────────────────────────
  -- Loop is currently DARK (0 measured rows) — emitting now means evidence
  -- appears automatically the day the loop produces its first measured cycle.
  -- delta prefers rating_lift; falls back to waste_lift (both are
  -- positive-is-better by construction); 'n/a' when neither is computed.
  -- deep-review 2026-07-09 disposition (suspected inverted waste polarity):
  -- VERIFIED CORRECT — 20260727000000_mess_menu_loop_spine.sql defines
  -- waste_lift = baseline_waste_pct - outcome_waste_pct ("positive =
  -- improvement"), i.e. reduction-positive, so lift>0 => 'improved' holds.
  BEGIN
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'mess_menu_recommendations', m.id, m.institution_id, 'NAAC', '7.3.f',
    public.fn_accreditation_ay_label(m.measured_at),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'mess_menu',
      'loop_name', 'Mess Choose-Your-Menu Loop',
      'outcome', jsonb_build_object(
        'tier_key',            m.tier_key,
        'meal_type',           m.meal_type,
        'week_start_date',     m.week_start_date,
        'baseline_avg_rating', m.baseline_avg_rating,
        'outcome_avg_rating',  m.outcome_avg_rating,
        'rating_lift',         m.rating_lift,
        'baseline_waste_pct',  m.baseline_waste_pct,
        'outcome_waste_pct',   m.outcome_waste_pct,
        'waste_lift',          m.waste_lift,
        'outcome_rating_n',    m.outcome_rating_n,
        'review_status',       m.status
      ),
      'delta_summary', CASE
        WHEN m.rating_lift IS NOT NULL THEN
          CASE WHEN m.rating_lift > 0 THEN 'improved'
               WHEN m.rating_lift < 0 THEN 'worse'
               ELSE 'no_change' END
        WHEN m.waste_lift IS NOT NULL THEN
          CASE WHEN m.waste_lift > 0 THEN 'improved'
               WHEN m.waste_lift < 0 THEN 'worse'
               ELSE 'no_change' END
        ELSE 'n/a' END,
      'measured_at', m.measured_at
    ),
    now()
  FROM public.mess_menu_recommendations m
  WHERE m.measured_at IS NOT NULL
    AND m.institution_id IS NOT NULL    -- NOT NULL on the junction; see induction note
    AND (m.measured_at >= now() - interval '45 days'   -- bounded sweep + catch-up, see teaching path
         OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                        WHERE qem.source_table = 'mess_menu_recommendations'
                          AND qem.source_id = m.id
                          AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.f'))
  LIMIT 5000   -- deep-review r3 MEDIUM: bound per-run emission so a giant
               -- post-outage backlog makes forward progress across nights
               -- instead of timing out wholesale (real volume: single digits/day)
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_mess = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('mess_menu', SQLERRM);
  END;

  -- Per-loop upsert counts + 'count' total ('count' is on the dispatcher's
  -- summarize() allowlist, so the Control Tower's "last run" line shows it).
  RETURN jsonb_build_object(
    'scf_teaching',       v_scf,
    'induction_session',  v_ise,
    'induction_playbook', v_playbook,
    'mess_menu',          v_mess,
    'count',              v_scf + v_ise + v_playbook + v_mess
  ) || CASE WHEN v_errors = '{}'::jsonb THEN '{}'::jsonb
            ELSE jsonb_build_object('errors', v_errors) END;
END;
$$;

-- MANDATORY security template (cron-only — service_role, NOT authenticated;
-- same deliberate more-restrictive deviation as 20260630160000): the fn is
-- SECURITY DEFINER with no per-caller scoping, called only by the cron route's
-- service-role client. GRANT-level gate only (no auth.uid() check) — exactly
-- the SCF loop-RPC pattern, so a Management-API validation context also works.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_rollup_loop_evidence() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_rollup_loop_evidence() TO service_role;

COMMENT ON FUNCTION public.fn_accreditation_rollup_loop_evidence() IS
  'Loop→AQAR bridge (PR 1/2): idempotently upserts one NAAC Metric-7.3 (Quality Assurance System, Binary Accreditation Framework 2024) quality_evidence_mappings row per MEASURED self-improving-loop cycle (SCF teaching 7.3.f, induction session 7.3.d, induction playbook 7.3.d, mess menu 7.3.f; legacy: maps to Criterion 6.5 (IQAC) under the outgoing framework). Re-runnable daily — refreshes metadata/period/mapped_at on conflict, never clobbers manual (is_auto=false) mappings. Returns per-loop upsert counts. service_role only (cron).';

-- ----------------------------------------------------------------------------
-- 4. Dispatcher schedule seed — daily at 04:23 IST (minute_of_day 263), all 7
--    days. Fired by the AI-routine dispatcher (*/15 vercel cron) which resolves
--    the triggerPath from the AI_ROUTINES registry (lib/ai-routines/misc-ai.ts);
--    day/time editable in /admin/ai-routines. NOT a raw vercel.json cron.
--    days_of_week: 0=Sun..6=Sat (all 7 = daily). minute_of_day: IST minutes.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('accreditation-loop-evidence', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 263)
ON CONFLICT (routine_id) DO NOTHING;

-- deep-review r2 LOW ("comment-asserted prod state is unverifiable"): assert
-- the ON CONFLICT arbiter at APPLY time — the migration fails loudly here
-- rather than the nightly cron failing silently forever.
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the rollup upserts depend on it';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new RPC resolves immediately after a
-- raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
