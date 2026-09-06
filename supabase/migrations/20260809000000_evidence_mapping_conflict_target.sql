-- ============================================================================
-- Evidence mappings: make every ON CONFLICT match the constraint that exists
-- Created: 2026-08-03
-- ----------------------------------------------------------------------------
-- WHAT IS BROKEN
--
-- public.quality_evidence_mappings carries:
--   quality_evidence_mappings_source_scope_key
--     UNIQUE NULLS NOT DISTINCT (source_table, source_id, body_code,
--                                metric_code, programme_id)   <- FIVE columns
--
-- Every writer in the codebase still names FOUR:
--     ON CONFLICT (source_table, source_id, body_code, metric_code)
--
-- PostgreSQL requires the inferred conflict target to match a unique constraint
-- exactly, so every one of those statements raises:
--     42P10  there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- programme_id was added to the constraint and NOTHING in the code followed.
-- Verified on production 2026-08-03: 22 functions carry the stale target, and
-- ZERO carry the correct one — this was a schema change with no code half.
--
-- ----------------------------------------------------------------------------
-- WHAT IT COSTS TODAY — five nightly routines fail on this, every night:
--   copo-attainment · hr-naac-evidence · sustainability-naac-evidence
--   event-feedback-naac-evidence · coe-result-naac-snapshots
-- each recorded as "HTTP 500 · error: there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" in ai_routine_schedules.
--
-- Eight of the 22 are also LIVE TRIGGERS on user-facing tables
-- (grievance_tickets, events, alumni_outcomes, service_requests,
--  health_sports_achievements, institution_collaborations, ss_grants,
--  anti_ragging_affidavits). They are latent rather than firing: each guards a
-- narrow path (e.g. closing an audit-finding request as 'rectified' for the
-- first time), which is why service_requests still took 2,070 rows including
-- today. They WILL raise on the next qualifying user action.
--
-- ----------------------------------------------------------------------------
-- WHY ADDING programme_id IS THE RIGHT HALF TO CHANGE, AND WHY IT IS SAFE NOW
--
-- The constraint is the newer, deliberate artifact — the column was added so
-- evidence can be scoped per programme. The code is what fell behind.
--
-- It is also behaviour-preserving TODAY. The constraint is NULLS NOT DISTINCT,
-- and programme_id is NULL on all 11,608 existing rows (measured 2026-08-03),
-- so two rows differing only by a NULL programme_id still collide exactly as
-- they did under the four-column target. Proven on production inside
-- BEGIN..ROLLBACK: two inserts of the same key with programme_id left NULL
-- produced ONE row and the DO UPDATE fired.
--
-- ----------------------------------------------------------------------------
-- HOW THIS FILE WAS PRODUCED — read before editing
--
-- Each function below is its LIVE production definition (pg_get_functiondef),
-- captured 2026-08-03, with ONE mechanical change: ', programme_id' inserted
-- before the closing paren of each stale ON CONFLICT. The generator asserted,
-- per function, that the output is byte-identical to the live source except for
-- those insertions. Nothing was re-authored from a repo file — a CREATE OR
-- REPLACE from a stale source silently reverted a gate in this codebase before.
--
-- 22 functions · 35 conflict clauses.
--
-- VERIFIED (production, BEGIN..ROLLBACK, 2026-08-03):
--   · before: fn_hr_refresh_naac_evidence() raises 42P10 at line 172
--   · after : all 22 apply; 0 stale targets remain; 22 correct ones present
--   · after : fn_copo_emit_attainment_evidence() returns
--             {"count": 92, "copo_attainment": 92} — 92 evidence rows that are
--             currently discarded every night
--   · production confirmed unchanged afterwards (22 still stale, 11,608 rows)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_populate_anti_ragging_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.student_affidavit_submitted IS NOT TRUE
     OR NEW.parent_affidavit_submitted IS NOT TRUE
     OR NEW.verified_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, is_auto, mapped_at
  )
  VALUES (
    'anti_ragging_affidavits', NEW.id, NEW.institution_id,
    'UGC', 'ANT', true, now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

  INSERT INTO quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, is_auto, mapped_at
  )
  VALUES (
    'anti_ragging_affidavits', NEW.id, NEW.institution_id,
    'NAAC', '7.7.1', true, now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_audit_finding_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_type_slug text;
  v_parameter_code    text;
  v_framework_mapping jsonb;
  v_audit_cycle_id    uuid;
  v_institution_id    uuid;
  v_body_code         text;
  v_metric_code       text;
BEGIN
  SELECT slug INTO v_service_type_slug FROM public.service_types WHERE id = NEW.service_type_id;
  IF v_service_type_slug != 'audit_finding' THEN RETURN NEW; END IF;
  IF NEW.status::text != 'closed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.form_data->>'resolution','') != 'rectified' THEN RETURN NEW; END IF;
  IF OLD.status::text = 'closed' AND COALESCE(OLD.form_data->>'resolution','') = 'rectified' THEN RETURN NEW; END IF;

  v_parameter_code := NEW.form_data->>'parameter_code';
  v_audit_cycle_id := NULLIF(NEW.form_data->>'audit_cycle_id','')::uuid;
  v_institution_id := NEW.institution_id;
  IF v_parameter_code IS NULL OR v_institution_id IS NULL THEN RETURN NEW; END IF;

  SELECT framework_mapping INTO v_framework_mapping
  FROM public.audit_parameter_catalog
  WHERE code = v_parameter_code AND (institution_id = v_institution_id OR institution_id IS NULL)
  ORDER BY (institution_id IS NOT NULL) DESC LIMIT 1;
  IF v_framework_mapping IS NULL OR v_framework_mapping = '{}'::jsonb THEN RETURN NEW; END IF;

  FOR v_body_code, v_metric_code IN SELECT key, value FROM jsonb_each_text(v_framework_mapping) LOOP
    IF COALESCE(v_metric_code,'') = '' OR v_metric_code = '-' THEN CONTINUE; END IF;
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code, mapped_at, mapped_by, is_auto, metadata)
    VALUES
      ('service_requests', NEW.id, v_institution_id, upper(v_body_code), v_metric_code, NEW.closed_at, NEW.updated_by, true,
       jsonb_build_object('audit_finding_id', NEW.id, 'parameter_code', v_parameter_code, 'audit_cycle_id', v_audit_cycle_id))
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.emit_event_naac_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qualifies boolean;
BEGIN
  v_qualifies := NEW.status IN ('post_event', 'archived')
                 AND COALESCE(cardinality(NEW.naac_criteria), 0) > 0
                 AND NEW.iqac_evidence_status <> 'rejected';

  -- Withdraw AUTO evidence that no longer matches this event (state
  -- regression, tag removal, IQAC rejection, or a code that no longer
  -- resolves). Manual (is_auto=false) mappings are never touched.
  DELETE FROM public.quality_evidence_mappings q
  WHERE q.source_table = 'events'
    AND q.source_id = NEW.id
    AND q.is_auto
    AND (
      NOT v_qualifies
      OR q.body_code <> 'NAAC'
      OR q.metric_code NOT IN (
        SELECT r.metric_code FROM public.fn_event_naac_resolve_codes(NEW.naac_criteria) r
      )
    );

  IF NOT v_qualifies THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  )
  SELECT
    'events', NEW.id, NEW.institution_id,
    'NAAC', r.metric_code,
    public.fn_accreditation_ay_label(COALESCE(NEW.end_date, NEW.start_date)),
    -- mapped_by FKs profiles(id); events.created_by may predate profiles —
    -- resolve defensively, NULL when absent.
    (SELECT p.id FROM public.profiles p WHERE p.id = NEW.created_by),
    true,
    public.fn_event_naac_evidence_metadata(NEW)
      || jsonb_build_object('naac_criteria_raw', r.raw_codes),
    now()
  FROM public.fn_event_naac_resolve_codes(NEW.naac_criteria) r
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        mapped_by      = EXCLUDED.mapped_by,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_grievance_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period TEXT;
BEGIN
  -- Only fire on transition INTO resolved (ignore other updates, ignore re-updates)
  IF (NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved')) THEN
    -- Academic year label from resolved_at (fallback: current date)
    -- Format 'YYYY-YY' e.g. '2026-27' for July-June academic year
    v_period := CASE
      WHEN EXTRACT(MONTH FROM COALESCE(NEW.resolved_at, NOW())) >= 7
        THEN EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT
             || '-' || RIGHT((EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))+1)::TEXT, 2)
      ELSE (EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))-1)::TEXT
             || '-' || RIGHT(EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT, 2)
    END;

    -- NAAC 7.7.1
    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'NAAC', '7.7.1', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

    -- UGC grievance
    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'UGC', 'grievance', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_institution_collaboration_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_metric text;
BEGIN
  v_metric := CASE WHEN NEW.kind = 'grant' THEN '9.1' ELSE '7.9' END;

  -- Withdraw AUTO evidence that no longer matches this row (kind flip or
  -- back-to-draft). Manual (is_auto=false) mappings are never touched.
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = 'institution_collaborations'
    AND source_id = NEW.id
    AND is_auto
    AND (NEW.status = 'draft' OR metric_code <> v_metric OR body_code <> 'NAAC');

  IF NEW.status <> 'draft' THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'institution_collaborations', NEW.id, NEW.institution_id,
      'NAAC', v_metric,
      public.fn_accreditation_ay_label(NEW.signed_on::timestamptz),
      NEW.created_by, true,
      jsonb_build_object(
        'kind',           NEW.kind,
        'title',          NEW.title,
        'partner_name',   NEW.partner_name,
        'scope',          NEW.scope,
        'signed_on',      NEW.signed_on,
        'valid_till',     NEW.valid_till,
        'amount_inr',     NEW.amount_inr,
        'status',         NEW.status,
        'document_url',   NEW.document_url,
        'source_trigger', 'emit_institution_collaboration_evidence'
      ),
      now()
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          period_label   = EXCLUDED.period_label,
          metadata       = EXCLUDED.metadata,
          is_auto        = true,
          mapped_at      = now()
      WHERE public.quality_evidence_mappings.is_auto;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_learner_achievement_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
BEGIN
  IF NOT COALESCE(NEW.verified, false) THEN
    -- State regression: un-verified (or never verified) → no auto evidence.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  SELECT lp.institution_id INTO v_institution_id
  FROM public.learners_profiles lp
  WHERE lp.id = NEW.learner_id;

  IF v_institution_id IS NULL THEN
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'health_sports_achievements', NEW.id, v_institution_id,
    'NAAC', '8.3',
    public.fn_accreditation_ay_label(NEW.achievement_date::timestamptz),
    NEW.verified_by, true,
    -- K-ANONYMOUS: category / type / level / event / host / year — no learner
    -- detail. `host_institution` is the OUTSIDE body that ran the event, which
    -- is an attribute of the event and carries no personal information.
    jsonb_build_object(
      'category',         NEW.category,
      'achievement_type', NEW.achievement_type,
      'event_level',      NEW.event_level,
      'event_name',       NEW.event_name,
      'host_institution', NEW.host_institution,
      'achievement_year', EXTRACT(YEAR FROM NEW.achievement_date)::int,
      'source_trigger',   'emit_learner_achievement_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_learner_exit_outcome_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_progression boolean;
BEGIN
  v_progression := NEW.outcome_type::text IN
    ('employed', 'self_employed', 'entrepreneur', 'higher_studies');

  -- Withdraw AUTO evidence that no longer matches this row (outcome edited
  -- back to a non-progression kind, or a stray row on another code).
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = 'alumni_outcomes'
    AND source_id = NEW.id
    AND is_auto
    AND (NOT v_progression OR metric_code <> '8.2.1' OR body_code <> 'NAAC');

  IF v_progression THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'alumni_outcomes', NEW.id, NEW.institution_id,
      'NAAC', '8.2.1',
      public.fn_accreditation_ay_label(NEW.graduation_date::timestamptz),
      NEW.created_by, true,
      -- K-ANONYMOUS: kind + year + verification band only. No names, no
      -- employers, no packages — auditors reach the source row by id.
      jsonb_build_object(
        'outcome_kind',        NEW.outcome_type::text,
        'graduation_year',     COALESCE(NEW.graduation_year,
                                        EXTRACT(YEAR FROM NEW.graduation_date)::int),
        'verification_status', NEW.verification_status::text,
        'source_trigger',      'emit_learner_exit_outcome_evidence'
      ),
      now()
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          period_label   = EXCLUDED.period_label,
          metadata       = EXCLUDED.metadata,
          is_auto        = true,
          mapped_at      = now()
      WHERE public.quality_evidence_mappings.is_auto;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_ss_grant_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.institution_id IS NULL THEN
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'ss_grants' AND source_id = NEW.id AND is_auto;
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'ss_grants', NEW.id, NEW.institution_id,
    'NAAC', '9.1',
    public.fn_accreditation_ay_label(
      COALESCE(NEW.sanction_date::timestamptz, NEW.start_date::timestamptz, NEW.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'name',              NEW.name,
      'funder',            NEW.funder,
      'grant_number',      NEW.grant_number,
      'sanctioned_amount', NEW.sanctioned_amount,
      'received_amount',   NEW.received_amount,
      'currency',          NEW.currency,
      'sanction_date',     NEW.sanction_date,
      'start_date',        NEW.start_date,
      'end_date',          NEW.end_date,
      'purpose',           NEW.purpose,
      'source_trigger',    'emit_ss_grant_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$function$;

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
  -- deep-review 2026-07-09 dispositions: (a) the arbiter UNIQUE constraint —
  -- ⚠️ CORRECTED 2026-08-03. The 2026-07-09 note claimed
  -- quality_evidence_mappings_source_table_source_id_body_code__key UNIQUE
  -- (source_table, source_id, body_code, metric_code) was "VERIFIED present on
  -- prod". That was true when written and is FALSE NOW: the table today carries
  -- exactly one unique constraint, quality_evidence_mappings_source_scope_key
  -- UNIQUE NULLS NOT DISTINCT (source_table, source_id, body_code, metric_code,
  -- programme_id) — five columns — plus the primary key on id. Re-verified
  -- against pg_constraint AND pg_indexes on 2026-08-03: no four-column unique
  -- object of any kind exists. The swap therefore happened after 2026-07-09,
  -- and it is what this migration repairs;
  -- (b) is_auto is NOT NULL DEFAULT false on prod, so "NULL is_auto blocks
  -- refresh" cannot occur — bare WHERE is_auto is exact, and conservatively
  -- treats unknown provenance as never-clobber by design.
  LIMIT 5000   -- deep-review r3 MEDIUM: bound per-run emission so a giant
               -- post-outage backlog makes forward progress across nights
               -- instead of timing out wholesale (real volume: single digits/day)
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
      ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
      ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_cdc_placement_outcome_measure()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled     boolean;
  v_min_cohort  integer;
  v_window      text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_measured    integer := 0;
  v_small       integer := 0;
  v_unchanged   integer := 0;
  v_evidence    integer := 0;
  v_held        integer := 0;
  v_details     jsonb := '[]'::jsonb;
  r             RECORD;
  v_metrics     jsonb;
  v_baseline    jsonb;
  v_delta       text;
  v_diff        numeric;
  v_cycle_id    uuid;
  v_label       text;
  v_latest      RECORD;
BEGIN
  -- Dark gate — the loop is dark unless its master switch is explicitly true.
  SELECT (value = 'true'::jsonb) INTO v_enabled
  FROM public.platform_policies
  WHERE policy_key = 'cdc_placement_loop.master_enabled'
    AND scope_type = 'global' AND is_active = true
  LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'loop dark (cdc_placement_loop.master_enabled != true)');
  END IF;

  SELECT COALESCE(NULLIF(value #>> '{}', '')::integer, 10) INTO v_min_cohort
  FROM public.platform_policies
  WHERE policy_key = 'cdc_placement_loop.min_cohort_size'
    AND scope_type = 'global' AND is_active = true
  LIMIT 1;
  v_min_cohort := COALESCE(v_min_cohort, 10);

  -- Enumerate cohorts FROM alumni_outcomes (the proven convergence source).
  FOR r IN
    SELECT DISTINCT ao.institution_id, ao.program_id,
      (CASE
         WHEN ao.graduation_date IS NOT NULL THEN
           CASE WHEN EXTRACT(MONTH FROM ao.graduation_date) >= 7
                THEN EXTRACT(YEAR FROM ao.graduation_date)::int + 1
                ELSE EXTRACT(YEAR FROM ao.graduation_date)::int END
         ELSE ao.graduation_year
       END) AS ay_end
    FROM public.alumni_outcomes ao
    WHERE ao.institution_id IS NOT NULL
      AND ao.program_id IS NOT NULL
      AND (ao.graduation_date IS NOT NULL OR ao.graduation_year IS NOT NULL)
    ORDER BY 1, 2, 3
  LOOP
    v_metrics := public.fn_cdc_placement_cohort_metrics(r.institution_id, r.program_id, r.ay_end);

    -- Small-cohort LABELING ('Compute, but label small group' — Director
    -- 2026-07-09): every cohort is computed; below the threshold the metrics
    -- carry small_cohort=true so UIs/reports render 'small group — interpret
    -- with care'. Nothing is skipped.
    v_metrics := v_metrics || jsonb_build_object(
      'small_cohort', COALESCE((v_metrics ->> 'n')::integer, 0) < v_min_cohort);
    IF (v_metrics ->> 'small_cohort')::boolean THEN
      v_small := v_small + 1;
    END IF;

    -- EVIDENCE HOLD (Director 2026-07-10 edge-case interview: "Hold
    -- incomplete-roster cohorts out"): a cohort whose denominator stands on
    -- outcome_reported (roster empty, or smaller than the outcomes we already
    -- know about) is still computed and stored, but stays OUT of the
    -- accreditation evidence ledger until its roster is completed. The stamp
    -- names the release action. NOTE small_cohort alone does NOT hold — the
    -- Director explicitly kept 2026-07-09's "compute, but label" ruling for
    -- placement smallness (same interview, consistency check).
    IF (v_metrics ->> 'denominator_basis') IS DISTINCT FROM 'batch_roster' THEN
      v_metrics := v_metrics || jsonb_build_object('evidence_held', 'incomplete_roster');
    END IF;

    -- Baseline = prior cohort (same institution+program, ay_end - 1), same
    -- estimator, same labeling. Unusable ONLY when truly empty (n = 0 — there
    -- is nothing to compare against) → NULL + 'n/a'. A small baseline is
    -- compared anyway and carries its own small_cohort flag.
    v_baseline := public.fn_cdc_placement_cohort_metrics(r.institution_id, r.program_id, r.ay_end - 1);
    IF COALESCE((v_baseline ->> 'n')::integer, 0) = 0 THEN
      v_baseline := NULL;
      v_delta := 'n/a';
    ELSE
      v_baseline := v_baseline || jsonb_build_object(
        'small_cohort', COALESCE((v_baseline ->> 'n')::integer, 0) < v_min_cohort);
      v_diff := COALESCE((v_metrics ->> 'progression_rate_pct')::numeric, 0)
              - COALESCE((v_baseline ->> 'progression_rate_pct')::numeric, 0);
      -- ±2.0pp deadband on progression rate (placement + higher studies).
      v_delta := CASE WHEN v_diff >= 2.0 THEN 'improved'
                      WHEN v_diff <= -2.0 THEN 'worse'
                      ELSE 'no_change' END;
    END IF;

    -- Change-only history: if the cohort's latest cycle row (any window) has
    -- identical metrics + baseline + delta, don't write a duplicate.
    SELECT c.metrics, c.baseline, c.delta_summary INTO v_latest
    FROM public.cdc_placement_outcome_cycles c
    WHERE c.institution_id = r.institution_id
      AND c.program_id = r.program_id
      AND c.cohort_ay_end = r.ay_end
    ORDER BY c.measured_at DESC
    LIMIT 1;
    IF v_latest.metrics IS NOT NULL
       AND v_latest.metrics = v_metrics
       AND v_latest.delta_summary = v_delta
       AND (v_latest.baseline IS NOT DISTINCT FROM v_baseline) THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    v_label := 'AY ' || (r.ay_end - 1)::text || '-' || right(r.ay_end::text, 2);

    INSERT INTO public.cdc_placement_outcome_cycles
      (institution_id, program_id, cohort_ay_end, cohort_label, measure_window,
       measured_at, metrics, baseline, delta_summary)
    VALUES
      (r.institution_id, r.program_id, r.ay_end, v_label, v_window,
       now(), v_metrics, v_baseline, v_delta)
    ON CONFLICT (institution_id, program_id, cohort_ay_end, measure_window)
    DO UPDATE SET
      measured_at   = now(),
      metrics       = EXCLUDED.metrics,
      baseline      = EXCLUDED.baseline,
      delta_summary = EXCLUDED.delta_summary,
      updated_at    = now()
    RETURNING id INTO v_cycle_id;

    v_measured := v_measured + 1;

    IF v_metrics ? 'evidence_held' THEN
      -- Held from the ledger — and self-heal: drop any auto evidence emitted
      -- for this cohort before the hold existed (or before its roster
      -- regressed). Manually-curated (is_auto=false) rows are never touched.
      v_held := v_held + 1;
      DELETE FROM public.quality_evidence_mappings
      WHERE source_table = 'cdc_placement_outcome_cycles'
        AND source_id = v_cycle_id
        AND is_auto;
    ELSE
      -- Gate ③ — NAAC 8.2.1 evidence emission ('Placement + higher studies
      -- progression', overlaps NIRF GO_PL/GO_PS). mapped_by is NULL: this runs
      -- as service role, there is no acting human — is_auto=true is the signal.
      INSERT INTO public.quality_evidence_mappings
        (source_table, source_id, institution_id, body_code, metric_code,
         period_label, mapped_by, is_auto, metadata, mapped_at)
      VALUES
        ('cdc_placement_outcome_cycles', v_cycle_id, r.institution_id, 'NAAC', '8.2.1',
         v_label, NULL, true,
         jsonb_build_object(
           'loop_key',      'cdc_placement',
           'loop_name',     'CDC Placement-Outcome Loop (measure phase)',
           'outcome',       v_metrics,
           'delta_summary', v_delta,
           'measured_at',   now(),
           'small_cohort',  (v_metrics ->> 'small_cohort')::boolean,
           'gates',         '①③ — act/feed-forward pending owner'),
         now())
      ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id)
      DO UPDATE SET
        period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_at    = now()
      WHERE public.quality_evidence_mappings.is_auto;

      v_evidence := v_evidence + 1;
    END IF;

    v_details := v_details || jsonb_build_object(
      'institution_id', r.institution_id, 'program_id', r.program_id,
      'cohort_ay_end', r.ay_end,
      'result', CASE WHEN v_metrics ? 'evidence_held'
                     THEN 'measured_held_from_evidence' ELSE 'measured' END,
      'denominator_basis', v_metrics ->> 'denominator_basis',
      'n', v_metrics ->> 'n',
      'small_cohort', (v_metrics ->> 'small_cohort')::boolean,
      'progression_rate_pct', v_metrics ->> 'progression_rate_pct',
      'delta_summary', v_delta);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'measure_window', v_window,
    'min_cohort_size', v_min_cohort,
    'cohorts_measured', v_measured,
    'cohorts_small_labeled', v_small,
    'cohorts_unchanged', v_unchanged,
    'cohorts_evidence_held', v_held,
    'evidence_upserts', v_evidence,
    'details', v_details);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_copo_emit_attainment_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled    boolean;
  v_count      integer := 0;
  v_removed    integer := 0;
  v_min_course integer;
  v_held_match integer := 0;
  v_held_small integer := 0;
BEGIN
  v_enabled := COALESCE((SELECT (value #>> '{}')::boolean
                         FROM public.platform_policies
                         WHERE policy_key = 'copo_attainment.master_enabled'
                           AND scope_type = 'global' AND is_active), false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'master_disabled', 'count', 0);
  END IF;

  -- EVIDENCE HOLDS (Director 2026-07-10 edge-case interview). A rollup enters
  -- the accreditation ledger ONLY when BOTH hold:
  --   1. its institution stamp is confident — institution_match is
  --      'unique_course_match' (course taught by exactly one mapped college)
  --      or 'manual_assignment' (a human assigned the twin via the re-stamp
  --      control). 'ambiguous_first_mapped' (CAS Self/Aided twins) and
  --      'unmatched_first_mapped' (no match at all — a guess) are HELD:
  --      "Hold ambiguous courses out" — an unmatched guess is even less
  --      defensible than an ambiguous one.
  --   2. the course is not small — learner basis (GREATEST of final/internal
  --      counts: final_learner_count is 0, NOT NULL, before finals are
  --      declared — a bare COALESCE held all 47 courses in validation)
  --      >= copo_attainment
  --      .min_course_size (Director: "Hold small courses out too"; NOTE this
  --      is deliberately STRICTER than placement, where small cohorts stay in
  --      evidence labeled small_cohort — Director kept that asymmetry
  --      explicitly in the same interview).
  -- Held rollups stay computed and visible on dashboards; they just never
  -- enter quality_evidence_mappings — and previously-emitted auto rows for
  -- now-held rollups are removed (self-healing on every run).
  v_min_course := COALESCE((SELECT NULLIF(value #>> '{}', '')::integer
                            FROM public.platform_policies
                            WHERE policy_key = 'copo_attainment.min_course_size'
                              AND scope_type = 'global' AND is_active), 10);

  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'obe_course_attainment_rollup', o.id, o.institution_id, b.body_code, b.metric_code,
    -- 'AY YYYY-YY', June cutoff (IST for the timestamptz fallback)
    (SELECT CASE
       WHEN extract(month FROM d) >= 6
         THEN 'AY ' || extract(year FROM d)::int::text || '-' || right((extract(year FROM d)::int + 1)::text, 2)
       ELSE 'AY ' || (extract(year FROM d)::int - 1)::text || '-' || right(extract(year FROM d)::int::text, 2)
     END
     FROM (SELECT COALESCE(o.session_end_date::timestamp,
                           (o.computed_at AT TIME ZONE 'Asia/Kolkata')) AS d) x),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'copo_attainment',
      'loop_name', 'CO/PO Attainment Loop',
      'grain',     o.grain,
      'co_tagged', COALESCE((o.metadata->>'co_tagged')::boolean, false),
      'outcome', jsonb_build_object(
        'course_code',        o.course_code,
        'course_name',        o.course_name,
        'program_code',       o.program_code,
        'session_code',       o.session_code,
        'attainment_basis',   o.attainment_basis,
        'attainment_pct',     o.attainment_pct,
        'attainment_level',   o.attainment_level,
        'learner_count',      GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)),
        'threshold_pct',      o.threshold_pct_used,
        'pass_pct',           o.pass_pct,
        'prev_attainment_pct', o.prev_attainment_pct,
        'delta_pct',          o.delta_pct
      ),
      'delta_summary', CASE
        WHEN o.delta_pct IS NULL THEN 'n/a'
        WHEN o.delta_pct > 0     THEN 'improved'
        WHEN o.delta_pct < 0     THEN 'worse'
        ELSE 'no_change' END,
      'measured_at', o.computed_at
    ),
    now()
  FROM public.obe_course_attainment_rollup o
  CROSS JOIN (VALUES ('NAAC', '7.3.d'), ('NBA', 'T1_CO')) AS b(body_code, metric_code)
  WHERE o.attainment_pct IS NOT NULL
    AND (o.metadata->>'institution_match') IN ('unique_course_match', 'manual_assignment')
    AND GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) >= v_min_course
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    -- never clobber a manually-curated (is_auto=false) mapping for this key
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Self-heal: auto evidence whose source rollup is now held leaves the ledger.
  DELETE FROM public.quality_evidence_mappings qem
  USING public.obe_course_attainment_rollup o
  WHERE qem.source_table = 'obe_course_attainment_rollup'
    AND qem.source_id = o.id
    AND qem.is_auto
    AND NOT ((o.metadata->>'institution_match') IN ('unique_course_match', 'manual_assignment')
             AND GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) >= v_min_course);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  SELECT
    count(*) FILTER (WHERE (o.metadata->>'institution_match')
                           NOT IN ('unique_course_match', 'manual_assignment')),
    count(*) FILTER (WHERE GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) < v_min_course)
  INTO v_held_match, v_held_small
  FROM public.obe_course_attainment_rollup o
  WHERE o.attainment_pct IS NOT NULL;

  RETURN jsonb_build_object(
    'copo_attainment', v_count, 'count', v_count,
    'min_course_size', v_min_course,
    'held_uncertain_institution', v_held_match,
    'held_small_course', v_held_small,
    'evidence_rows_removed', v_removed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_event_feedback_refresh_naac_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_facility_teaching_naac_snapshot_refresh()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ay       text := public.fn_accreditation_ay_label(now());
  v_511      integer := 0;
  v_311      integer := 0;
  v_341      integer := 0;
  v_map      integer := 0;
  v_campus   jsonb;
  v_errors   jsonb := '{}'::jsonb;
BEGIN
  -- ── (a) 5.1.1 — lesson-plan / pedagogy-tagging coverage per institution ────
  -- Emits ONLY for institutions with at least one curriculum_lesson row
  -- (no fabricated zero-coverage snapshots). Counts only; created_by /
  -- approved_by identities are deliberately never copied (k-anonymity).
  BEGIN
    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      l.institution_id, '5.1.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'lessons_total',          l.lessons_total,
        'lessons_published',      l.lessons_published,
        'courses_covered_total',  l.courses_covered_total,
        'courses_covered_active', l.courses_covered_active,
        'active_courses_total',   COALESCE(c.active_total, 0),
        'course_coverage_pct',    CASE WHEN COALESCE(c.active_total, 0) > 0
                                    THEN round(100.0 * l.courses_covered_active / c.active_total, 1)
                                    ELSE NULL END,
        'taxonomy_tagged',        l.taxonomy_tagged,
        'taxonomy_tagged_pct',    round(100.0 * l.taxonomy_tagged / l.lessons_total, 1),
        'technique_diversity',    jsonb_build_object(
                                    'distinct_taxonomies',      l.distinct_taxonomies,
                                    'distinct_bloom_levels',    l.distinct_bloom_levels,
                                    'distinct_fink_dimensions', l.distinct_fink_dimensions),
        'source',                 'curriculum_lesson spine',
        'privacy',                'aggregate counts only — no faculty identities'
      ),
      now(), now()
    FROM (
      SELECT cl.institution_id,
             count(*)                                       AS lessons_total,
             count(*) FILTER (WHERE cl.status = 'published' OR cl.is_published) AS lessons_published,
             count(DISTINCT cl.course_id)                   AS courses_covered_total,
             count(DISTINCT cl.course_id) FILTER (WHERE co.is_active) AS courses_covered_active,
             count(*) FILTER (WHERE cl.primary_taxonomy IS NOT NULL
                                 OR cl.primary_bloom_level IS NOT NULL
                                 OR cl.primary_fink_dimension IS NOT NULL) AS taxonomy_tagged,
             count(DISTINCT cl.primary_taxonomy)            AS distinct_taxonomies,
             count(DISTINCT cl.primary_bloom_level)         AS distinct_bloom_levels,
             count(DISTINCT cl.primary_fink_dimension)      AS distinct_fink_dimensions
      FROM public.curriculum_lesson cl
      LEFT JOIN public.courses co ON co.id = cl.course_id
      GROUP BY cl.institution_id
    ) l
    JOIN public.institutions i ON i.id = l.institution_id
    LEFT JOIN (
      SELECT institution_id, count(*) AS active_total
      FROM public.courses WHERE is_active GROUP BY institution_id
    ) c ON c.institution_id = l.institution_id
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_511 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_5_1_1', SQLERRM);
  END;

  -- ── (b) 3.1.1 — facilities in daily use per institution ────────────────────
  -- Resource registry counts by parent category + reservation/usage activity,
  -- plus campus-wide living-module activity counts (hostel/mess/health/sports
  -- tables are not institution-scoped here → computed once, stamped with
  -- campus_wide=true; zeros are reported honestly, not hidden).
  BEGIN
    SELECT jsonb_build_object(
      'campus_wide',        true,
      'hostel_beds',        (SELECT count(*) FROM public.hostel_beds),
      'hostel_allocations', (SELECT count(*) FROM public.hostel_allocations),
      'hostel_attendance',  (SELECT count(*) FROM public.hostel_attendance),
      'mess_dish_votes',    (SELECT count(*) FROM public.mess_dish_votes),
      'health_profiles',    (SELECT count(*) FROM public.health_profiles),
      'health_assessments', (SELECT count(*) FROM public.health_assessments),
      'tournament_entries', (SELECT count(*) FROM public.tournament_entries),
      'tournament_matches', (SELECT count(*) FROM public.tournament_matches)
    ) INTO v_campus;

    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      r.institution_id, '3.1.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'resources_total',        r.resources_total,
        'resources_by_category',  r.by_category,
        'reservations_total',     COALESCE(act.reservations, 0),
        'usage_logs_total',       COALESCE(act.usage_logs, 0),
        'campus_module_activity', v_campus,
        'source',                 'resource registry + campus living modules'
      ),
      now(), now()
    FROM (
      SELECT res.institution_id,
             count(*) AS resources_total,
             jsonb_object_agg(pc.name, cnt) FILTER (WHERE pc.name IS NOT NULL) AS by_category
      FROM (
        SELECT institution_id, parent_category_id, count(*) AS cnt
        FROM public.resources
        WHERE institution_id IS NOT NULL
        GROUP BY institution_id, parent_category_id
      ) res
      LEFT JOIN public.resource_parent_categories pc ON pc.id = res.parent_category_id
      GROUP BY res.institution_id
    ) r
    JOIN public.institutions i ON i.id = r.institution_id
    LEFT JOIN (
      SELECT rs.institution_id,
             count(DISTINCT rr.id) AS reservations,
             count(DISTINCT ul.id) AS usage_logs
      FROM public.resources rs
      LEFT JOIN public.resource_reservations rr ON rr.resource_id = rs.id
      LEFT JOIN public.resource_usage_logs   ul ON ul.resource_id = rs.id
      WHERE rs.institution_id IS NOT NULL
      GROUP BY rs.institution_id
    ) act ON act.institution_id = r.institution_id
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_311 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_3_1_1', SQLERRM);
  END;

  -- ── (c) 3.4.1 — IT infrastructure & learner:computer ratio ─────────────────
  -- SOURCE: resource registry (survey 2026-07-26: ims_item_categories has NO
  -- computing categories — dental/pharmacy/lab consumables only — so the IMS
  -- path is honestly uncomputable and skipped). Category matching is by the
  -- live names ('IT & Digital Resources' parent; 'Computers' subcategory);
  -- if those are ever renamed this section emits nothing rather than guessing.
  -- units = sum(coalesce(current_stock_quantity, 1)) — a registered resource
  -- row is at least one physical unit; method recorded in metadata.
  -- Ratio emitted only where computer_units > 0.
  BEGIN
    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      it.institution_id, '3.4.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'it_resources_rows',      it.it_rows,
        'it_units',               it.it_units,
        'computer_rows',          it.computer_rows,
        'computer_units',         it.computer_units,
        'networking_rows',        it.networking_rows,
        'learners_total',         COALESCE(lp.learners, 0),
        'learner_computer_ratio', CASE WHEN it.computer_units > 0 AND COALESCE(lp.learners, 0) > 0
                                    THEN round(lp.learners::numeric / it.computer_units, 1)
                                    ELSE NULL END,
        'unit_method',            'units = sum(coalesce(current_stock_quantity, 1)) over resource rows',
        'source',                 'resource registry — parent category ''IT & Digital Resources'', subcategory ''Computers''',
        'ims_note',               'ims_item_categories carries no computing categories (surveyed 2026-07-26) — IMS path skipped, not fabricated'
      ),
      now(), now()
    FROM (
      SELECT r.institution_id,
             count(*) FILTER (WHERE pc.name = 'IT & Digital Resources')          AS it_rows,
             COALESCE(sum(COALESCE(r.current_stock_quantity, 1))
               FILTER (WHERE pc.name = 'IT & Digital Resources'), 0)             AS it_units,
             count(*) FILTER (WHERE sc.name = 'Computers')                       AS computer_rows,
             COALESCE(sum(COALESCE(r.current_stock_quantity, 1))
               FILTER (WHERE sc.name = 'Computers'), 0)                          AS computer_units,
             count(*) FILTER (WHERE sc.name = 'Networking Devices')              AS networking_rows
      FROM public.resources r
      LEFT JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
      LEFT JOIN public.resource_sub_categories    sc ON sc.id = r.subcategory_id
      WHERE r.institution_id IS NOT NULL
        AND (pc.name = 'IT & Digital Resources'
             OR sc.name IN ('Computers', 'Networking Devices'))
      GROUP BY r.institution_id
    ) it
    JOIN public.institutions i ON i.id = it.institution_id
    LEFT JOIN (
      SELECT institution_id, count(*) AS learners
      FROM public.learners_profiles GROUP BY institution_id
    ) lp ON lp.institution_id = it.institution_id
    WHERE it.it_rows > 0 OR it.computer_rows > 0 OR it.networking_rows > 0
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_341 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_3_4_1', SQLERRM);
  END;

  -- ── (d) Fan-out: snapshot rows → quality_evidence_mappings (canonical
  --        junction, natural-key upsert, never clobber manual rows) ──────────
  BEGIN
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    SELECT
      'facility_teaching_naac_evidence', s.id, s.institution_id, 'NAAC',
      s.metric_code, s.ay_label, NULL, true,
      s.computed || jsonb_build_object('snapshot', true, 'computed_at', s.computed_at),
      now()
    FROM public.facility_teaching_naac_evidence s
    WHERE s.ay_label = v_ay
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      WHERE public.quality_evidence_mappings.is_auto;
    GET DIAGNOSTICS v_map = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('mappings', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ay',          v_ay,
    'snap_5_1_1',  v_511,
    'snap_3_1_1',  v_311,
    'snap_3_4_1',  v_341,
    'mappings',    v_map,
    'count',       v_511 + v_311 + v_341
  ) || CASE WHEN v_errors = '{}'::jsonb THEN '{}'::jsonb
            ELSE jsonb_build_object('errors', v_errors) END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_refresh_naac_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ay        text;
  v_ay_start  date;
  v_cutoff    date;   -- retention baseline: joined on/before AY start − 3 years
  v_snapshots integer := 0;
  v_m21       integer := 0;
  v_m221      integer := 0;
  v_m222      integer := 0;
  v_m223      integer := 0;
  v_m7101     integer := 0;
  v_withdrawn integer := 0;
BEGIN
  v_ay := public.fn_accreditation_ay_label(now());
  -- AY start (June 1, IST) — same June cutoff as fn_accreditation_ay_label.
  v_ay_start := CASE
    WHEN extract(month FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 6
      THEN make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int, 6, 1)
    ELSE make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 1, 6, 1)
  END;
  v_cutoff := (v_ay_start - interval '3 years')::date;

  -- ── (a) Upsert snapshots — one per institution that has active faculty ────
  -- Faculty = employment_categories.is_teaching AND staff.is_active (verified
  -- discriminator; staff.role_type is 'teacher' for ALL rows, incl. drivers).
  -- Cadre from free-text designation, case-insensitive; assistant checked
  -- before associate before bare professor so 'Assistant Professor & Head'
  -- lands correctly; legacy 'Reader' = associate level.
  WITH fac AS (
    SELECT
      s.institution_id,
      count(*)::int AS faculty_count,
      count(*) FILTER (WHERE s.designation !~* 'assistant\s*professor'
                         AND s.designation !~* 'associate\s*professor'
                         AND s.designation !~* '^\s*reader'
                         AND s.designation  ~* 'professor')::int AS n_prof,
      count(*) FILTER (WHERE s.designation ~* 'associate\s*professor'
                          OR s.designation ~* '^\s*reader')::int AS n_assoc,
      count(*) FILTER (WHERE s.designation ~* 'assistant\s*professor')::int AS n_asst,
      count(*) FILTER (WHERE s.designation !~* 'professor'
                         AND s.designation !~* '^\s*reader')::int AS n_other,
      count(*) FILTER (WHERE s.qualifications::text ~* 'ph\.?\s?d'
                          OR s.qualification_summary ~* 'ph\.?\s?d')::int AS n_phd,
      round(avg(s.experience_years)::numeric, 1) AS avg_exp
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE ec.is_teaching AND COALESCE(s.is_active, false)
    GROUP BY s.institution_id
  ),
  ret AS (
    -- Retention over ALL teaching-category staff rows (active + inactive):
    -- baseline = joined on/before cutoff; retained = of those, still active.
    -- (hr_offboarding_cases has 0 completed separations on prod, so
    -- is_active is the separation signal; open cases carried as context.)
    SELECT
      s.institution_id,
      count(*) FILTER (WHERE s.date_of_joining <= v_cutoff)::int AS baseline_n,
      count(*) FILTER (WHERE s.date_of_joining <= v_cutoff
                         AND COALESCE(s.is_active, false))::int AS retained_n
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE ec.is_teaching
    GROUP BY s.institution_id
  ),
  lrn AS (
    SELECT lp.institution_id, count(*)::int AS learner_n
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
    GROUP BY lp.institution_id
  ),
  sanc AS (
    SELECT sp.institution_id,
           sum(sp.sanctioned_count)::int AS sanctioned_total,
           jsonb_object_agg(sp.cadre, sp.cadre_total) FILTER (WHERE sp.cadre IS NOT NULL) AS by_cadre
    FROM (
      SELECT institution_id, cadre, sum(sanctioned_count)::int AS cadre_total,
             sum(sanctioned_count) AS sanctioned_count
      FROM public.sanctioned_posts
      WHERE academic_year = v_ay
      GROUP BY institution_id, cadre
    ) sp
    GROUP BY sp.institution_id
  ),
  offb AS (
    SELECT o.institution_id, count(*)::int AS open_n
    FROM public.hr_offboarding_cases o
    WHERE o.status = 'open'
    GROUP BY o.institution_id
  )
  INSERT INTO public.hr_naac_evidence AS h
    (institution_id, academic_year,
     learner_count, faculty_count, fsr,
     cadre_professor, cadre_associate_professor, cadre_assistant_professor,
     cadre_other_teaching, sanctioned_total, sanctioned_filled_pct,
     phd_faculty_count, phd_pct,
     avg_experience_years,
     retention_baseline_count, retention_retained_count, retention_pct,
     open_offboarding_cases, metadata, computed_at, updated_at)
  SELECT
    f.institution_id, v_ay,
    COALESCE(l.learner_n, 0), f.faculty_count,
    CASE WHEN f.faculty_count > 0 AND COALESCE(l.learner_n, 0) > 0
         THEN round(l.learner_n::numeric / f.faculty_count, 1) END,
    f.n_prof, f.n_assoc, f.n_asst, f.n_other,
    sa.sanctioned_total,
    CASE WHEN sa.sanctioned_total > 0
         THEN round(f.faculty_count::numeric * 100 / sa.sanctioned_total, 1) END,
    f.n_phd,
    CASE WHEN f.faculty_count > 0
         THEN round(f.n_phd::numeric * 100 / f.faculty_count, 1) END,
    f.avg_exp,
    COALESCE(r.baseline_n, 0), COALESCE(r.retained_n, 0),
    CASE WHEN COALESCE(r.baseline_n, 0) > 0
         THEN round(r.retained_n::numeric * 100 / r.baseline_n, 1) END,
    COALESCE(ob.open_n, 0),
    jsonb_build_object(
      'sanctioned_by_cadre', sa.by_cadre,
      'method', jsonb_build_object(
        'faculty',   'employment_categories.is_teaching AND staff.is_active',
        'learners',  'learners_profiles.lifecycle_status = active',
        'phd',       'qualifications/qualification_summary ~* ph.d',
        'cadre',     'designation pattern match (Reader = associate level)',
        'retention', 'joined on/before ' || v_cutoff::text || ' AND still active'
      )
    ),
    now(), now()
  FROM fac f
  LEFT JOIN lrn  l  ON l.institution_id  = f.institution_id
  LEFT JOIN ret  r  ON r.institution_id  = f.institution_id
  LEFT JOIN sanc sa ON sa.institution_id = f.institution_id
  LEFT JOIN offb ob ON ob.institution_id = f.institution_id
  ON CONFLICT (institution_id, academic_year) DO UPDATE
    SET learner_count             = EXCLUDED.learner_count,
        faculty_count             = EXCLUDED.faculty_count,
        fsr                       = EXCLUDED.fsr,
        cadre_professor           = EXCLUDED.cadre_professor,
        cadre_associate_professor = EXCLUDED.cadre_associate_professor,
        cadre_assistant_professor = EXCLUDED.cadre_assistant_professor,
        cadre_other_teaching      = EXCLUDED.cadre_other_teaching,
        sanctioned_total          = EXCLUDED.sanctioned_total,
        sanctioned_filled_pct     = EXCLUDED.sanctioned_filled_pct,
        phd_faculty_count         = EXCLUDED.phd_faculty_count,
        phd_pct                   = EXCLUDED.phd_pct,
        avg_experience_years      = EXCLUDED.avg_experience_years,
        retention_baseline_count  = EXCLUDED.retention_baseline_count,
        retention_retained_count  = EXCLUDED.retention_retained_count,
        retention_pct             = EXCLUDED.retention_pct,
        open_offboarding_cases    = EXCLUDED.open_offboarding_cases,
        metadata                  = EXCLUDED.metadata,
        computed_at               = now(),
        updated_at                = now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- ── (b) Withdraw stale AUTO mappings whose emit-condition stopped holding
  --        (e.g. sanctioned posts deleted → 2.2.1 must disappear, not zero).
  --        Manual (is_auto=false) mappings are never touched. ────────────────
  DELETE FROM public.quality_evidence_mappings qem
  USING public.hr_naac_evidence h
  WHERE qem.source_table = 'hr_naac_evidence'
    AND qem.source_id   = h.id
    AND qem.body_code   = 'NAAC'
    AND qem.is_auto
    AND h.academic_year = v_ay
    AND (   (qem.metric_code = '2.2.1'  AND h.sanctioned_total IS NULL)
         OR (qem.metric_code = '2.1'    AND h.fsr IS NULL)
         OR (qem.metric_code = '2.2.2'  AND h.phd_pct IS NULL)
         OR (qem.metric_code = '2.2.3'  AND COALESCE(h.faculty_count, 0) = 0)
         OR (qem.metric_code = '7.10.1' AND h.retention_pct IS NULL));
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;

  -- ── (c) 2.1 — faculty-learner ratio ────────────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',       'faculty_learner_ratio',
      'learner_count', h.learner_count,
      'faculty_count', h.faculty_count,
      'ratio',         h.fsr,
      'ratio_label',   '1:' || h.fsr::text,
      'computed_at',   h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.fsr IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m21 = ROW_COUNT;

  -- ── (d) 2.2.1 — cadre strength vs sanctioned posts (ONLY where a register
  --        exists for this institution + AY; absence is skipped, never zeroed).
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',             'cadre_vs_sanctioned',
      'sanctioned_total',    h.sanctioned_total,
      'filled_total',        h.faculty_count,
      'filled_pct',          h.sanctioned_filled_pct,
      'filled_by_cadre',     jsonb_build_object(
                               'professor',           h.cadre_professor,
                               'associate_professor', h.cadre_associate_professor,
                               'assistant_professor', h.cadre_assistant_professor,
                               'other_teaching',      h.cadre_other_teaching),
      'sanctioned_by_cadre', h.metadata->'sanctioned_by_cadre',
      'computed_at',         h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.sanctioned_total IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m221 = ROW_COUNT;

  -- ── (e) 2.2.2 — PhD % ─────────────────────────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.2',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',           'phd_pct',
      'phd_faculty_count', h.phd_faculty_count,
      'faculty_count',     h.faculty_count,
      'phd_pct',           h.phd_pct,
      'computed_at',       h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.phd_pct IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m222 = ROW_COUNT;

  -- ── (f) 2.2.3 — avg teaching experience + cadre-level distribution ────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.3',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',              'avg_experience_and_cadre_levels',
      'avg_experience_years', h.avg_experience_years,
      'faculty_count',        h.faculty_count,
      'by_level',             jsonb_build_object(
                                'professor',           h.cadre_professor,
                                'associate_professor', h.cadre_associate_professor,
                                'assistant_professor', h.cadre_assistant_professor,
                                'other_teaching',      h.cadre_other_teaching),
      'computed_at',          h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND COALESCE(h.faculty_count, 0) > 0
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m223 = ROW_COUNT;

  -- ── (g) 7.10.1 — 3-year faculty retention % ───────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '7.10.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',                'retention_3y',
      'baseline_count',         h.retention_baseline_count,
      'retained_count',         h.retention_retained_count,
      'retention_pct',          h.retention_pct,
      'baseline_cutoff',        v_cutoff,
      'open_offboarding_cases', h.open_offboarding_cases,
      'computed_at',            h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.retention_pct IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m7101 = ROW_COUNT;

  -- 'count' is on the dispatcher's summarize() allowlist.
  RETURN jsonb_build_object(
    'academic_year', v_ay,
    'snapshots',     v_snapshots,
    'fsr_2_1',       v_m21,
    'cadre_2_2_1',   v_m221,
    'phd_2_2_2',     v_m222,
    'exp_2_2_3',     v_m223,
    'retention_7_10_1', v_m7101,
    'withdrawn',     v_withdrawn,
    'count',         v_m21 + v_m221 + v_m222 + v_m223 + v_m7101
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_induction_emit_naac_evidence(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prog    RECORD;
  v_period  TEXT;
  v_meta    JSONB;
  v_metric  TEXT;
  v_n       INTEGER := 0;
  v_rc      INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authenticated'; END IF;

  SELECT ip.id AS program_id, ip.institution_id, e.start_date, ay.academic_year_name
    INTO v_prog
  FROM public.induction_programs ip
  JOIN public.events e ON e.id = ip.event_id
  LEFT JOIN public.academic_years ay ON ay.id = ip.academic_year_id
  WHERE ip.event_id = p_event_id;
  IF v_prog.program_id IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not an induction event'; END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_prog.institution_id))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authorized';
  END IF;

  -- Prefer the linked academic-year LABEL (correct AY semantics — an Indian academic
  -- year spans two calendar years, so a Jan–May induction must not be labelled by its
  -- calendar start year). Fall back to an IST-normalised calendar-year label only when
  -- the program has no academic_year row.
  v_period := COALESCE(
    NULLIF(btrim(v_prog.academic_year_name), ''),
    CASE WHEN v_prog.start_date IS NULL THEN NULL
      ELSE extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int::text || '-' ||
           right((extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    END
  );

  -- Live rollup snapshot for the metadata (joins LIVE off the admission funnel).
  WITH freshers AS (
    SELECT ie.learner_id FROM public.induction_enrollment ie WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- submitted/referrers = EFFORT (any JKKN college); only JOINED scoped to
             -- this college (match fn_induction_scorecard) for the NAAC evidence metadata.
    SELECT count(*) FILTER (WHERE al.id IS NOT NULL) AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_prog.institution_id
           ) AS joined,
           count(DISTINCT al.referred_by_id) FILTER (WHERE al.id IS NOT NULL) AS referrers
    FROM freshers f
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = f.learner_id AND al.source = 'referral'::lead_source
  ),
  comp AS (
    SELECT count(*) AS enrolled,
           count(*) FILTER (WHERE c.participation_complete) AS participation_complete,
           count(*) FILTER (WHERE c.outcome_complete) AS outcome_complete,
           round(avg(c.attendance_pct), 2) AS avg_attendance_pct,
           round(avg(c.value_score_avg), 2) AS avg_value,
           round(avg(c.advocacy_score), 2) AS avg_advocacy
    FROM public.induction_enrollment ie
    LEFT JOIN public.induction_completion c
      ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
    WHERE ie.event_id = p_event_id
  )
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'period_label', v_period,
    'enrolled', comp.enrolled,
    'participation_complete', comp.participation_complete,
    'outcome_complete', comp.outcome_complete,
    'avg_attendance_pct', comp.avg_attendance_pct,
    'avg_value_score', comp.avg_value,
    'avg_advocacy_score', comp.avg_advocacy,
    'referrers', refs.referrers,
    'referrals_submitted', refs.submitted,
    'referrals_joined', refs.joined,
    'snapshot_at', now()
  ) INTO v_meta
  FROM comp, refs;

  -- Don't write NAAC evidence for an induction that reached nobody. The UI hides the
  -- button at enrolled=0, but a direct RPC must not emit all-zero evidence rows.
  IF COALESCE((v_meta->>'enrolled')::int, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Upsert one evidence row per NAAC criterion (source row = the induction_programs
  -- satellite). Refresh metadata + mapped_at on conflict so re-running re-snapshots.
  FOREACH v_metric IN ARRAY ARRAY['6.3.1','6.3.2'] LOOP
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    VALUES
      ('induction_programs', v_prog.program_id, v_prog.institution_id, 'NAAC', v_metric,
       v_period, auth.uid(), true, v_meta, now())
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      -- never clobber a manually-curated (is_auto=false) evidence mapping for this key
      WHERE public.quality_evidence_mappings.is_auto;
    -- count ACTUAL writes only: the upsert is a no-op (ROW_COUNT 0) when a manual
    -- row blocked the update, so the caller/UI never reports a false success.
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_n := v_n + v_rc;
  END LOOP;

  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_sustainability_refresh_naac_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ay          text;
  v_ay_start    date;
  v_ay_end      date;
  v_prior_start date;
  v_min_months  integer;
  v_snapshots   integer := 0;
  v_m102        integer := 0;
  v_m103        integer := 0;
  v_withdrawn   integer := 0;
BEGIN
  v_ay := public.fn_accreditation_ay_label(now());
  -- AY start (June 1, IST) — derived from the SAME June cutoff as the label so
  -- the aggregation window and the period_label can never drift at the boundary.
  v_ay_start := CASE
    WHEN extract(month FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 6
      THEN make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int, 6, 1)
    ELSE make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 1, 6, 1)
  END;
  v_ay_end      := (v_ay_start + interval '1 year')::date;
  v_prior_start := (v_ay_start - interval '1 year')::date;

  v_min_months := COALESCE(
    public.fn_get_policy_int('sustainability.min_months_for_trend', 2, NULL), 2);

  -- ── (a) Upsert snapshots — ONLY for institutions with readings in this AY.
  --        No readings → no row here → no evidence downstream.
  WITH cur AS (
    SELECT
      r.institution_id,
      count(DISTINCT r.period_month)::int                        AS months_reported,
      max(r.period_month)                                        AS latest_month,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream = 'electricity_kwh')::int          AS electricity_months,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream IN ('water_kl', 'waste_kg'))::int   AS water_waste_months,
      sum(r.reading_value) FILTER (WHERE r.stream = 'electricity_kwh')      AS electricity_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'water_kl')             AS water_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'waste_kg')             AS waste_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'solar_kwh_generated')  AS solar_total,
      count(*) FILTER (WHERE r.is_estimated)::int                 AS estimated_rows
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_ay_start AND r.period_month < v_ay_end
    GROUP BY r.institution_id
  ),
  -- Earliest / latest reported electricity month inside the AY — the two ends
  -- the 10.3 direction is measured across. (institution, month, stream) is
  -- UNIQUE, so DISTINCT ON yields exactly one row per institution.
  elec_first AS (
    SELECT DISTINCT ON (r.institution_id)
           r.institution_id, r.period_month AS m, r.reading_value AS v
    FROM public.sustainability_meter_readings r
    WHERE r.stream = 'electricity_kwh'
      AND r.period_month >= v_ay_start AND r.period_month < v_ay_end
    ORDER BY r.institution_id, r.period_month ASC
  ),
  elec_last AS (
    SELECT DISTINCT ON (r.institution_id)
           r.institution_id, r.period_month AS m, r.reading_value AS v
    FROM public.sustainability_meter_readings r
    WHERE r.stream = 'electricity_kwh'
      AND r.period_month >= v_ay_start AND r.period_month < v_ay_end
    ORDER BY r.institution_id, r.period_month DESC
  ),
  prior AS (
    SELECT
      r.institution_id,
      count(DISTINCT r.period_month)::int                                  AS months_reported,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream = 'electricity_kwh')::int                   AS electricity_months,
      sum(r.reading_value) FILTER (WHERE r.stream = 'electricity_kwh')     AS electricity_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'water_kl')            AS water_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'waste_kg')            AS waste_total
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_prior_start AND r.period_month < v_ay_start
    GROUP BY r.institution_id
  ),
  series AS (
    SELECT r.institution_id,
           jsonb_agg(jsonb_build_object(
             'month',     to_char(r.period_month, 'YYYY-MM'),
             'stream',    r.stream,
             'value',     r.reading_value,
             'estimated', r.is_estimated
           ) ORDER BY r.period_month, r.stream) AS s
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_ay_start AND r.period_month < v_ay_end
    GROUP BY r.institution_id
  ),
  calc AS (
    SELECT
      c.*,
      ef.m AS elec_first_month, ef.v AS elec_first_value,
      el.m AS elec_last_month,  el.v AS elec_last_value,
      p.electricity_total AS prior_elec, p.water_total AS prior_water,
      p.waste_total AS prior_waste, p.months_reported AS prior_months,
      p.electricity_months AS prior_elec_months,
      s.s AS series,
      -- Direction preference: year-on-year when a prior AY exists (the honest
      -- comparison), else first-vs-latest month inside this AY.
      --
      -- YoY compares AVERAGE PER REPORTED MONTH, never raw totals. A current
      -- AY is almost always partial (in July it holds 2 months against the
      -- prior year's 12), so a totals comparison reports a fake +500% every
      -- June and a fake -85% every July. Caught by assertion A5 during
      -- BEGIN..ROLLBACK validation on prod, 2026-07-26.
      CASE
        WHEN COALESCE(p.electricity_months, 0) > 0
         AND COALESCE(p.electricity_total, 0) > 0
         AND c.electricity_months > 0
         AND c.electricity_total IS NOT NULL
          THEN round(
                 ( (c.electricity_total / c.electricity_months)
                 - (p.electricity_total / p.electricity_months) ) * 100
                 / (p.electricity_total / p.electricity_months), 1)
        WHEN ef.v IS NOT NULL AND el.m > ef.m AND ef.v > 0
          THEN round((el.v - ef.v) * 100 / ef.v, 1)
      END AS trend_pct,
      CASE
        WHEN COALESCE(p.electricity_months, 0) > 0
         AND COALESCE(p.electricity_total, 0) > 0
         AND c.electricity_months > 0
         AND c.electricity_total IS NOT NULL       THEN 'year_on_year_avg_per_month'
        WHEN ef.v IS NOT NULL AND el.m > ef.m AND ef.v > 0
                                                  THEN 'first_vs_latest_month'
        ELSE 'none'
      END AS trend_basis
    FROM cur c
    LEFT JOIN elec_first ef ON ef.institution_id = c.institution_id
    LEFT JOIN elec_last  el ON el.institution_id = c.institution_id
    LEFT JOIN prior      p  ON p.institution_id  = c.institution_id
    LEFT JOIN series     s  ON s.institution_id  = c.institution_id
  )
  INSERT INTO public.sustainability_naac_evidence AS t
    (institution_id, academic_year, months_reported, latest_month,
     electricity_kwh_total, water_kl_total, waste_kg_total, solar_kwh_total,
     electricity_months, water_waste_months,
     electricity_first_month, electricity_first_value, electricity_last_value,
     electricity_trend_pct, net_zero_direction,
     prior_electricity_kwh_total, prior_water_kl_total, prior_waste_kg_total,
     monthly_series, emit_10_2, emit_10_3, metadata, computed_at, updated_at)
  SELECT
    k.institution_id, v_ay, k.months_reported, k.latest_month,
    k.electricity_total, k.water_total, k.waste_total, k.solar_total,
    k.electricity_months, k.water_waste_months,
    k.elec_first_month, k.elec_first_value, k.elec_last_value,
    k.trend_pct,
    CASE
      WHEN k.trend_pct IS NULL   THEN NULL
      WHEN k.trend_pct <= -1     THEN 'improving'
      WHEN k.trend_pct >=  1     THEN 'worsening'
      ELSE 'flat'
    END,
    k.prior_elec, k.prior_water, k.prior_waste,
    COALESCE(k.series, '[]'::jsonb),
    -- 10.2 gate: water and/or waste reported for enough months, with a total.
    (k.water_waste_months >= v_min_months
      AND (k.water_total IS NOT NULL OR k.waste_total IS NOT NULL)),
    -- 10.3 gate: enough electricity months AND a computable direction.
    (k.electricity_months >= v_min_months AND k.trend_pct IS NOT NULL),
    jsonb_build_object(
      'ay_window',        jsonb_build_object('from', v_ay_start, 'to_exclusive', v_ay_end),
      'min_months_for_trend', v_min_months,
      'estimated_rows',   k.estimated_rows,
      'prior_ay_months',  COALESCE(k.prior_months, 0),
      'prior_ay_electricity_months', COALESCE(k.prior_elec_months, 0),
      'trend_basis',      k.trend_basis,
      'method', jsonb_build_object(
        'source',   'sustainability_meter_readings (institution × month × stream)',
        'campus',   'institution_id — no separate campus/premises entity exists',
        'excluded', 'mess_waste_log (food waste per meal) is NOT a source: 0 rows on prod and a different measure'
      )
    ),
    now(), now()
  FROM calc k
  ON CONFLICT (institution_id, academic_year) DO UPDATE
    SET months_reported             = EXCLUDED.months_reported,
        latest_month                = EXCLUDED.latest_month,
        electricity_kwh_total       = EXCLUDED.electricity_kwh_total,
        water_kl_total              = EXCLUDED.water_kl_total,
        waste_kg_total              = EXCLUDED.waste_kg_total,
        solar_kwh_total             = EXCLUDED.solar_kwh_total,
        electricity_months          = EXCLUDED.electricity_months,
        water_waste_months          = EXCLUDED.water_waste_months,
        electricity_first_month     = EXCLUDED.electricity_first_month,
        electricity_first_value     = EXCLUDED.electricity_first_value,
        electricity_last_value      = EXCLUDED.electricity_last_value,
        electricity_trend_pct       = EXCLUDED.electricity_trend_pct,
        net_zero_direction          = EXCLUDED.net_zero_direction,
        prior_electricity_kwh_total = EXCLUDED.prior_electricity_kwh_total,
        prior_water_kl_total        = EXCLUDED.prior_water_kl_total,
        prior_waste_kg_total        = EXCLUDED.prior_waste_kg_total,
        monthly_series              = EXCLUDED.monthly_series,
        emit_10_2                   = EXCLUDED.emit_10_2,
        emit_10_3                   = EXCLUDED.emit_10_3,
        metadata                    = EXCLUDED.metadata,
        computed_at                 = now(),
        updated_at                  = now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- ── (b) Withdraw this emitter's own stale AUTO rows when a gate stops
  --        holding (e.g. readings deleted → the metric disappears, it is NOT
  --        zeroed). Manual (is_auto=false) mappings are never touched, and the
  --        delete is keyed per metric so no foreign auto mapping can be caught.
  DELETE FROM public.quality_evidence_mappings qem
  USING public.sustainability_naac_evidence s
  WHERE qem.source_table = 'sustainability_naac_evidence'
    AND qem.source_id    = s.id
    AND qem.body_code    = 'NAAC'
    AND qem.is_auto
    AND s.academic_year  = v_ay
    AND (   (qem.metric_code = '10.2' AND NOT s.emit_10_2)
         OR (qem.metric_code = '10.3' AND NOT s.emit_10_3));
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;

  -- ── (c) 10.2 — water & waste management ───────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'sustainability_naac_evidence', s.id, s.institution_id, 'NAAC', '10.2',
    s.academic_year, NULL, true,
    jsonb_build_object(
      'measure',            'water_and_waste_management',
      'months_reported',    s.water_waste_months,
      'water_kl_total',     s.water_kl_total,
      'waste_kg_total',     s.waste_kg_total,
      'prior_water_kl',     s.prior_water_kl_total,
      'prior_waste_kg',     s.prior_waste_kg_total,
      'latest_month',       s.latest_month,
      'monthly_series',     s.monthly_series,
      'computed_at',        s.computed_at
    ),
    now()
  FROM public.sustainability_naac_evidence s
  WHERE s.academic_year = v_ay AND s.emit_10_2
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m102 = ROW_COUNT;

  -- ── (d) 10.3 — progressing towards net zero (direction, not a snapshot) ───
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'sustainability_naac_evidence', s.id, s.institution_id, 'NAAC', '10.3',
    s.academic_year, NULL, true,
    jsonb_build_object(
      'measure',              'net_zero_progress',
      'direction',            s.net_zero_direction,
      'trend_pct',            s.electricity_trend_pct,
      'trend_basis',          s.metadata->>'trend_basis',
      'electricity_months',   s.electricity_months,
      'electricity_kwh_total', s.electricity_kwh_total,
      'prior_electricity_kwh', s.prior_electricity_kwh_total,
      'solar_kwh_total',      s.solar_kwh_total,
      'solar_share_pct',      CASE
                                WHEN COALESCE(s.electricity_kwh_total, 0) > 0
                                 AND s.solar_kwh_total IS NOT NULL
                                THEN round(s.solar_kwh_total * 100
                                           / s.electricity_kwh_total, 1)
                              END,
      'latest_month',         s.latest_month,
      'monthly_series',       s.monthly_series,
      'computed_at',          s.computed_at
    ),
    now()
  FROM public.sustainability_naac_evidence s
  WHERE s.academic_year = v_ay AND s.emit_10_3
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m103 = ROW_COUNT;

  -- 'count' is on the dispatcher's summarize() allowlist.
  RETURN jsonb_build_object(
    'academic_year',      v_ay,
    'snapshots',          v_snapshots,
    'water_waste_10_2',   v_m102,
    'net_zero_10_3',      v_m103,
    'withdrawn',          v_withdrawn,
    'skipped_thin',       GREATEST(v_snapshots * 2 - v_m102 - v_m103, 0),
    'count',              v_m102 + v_m103
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_audit_cycle_evidence(p_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.audit_cycles%ROWTYPE;
  v_inst uuid;
  v_period text;
BEGIN
  SELECT * INTO c FROM public.audit_cycles WHERE id = p_cycle_id;

  v_inst := CASE WHEN c.institution_ids IS NOT NULL AND array_length(c.institution_ids, 1) >= 1
                 THEN c.institution_ids[1] END;

  IF NOT FOUND
     OR c.phase <> 'closed'
     OR NOT ('NAAC' = ANY (c.frameworks))
     OR v_inst IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst) THEN
    -- Withdraw ONLY this emitter's keys. audit_cycles ALREADY has a foreign
    -- auto mapping live (→ NAAC 7.3.d, mapped 2026-07-10) — a blanket
    -- "delete all auto for this source" here would destroy it.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'audit_cycles' AND source_id = p_cycle_id AND is_auto
      AND body_code = 'NAAC' AND metric_code IN ('4.4.2', '10.4');
    RETURN;
  END IF;

  v_period := public.fn_accreditation_ay_label(
    COALESCE(c.closed_at, c.end_date::timestamptz, c.start_date::timestamptz)
  );

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'audit_cycles', c.id, v_inst,
    'NAAC', '4.4.2',
    v_period,
    NULL, true,
    jsonb_build_object(
      'name',               c.name,
      'phase',              c.phase,
      'audit_kind',         'internal',
      'frameworks',         to_jsonb(c.frameworks),
      'start_date',         c.start_date,
      'end_date',           c.end_date,
      'closed_at',          c.closed_at,
      'is_standing',        c.is_standing,
      'module_key',         c.module_key,
      'institutions_count', COALESCE(array_length(c.institution_ids, 1), 0),
      'source_trigger',     'fn_sync_audit_cycle_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  -- ── NAAC 10.4 — green audits & initiatives. Added 2026-07-26.
  -- A closed cycle discriminated by module_key='sustainability' IS the yearly
  -- green audit; the existing audit module (parameters → attestations →
  -- close) runs it, so there is no second audit engine. module_key is free
  -- text with no CHECK/FK/enum, so this needs no vocabulary widening and
  -- cannot leak into another framework's parameter snapshot.
  IF COALESCE(c.module_key, '') = 'sustainability' THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'audit_cycles', c.id, v_inst,
      'NAAC', '10.4',
      v_period,
      NULL, true,
      jsonb_build_object(
        'measure',            'green_audit_closed',
        'audit_kind',         'green',
        'name',               c.name,
        'phase',              c.phase,
        'frameworks',         to_jsonb(c.frameworks),
        'start_date',         c.start_date,
        'end_date',           c.end_date,
        'closed_at',          c.closed_at,
        'module_key',         c.module_key,
        'institutions_count', COALESCE(array_length(c.institution_ids, 1), 0),
        'source_trigger',     'fn_sync_audit_cycle_evidence'
      ),
      now()
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          period_label   = EXCLUDED.period_label,
          metadata       = EXCLUDED.metadata,
          is_auto        = true,
          mapped_at      = now()
      WHERE public.quality_evidence_mappings.is_auto;
  ELSE
    -- module_key edited away from 'sustainability' → withdraw 10.4 only.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'audit_cycles' AND source_id = c.id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '10.4';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_bos_meeting_evidence(p_meeting_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.bos_meetings%ROWTYPE;
  v_total   integer;
  v_present integer;
BEGIN
  SELECT * INTO m FROM public.bos_meetings WHERE id = p_meeting_id;

  IF NOT FOUND
     OR m.status <> 'minutes_approved'
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = m.institutions_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'bos_meetings' AND source_id = p_meeting_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '1.2';
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE attendance_status = 'present')
  INTO v_total, v_present
  FROM public.bos_meeting_attendees
  WHERE meeting_id = m.id;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'bos_meetings', m.id, m.institutions_id,
    'NAAC', '1.2',
    public.fn_accreditation_ay_label(
      COALESCE(m.actual_date::timestamptz, m.scheduled_date::timestamptz,
               m.minutes_approved_at, m.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'meeting_number',    m.meeting_number,
      'meeting_title',     m.meeting_title,
      'board_type',        m.board_type,
      'meeting_type',      m.meeting_type,
      'academic_year',     m.academic_year,
      'meeting_date',      COALESCE(m.actual_date, m.scheduled_date),
      'quorum_met',        m.quorum_met,
      'ratified_by_ac',    m.ratified_by_ac,
      'attendees_total',   v_total,
      'attendees_present', v_present,
      'source_trigger',    'fn_sync_bos_meeting_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_cdc_drive_evidence(p_drive_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d public.cdc_drives%ROWTYPE;
  v_inst uuid;
BEGIN
  SELECT * INTO d FROM public.cdc_drives WHERE id = p_drive_id;

  v_inst := CASE WHEN d.institutions IS NOT NULL AND array_length(d.institutions, 1) >= 1
                 THEN d.institutions[1] END;

  IF NOT FOUND
     OR d.status NOT IN ('attendance_day', 'results_announced', 'closed')
     OR v_inst IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'cdc_drives' AND source_id = p_drive_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '7.6';
    RETURN;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'cdc_drives', d.id, v_inst,
    'NAAC', '7.6',
    public.fn_accreditation_ay_label(COALESCE(d.drive_date::timestamptz, d.created_at)),
    NULL, true,
    jsonb_build_object(
      'title',                d.title,
      'status',               d.status::text,
      'drive_date',           d.drive_date,
      'drive_mode',           d.drive_mode,
      'job_role_title',       d.job_role_title,
      'job_location',         d.job_location,
      'expected_package_lpa', d.expected_package_lpa,
      'rounds_count',         d.rounds_count,
      'institutions_count',   COALESCE(array_length(d.institutions, 1), 0),
      'source_trigger',       'fn_sync_cdc_drive_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_cdc_training_evidence(p_programme_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.cdc_training_programmes%ROWTYPE;
  v_total     integer;
  v_completed integer;
BEGIN
  SELECT * INTO p FROM public.cdc_training_programmes WHERE id = p_programme_id;

  IF NOT FOUND
     OR p.status IN ('planned', 'cancelled')
     OR p.institution_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = p.institution_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'cdc_training_programmes' AND source_id = p_programme_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '7.6';
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.cdc_training_enrollments
  WHERE programme_id = p.id;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'cdc_training_programmes', p.id, p.institution_id,
    'NAAC', '7.6',
    public.fn_accreditation_ay_label(COALESCE(p.start_date::timestamptz, p.created_at)),
    NULL, true,
    jsonb_build_object(
      'name',                  p.name,
      'status',                p.status,
      'external_provider',     p.external_provider,
      'total_hours',           p.total_hours,
      'start_date',            p.start_date,
      'end_date',              p.end_date,
      'academic_year_label',   p.academic_year_label,
      'enrollments_total',     v_total,
      'enrollments_completed', v_completed,
      'source_trigger',        'fn_sync_cdc_training_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_procurement_po_evidence(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  po public.procurement_purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO po FROM public.procurement_purchase_orders WHERE id = p_po_id;

  IF NOT FOUND
     OR NOT po.is_library_resource
     OR po.status NOT IN ('approved', 'sent', 'partially_received', 'completed', 'closed')
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = po.institution_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'procurement_purchase_orders' AND source_id = p_po_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '3.1.1';
    RETURN;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'procurement_purchase_orders', po.id, po.institution_id,
    'NAAC', '3.1.1',
    public.fn_accreditation_ay_label(COALESCE(po.approved_at, po.created_at)),
    NULL, true,
    jsonb_build_object(
      'po_number',              po.po_number,
      'status',                 po.status,
      'domain',                 po.domain,
      'subtotal',               po.subtotal,
      'tax_amount',             po.tax_amount,
      'total_amount',           po.total_amount,
      'approved_at',            po.approved_at,
      'expected_delivery_date', po.expected_delivery_date,
      'resource_tag',           'library_resource',
      'source_trigger',         'fn_sync_procurement_po_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_stakeholder_survey_evidence(p_survey_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.accreditation_stakeholder_surveys%ROWTYPE;
  v_found     boolean;
  v_invited   integer := 0;
  v_responded integer := 0;
  v_means     jsonb;
  -- k-anonymity floor: a mean over 1-4 external respondents IS that person's
  -- opinion, and the employer roster is small enough to re-identify from.
  c_min_for_means constant integer := 5;
BEGIN
  SELECT * INTO s FROM public.accreditation_stakeholder_surveys WHERE id = p_survey_id;
  -- Capture FOUND immediately: every later SELECT INTO overwrites it (a
  -- count(*) always returns a row, so it always sets FOUND true).
  v_found := FOUND;

  -- Count ONLY for a cycle that could possibly emit. A draft or active cycle
  -- stops here, which is what makes the child-row triggers cheap: building a
  -- roster of 1,100 alumni fires 1,100 syncs that each do one indexed row read
  -- and no counting at all.
  IF v_found
     AND s.status = 'closed'
     AND EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = s.institution_id) THEN
    SELECT count(*) INTO v_invited
    FROM public.accreditation_stakeholder_invites WHERE survey_id = s.id;

    SELECT count(*) INTO v_responded
    FROM public.accreditation_stakeholder_responses WHERE survey_id = s.id;
  END IF;

  -- Honest gating, in ONE test: v_responded is still 0 for a missing row, a
  -- non-closed cycle, a cycle whose institution does not exist, AND a closed
  -- cycle nobody answered. No responses means no evidence row.
  IF v_responded < 1 THEN
    -- Withdraw ONLY this emitter's key. source_table already scopes this to
    -- rows this emitter wrote (bos_meetings rows carry source_table
    -- 'bos_meetings' and can never match), and metric_code is pinned so a
    -- future second emitter on the same table is not clobbered. body_code is
    -- deliberately NOT pinned: when the row is missing, s.body_code is NULL
    -- and pinning it would make the withdraw a silent no-op.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'accreditation_stakeholder_surveys'
      AND source_id = p_survey_id AND is_auto
      AND metric_code = '1.2';
    RETURN;
  END IF;

  -- Per-question means over the cycle's OWN frozen scale questions. Counts and
  -- means only — free text is never read into metadata.
  IF v_responded >= c_min_for_means THEN
    SELECT jsonb_object_agg(t.qk, t.mean) INTO v_means
    FROM (
      SELECT q.value->>'key' AS qk,
             round(avg((r.answers->>(q.value->>'key'))::numeric), 2) AS mean
      FROM jsonb_array_elements(s.questions) q
      JOIN public.accreditation_stakeholder_responses r ON r.survey_id = s.id
      WHERE q.value->>'type' = 'scale'
        AND jsonb_typeof(r.answers->(q.value->>'key')) = 'number'
      GROUP BY q.value->>'key'
    ) t;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'accreditation_stakeholder_surveys', s.id, s.institution_id,
    s.body_code, '1.2',
    public.fn_accreditation_ay_label(
      COALESCE(s.closes_at, s.opens_at, s.updated_at, s.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'audience',             s.audience::text,
      'academic_year',        s.academic_year,
      'title',                s.title,
      'invited_count',        v_invited,
      'responded_count',      v_responded,
      'response_rate_pct',    CASE WHEN v_invited > 0
                                   THEN round((v_responded::numeric * 100) / v_invited, 1)
                              END,
      'closed_at',            s.closes_at,
      'question_means',       COALESCE(v_means, '{}'::jsonb),
      'aggregate_suppressed', v_responded < c_min_for_means,
      'source_trigger',       'fn_sync_stakeholder_survey_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;
END;
$function$;

-- ----------------------------------------------------------------------------
-- Explicit anon lock (CI: check-secdef-anon-revoke).
--
-- These 14 are pre-existing SECURITY DEFINER functions being REPLACED, not
-- created. CREATE OR REPLACE preserves privileges, so this migration does not
-- change who may call them. Verified on production 2026-08-03: anon holds
-- EXECUTE on NONE of the 22, and none relies on the PUBLIC default (no function
-- here has a null proacl). So every REVOKE below is a no-op that makes an
-- already-correct lock explicit, which is exactly what the guard asks for.
--
-- Deliberately NO accompanying "GRANT EXECUTE ... TO authenticated". The guard's
-- suggested fix includes one, but adding it here would WIDEN access: 13 of these
-- 14 grant EXECUTE to nobody but postgres/service_role today. The one that does
-- hold an authenticated grant (fn_induction_emit_naac_evidence) keeps it, since
-- only anon and PUBLIC are revoked.
--
-- The 8 trigger functions in this migration are exempt (RETURNS trigger) and are
-- intentionally absent from this list.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_rollup_loop_evidence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cdc_placement_outcome_measure() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_copo_emit_attainment_evidence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_event_feedback_refresh_naac_evidence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_facility_teaching_naac_snapshot_refresh() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_refresh_naac_evidence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(p_event_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sustainability_refresh_naac_evidence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_audit_cycle_evidence(p_cycle_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_bos_meeting_evidence(p_meeting_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_cdc_drive_evidence(p_drive_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_cdc_training_evidence(p_programme_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_procurement_po_evidence(p_po_id uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_stakeholder_survey_evidence(p_survey_id uuid) FROM anon, PUBLIC;

-- ----------------------------------------------------------------------------
-- Apply-time asserts.
--
-- Deep-review 2026-08-04 raised two real gaps in the earlier version of this
-- block, both fixed here:
--
--   (1) It only grepped function TEXT and never checked that the five-column
--       constraint actually EXISTS. Applied against a database where that
--       constraint is absent, dropped or renamed, the text assert would pass
--       while every rewritten writer throws 42P10 at runtime — the exact failure
--       this migration repairs, inverted. Assert 1 now checks pg_constraint for
--       the precise five-column arbiter BEFORE anything else is believed.
--
--   (2) The stale-target scan covered EVERY function in public. A function
--       legitimately upserting into a DIFFERENT table that really does have a
--       four-column unique constraint would have failed this whole migration
--       spuriously. The scan is now scoped to the 22 functions this file
--       rewrites.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_stale int;
  v_fixed int;
  v_arbiter int;
  -- exactly the functions this migration rewrites
  c_names CONSTANT text[] := ARRAY[
    'auto_populate_anti_ragging_evidence','emit_audit_finding_evidence',
    'emit_event_naac_evidence','emit_grievance_evidence',
    'emit_institution_collaboration_evidence','emit_learner_achievement_evidence',
    'emit_learner_exit_outcome_evidence','emit_ss_grant_evidence',
    'fn_accreditation_rollup_loop_evidence','fn_cdc_placement_outcome_measure',
    'fn_copo_emit_attainment_evidence','fn_event_feedback_refresh_naac_evidence',
    'fn_facility_teaching_naac_snapshot_refresh','fn_hr_refresh_naac_evidence',
    'fn_induction_emit_naac_evidence','fn_sustainability_refresh_naac_evidence',
    'fn_sync_audit_cycle_evidence','fn_sync_bos_meeting_evidence',
    'fn_sync_cdc_drive_evidence','fn_sync_cdc_training_evidence',
    'fn_sync_procurement_po_evidence','fn_sync_stakeholder_survey_evidence'
  ];
BEGIN
  -- ASSERT 1 — the arbiter these functions now name must genuinely exist, on
  -- exactly those five columns, in that order. Without this the rest is theatre.
  SELECT count(*) INTO v_arbiter
    FROM pg_constraint c
   WHERE c.conrelid = 'public.quality_evidence_mappings'::regclass
     AND c.contype  = 'u'
     AND (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
         = ARRAY['source_table','source_id','body_code','metric_code','programme_id'];
  IF v_arbiter <> 1 THEN
    RAISE EXCEPTION
      'quality_evidence_mappings has no UNIQUE constraint on exactly (source_table, source_id, body_code, metric_code, programme_id) — found %. Every ON CONFLICT rewritten by this migration would raise 42P10. Refusing to apply.',
      v_arbiter;
  END IF;

  -- ASSERT 2 — no function THIS migration owns may still name only four columns.
  SELECT count(*) INTO v_stale FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (c_names)
     AND pg_get_functiondef(p.oid) ~* 'ON CONFLICT\s*\(\s*source_table\s*,\s*source_id\s*,\s*body_code\s*,\s*metric_code\s*\)';
  IF v_stale <> 0 THEN
    RAISE EXCEPTION 'evidence conflict-target fix incomplete: % of the 22 rewritten function(s) still name only four columns', v_stale;
  END IF;

  -- ASSERT 3 — and all 22 must carry the five-column target.
  SELECT count(*) INTO v_fixed FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (c_names)
     AND pg_get_functiondef(p.oid) ~* 'ON CONFLICT\s*\(\s*source_table\s*,\s*source_id\s*,\s*body_code\s*,\s*metric_code\s*,\s*programme_id\s*\)';
  IF v_fixed < 22 THEN
    RAISE EXCEPTION 'expected 22 functions on the five-column target, found %', v_fixed;
  END IF;
END
$assert$;

COMMIT;
