-- =============================================================================
-- Adoption: weekly Power Users — small SQL follow-ups from #4298's panel
-- =============================================================================
-- Builds on 20271009115500_adoption_weekly_power_users.sql (already applied;
-- this file never edits it). Adds two functions and replaces one:
--   1. fn_adoption_power_users_exclusions() RETURNS jsonb — the exclusion list
--      (adoption.power_users.exclude_institution_ids) with the SAME fail-closed
--      check fn_adoption_power_users runs: a missing, switched-off, draft or
--      malformed row, or a null / non-text item, raises. The route calls it when
--      it re-uses a stored week (no fn_adoption_power_users call), so a re-run
--      fails closed too and leaves out anyone whose college was added since.
--      Service role only.
--   2. fn_adoption_power_user_weeks_save(date, jsonb) — stores a freshly
--      computed report AND, in the same statement, stops tracking the agenda
--      jobs of people no longer in its top list (#4324 panel LOW: a separate
--      upsert and clean-up could race a plain re-run, or leave stale ids if the
--      clean-up failed after the upsert). Never cancels a job; it only stops
--      recording it. Service role only.
--   3. fn_adoption_power_user_weeks_merge_jobs(date, jsonb) — REPLACED: still
--      merges with `||` under the row lock, but now keeps only people in the
--      row's CURRENT payload.top, so a run that read an older top list cannot
--      put a dropped person's id back.
-- fn_adoption_agenda_supersede_stale is NOT changed (#4324 panel MEDIUM): a
-- claimed/running job with neither claimed_at nor started_at is still never
-- cancelled. ai_jobs has no other liveness column, so such a job cannot be told
-- apart from one claimed seconds ago; and every claim path sets claimed_at
-- (fn_ai_claim, and the TS writers that claim directly), so none is expected.
-- Changes no table, no row and no policy. Messages nobody.
-- Rehearsal: supabase/tests/adoption/27_power_users_lows.sql (run.sh).
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1) the exclusion list, validated (same check as fn_adoption_power_users)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_power_users_exclusions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw      jsonb;
  v_excluded uuid[];
BEGIN
  SELECT pp.value INTO v_raw
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'adoption.power_users.exclude_institution_ids'
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active
     AND COALESCE(pp.publication_state, 'published') = 'published'
   LIMIT 1;
  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'array' THEN
    RAISE EXCEPTION 'fn_adoption_power_users_exclusions: policy adoption.power_users.exclude_institution_ids is missing, off, a draft or not a list';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_raw) AS e WHERE jsonb_typeof(e) <> 'string') THEN
    RAISE EXCEPTION 'fn_adoption_power_users_exclusions: policy adoption.power_users.exclude_institution_ids holds something that is not a college id';
  END IF;
  BEGIN
    SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO v_excluded
      FROM jsonb_array_elements_text(v_raw) AS x;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'fn_adoption_power_users_exclusions: policy adoption.power_users.exclude_institution_ids holds something that is not a college id';
  END;
  RETURN to_jsonb(v_excluded);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_users_exclusions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_users_exclusions() TO service_role;

-- ---------------------------------------------------------------------
-- 2) store a computed report and drop ids of people who left its top list
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_power_user_weeks_save(p_week_start date, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload->'top') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_payload must be a report object with a top list';
  END IF;
  -- One statement: the row lock covers the report and the trimmed id map
  -- together, so no merge can land between them.
  INSERT INTO public.adoption_power_user_weeks AS w (week_start, computed_at, payload, agenda_jobs)
  VALUES (p_week_start, now(), p_payload, '{}'::jsonb)
  ON CONFLICT (week_start) DO UPDATE
     SET computed_at = now(),
         payload     = EXCLUDED.payload,
         agenda_jobs = COALESCE(
           (SELECT jsonb_object_agg(j.key, j.value)
              FROM jsonb_each(COALESCE(w.agenda_jobs, '{}'::jsonb)) AS j
             WHERE j.key IN (SELECT e->>'user_id' FROM jsonb_array_elements(EXCLUDED.payload->'top') AS e)),
           '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_save(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_save(date, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 3) merge agenda job ids — only for people in the row's current top list
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(p_week_start date, p_jobs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_jobs IS NULL OR jsonb_typeof(p_jobs) <> 'object' THEN
    RAISE EXCEPTION 'p_jobs must be a json object of user_id -> job id';
  END IF;
  UPDATE public.adoption_power_user_weeks w
     SET agenda_jobs = COALESCE(
           (SELECT jsonb_object_agg(j.key, j.value)
              FROM jsonb_each(COALESCE(w.agenda_jobs, '{}'::jsonb) || p_jobs) AS j
             WHERE j.key IN (SELECT e->>'user_id' FROM jsonb_array_elements(COALESCE(w.payload->'top', '[]'::jsonb)) AS e)),
           '{}'::jsonb)
   WHERE w.week_start = p_week_start;
  -- No week row = the ids would be dropped while the route reports success.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_merge_jobs: no week row for %', p_week_start;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_adoption_power_users_exclusions()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_users_exclusions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_users_exclusions is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_power_user_weeks_save(date, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_user_weeks_save(date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_save is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_merge_jobs is callable by a client role';
  END IF;
END $$;
