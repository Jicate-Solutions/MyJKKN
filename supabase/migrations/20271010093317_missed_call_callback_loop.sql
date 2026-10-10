-- 20271010093317_missed_call_callback_loop.sql
-- Added: 2026-10-10 — every missed admission call becomes a callback a counsellor
-- actually sees, and an unreturned call is escalated instead of silently closed.
--
-- WHY THIS EXISTS (live numbers, read 2026-10-10)
-- ----------------------------------------------
-- The call pipeline already puts every missed call into admission_callback_queue
-- with a due time. Since 6 Apr 2026: 9,895 rows, 289 ever assigned (to 2 people),
-- 0 called back, and 9,892 closed as 'expired' by fn_expire_stale_callbacks the
-- moment callback_due_by passed. No screen reads the queue, and the table's RLS lets
-- only 11 of 93 active counsellors SELECT their own college's rows. So the loop was
-- "file it, hide it, close it".
--
-- WHAT THIS ADDS (the inbound-call webhook is NOT touched)
--   1. Six settings in platform_policies (all editable, all defaults are the Front
--      desk's stand-ins while the Director's answers Q-1010-01..04 are pending):
--        telephony.callback_queue.rota                      'all_on_duty' | 'off'
--        telephony.callback_queue.expiry_mode               'escalate' | 'expire'
--        telephony.callback_queue.counsellor_alert_minutes  60
--        telephony.callback_queue.head_alert_minutes        180
--        telephony.callback_queue.escalation_role_key       'admission'
--        telephony.callback_queue.call_method               'own_mobile'
--   2. fn_assign_pending_callbacks(): gives each unassigned pending callback to the
--      on-duty counsellor of that college with the fewest open callbacks. Run every
--      15 minutes by the existing counselor-shift-flip cron.
--   3. fn_expire_stale_callbacks(): in 'escalate' mode, nothing is closed. A pending
--      callback older than counsellor_alert_minutes goes to escalation_level 1 and
--      its counsellor gets ONE bell per run; older than head_alert_minutes goes to
--      level 2 and every holder of the escalation role gets ONE bell per run. In
--      'expire' mode the previous live body runs unchanged.
--   4. fn_callback_queue_for_me(institution, counsellor) — the counsellor screen.
--   5. fn_complete_callback(id, note) — "I called back" from the screen.
--   6. fn_callback_script_context(id) — what the AI call script may use.
-- All new functions: SECURITY DEFINER, anon and PUBLIC revoked.

-- ── 1. Settings ─────────────────────────────────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, classification, ui_category, is_system, is_active)
SELECT v.k, 'global', NULL, v.val, v.descr, v.dt, 'operational', 'admission', false, true
FROM (VALUES
  ('telephony.callback_queue.rota', '"all_on_duty"'::jsonb,
   'Who missed admission calls are given to. all_on_duty = every active counsellor of that college who is on duty today, fewest open callbacks first. off = nobody is assigned automatically. Stand-in default (Front desk, 2026-10-10) until the Director answers Q-1010-01.', 'string'),
  ('telephony.callback_queue.expiry_mode', '"escalate"'::jsonb,
   'What happens to a missed call nobody has returned. escalate = it stays open and is escalated to the counsellor, then to the admission head. expire = the old behaviour: closed automatically once its due time passes. Stand-in default (Front desk, 2026-10-10) until the Director answers Q-1010-02.', 'string'),
  ('telephony.callback_queue.counsellor_alert_minutes', '60'::jsonb,
   'Minutes after a missed call before its counsellor gets a bell that it is overdue. Counted in clock minutes, not working hours.', 'number'),
  ('telephony.callback_queue.head_alert_minutes', '180'::jsonb,
   'Minutes after a missed call before the admission head (holders of telephony.callback_queue.escalation_role_key) gets a bell that it is still unreturned. Counted in clock minutes.', 'number'),
  ('telephony.callback_queue.escalation_role_key', '"admission"'::jsonb,
   'Role whose holders get the second-level bell for unreturned missed calls. Default admission = Admission Officer.', 'string'),
  ('telephony.callback_queue.call_method', '"own_mobile"'::jsonb,
   'How counsellors return a missed call. own_mobile = tap to call from their own phone, then mark it done on the screen. Stand-in default (Front desk, 2026-10-10) until the Director answers Q-1010-03; fixing outbound calls on the phone system is separate work.', 'string')
) AS v(k, val, descr, dt)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
   WHERE p.policy_key = v.k AND p.scope_type = 'global' AND p.scope_id IS NULL
);

-- Small reader so every function below agrees on how a setting is read.
CREATE OR REPLACE FUNCTION public.fn_callback_queue_setting(p_key text, p_default text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}' ELSE value::text END
       FROM public.platform_policies
      WHERE policy_key = 'telephony.callback_queue.' || p_key
        AND scope_type = 'global' AND scope_id IS NULL AND is_active
      LIMIT 1),
    p_default);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_callback_queue_setting(text, text) FROM anon, PUBLIC, authenticated;

-- ── 2. Assignment ───────────────────────────────────────────────────────────
-- assigned_counselor_id references profiles(id), so it is admission_counselors.user_id.
CREATE OR REPLACE FUNCTION public.fn_assign_pending_callbacks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_pick uuid;
  v_n integer := 0;
BEGIN
  IF public.fn_callback_queue_setting('rota', 'all_on_duty') <> 'all_on_duty' THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT q.id, q.institution_id
      FROM public.admission_callback_queue q
     WHERE q.status = 'pending'
       AND q.assigned_counselor_id IS NULL
       AND q.institution_id IS NOT NULL
     ORDER BY q.created_at
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT c.user_id INTO v_pick
      FROM public.admission_counselors c
     WHERE c.institution_id = r.institution_id
       AND c.is_active
       AND c.user_id IS NOT NULL
       AND public.fn_is_counselor_on_duty(c.id, (now() AT TIME ZONE 'Asia/Kolkata')::date)
     ORDER BY (SELECT count(*) FROM public.admission_callback_queue o
                WHERE o.assigned_counselor_id = c.user_id AND o.status IN ('pending', 'in_progress')),
              random()
     LIMIT 1;

    IF v_pick IS NOT NULL THEN
      UPDATE public.admission_callback_queue
         SET assigned_counselor_id = v_pick, updated_at = now()
       WHERE id = r.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assign_pending_callbacks() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_assign_pending_callbacks() TO service_role;

-- ── 3. Expiry becomes escalation ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_expire_stale_callbacks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expiry_days int;
  v_now timestamptz := now();
  v_cutoff timestamptz;
  v_expired_count int;
  v_mode text := public.fn_callback_queue_setting('expiry_mode', 'escalate');
  v_c_min int;
  v_h_min int;
  v_role text := public.fn_callback_queue_setting('escalation_role_key', 'admission');
  v_lvl1 int := 0;
  v_lvl2 int := 0;
  v_heads uuid[];
  v_groups jsonb;
  r record;
BEGIN
  IF v_mode = 'expire' THEN
    -- Previous live body, unchanged.
    SELECT COALESCE((value)::text::int, 7) INTO v_expiry_days
      FROM public.platform_policies
     WHERE policy_key = 'telephony.callback_queue.expiry_days'
       AND scope_type = 'global' AND scope_id IS NULL
     LIMIT 1;
    IF v_expiry_days IS NULL OR v_expiry_days <= 0 THEN
      v_expiry_days := 7;
    END IF;
    v_cutoff := v_now - make_interval(days => v_expiry_days);
    UPDATE public.admission_callback_queue
       SET status = 'expired',
           resolution_notes = COALESCE(
             resolution_notes,
             'auto-expired by cron — never resolved (callback_due_by passed or row older than '
               || v_expiry_days::text || ' days)'
           ),
           resolved_at = v_now,
           updated_at = v_now
     WHERE status = 'pending'
       AND (
         (callback_due_by IS NOT NULL AND callback_due_by < v_now)
         OR (callback_due_by IS NULL AND created_at < v_cutoff)
       );
    GET DIAGNOSTICS v_expired_count = ROW_COUNT;
    RETURN jsonb_build_object(
      'expired_count', v_expired_count,
      'expiry_days_used', v_expiry_days,
      'cutoff_used', v_cutoff,
      'ran_at', v_now
    );
  END IF;

  -- 'escalate' (default): nothing is closed.
  v_c_min := COALESCE(NULLIF(public.fn_callback_queue_setting('counsellor_alert_minutes', '60'), '')::int, 60);
  v_h_min := COALESCE(NULLIF(public.fn_callback_queue_setting('head_alert_minutes', '180'), '')::int, 180);

  -- Level 1: overdue for the counsellor. One bell per counsellor per run.
  -- Only 'pending' rows escalate; 'in_progress' means someone is already on it.
  WITH bumped AS (
    UPDATE public.admission_callback_queue
       SET escalation_level = 1,
           sla_breached = true,
           sla_breached_at = COALESCE(sla_breached_at, v_now),
           updated_at = v_now
     WHERE status = 'pending'
       AND COALESCE(escalation_level, 0) < 1
       AND created_at < v_now - make_interval(mins => v_c_min)
    RETURNING assigned_counselor_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', g.uid, 'n', g.n)), '[]'::jsonb)
    INTO v_groups
    FROM (SELECT assigned_counselor_id AS uid, count(*) AS n FROM bumped GROUP BY assigned_counselor_id) g;

  FOR r IN SELECT (e->>'uid')::uuid AS uid, (e->>'n')::int AS n FROM jsonb_array_elements(v_groups) e
  LOOP
    v_lvl1 := v_lvl1 + r.n;
    IF r.uid IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications
          (title, body, category, kind, targeting, url, priority, created_by, metadata)
        VALUES (
          r.n::text || CASE WHEN r.n = 1 THEN ' missed call is' ELSE ' missed calls are' END || ' waiting for your callback',
          'Over ' || v_c_min::text || ' minutes have passed. Open Call back now on your Counselor View, call from your phone, then mark it done.',
          'admission:callback_overdue', 'work_item',
          jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[r.uid])),
          '/admission/counselors/daily-view', 'high', r.uid,
          jsonb_build_object('source', 'telephony.callback_queue', 'level', 1, 'count', r.n));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'callback overdue bell failed for %: %', r.uid, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Level 2: still unreturned — the admission head.
  WITH bumped AS (
    UPDATE public.admission_callback_queue
       SET escalation_level = 2,
           escalated = true,
           escalated_at = COALESCE(escalated_at, v_now),
           updated_at = v_now
     WHERE status = 'pending'
       AND COALESCE(escalation_level, 0) < 2
       AND created_at < v_now - make_interval(mins => v_h_min)
    RETURNING id
  )
  SELECT count(*) INTO v_lvl2 FROM bumped;

  IF v_lvl2 > 0 THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_heads
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE cr.role_key = v_role AND cr.is_active;

    IF v_heads IS NOT NULL THEN
      FOR i IN 1 .. array_length(v_heads, 1) LOOP
        BEGIN
          INSERT INTO public.notifications
            (title, body, category, kind, targeting, url, priority, created_by, metadata)
          VALUES (
            v_lvl2::text || CASE WHEN v_lvl2 = 1 THEN ' missed call has' ELSE ' missed calls have' END
              || ' gone ' || (v_h_min / 60)::text || ' hours without a callback',
            'Nobody has returned these calls yet. Open the Counselor View to see who they are waiting with.',
            'admission:callback_escalated', 'work_item',
            jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[v_heads[i]])),
            '/admission/counselors/daily-view', 'high', v_heads[i],
            jsonb_build_object('source', 'telephony.callback_queue', 'level', 2, 'count', v_lvl2));
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'callback escalation bell failed for %: %', v_heads[i], SQLERRM;
        END;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'mode', 'escalate',
    'expired_count', 0,
    'level1_count', v_lvl1,
    'level2_count', v_lvl2,
    'ran_at', v_now
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_expire_stale_callbacks() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_expire_stale_callbacks() TO service_role;

-- ── Shared access rule for one callback row ─────────────────────────────────
-- Manager: super admin, admin, or admission.counselors.view with access to the college.
-- Counsellor: the row is theirs, or it is unassigned in a college they counsel for.
CREATE OR REPLACE FUNCTION public.fn_can_work_callback(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admission_callback_queue q
     WHERE q.id = p_id
       AND (
         is_super_admin() OR is_admin()
         OR (user_has_permission('admission.counselors.view') AND role_has_institution_access(q.institution_id))
         OR q.assigned_counselor_id = auth.uid()
         OR (q.assigned_counselor_id IS NULL AND EXISTS (
               SELECT 1 FROM public.admission_counselors c
                WHERE c.user_id = auth.uid() AND c.is_active AND c.institution_id = q.institution_id))
       ));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_work_callback(uuid) FROM anon, PUBLIC, authenticated;

-- ── 4. The counsellor screen ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_callback_queue_for_me(
  p_institution_id uuid,
  p_counsellor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manager boolean;
  v_counsellor boolean;
BEGIN
  IF v_uid IS NULL OR p_institution_id IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'is_manager', false);
  END IF;

  v_manager := is_super_admin() OR is_admin()
    OR (user_has_permission('admission.counselors.view') AND role_has_institution_access(p_institution_id));
  v_counsellor := EXISTS (
    SELECT 1 FROM public.admission_counselors c
     WHERE c.user_id = v_uid AND c.is_active AND c.institution_id = p_institution_id);

  IF NOT (v_manager OR v_counsellor) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'is_manager', false);
  END IF;

  RETURN (
    WITH visible AS (
      SELECT q.*
        FROM public.admission_callback_queue q
       WHERE q.institution_id = p_institution_id
         AND q.status IN ('pending', 'in_progress')
         AND CASE
               WHEN v_manager AND p_counsellor_user_id IS NOT NULL THEN q.assigned_counselor_id = p_counsellor_user_id
               WHEN v_manager THEN true
               ELSE (q.assigned_counselor_id = v_uid OR q.assigned_counselor_id IS NULL)
             END
    ), ranked AS (
      SELECT v.*,
             CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END AS prank
        FROM visible v
       ORDER BY COALESCE(v.escalation_level, 0) DESC, prank, v.created_at
       LIMIT 100
    )
    SELECT jsonb_build_object(
      'is_manager', v_manager,
      'total', (SELECT count(*) FROM visible),
      'rows', COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'caller_number', r.caller_number,
        'lead_id', r.lead_id,
        'lead_name', l.full_name,
        'priority', r.priority,
        'missed_count_7d', r.missed_count_7d,
        'ever_connected', r.ever_connected,
        'created_at', r.created_at,
        'escalation_level', COALESCE(r.escalation_level, 0),
        'assigned_counselor_id', r.assigned_counselor_id,
        'assigned_name', p.full_name,
        'is_mine', r.assigned_counselor_id = v_uid
      ) ORDER BY COALESCE(r.escalation_level, 0) DESC, r.prank, r.created_at), '[]'::jsonb)
    )
      FROM ranked r
      LEFT JOIN public.admission_leads l ON l.id = r.lead_id
      LEFT JOIN public.profiles p ON p.id = r.assigned_counselor_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_callback_queue_for_me(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_callback_queue_for_me(uuid, uuid) TO authenticated;

-- ── 5. "I called back" ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_complete_callback(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
BEGIN
  IF NOT public.fn_can_work_callback(p_id) THEN
    RAISE EXCEPTION 'You cannot close this callback.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admission_callback_queue
     SET status = 'completed',
         resolved_by = v_uid,
         resolved_at = now(),
         assigned_counselor_id = COALESCE(assigned_counselor_id, v_uid),
         resolution_notes = 'Called back (' || public.fn_callback_queue_setting('call_method', 'own_mobile') || ')'
           || CASE WHEN NULLIF(btrim(p_note), '') IS NOT NULL THEN ': ' || left(btrim(p_note), 500) ELSE '' END,
         updated_at = now()
   WHERE id = p_id AND status IN ('pending', 'in_progress');
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', v_n = 1, 'already_closed', v_n = 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_complete_callback(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_complete_callback(uuid, text) TO authenticated;

-- ── 6. What the AI call script may use ──────────────────────────────────────
-- No phone number and no notes: the script needs the situation, not the identity.
CREATE OR REPLACE FUNCTION public.fn_callback_script_context(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_work_callback(p_id) THEN
    RAISE EXCEPTION 'You cannot open this callback.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'college', i.name,
      'missed_count_7d', q.missed_count_7d,
      'ever_connected', q.ever_connected,
      'called_at', q.created_at,
      'known_enquiry', q.lead_id IS NOT NULL,
      'first_name', l.first_name,
      'interested_programs', l.interested_programs,
      'funnel_stage', l.funnel_stage,
      'city', l.city
    )
      FROM public.admission_callback_queue q
      LEFT JOIN public.institutions i ON i.id = q.institution_id
      LEFT JOIN public.admission_leads l ON l.id = q.lead_id
     WHERE q.id = p_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_callback_script_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_callback_script_context(uuid) TO authenticated;

-- ── 7. The AI call script's model row (/admin/ai-models governs it) ─────────
-- Haiku 4.5: a 4-line script is short text; same id the HR intake reader uses.
insert into public.ai_model_config (feature_key, display_name, description, category, provider, model_id, is_active, change_reason)
values ('admission.callback_script', 'Missed-call Callback Script',
 'Drafts a short call script when a counsellor opens a missed call on Call back now. Sees only the college, how many times they called, when, and — for a known enquiry — first name, programmes of interest, stage and city. Never sees the phone number. Paid per script opened.',
 'admission', 'anthropic', 'claude-haiku-4-5', true,
 'Missed-call callback loop, lever 1 (2026-10-10)')
on conflict (feature_key) do nothing;
