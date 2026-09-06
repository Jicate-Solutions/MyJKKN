-- ============================================================================
-- Accreditation narrative drafter — widen escalation from super-admin to IQAC
-- (Director 07-26 follow-up; the applied 20260726193500 header already flagged
--  this widening as intended.)
--
-- The escalation branch of fn_accreditation_narrative_reminders previously fanned
-- its "overdue narrative" bell only to super admins (a resolvable oversight
-- backstop). This widens delivery to holders of the accreditation.naac.narrative
-- .manage permission — i.e. IQAC / Accreditation Officers, the same permission
-- the accreditation_metric_owners RLS "manage" policy gates on.
--
-- SAFETY (additive widening, never an empty fan):
--   Recipients are resolved via public.user_has_permission(profile_id, key),
--   which super-admin-BYPASSES internally. So the new recipient set is a strict
--   SUPERSET of the old one: {super admins} ∪ {manage-permission holders}. It can
--   never notify fewer people than the current backstop. Verified read-only on
--   prod: 14 super-admins today == 14 new-fan recipients today (identical), and
--   the set auto-grows to include IQAC once accreditation_officer is granted the
--   permission + assigned users (currently manage=null, 0 users).
--
-- Only the escalation target + its targeting label change; the nudge branch,
-- signature, idempotency, and every other line are unchanged. New dated
-- migration (the applied 20260726193500 is NOT rewritten in place).
-- CREATE OR REPLACE is treated as NEW by the anon-revoke gate → revoke re-asserted.
-- Validated in BEGIN..ROLLBACK; NOT applied (Director applies).
-- notifications.kind CHECK allows only 'announcement'|'work_item' — a nudge is 'work_item'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_reminders(
  p_nudge_days int DEFAULT 3, p_escalate_days int DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_sys uuid;
  v_today text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  v_nudged int := 0;
  v_escalated int := 0;
BEGIN
  SELECT id INTO v_sys FROM public.profiles WHERE is_super_admin = true ORDER BY created_at NULLS LAST LIMIT 1;
  IF v_sys IS NULL THEN RAISE EXCEPTION 'no system identity for notifications.created_by'; END IF;

  -- 1) NUDGE the owner of an actionable draft stuck > p_nudge_days -------------
  WITH stuck AS (
    SELECT n.id, n.owner_user_id AS uid, n.metric_code,
           'accred_narr_nudge:'||n.id::text||':'||v_today AS ik
    FROM public.accreditation_metric_narratives n
    WHERE n.owner_user_id IS NOT NULL
      AND ( (n.status = 'ai_drafted' AND n.grounding_verdict = 'grounded')
            OR n.status = 'revision_requested' )
      AND n.updated_at < now() - make_interval(days => GREATEST(0, p_nudge_days))
  ),
  created AS (
    INSERT INTO public.notifications
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at)
    SELECT gen_random_uuid(),
      'NAAC narrative awaiting your review',
      'An AI-drafted NAAC narrative for metric '||s.metric_code||' is waiting for you to review and okay it.',
      '/accreditation/naac/narratives/'||s.id::text, 'FileText', 'normal', 'accreditation', 'work_item',
      s.ik, jsonb_build_object('type','user','user_ids', jsonb_build_array(s.uid)), v_sys, now(), now()
    FROM stuck s
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications x WHERE x.idempotency_key = s.ik)
    RETURNING id, (targeting->'user_ids'->>0)::uuid AS uid
  ),
  fan AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, c.uid, now() FROM created c
    RETURNING 1
  )
  SELECT count(*) INTO v_nudged FROM fan;

  -- 2) ESCALATE a draft stuck > p_escalate_days to IQAC oversight --------------
  --    Delivery = holders of accreditation.naac.narrative.manage (super-admin
  --    bypass keeps super admins in the set — strict superset of the old fan).
  WITH elig AS (
    SELECT p.id
    FROM public.profiles p
    WHERE public.user_has_permission(p.id, 'accreditation.naac.narrative.manage')
  ),
  stuck2 AS (
    SELECT n.id, n.metric_code,
           'accred_narr_esc:'||n.id::text||':'||v_today AS ik
    FROM public.accreditation_metric_narratives n
    WHERE n.status IN ('ai_drafted','owner_okayed','principal_approved','revision_requested')
      AND ( n.status <> 'ai_drafted' OR n.grounding_verdict = 'grounded' )
      AND n.updated_at < now() - make_interval(days => GREATEST(1, p_escalate_days))
  ),
  created2 AS (
    INSERT INTO public.notifications
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at)
    SELECT gen_random_uuid(),
      'Overdue NAAC narrative needs attention',
      'A NAAC narrative for metric '||s.metric_code||' has been waiting more than '||p_escalate_days||' days for review.',
      '/accreditation/naac/narratives/'||s.id::text, 'AlertTriangle', 'high', 'accreditation', 'work_item',
      s.ik, jsonb_build_object('type','permission','permission','accreditation.naac.narrative.manage'), v_sys, now(), now()
    FROM stuck2 s
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications x WHERE x.idempotency_key = s.ik)
    RETURNING id
  ),
  fan2 AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, e.id, now()
    FROM created2 c CROSS JOIN elig e
    RETURNING 1
  )
  SELECT count(*) INTO v_escalated FROM fan2;

  RETURN jsonb_build_object('nudged', v_nudged, 'escalated', v_escalated);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) TO service_role;
