-- Fix: CDC alumni bridges must NOT insert into the GENERATED column graduation_year.
--
-- alumni_outcomes.graduation_year is GENERATED ALWAYS AS (EXTRACT(year FROM graduation_date)).
-- Postgres rejects any explicit value for a generated column. Both CDC->alumni bridge
-- trigger functions shipped (PR #994, "A2") inserting graduation_year explicitly, which
-- throws and rolls back the entire triggering statement on the only path that fires the
-- INSERT (an accepted placement for a graduated/alumni learner). Latent today
-- (cdc_placements ~0 rows) but real: it would block placement acceptance for graduates.
--
-- Both functions insert graduation_date = CURRENT_DATE, so the generated graduation_year
-- computes to the SAME value (EXTRACT(year FROM CURRENT_DATE)) once we stop inserting it
-- explicitly. The dedup tuple is (learner_id, company_name, outcome_start_date) and does
-- not reference graduation_year, so dedup behaviour is unchanged. No data/behaviour change
-- beyond no longer throwing.
--
-- Each function below is byte-identical to its live definition EXCEPT the graduation_year
-- column is removed from the INSERT column list and its corresponding value
-- (EXTRACT(YEAR FROM CURRENT_DATE)::integer) is removed from the SELECT.

CREATE OR REPLACE FUNCTION public.fn_cdc_placement_to_alumni()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner RECORD;
BEGIN
  -- Only fire on transitions INTO 'accepted' from a non-accepted state.
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' THEN
    RETURN NEW;  -- idempotent: re-fire on a no-op acceptance update
  END IF;

  -- Look up the learner's current lifecycle + program/institution/batch.
  -- Skip if learner is not yet graduated/alumni — the learners_profiles
  -- trigger will pick this placement up when graduation flips the status.
  SELECT id, institution_id, program_id, batch_id, lifecycle_status, updated_by
    INTO v_learner
  FROM public.learners_profiles
  WHERE id = NEW.learner_id;

  IF NOT FOUND THEN
    RETURN NEW;  -- learner row missing — silently skip (don't break placement update)
  END IF;

  IF v_learner.lifecycle_status NOT IN ('graduated', 'alumni') THEN
    RETURN NEW;  -- learner still active — wait for graduation to trigger insert
  END IF;

  -- Insert mirrors fn_cdc_passed_out_to_alumni_bridge field mappings exactly.
  -- Dedup: same (learner_id, company_name, outcome_start_date) tuple as the
  -- sibling bridge. Both bridges use NOT EXISTS rather than ON CONFLICT
  -- because alumni_outcomes has no unique constraint on this tuple — they
  -- are two writers using the same logical dedup key.
  INSERT INTO public.alumni_outcomes (
    learner_id,
    institution_id,
    program_id,
    batch_id,
    graduation_date,
    outcome_type,
    outcome_start_date,
    company_name,
    designation,
    city,
    country,
    is_remote,
    data_source,
    verification_status,
    reported_at,
    created_by
  )
  SELECT
    NEW.learner_id,
    v_learner.institution_id,
    v_learner.program_id,
    v_learner.batch_id,
    CURRENT_DATE,
    'employed'::public.outcome_type,
    NEW.joining_date,
    r.name,
    NEW.job_role,
    NEW.job_location,
    COALESCE(r.hq_country, 'India'),
    NEW.is_remote,
    'cdc_placement_bridge'::varchar,
    'pending'::public.verification_status,
    now(),
    NEW.updated_by
  FROM public.cdc_recruiters r
  WHERE r.id = NEW.recruiter_id
    AND NOT EXISTS (
      SELECT 1 FROM public.alumni_outcomes ao
      WHERE ao.learner_id = NEW.learner_id
        AND ao.company_name = r.name
        AND ao.outcome_start_date IS NOT DISTINCT FROM NEW.joining_date
    );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cdc_passed_out_to_alumni_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_placement RECORD;
BEGIN
  -- Only fire on transitions INTO a passed-out state from a non-passed-out state.
  IF NEW.lifecycle_status NOT IN ('graduated', 'alumni') THEN
    RETURN NEW;
  END IF;
  IF OLD.lifecycle_status IN ('graduated', 'alumni') THEN
    RETURN NEW;
  END IF;

  -- Copy each accepted placement to alumni_outcomes.
  -- Skip if a duplicate already exists (idempotent re-fire safety).
  -- The graduation_date is set to CURRENT_DATE since learners_profiles
  -- doesn't carry a graduation_date column — the lifecycle_status flip
  -- IS the graduation event timestamp.
  FOR v_placement IN
    SELECT p.*
    FROM public.cdc_placements p
    WHERE p.learner_id = NEW.id
      AND p.status = 'accepted'
  LOOP
    INSERT INTO public.alumni_outcomes (
      learner_id,
      institution_id,
      program_id,
      batch_id,
      graduation_date,
      outcome_type,
      outcome_start_date,
      company_name,
      designation,
      city,
      country,
      is_remote,
      data_source,
      verification_status,
      reported_at,
      created_by
    )
    SELECT
      v_placement.learner_id,
      NEW.institution_id,
      NEW.program_id,
      NEW.batch_id,
      CURRENT_DATE,
      'employed'::public.outcome_type,                  -- bare enum name (verified 2026-05-18)
      v_placement.joining_date,
      r.name,
      v_placement.job_role,
      v_placement.job_location,
      COALESCE(r.hq_country, 'India'),
      v_placement.is_remote,
      'cdc_placement_bridge'::varchar,
      'pending'::public.verification_status,            -- bare enum name (verified 2026-05-18)
      now(),
      NEW.updated_by                                    -- audit trail: who triggered the graduation
    FROM public.cdc_recruiters r
    WHERE r.id = v_placement.recruiter_id
      AND NOT EXISTS (
        SELECT 1 FROM public.alumni_outcomes ao
        WHERE ao.learner_id = v_placement.learner_id
          AND ao.company_name = r.name
          AND ao.outcome_start_date IS NOT DISTINCT FROM v_placement.joining_date
      );
  END LOOP;

  RETURN NEW;
END;
$function$;
