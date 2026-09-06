-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap loop v2 — stuck notify + parked resurface
-- Created: 2026-07-27
-- ----------------------------------------------------------------------------
-- DEPENDS ON PR1 (20260804060000): owner_id + stalled_notified_at columns.
-- Two service-role RPCs the measure-gap-outcomes cron calls each run:
--
--   fn_mba_notify_stalled_gaps()  — decision #4/5/6: for every gap now/still
--     'accepted_stalled', notify THAT college's Improvement-Board managers +
--     the owner (if assigned), IN-APP only, ONCE then WEEKLY (stalled_notified_at
--     guards re-fire). Reuses fn_cr_notify (dedups, drops nulls, fans out
--     notifications + user_notifications).
--
--   fn_mba_resurface_parked_gaps() — decision #12: a 'parked' (someday) gap sat
--     for 3 months → flip it back to 'triaged' so it re-enters the live queue
--     and gets re-ranked. A gentle nudge, not a demand.
--
-- Both service-role only (called by the cron via createServiceRoleClient); never
-- reachable from an end-user session.
-- ============================================================================

BEGIN;

-- 1) Notify managers + owner of stuck gaps (once, then weekly) ---------------
CREATE OR REPLACE FUNCTION public.fn_mba_notify_stalled_gaps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gap record;
  v_recipients uuid[];
  v_count int := 0;
BEGIN
  FOR v_gap IN
    SELECT g.id, g.title, g.institution_id, g.owner_id
    FROM public.mba_data_gaps g
    WHERE g.gap_outcome = 'accepted_stalled'
      AND (g.stalled_notified_at IS NULL OR g.stalled_notified_at < now() - interval '7 days')
  LOOP
    -- That college's board managers (permission stored flat OR nested; scoped by
    -- role scope='all', own institution, or an explicit cross-institution grant)
    -- plus the owner if one is assigned.
    SELECT array_agg(DISTINCT uid) INTO v_recipients FROM (
      SELECT ur.user_id AS uid
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE cr.is_active
        AND (cr.permissions->>'improvement.board.manage' = 'true'
             OR (cr.permissions #>> '{improvement,board,manage}') = 'true')
        AND (cr.institution_scope = 'all'
             OR pr.institution_id = v_gap.institution_id
             OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                        WHERE uia.user_id = ur.user_id
                          AND uia.institution_id = v_gap.institution_id
                          AND uia.is_active))
      UNION
      SELECT v_gap.owner_id WHERE v_gap.owner_id IS NOT NULL
    ) t WHERE uid IS NOT NULL;

    IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) IS NOT NULL THEN
      PERFORM public.fn_cr_notify(
        NULL,
        v_recipients,
        'A data gap is stuck',
        'An accepted data gap ("' || left(coalesce(v_gap.title, '(untitled)'), 80)
          || '") has not progressed. Please review it on the Improvement Board.',
        '/improvement-board/data-gaps'
      );
      -- Stamp ONLY when we actually notified, so a gap with no resolvable
      -- manager retries next run (and weekly thereafter once notified).
      UPDATE public.mba_data_gaps SET stalled_notified_at = now() WHERE id = v_gap.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_notify_stalled_gaps() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_notify_stalled_gaps() TO service_role;

-- 2) Resurface parked ("someday") gaps after 3 months -----------------------
CREATE OR REPLACE FUNCTION public.fn_mba_resurface_parked_gaps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.mba_data_gaps
     SET status = 'triaged',
         triage_note = left(
           coalesce(triage_note, '') || ' [auto-resurfaced from the someday wishlist after 3 months]',
           1000)
   WHERE status = 'parked'
     AND triaged_at IS NOT NULL
     AND triaged_at < now() - interval '3 months';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_resurface_parked_gaps() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_resurface_parked_gaps() TO service_role;

COMMIT;
