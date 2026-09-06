-- ============================================================================
-- Accreditation narrative drafter — reminder + escalation (Director 07-26)
-- A stuck draft (waiting on a human) nudges its owner after p_nudge_days, and
-- escalates to super-admin oversight after p_escalate_days. In-app bell only.
-- Mirrors fn_scf_nudge_pending_learners: SECURITY DEFINER + service_role only,
-- writes notifications + user_notifications directly, idempotent per draft/day.
-- NEW function (no sibling overlap). Validated in BEGIN..ROLLBACK; NOT applied.
-- Escalation target = super admins (a resolvable oversight backstop); can be
-- widened to accreditation.naac.narrative.manage holders (IQAC) later.
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

  -- 2) ESCALATE a draft stuck > p_escalate_days to super-admin oversight -------
  WITH stuck2 AS (
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
      s.ik, jsonb_build_object('type','role','roles', jsonb_build_array('super_admin')), v_sys, now(), now()
    FROM stuck2 s
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications x WHERE x.idempotency_key = s.ik)
    RETURNING id
  ),
  fan2 AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, p.id, now()
    FROM created2 c CROSS JOIN public.profiles p WHERE p.is_super_admin = true
    RETURNING 1
  )
  SELECT count(*) INTO v_escalated FROM fan2;

  RETURN jsonb_build_object('nudged', v_nudged, 'escalated', v_escalated);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) TO service_role;
