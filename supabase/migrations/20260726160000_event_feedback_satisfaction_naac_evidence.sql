-- ============================================================================
-- Accreditation — Event feedback → NAAC 7.3.f stakeholder-satisfaction evidence
-- File: 20260726160000_event_feedback_satisfaction_naac_evidence.sql
-- Date: 2026-07-26
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework,
--            Attribute 7 (Governance) · Metric 7.3 Quality Assurance System,
--            facet f — "periodic stakeholder satisfaction survey with feedback
--            provided" (metric_code '7.3.f', verified ACTIVE in
--            sh_accreditation_metrics on prod 2026-07-26).
--
-- WHY
--   The events module holds THREE live feedback tables and none of it reaches
--   the accreditation evidence spine. Measured live on prod 2026-07-26:
--     event_session_feedback  10,329 rows  (2 institutions, 449 respondents)
--     event_day_feedback       2,008 rows  (1 institution, 298 respondents)
--     event_program_feedback     173 rows  (1 institution, 173 respondents)
--     ------------------------------------------------------------------
--     TOTAL                   12,510 rows → 0 quality_evidence_mappings rows
--   This is the single largest unwired evidence mass on the platform.
--
--   PR #2408 (20260726110000_events_naac_evidence_emitter) wired the EVENTS
--   half and deliberately left the FEEDBACK half unbuilt. Its per-event
--   metadata does carry feedback counts + averages, but its emit gate is
--   status IN ('post_event','archived') AND naac_criteria non-empty. ALL
--   12,510 feedback rows belong to ONE event — 'Fresher Induction 2026'
--   (d0d995a9-8ab4-4ee8-a90b-e63f42a29d46), status='live',
--   naac_criteria='{}', iqac_evidence_status='draft' — so not one of those
--   rows can EVER reach the spine through #2408. Per-event NAAC tagging is a
--   human curation act that has not happened; stakeholder satisfaction does
--   not depend on it. Hence an institution × academic-year aggregate emitter
--   that is independent of per-event tagging.
--
-- EXISTING-MECHANISM SURVEY (parallel-mechanism prevention; verified live
-- 2026-07-26 on prod kvizhngldtiuufknvehv):
--   - fn_accreditation_rollup_loop_evidence() (20260709023000, PR #1899)
--     already emits 7.3.f from source_table='scf_ai_suggestions' (4 rows) and
--     'mess_menu_recommendations'. It is INSERT..ON CONFLICT only and every
--     one of its withdraw/exclude clauses is scoped by its OWN source_table —
--     it never deletes another source's rows. This migration's rows therefore
--     coexist safely; the junction's natural key includes source_table.
--   - The pre-existing 7.3.d mappings (audit_cycles ×1,
--     obe_course_attainment_rollup ×46) are NOT touched: different metric_code,
--     different source_table, no DDL on the junction.
--   - The only LIVE aggregate-snapshot emitters are obe_course_attainment_rollup
--     (20260709031000) and the Wave-2 pair hr_naac_evidence (20260726130000) /
--     facility_teaching_naac_evidence (20260726031500). This migration follows
--     that proven shape exactly: module-owned snapshot table + service_role-only
--     SECDEF refresh fn + natural-key upsert into the junction + an
--     ai_routine_schedules dispatcher row. No new mechanism is invented.
--   - Rating scale on all three tables is integer 1..5 (min 1, max 5 live),
--     institution_id is NOT NULL on all three, and every row carries created_at
--     — so AY bucketing uses fn_accreditation_ay_label(created_at) (June cutoff,
--     IST), identical to every sibling emitter's period_label.
--   - Metric catalog already holds 7.3.d / 7.3.e / 7.3.f (+ 7.3.1). NO catalog
--     seed is needed and none is done here.
--   - LoopEvidenceService.groupByLoop() (lib/services/accreditation/
--     loop-evidence-service.ts) renders every 7.3.d/e/f row on the NAAC
--     dashboard, grouping by metadata->>'loop_key' and reading loop_name /
--     delta_summary / measured_at / outcome. This migration populates that
--     pinned contract so the rows render as a real satisfaction-loop tile with
--     a year-on-year trend rather than an "unknown / not yet comparable" tile.
--
-- WHAT THIS ADDS
--   1. event_feedback_naac_evidence — snapshot table, ONE row per institution
--      × academic year, aggregating all three feedback channels: response
--      counts, distinct-respondent counts, events covered, per-channel and
--      overall mean rating, satisfied share, and the prior-year comparison
--      (this is a satisfaction LOOP metric — the trend and the volume are the
--      evidence, not individual opinions). Writes are RPC-only.
--   2. fn_event_feedback_refresh_naac_evidence() — SECDEF, service_role-only
--      refresh: upserts snapshots for every institution × AY that HAS
--      feedback, zeroes snapshots whose source rows have since disappeared,
--      recomputes the prior-year trend, withdraws its own stale auto mappings,
--      then upserts one quality_evidence_mappings row per snapshot with
--      responses > 0 (NAAC / 7.3.f).
--   3. quality_evidence_source_registry row 'event_feedback_snapshot'
--      (WHERE NOT EXISTS — ON CONFLICT fails 42P10 on expression indexes).
--      Non-colliding with the live 'event' → events row from #2408.
--   4. ai_routine_schedules row 'event-feedback-naac-evidence' (daily 05:19
--      IST, minute_of_day 319). Originally 305; MOVED after PR #2456
--      (sustainability evidence) merged claiming 305 with the identical
--      "verified free" reasoning — both were built in parallel against the same
--      pre-merge snapshot, so both read the same free slot. Live occupancy
--      re-read 2026-07-26: 291/343/350/365/380 in the 280-380 band, 319 clear.
--      Fired by the AI-routine dispatcher, day/time
--      editable in /admin/ai-routines; NOT a raw vercel.json cron. Route:
--      /api/cron/event-feedback-naac-evidence.
--
-- PRIVACY — K-ANONYMITY IS STRUCTURAL, NOT OPTIONAL
--   k = 5, hardcoded. Chosen to match the precedent already set on this spine
--   (PR #2457 suppresses means below 5 responses; #2408 emits k-anonymous
--   counts only). Deliberately NOT a platform_policies row: this is a privacy
--   FLOOR, and a floor an admin can lower to 1 is not a floor. The value is
--   written into every snapshot row (k_threshold) and every mapping's metadata
--   so the guarantee is auditable in the evidence itself.
--   Below k, NO rating-derived statistic is stored or emitted at all — not the
--   mean and not the satisfied share, because with n=1 a "share ≥4" of 0 or
--   100 reveals that one respondent's rating band. Counts stay visible (they
--   are honest volume and identify nobody).
--   COMPLEMENTARY SUPPRESSION (added after audit — the per-cell floor alone was
--   NOT enough): publishing the overall mean alongside the surviving channel
--   means leaks the hidden one by subtraction (session n=100 published + day
--   n=1 hidden ⇒ that one rating ≈ total_avg*101 − session_avg*100). The
--   overall mean and satisfied share are therefore published only when the
--   POOLED residual of every below-k channel is 0 or >= k, so whatever remains
--   recoverable is a crowd of at least k, never a person. residual_n is written
--   into the snapshot metadata so the decision is auditable, not implicit.
--   NEVER stored, NEVER emitted, at any n: free-text comments (all three
--   tables have a `comment` column — it is not read by this migration), and
--   learner / Senior Learner identities (learner_id is used ONLY inside
--   count(DISTINCT …); no id ever lands in a column or in metadata).
--
-- HONEST GATING
--   An institution with no feedback rows for an AY gets NO snapshot row and NO
--   evidence row — nothing is fabricated. A snapshot whose source rows are
--   later deleted is zeroed (the real zero is recorded, not hidden) and its
--   auto mapping is WITHDRAWN, so a zero never masquerades as evidence of a
--   satisfaction survey. Manually-curated (is_auto=false) mappings are never
--   read, never updated and never deleted.
--
-- SECURITY (CLAUDE.md mandatory RPC lockdown, 2026-06-06)
--   fn_event_feedback_refresh_naac_evidence is VOLATILE SECURITY DEFINER SET
--   search_path = public, REVOKEd from anon, authenticated AND PUBLIC, GRANTed
--   to service_role ONLY (cron/system-only — the live ACL shape of
--   fn_hr_refresh_naac_evidence, confirmed via has_function_privilege:
--   anon=false, authenticated=false, service_role=true).
--   The new table carries an EXPLICIT REVOKE ALL FROM anon, PUBLIC. Supabase's
--   default privileges silently grant anon 7 privileges on every new table —
--   measured today, hr_naac_evidence and facility_teaching_naac_evidence both
--   carry them (RLS still denies the rows, but the grant should not be there).
--   fn_accreditation_ay_label is called INSIDE the SECDEF fn: the inner
--   privilege check runs against the definer, which owns that helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. event_feedback_naac_evidence — the snapshot table.
--    One row per institution × academic year. Writes are RPC-only (no INSERT /
--    UPDATE / DELETE policies — same posture as obe_course_attainment_rollup
--    and hr_naac_evidence).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_feedback_naac_evidence (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  academic_year             text NOT NULL,          -- 'AY 2026-27' (fn_accreditation_ay_label)

  -- per-channel volume (always real counts) + mean (NULL below k)
  session_response_count    integer NOT NULL DEFAULT 0,
  session_respondent_count  integer NOT NULL DEFAULT 0,
  session_avg_rating        numeric,
  day_response_count        integer NOT NULL DEFAULT 0,
  day_respondent_count      integer NOT NULL DEFAULT 0,
  day_avg_rating            numeric,
  program_response_count    integer NOT NULL DEFAULT 0,
  program_respondent_count  integer NOT NULL DEFAULT 0,
  program_avg_rating        numeric,

  -- combined
  total_response_count      integer NOT NULL DEFAULT 0,
  total_respondent_count    integer NOT NULL DEFAULT 0,
  events_covered            integer NOT NULL DEFAULT 0,
  overall_avg_rating        numeric,                -- NULL below k
  satisfaction_pct          numeric,                -- share rating >= 4; NULL below k

  -- privacy posture, carried in the row so it is auditable in the evidence
  k_threshold               integer NOT NULL DEFAULT 5,
  means_suppressed          boolean NOT NULL DEFAULT false,

  -- the LOOP half: year-on-year trend
  prior_year_label          text,
  prior_year_response_count integer,
  prior_year_avg_rating     numeric,
  avg_rating_delta          numeric,

  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year)
);

COMMENT ON TABLE public.event_feedback_naac_evidence IS
  'Event feedback → NAAC 7.3.f stakeholder-satisfaction evidence snapshots: one row per institution per academic year aggregating event_session_feedback + event_day_feedback + event_program_feedback into response counts, distinct-respondent counts, per-channel and overall mean ratings, satisfied share, and the prior-year trend. K-ANONYMOUS BY CONSTRUCTION (k=5): no rating-derived statistic is stored when its response count is below k, and no free-text comment or learner identity is ever stored. Computed + mapped into quality_evidence_mappings by fn_event_feedback_refresh_naac_evidence (service_role cron ''event-feedback-naac-evidence''); writes are RPC-only. Same module-owned-snapshot pattern as hr_naac_evidence / obe_course_attainment_rollup.';

CREATE INDEX IF NOT EXISTS idx_event_feedback_naac_evidence_inst_ay
  ON public.event_feedback_naac_evidence (institution_id, academic_year);

DROP TRIGGER IF EXISTS set_updated_at ON public.event_feedback_naac_evidence;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.event_feedback_naac_evidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table grants — explicit. Supabase's ALTER DEFAULT PRIVILEGES hands anon
-- 7 privileges on every new table; revoke before granting anything.
REVOKE ALL ON TABLE public.event_feedback_naac_evidence FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.event_feedback_naac_evidence TO authenticated;
GRANT  ALL    ON TABLE public.event_feedback_naac_evidence TO service_role;

ALTER TABLE public.event_feedback_naac_evidence ENABLE ROW LEVEL SECURITY;

-- READ: accreditation evidence viewers, institution-scoped. Mirrors the live
-- qem_select / ftne_select shape exactly — no hardcoded role names.
DROP POLICY IF EXISTS "efne_select" ON public.event_feedback_naac_evidence;
CREATE POLICY "efne_select" ON public.event_feedback_naac_evidence
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.view')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 2. Evidence source registry row — CONFIG, seeded WHERE NOT EXISTS.
--    ON CONFLICT is wrong here: registry uniqueness is an expression index
--    (42P10). source_kind 'event_feedback_snapshot' does not collide with the
--    live 'event' → events row (#2408).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'event_feedback_snapshot', 'event_feedback_naac_evidence',
       'Event Feedback Satisfaction Snapshots',
       'Per-institution per-AY aggregates of event session / day / programme feedback (response counts, distinct respondents, mean ratings, satisfied share, year-on-year trend) mapped to NAAC 7.3.f stakeholder satisfaction. K-anonymous (k=5): counts and means only — never free-text comments, never learner identities. Refreshed by fn_event_feedback_refresh_naac_evidence via cron event-feedback-naac-evidence.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind  = 'event_feedback_snapshot'
     OR source_table = 'event_feedback_naac_evidence'
);

-- ----------------------------------------------------------------------------
-- 3. fn_event_feedback_refresh_naac_evidence — snapshot + mapping refresh.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_event_feedback_refresh_naac_evidence()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- k-anonymity floor. Hardcoded on purpose (see the header): a privacy floor
  -- an operator can lower is not a floor. Mirrors PR #2457's threshold.
  v_k         constant integer := 5;
  -- clock_timestamp() (NOT now()) so a second call inside the SAME transaction
  -- still distinguishes "refreshed by this run" from "stale".
  v_run_at    timestamptz := clock_timestamp();
  v_snapshots integer := 0;
  v_zeroed    integer := 0;
  v_withdrawn integer := 0;
  v_mapped    integer := 0;
BEGIN
  -- ── (a) Upsert one snapshot per institution × AY that HAS feedback ─────────
  -- learner_id appears ONLY inside count(DISTINCT …); `comment` is never read.
  WITH raw AS (
    SELECT 'session'::text AS channel, f.institution_id, f.event_id,
           f.learner_id, f.rating, f.created_at
      FROM public.event_session_feedback f
    UNION ALL
    SELECT 'day', f.institution_id, f.event_id, f.learner_id, f.rating, f.created_at
      FROM public.event_day_feedback f
    UNION ALL
    SELECT 'program', f.institution_id, f.event_id, f.learner_id, f.rating, f.created_at
      FROM public.event_program_feedback f
  ),
  tagged AS (
    SELECT r.*, public.fn_accreditation_ay_label(r.created_at) AS ay
      FROM raw r
     WHERE r.institution_id IS NOT NULL
       AND r.rating IS NOT NULL
       AND r.created_at IS NOT NULL
  ),
  agg AS (
    SELECT
      t.institution_id,
      t.ay,
      count(*) FILTER (WHERE t.channel = 'session')::int                    AS session_n,
      count(DISTINCT t.learner_id) FILTER (WHERE t.channel = 'session')::int AS session_learners,
      avg(t.rating) FILTER (WHERE t.channel = 'session')                    AS session_avg,
      count(*) FILTER (WHERE t.channel = 'day')::int                        AS day_n,
      count(DISTINCT t.learner_id) FILTER (WHERE t.channel = 'day')::int    AS day_learners,
      avg(t.rating) FILTER (WHERE t.channel = 'day')                        AS day_avg,
      count(*) FILTER (WHERE t.channel = 'program')::int                    AS program_n,
      count(DISTINCT t.learner_id) FILTER (WHERE t.channel = 'program')::int AS program_learners,
      avg(t.rating) FILTER (WHERE t.channel = 'program')                    AS program_avg,
      count(*)::int                                                         AS total_n,
      count(DISTINCT t.learner_id)::int                                     AS total_learners,
      count(DISTINCT t.event_id)::int                                       AS events_n,
      avg(t.rating)                                                         AS total_avg,
      count(*) FILTER (WHERE t.rating >= 4)::int                            AS satisfied_n,
      -- Pooled size of the channels whose OWN mean is suppressed (0 < n < k).
      -- Complementary suppression depends on this: see the CASE below.
      ( CASE WHEN count(*) FILTER (WHERE t.channel = 'session') >= v_k THEN 0
             ELSE count(*) FILTER (WHERE t.channel = 'session') END
      + CASE WHEN count(*) FILTER (WHERE t.channel = 'day')     >= v_k THEN 0
             ELSE count(*) FILTER (WHERE t.channel = 'day')     END
      + CASE WHEN count(*) FILTER (WHERE t.channel = 'program') >= v_k THEN 0
             ELSE count(*) FILTER (WHERE t.channel = 'program') END
      )::int                                                                AS residual_n
    FROM tagged t
    GROUP BY t.institution_id, t.ay
  )
  INSERT INTO public.event_feedback_naac_evidence AS h
    (institution_id, academic_year,
     session_response_count, session_respondent_count, session_avg_rating,
     day_response_count, day_respondent_count, day_avg_rating,
     program_response_count, program_respondent_count, program_avg_rating,
     total_response_count, total_respondent_count, events_covered,
     overall_avg_rating, satisfaction_pct,
     k_threshold, means_suppressed,
     metadata, computed_at, updated_at)
  SELECT
    a.institution_id, a.ay,
    a.session_n, a.session_learners,
    CASE WHEN a.session_n >= v_k THEN round(a.session_avg::numeric, 2) END,
    a.day_n, a.day_learners,
    CASE WHEN a.day_n >= v_k THEN round(a.day_avg::numeric, 2) END,
    a.program_n, a.program_learners,
    CASE WHEN a.program_n >= v_k THEN round(a.program_avg::numeric, 2) END,
    a.total_n, a.total_learners, a.events_n,
    -- COMPLEMENTARY SUPPRESSION. Suppressing a small channel's own mean is NOT
    -- sufficient while the overall mean is published: with one channel hidden,
    -- its mean is recoverable by subtraction (total_avg*total_n minus the
    -- published channels). So the overall figure is published only when the
    -- pooled residual of all below-k channels is itself k-anonymous — either
    -- empty (nothing to difference out) or >= k (the recoverable group is a
    -- crowd, not a person).
    CASE WHEN a.total_n >= v_k AND (a.residual_n = 0 OR a.residual_n >= v_k)
         THEN round(a.total_avg::numeric, 2) END,
    CASE WHEN a.total_n >= v_k AND (a.residual_n = 0 OR a.residual_n >= v_k)
         THEN round(a.satisfied_n::numeric * 100 / a.total_n, 1) END,
    v_k,
    NOT (a.total_n >= v_k AND (a.residual_n = 0 OR a.residual_n >= v_k)),
    jsonb_build_object(
      'method', jsonb_build_object(
        'channels',      'event_session_feedback + event_day_feedback + event_program_feedback',
        'period',        'fn_accreditation_ay_label(created_at) — June cutoff, IST',
        'rating_scale',  '1-5 integer',
        'satisfied',     'rating >= 4'
      ),
      'privacy', jsonb_build_object(
        'k_threshold',        v_k,
        'rule',              'no rating-derived statistic below k responses; counts always real',
        'complementary_suppression',
          'overall mean/share withheld unless the pooled below-k channels are empty or >= k, so no channel mean is recoverable by subtraction',
        'residual_n',         a.residual_n,
        'free_text_excluded', true,
        'identities_excluded', true
      )
    ),
    v_run_at, now()
  FROM agg a
  ON CONFLICT (institution_id, academic_year) DO UPDATE
    SET session_response_count   = EXCLUDED.session_response_count,
        session_respondent_count = EXCLUDED.session_respondent_count,
        session_avg_rating       = EXCLUDED.session_avg_rating,
        day_response_count       = EXCLUDED.day_response_count,
        day_respondent_count     = EXCLUDED.day_respondent_count,
        day_avg_rating           = EXCLUDED.day_avg_rating,
        program_response_count   = EXCLUDED.program_response_count,
        program_respondent_count = EXCLUDED.program_respondent_count,
        program_avg_rating       = EXCLUDED.program_avg_rating,
        total_response_count     = EXCLUDED.total_response_count,
        total_respondent_count   = EXCLUDED.total_respondent_count,
        events_covered           = EXCLUDED.events_covered,
        overall_avg_rating       = EXCLUDED.overall_avg_rating,
        satisfaction_pct         = EXCLUDED.satisfaction_pct,
        k_threshold              = EXCLUDED.k_threshold,
        means_suppressed         = EXCLUDED.means_suppressed,
        metadata                 = EXCLUDED.metadata,
        computed_at              = EXCLUDED.computed_at,
        updated_at               = now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- ── (b) Zero snapshots this run did NOT refresh (their source feedback is
  --        gone). The real zero is RECORDED, not hidden; its auto mapping is
  --        withdrawn in (c) so a zero never stands in as survey evidence.
  UPDATE public.event_feedback_naac_evidence
     SET session_response_count = 0, session_respondent_count = 0, session_avg_rating = NULL,
         day_response_count     = 0, day_respondent_count     = 0, day_avg_rating     = NULL,
         program_response_count = 0, program_respondent_count = 0, program_avg_rating = NULL,
         total_response_count   = 0, total_respondent_count   = 0, events_covered     = 0,
         overall_avg_rating     = NULL, satisfaction_pct      = NULL,
         means_suppressed       = true,
         computed_at            = v_run_at,
         updated_at             = now()
   WHERE computed_at IS DISTINCT FROM v_run_at
     AND total_response_count > 0;
  GET DIAGNOSTICS v_zeroed = ROW_COUNT;

  -- ── (c) Year-on-year trend. Prior label is derived from the AY text
  --        ('AY 2026-27' → 'AY 2025-26'). LEFT JOIN so rows with no prior
  --        year are actively RESET to NULL rather than keeping a stale trend.
  UPDATE public.event_feedback_naac_evidence h
     SET prior_year_label          = x.prior_label,
         prior_year_response_count = x.prior_n,
         prior_year_avg_rating     = x.prior_avg,
         avg_rating_delta          = x.delta,
         updated_at                = now()
    FROM (
      SELECT c.id,
             p.academic_year AS prior_label,
             p.total_response_count AS prior_n,
             p.overall_avg_rating AS prior_avg,
             CASE WHEN c.overall_avg_rating IS NOT NULL
                   AND p.overall_avg_rating IS NOT NULL
                  THEN round(c.overall_avg_rating - p.overall_avg_rating, 2) END AS delta
        FROM public.event_feedback_naac_evidence c
        LEFT JOIN public.event_feedback_naac_evidence p
               ON p.institution_id = c.institution_id
              AND p.academic_year  =
                  'AY ' || (substring(c.academic_year FROM 4 FOR 4)::int - 1)::text
                        || '-' || right(substring(c.academic_year FROM 4 FOR 4), 2)
       WHERE c.academic_year ~ '^AY \d{4}-\d{2}$'
    ) x
   WHERE h.id = x.id
     AND (h.prior_year_label,          h.prior_year_response_count,
          h.prior_year_avg_rating,     h.avg_rating_delta)
      IS DISTINCT FROM
         (x.prior_label,               x.prior_n,
          x.prior_avg,                 x.delta);

  -- ── (d) Withdraw our OWN stale auto mappings: a snapshot with zero
  --        responses must not carry a 7.3.f claim. is_auto=false rows are
  --        never touched.
  DELETE FROM public.quality_evidence_mappings qem
   USING public.event_feedback_naac_evidence h
   WHERE qem.source_table = 'event_feedback_naac_evidence'
     AND qem.source_id    = h.id
     AND qem.body_code    = 'NAAC'
     AND qem.metric_code  = '7.3.f'
     AND qem.is_auto
     AND h.total_response_count = 0;
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;

  -- ── (e) 7.3.f — stakeholder satisfaction. Emitted ONLY where real responses
  --        exist. metadata follows the pinned LoopEvidenceService contract
  --        (loop_key / loop_name / delta_summary / measured_at / outcome) so
  --        these rows render as a satisfaction-loop tile with a trend on the
  --        NAAC dashboard. Counts and means only — no comments, no identities.
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'event_feedback_naac_evidence', h.id, h.institution_id, 'NAAC', '7.3.f',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'loop_key',   'event_feedback_satisfaction',
      'loop_name',  'Event feedback satisfaction (session / day / programme)',
      'measure',    'stakeholder_satisfaction_aggregate',
      'measured_at', h.computed_at,
      -- ±0.05 on a 1-5 scale is rounding noise, not movement.
      'delta_summary', CASE
        WHEN h.avg_rating_delta IS NULL      THEN 'n/a'
        WHEN h.avg_rating_delta >  0.05      THEN 'improved'
        WHEN h.avg_rating_delta < -0.05      THEN 'worse'
        ELSE 'no_change'
      END,
      'outcome', jsonb_build_object(
        'responses',          h.total_response_count,
        'respondents',        h.total_respondent_count,
        'events_covered',     h.events_covered,
        'avg_rating',         h.overall_avg_rating,
        'satisfaction_pct',   h.satisfaction_pct,
        'prior_year_avg',     h.prior_year_avg_rating,
        'avg_rating_delta',   h.avg_rating_delta
      ),
      'by_channel', jsonb_build_object(
        'session', jsonb_build_object('responses', h.session_response_count,
                                      'respondents', h.session_respondent_count,
                                      'avg_rating', h.session_avg_rating),
        'day',     jsonb_build_object('responses', h.day_response_count,
                                      'respondents', h.day_respondent_count,
                                      'avg_rating', h.day_avg_rating),
        'program', jsonb_build_object('responses', h.program_response_count,
                                      'respondents', h.program_respondent_count,
                                      'avg_rating', h.program_avg_rating)
      ),
      'trend', jsonb_build_object(
        'prior_year',            h.prior_year_label,
        'prior_year_responses',  h.prior_year_response_count,
        'prior_year_avg_rating', h.prior_year_avg_rating,
        'avg_rating_delta',      h.avg_rating_delta
      ),
      'rating_scale', '1-5',
      'privacy', jsonb_build_object(
        'k_threshold',         h.k_threshold,
        'means_suppressed',    h.means_suppressed,
        'free_text_excluded',  true,
        'identities_excluded', true
      ),
      'computed_at', h.computed_at
    ),
    now()
  FROM public.event_feedback_naac_evidence h
  WHERE h.total_response_count > 0
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    -- never clobber a manually-curated (is_auto=false) mapping for this key
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_mapped = ROW_COUNT;

  -- 'count' is on the dispatcher's summarize() allowlist.
  RETURN jsonb_build_object(
    'snapshots',     v_snapshots,
    'zeroed',        v_zeroed,
    'withdrawn',     v_withdrawn,
    'mapped_7_3_f',  v_mapped,
    'k_threshold',   v_k,
    'count',         v_mapped
  );
END;
$$;

-- MANDATORY security template (cron/system-only — service_role, NOT
-- authenticated; same live ACL shape as fn_hr_refresh_naac_evidence).
REVOKE EXECUTE ON FUNCTION public.fn_event_feedback_refresh_naac_evidence() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_feedback_refresh_naac_evidence() TO service_role;

COMMENT ON FUNCTION public.fn_event_feedback_refresh_naac_evidence() IS
  'Upserts one event_feedback_naac_evidence snapshot per institution per academic year from event_session_feedback + event_day_feedback + event_program_feedback, then upserts NAAC 7.3.f (stakeholder satisfaction) rows into quality_evidence_mappings. K-anonymous k=5: no rating-derived statistic below 5 responses, never a free-text comment, never a learner identity. Honest gating: no feedback → no row; a snapshot whose source rows vanish is zeroed and its auto mapping withdrawn. Idempotent on the junction natural key; refreshes metadata/mapped_at on re-run; never clobbers manual (is_auto=false) mappings. service_role only (cron event-feedback-naac-evidence).';

-- ----------------------------------------------------------------------------
-- 4. Dispatcher schedule seed — daily 05:19 IST (minute_of_day 319; clear of
--    the live 291/343/350/365/380 slots and of 305, which merged #2456 takes). Fired by the AI-routine
--    dispatcher, which resolves triggerPath from the AI_ROUTINES registry
--    (lib/ai-routines/misc-ai.ts); day/time editable in /admin/ai-routines.
--    routine_id is a plain unique column, so ON CONFLICT is correct here.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('event-feedback-naac-evidence', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 319)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly here rather than the cron failing
--    silently forever (same discipline as 20260709023000 / 20260726130000).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the snapshot upserts depend on it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND metric_code = '7.3.f' AND is_active
  ) THEN
    RAISE EXCEPTION 'NAAC metric 7.3.f (stakeholder satisfaction) missing or inactive in sh_accreditation_metrics';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_source_registry
    WHERE source_kind = 'event_feedback_snapshot'
      AND source_table = 'event_feedback_naac_evidence'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_source_registry row event_feedback_snapshot missing — registry seed failed (source_kind or source_table collision?)';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'event_feedback_naac_evidence'
       AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'anon still holds grants on event_feedback_naac_evidence — the explicit REVOKE did not take';
  END IF;

  IF has_function_privilege('anon', 'public.fn_event_feedback_refresh_naac_evidence()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_event_feedback_refresh_naac_evidence()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_event_feedback_refresh_naac_evidence is still EXECUTEable by anon/authenticated — cron-only lockdown failed';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new table/RPC resolve immediately
-- after a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
