-- ============================================================================
-- IQAC-as-loops — rollup fn gains loops (e) IQAC meetings and (f) audit cycles
-- File: 20260710070000_rollup_iqac_meeting_and_audit_loops.sql | Date: 2026-07-10
-- Director decision 2026-07-10 ("make ALL IQAC functions loops"), Moves 1+2.
-- CREATE OR REPLACE of fn_accreditation_rollup_loop_evidence (base body =
-- prod's live definition, pg_get_functiondef 2026-07-10 — loops (a)-(d)
-- byte-unchanged): adds
--   (e) iqac_meeting        → NAAC 7.3.e — one row per MINUTED committee
--       meeting (substrate 20260710060000; must apply first).
--   (f) institutional_audit → NAAC 7.3.d — one row per CLOSED single-
--       institution audit cycle (findings via service_requests slug
--       'audit_finding'; multi-institution cycles skipped — see loop comment).
-- Same per-loop BEGIN/EXCEPTION isolation, same recent-or-never-emitted
-- anti-join, same is_auto-guarded upsert, same pinned metadata contract
-- { loop_key, loop_name, outcome{...}, delta_summary, measured_at }.
-- Return payload gains "iqac_meeting" + "institutional_audit"; the existing
-- accreditation-loop-evidence dispatcher schedule (daily 04:23 IST) picks
-- both up with NO new cron.
-- HARD DEPENDENCY: 20260710060000 (meetings/resolutions tables). Timestamp
-- sorts after it; do NOT apply out of order.
-- CI-trigger note 2026-07-10: r1 fixes validated in rolled-back prod txn.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_rollup_loop_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scf      integer := 0;
  v_ise      integer := 0;
  v_playbook integer := 0;
  v_mess     integer := 0;
  v_iqac     integer := 0;
  v_audit    integer := 0;
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

  -- ── (e) IQAC meeting loop → 7.3.e (quality circles — the Cell's own practice) ──
  -- ADDED 2026-07-10 (IQAC-as-loops Move 1, Director decision). One row per
  -- MINUTED committee meeting (substrate 20260710060000): the meeting reviewed
  -- prior resolutions against deadlines (Measure), closed/carried/dropped them
  -- (Decide), and its minutes are the ATR. This SUPERSEDES the "7.3.e emits no
  -- per-row evidence" reservation in specs/iqac-cqi-loop-equivalence-2026-07-09
  -- — that stance predates meetings having platform substrate. Counts are
  -- as-of-run snapshots: reviewed_in_meeting_id moves when an item is reviewed
  -- again later, so a within-window refresh may recount — the minutes_summary
  -- text remains the canonical at-minuting record.
  BEGIN
    WITH src AS (
      SELECT m.id, m.institution_id, m.held_at, m.meeting_no,
             c.committee_name,
             (SELECT count(*) FROM public.accreditation_committee_resolutions r
               WHERE r.meeting_id = m.id) AS passed,
             (SELECT count(*) FROM public.accreditation_committee_resolutions r
               WHERE r.reviewed_in_meeting_id = m.id AND r.status = 'done') AS done,
             (SELECT count(*) FROM public.accreditation_committee_resolutions r
               WHERE r.reviewed_in_meeting_id = m.id AND r.status = 'open') AS carried,
             (SELECT count(*) FROM public.accreditation_committee_resolutions r
               WHERE r.reviewed_in_meeting_id = m.id AND r.status = 'dropped') AS dropped,
             (SELECT count(*) FROM public.accreditation_committee_resolutions r
               WHERE r.committee_id = m.committee_id AND r.status = 'open'
                 AND r.due_date IS NOT NULL
                 AND r.due_date < (COALESCE(m.held_at, now()) AT TIME ZONE 'Asia/Kolkata')::date) AS overdue_open
      FROM public.accreditation_committee_meetings m
      JOIN public.accreditation_committees c ON c.id = m.committee_id
      WHERE m.status = 'minuted'
        AND m.held_at IS NOT NULL
        AND m.institution_id IS NOT NULL
        AND (m.updated_at >= now() - interval '45 days'
             OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                             WHERE qem.source_table = 'accreditation_committee_meetings'
                               AND qem.source_id = m.id
                               AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.e'))
      ORDER BY m.updated_at
      LIMIT 5000
    ),
    ins AS (
      INSERT INTO public.quality_evidence_mappings
        (source_table, source_id, institution_id, body_code, metric_code,
         period_label, mapped_by, is_auto, metadata, mapped_at)
      SELECT
        'accreditation_committee_meetings', s.id, s.institution_id, 'NAAC', '7.3.e',
        public.fn_accreditation_ay_label(s.held_at), NULL, true,
        jsonb_build_object(
          'loop_key',  'iqac_meeting',
          'loop_name', s.committee_name || ' — Loop Review meeting #' || s.meeting_no,
          'outcome', jsonb_build_object(
            'resolutions_passed', s.passed,
            'reviewed_done',      s.done,
            'reviewed_carried',   s.carried,
            'reviewed_dropped',   s.dropped,
            'closure_rate',       CASE WHEN (s.done + s.carried + s.dropped) > 0
                                       THEN round(s.done::numeric / (s.done + s.carried + s.dropped), 2)
                                  END,
            'overdue_open_after', s.overdue_open),
          'delta_summary',
            CASE WHEN (s.done + s.carried + s.dropped) = 0
                 THEN 'first review cycle — ' || s.passed || ' resolution(s) passed (baseline)'
                 ELSE s.done || ' of ' || (s.done + s.carried + s.dropped)
                      || ' prior resolution(s) completed on review; '
                      || s.carried || ' carried forward, ' || s.dropped || ' dropped; '
                      || s.passed || ' new passed'
            END,
          'measured_at', s.held_at),
        now()
      FROM src s
      ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
        SET period_label = EXCLUDED.period_label,
            metadata     = EXCLUDED.metadata,
            mapped_at    = now()
        WHERE public.quality_evidence_mappings.is_auto
      RETURNING 1
    )
    SELECT count(*) INTO v_iqac FROM ins;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('iqac_meeting', SQLERRM);
  END;

  -- ── (f) Institutional audit loop → 7.3.d (structured QA mechanism) ─────────
  -- ADDED 2026-07-10 (IQAC-as-loops Move 2). One row per CLOSED single-
  -- institution audit cycle. Multi-institution cycles are SKIPPED: the
  -- junction's natural key permits one row per (source row, metric), so a
  -- per-institution fan-out would collide — documented limitation; every prod
  -- cycle to date is single-institution. Findings = service_requests of slug
  -- 'audit_finding' keyed by form_data->>audit_cycle_id (AuditFindingService
  -- contract); resolved = status IN ('fulfilled','closed') (real B2A status
  -- vocabulary, verified 2026-07-10). Delta = vs the institution's PRIOR
  -- closed cycle.
  BEGIN
    -- Refuse to emit evidence that falsely attests ZERO findings when the
    -- finding service type is absent (unseeded env / deploy ordering): the
    -- RAISE lands in v_errors and the loop is skipped for the run (r1 MEDIUM).
    IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE slug = 'audit_finding') THEN
      RAISE EXCEPTION 'service_types slug audit_finding missing - refusing to emit zero-finding 7.3.d evidence';
    END IF;
    WITH ft AS (
      SELECT id FROM public.service_types WHERE slug = 'audit_finding'
    ),
    closed_cycles AS (
      SELECT ac.id, ac.name, ac.closed_at,
             ac.institution_ids[1] AS institution_id,
             CASE WHEN jsonb_typeof(ac.parameter_catalog_snapshot->'parameters') = 'array'
                  THEN jsonb_array_length(ac.parameter_catalog_snapshot->'parameters') ELSE 0 END AS params_in_scope
      FROM public.audit_cycles ac
      WHERE ac.closed_at IS NOT NULL
        AND cardinality(ac.institution_ids) = 1
        AND ac.institution_ids[1] IS NOT NULL
        AND (ac.updated_at >= now() - interval '45 days'
             OR NOT EXISTS (SELECT 1 FROM public.quality_evidence_mappings qem
                             WHERE qem.source_table = 'audit_cycles'
                               AND qem.source_id = ac.id
                               AND qem.body_code = 'NAAC' AND qem.metric_code = '7.3.d'))
      ORDER BY ac.updated_at
      LIMIT 5000
    ),
    enriched AS (
      SELECT cc.*,
             (SELECT count(*) FROM public.service_requests sr, ft
               WHERE sr.service_type_id = ft.id
                 AND sr.form_data->>'audit_cycle_id' = cc.id::text) AS findings_total,
             (SELECT count(*) FROM public.service_requests sr, ft
               WHERE sr.service_type_id = ft.id
                 AND sr.form_data->>'audit_cycle_id' = cc.id::text
                 AND sr.status IN ('fulfilled','closed')) AS findings_resolved,
             prior.prior_name,
             prior.prior_findings
      FROM closed_cycles cc
      LEFT JOIN LATERAL (
        SELECT p.name AS prior_name,
               (SELECT count(*) FROM public.service_requests sr, ft
                 WHERE sr.service_type_id = ft.id
                   AND sr.form_data->>'audit_cycle_id' = p.id::text) AS prior_findings
        FROM public.audit_cycles p
        WHERE p.closed_at IS NOT NULL
          AND p.closed_at < cc.closed_at
          AND cardinality(p.institution_ids) = 1
          AND p.institution_ids[1] = cc.institution_id
        ORDER BY p.closed_at DESC
        LIMIT 1
      ) prior ON true
    ),
    ins AS (
      INSERT INTO public.quality_evidence_mappings
        (source_table, source_id, institution_id, body_code, metric_code,
         period_label, mapped_by, is_auto, metadata, mapped_at)
      SELECT
        'audit_cycles', e.id, e.institution_id, 'NAAC', '7.3.d',
        public.fn_accreditation_ay_label(e.closed_at), NULL, true,
        jsonb_build_object(
          'loop_key',  'institutional_audit',
          'loop_name', 'Institutional audit — ' || e.name,
          'outcome', jsonb_build_object(
            'parameters_in_scope', e.params_in_scope,
            'findings_total',      e.findings_total,
            'findings_resolved',   e.findings_resolved,
            'prior_cycle',         e.prior_name,
            'prior_cycle_findings', e.prior_findings),
          'delta_summary',
            CASE WHEN e.prior_name IS NULL
                 THEN 'first closed audit cycle (baseline) — ' || e.findings_total
                      || ' finding(s) across ' || e.params_in_scope || ' parameter(s)'
                 ELSE e.findings_total || ' finding(s) vs ' || e.prior_findings
                      || ' in prior cycle "' || e.prior_name || '"'
            END,
          'measured_at', e.closed_at),
        now()
      FROM enriched e
      ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
        SET period_label = EXCLUDED.period_label,
            metadata     = EXCLUDED.metadata,
            mapped_at    = now()
        WHERE public.quality_evidence_mappings.is_auto
      RETURNING 1
    )
    SELECT count(*) INTO v_audit FROM ins;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('institutional_audit', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'scf_teaching',       v_scf,
    'induction_session',  v_ise,
    'induction_playbook', v_playbook,
    'mess_menu',          v_mess,
    'iqac_meeting',       v_iqac,
    'institutional_audit', v_audit,
    'count',              v_scf + v_ise + v_playbook + v_mess + v_iqac + v_audit
  ) || CASE WHEN v_errors = '{}'::jsonb THEN '{}'::jsonb
            ELSE jsonb_build_object('errors', v_errors) END;
END;
$function$
;

-- Cron-only fn: same ACL stance as 20260709023000 (service_role executes via
-- the dispatcher; not callable by users or anon).
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_rollup_loop_evidence() FROM anon, authenticated, PUBLIC;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT public.fn_accreditation_rollup_loop_evidence();
--   Expect keys iqac_meeting + institutional_audit; institutional_audit >= 1
--   (one closed single-institution cycle existed at authoring).
-- SELECT metric_code, count(*) FROM quality_evidence_mappings
--  WHERE body_code='NAAC' AND metric_code IN ('7.3.d','7.3.e') GROUP BY 1;
-- ============================================================================
