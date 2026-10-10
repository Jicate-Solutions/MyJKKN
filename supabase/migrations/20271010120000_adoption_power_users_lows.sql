-- =============================================================================
-- Adoption: weekly Power Users — three small SQL follow-ups from #4298's panel
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
--   2. fn_adoption_power_user_weeks_prune_jobs(date, text[]) — keeps only the
--      agenda_jobs entries of the given people (the new top 10 after
--      ?recompute=1), in one row-locked UPDATE. Never cancels a job; it only
--      stops tracking it. Raises if the week row is missing. Service role only.
--   3. fn_adoption_agenda_supersede_stale(uuid) — same rule as before, plus: a
--      claimed/running job with NEITHER claimed_at nor started_at falls back to
--      requested_at (GREATEST(NULL, NULL) is NULL, so such a job could never be
--      replaced and blocked that person's agenda for good). Same rule as
--      isStaleAgendaJob in lib/adoption/power-users.ts.
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
-- 2) stop tracking agenda jobs of people no longer in the top 10
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_power_user_weeks_prune_jobs(p_week_start date, p_keep_user_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_keep_user_ids IS NULL THEN
    RAISE EXCEPTION 'p_keep_user_ids must be a list of user ids (empty = keep none)';
  END IF;
  UPDATE public.adoption_power_user_weeks w
     SET agenda_jobs = COALESCE(
           (SELECT jsonb_object_agg(j.key, j.value)
              FROM jsonb_each(COALESCE(w.agenda_jobs, '{}'::jsonb)) AS j
             WHERE j.key = ANY (p_keep_user_ids)),
           '{}'::jsonb)
   WHERE w.week_start = p_week_start;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_prune_jobs: no week row for %', p_week_start;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_prune_jobs(date, text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_prune_jobs(date, text[]) TO service_role;

-- ---------------------------------------------------------------------
-- 3) retire ONE stuck agenda job — now also one with no claim/start time
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_agenda_supersede_stale(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_jobs
     SET status = 'canceled',
         error = 'superseded: stuck over 24 h (pending since its request, or claimed/running since the drain took it); the weekly power users run queued a fresh job',
         completed_at = now()
   WHERE id = p_job_id
     AND job_type = 'adoption.chat_agenda'
     AND ((status = 'pending' AND requested_at < now() - interval '24 hours')
          OR (status IN ('claimed', 'running')
              -- neither time recorded: fall back to the request time
              AND COALESCE(GREATEST(claimed_at, started_at), requested_at) < now() - interval '24 hours'));
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_agenda_supersede_stale(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_agenda_supersede_stale(uuid) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_adoption_power_users_exclusions()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_users_exclusions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_users_exclusions is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_power_user_weeks_prune_jobs(date, text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_user_weeks_prune_jobs(date, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_prune_jobs is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_agenda_supersede_stale(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_agenda_supersede_stale(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_agenda_supersede_stale is callable by a client role';
  END IF;
END $$;
