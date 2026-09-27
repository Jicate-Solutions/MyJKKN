-- =============================================================================
-- Adoption loop E.1 (2026-09-27): the daily run copies usage in before it reads it
-- =============================================================================
-- Spec: specs/2026-09-16-adoption-loop.md, rulings 9 + 10.
--
-- THE GAP (read on production 2026-09-27 08:30, after #4020 went live at 08:13):
-- ten features are counted from MyJKKN's usage log through the bridge
-- fn_adoption_sync_usage_events, and nothing ran that bridge except the Sync
-- button on /admin/adoption. It was last pressed 2026-09-23 03:48 IST. So:
--   * the first daily run reminded "you have never done X" from four-day-old
--     usage — 348 people had done an X for the first time since that copy
--     (ai_pulse.open 126, dashboard.open 141, application_hub.open 81, …);
--   * from 2026-09-30 03:48 the run's own 7-day stale guard drops every bridged
--     feature, and the loop goes quiet with nobody told.
--
-- THE FIX, and nothing else:
--   1. fn_adoption_sync_usage_events_core(days) — the bridge body, unchanged,
--      minus the super-admin check. Callable only by other definer functions.
--      fn_adoption_sync_usage_events keeps its name, grants, super-admin check
--      and loop-off answer for the Sync button, and calls the core.
--   2. The daily run as reviewed in #4020 is renamed fn_adoption_daily_tick_send,
--      body untouched. A new fn_adoption_daily_tick keeps the name the cron route
--      calls: it copies the last 30 days in first, then sends.
--      * dry run: copies nothing, writes nothing (as before);
--      * loop off: copies nothing, sends nothing (the send half says so);
--      * the copy fails: the failure is reported in the answer ('usage_sync')
--        and the run STILL SENDS — the 7-day stale guard inside the send half
--        already skips any feature whose last good copy is too old, so a
--        failed copy can only make the run send less, never send wrongly.
--   Neither function can send more than before; every limit lives in the send
--   half, which this file does not touch.
--
-- Cost: the 30-day copy read ~1.2 s on production 2026-09-27; the route's
-- budget is 120 s.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1) the bridge body, without the caller check
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_sync_usage_events_core(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feat  record;
  v_rows  integer := 0;
  v_n     integer;
  v_feats integer := 0;
  v_from  timestamptz := (((now() AT TIME ZONE 'Asia/Kolkata')::date - GREATEST(COALESCE(p_days, 30), 1)) ::timestamp AT TIME ZONE 'Asia/Kolkata');
BEGIN
  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'adoption loop is switched off (policy adoption.loop.enabled)');
  END IF;

  FOR v_feat IN
    SELECT fr.feature_key, fr.usage_event_module, fr.usage_event_feature, fr.usage_event_type
    FROM public.feature_registry fr
    WHERE fr.usage_event_module IS NOT NULL AND fr.status <> 'retired'
  LOOP
    INSERT INTO public.feature_usage (user_id, feature_key, day, count, institution_id, role, first_at, last_at)
    SELECT ue.user_id, v_feat.feature_key,
           (ue.created_at AT TIME ZONE 'Asia/Kolkata')::date,
           count(*)::integer,
           COALESCE((array_agg(ue.institution_id) FILTER (WHERE ue.institution_id IS NOT NULL))[1],
                    (array_agg(p.institution_id)  FILTER (WHERE p.institution_id  IS NOT NULL))[1]),
           COALESCE(max(ue.role), max(p.role)),
           min(ue.created_at), max(ue.created_at)
    FROM public.usage_events ue
    JOIN public.profiles p ON p.id = ue.user_id
    WHERE ue.module = v_feat.usage_event_module
      AND (v_feat.usage_event_feature IS NULL OR ue.feature = v_feat.usage_event_feature)
      AND (CASE WHEN v_feat.usage_event_type IS NULL THEN ue.event_type <> 'page_visit'
                ELSE ue.event_type = v_feat.usage_event_type END)
      AND ue.created_at >= v_from
    GROUP BY ue.user_id, (ue.created_at AT TIME ZONE 'Asia/Kolkata')::date
    ON CONFLICT (user_id, feature_key, day) DO UPDATE
      SET count    = GREATEST(public.feature_usage.count, EXCLUDED.count),
          first_at = LEAST(public.feature_usage.first_at, EXCLUDED.first_at),
          last_at  = GREATEST(public.feature_usage.last_at, EXCLUDED.last_at);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rows := v_rows + v_n;
    v_feats := v_feats + 1;
    UPDATE public.feature_registry
    SET usage_wired = true, usage_synced_at = now(), updated_at = now()
    WHERE feature_key = v_feat.feature_key;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'features', v_feats, 'rows', v_rows, 'since', v_from);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_sync_usage_events_core(integer) FROM anon, authenticated, service_role, PUBLIC;

-- The Sync button: same name, grants and caller check as before; the body is the core.
CREATE OR REPLACE FUNCTION public.fn_adoption_sync_usage_events(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_adoption_sync_usage_events_core(p_days);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_sync_usage_events(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_sync_usage_events(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) the daily run: #4020's body becomes the send half, untouched
-- ---------------------------------------------------------------------
-- Guarded so a re-apply of this file never renames the NEW wrapper.
DO $$
BEGIN
  IF to_regprocedure('public.fn_adoption_daily_tick_send(boolean)') IS NULL THEN
    ALTER FUNCTION public.fn_adoption_daily_tick(boolean) RENAME TO fn_adoption_daily_tick_send;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_daily_tick_send(boolean) FROM anon, authenticated, service_role, PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_adoption_daily_tick(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dry  boolean := COALESCE(p_dry_run, false);
  v_sync jsonb;
  v_res  jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'the adoption daily run is started by the scheduler, not by a person' USING ERRCODE = '42501';
  END IF;

  IF v_dry THEN
    v_sync := jsonb_build_object('skipped', 'dry run copies nothing');
  ELSIF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    v_sync := jsonb_build_object('skipped', 'adoption loop is switched off (policy adoption.loop.enabled)');
  ELSE
    -- A failed copy rolls back only itself; the send half still runs, and its
    -- 7-day stale guard skips any feature whose last good copy is too old.
    BEGIN
      v_sync := public.fn_adoption_sync_usage_events_core(30);
    EXCEPTION WHEN OTHERS THEN
      v_sync := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  END IF;

  v_res := public.fn_adoption_daily_tick_send(v_dry);
  RETURN v_res || jsonb_build_object('usage_sync', v_sync);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_daily_tick(boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_daily_tick(boolean) TO service_role;
