-- =====================================================================
-- Bug loop: AUTO-RESOLVE policy — built DORMANT, activation is earned
-- Spec: docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md
-- (auto-resolve addendum; Director-interviewed decisions R1-R4, 2026-07-19)
--
-- R1 TRIGGER: a group may auto-resolve only when its reporter-feedback
--    thread is fully SETTLED (every question answered or expired; no
--    unsent/pending question), NOBODY answered still-broken, and at
--    least one reporter answered fixed. Silence never blocks forever
--    and never counts as a yes (locked E2 preserved).
-- R2 EARN-IT: stays OFF until 10 CLEAN human-approved resolutions exist
--    (ledger-measured: resolved outcomes, reporter_confirmed='positive',
--    zero late thumbs-down, not themselves auto-resolved). Even then,
--    flipping bug_reports.auto_resolve.enabled is a human act.
-- R3 CIRCUIT BREAKER: the first still-broken answer landing on an
--    AUTO-resolved group switches the whole feature off (policy row
--    flipped false + suspension note) until a human reviews.
-- R4 VISIBILITY: every auto-resolve raises a bell notification to the
--    admin who enabled the policy (app-side, real notifications schema).
--
-- The resolve ACTION runs app-side (nightly cron) so it reuses the same
-- email + cascade + ledger path as a human resolve — never a second
-- code path for outbound mail.
-- =====================================================================

-- Policy rows (config-table pattern: every policy decision = a config row).
INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type, description)
VALUES
  ('bug_reports.auto_resolve.enabled', 'global', 'false'::jsonb, 'boolean',
   'Bug groups: resolve automatically when the reporter-feedback thread is settled with zero still-broken and at least one fixed answer. Dormant until earned (see required_clean_track); flipping this on is a human decision.'),
  ('bug_reports.auto_resolve.required_clean_track', 'global', '10'::jsonb, 'number',
   'How many CLEAN human-approved group resolutions (positive reporter outcome, zero late still-broken) must exist before auto-resolve may act.'),
  ('bug_reports.auto_resolve.suspended', 'global', '{}'::jsonb, 'object',
   'Circuit-breaker state: set automatically when a reporter answers still-broken on an auto-resolved group. Empty object = not suspended.')
ON CONFLICT DO NOTHING;

-- ── status: one gate-state object (UI strip + cron preamble) ─────────
CREATE OR REPLACE FUNCTION public.fn_bug_auto_resolve_status()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'enabled',   COALESCE((SELECT (value)::boolean FROM public.platform_policies
                            WHERE policy_key = 'bug_reports.auto_resolve.enabled' AND scope_type = 'global'), false),
    'required',  COALESCE((SELECT (value)::int FROM public.platform_policies
                            WHERE policy_key = 'bug_reports.auto_resolve.required_clean_track' AND scope_type = 'global'), 10),
    'clean',     (SELECT count(*) FROM public.bug_fix_outcomes o
                   WHERE o.resolved_at IS NOT NULL
                     AND o.reporter_confirmed = 'positive'
                     AND o.reporter_neg = 0
                     AND NOT COALESCE((SELECT c.metadata ? 'auto_resolved'
                                         FROM public.bug_clusters c WHERE c.id = o.cluster_id), false)),
    'suspended', COALESCE((SELECT value FROM public.platform_policies
                            WHERE policy_key = 'bug_reports.auto_resolve.suspended' AND scope_type = 'global'), '{}'::jsonb),
    'notify_user_id', (SELECT updated_by FROM public.platform_policies
                        WHERE policy_key = 'bug_reports.auto_resolve.enabled' AND scope_type = 'global')
  );
$function$;

-- ── scan: eligible groups, ONLY when armed (enabled + earned + not suspended)
CREATE OR REPLACE FUNCTION public.fn_bug_auto_resolve_scan()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status jsonb;
  v_armed  boolean;
  v_elig   jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('armed', false, 'error', 'service role only');
  END IF;

  v_status := public.fn_bug_auto_resolve_status();
  v_armed := (v_status ->> 'enabled')::boolean
             AND (v_status ->> 'clean')::int >= (v_status ->> 'required')::int
             AND (v_status -> 'suspended') = '{}'::jsonb;
  IF NOT v_armed THEN
    RETURN v_status || jsonb_build_object('armed', false, 'eligible', '[]'::jsonb);
  END IF;

  -- R1 trigger, per group: thread exists + fully settled + 0 still-broken
  -- + >=1 fixed + canonical still open. pending_send (prepared, never sent)
  -- counts as UNSETTLED — an incomplete thread never auto-resolves.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cluster_id', c.id, 'seed_bug_id', c.seed_bug_id, 'member_count', c.member_count)), '[]'::jsonb)
    INTO v_elig
  FROM public.bug_clusters c
  WHERE c.status = 'confirmed'
    AND NOT (c.metadata ? 'auto_resolved')
    AND EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests r WHERE r.cluster_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests r
                     WHERE r.cluster_id = c.id
                       AND (r.status = 'pending_send'
                            OR (r.status IN ('sent','delivered') AND r.expires_at > now())))
    AND NOT EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests r
                     WHERE r.cluster_id = c.id AND r.answer = 'not_fixed')
    AND EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests r
                 WHERE r.cluster_id = c.id AND r.answer = 'fixed')
    AND (SELECT br.status FROM public.bug_reports br WHERE br.id = c.seed_bug_id)
        NOT IN ('resolved','wont_fix');

  RETURN v_status || jsonb_build_object('armed', true, 'eligible', v_elig);
END;
$function$;

-- ── mark: stamp a group as auto-resolved (called by the cron just before
-- it resolves the canonical through the normal app path) ─────────────
CREATE OR REPLACE FUNCTION public.fn_bug_auto_resolve_mark(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;
  UPDATE public.bug_clusters
     SET metadata = metadata || jsonb_build_object('auto_resolved',
           jsonb_build_object('at', now())),
         updated_at = now()
   WHERE id = p_cluster_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ── circuit breaker (R3): fn_bug_feedback_answer replaced — a still-broken
-- answer on an AUTO-resolved group suspends the feature. Body otherwise
-- verbatim from the live def (pg_get_functiondef, checked 2026-07-19).
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.bug_fix_feedback_requests%ROWTYPE;
BEGIN
  IF p_answer NOT IN ('fixed','not_fixed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be fixed or not_fixed');
  END IF;

  SELECT * INTO v_row
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status = 'pending_send' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not sent yet');
  END IF;
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  -- Learn (#3): refresh the measured-outcome ledger. Never fail the answer.
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- R3 circuit breaker: a still-broken answer on an AUTO-resolved group
  -- switches auto-resolve OFF everywhere until a human reviews. Must never
  -- break the reporter's answer write.
  IF p_answer = 'not_fixed' THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM public.bug_clusters c
                  WHERE c.id = v_row.cluster_id AND (c.metadata ? 'auto_resolved')) THEN
        UPDATE public.platform_policies
           SET value = 'false'::jsonb, updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.enabled' AND scope_type = 'global';
        UPDATE public.platform_policies
           SET value = jsonb_build_object(
                 'suspended_at', now(),
                 'cluster_id', v_row.cluster_id,
                 'reason', 'a reporter answered still-broken after an auto-resolve'),
               updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.suspended' AND scope_type = 'global';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$function$;

-- Grants (anon-lock template; answer fn keeps its authenticated grant —
-- reporters call it — re-asserted below).
REVOKE EXECUTE ON FUNCTION public.fn_bug_auto_resolve_status() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_auto_resolve_status() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_bug_auto_resolve_scan() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_auto_resolve_scan() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_bug_auto_resolve_mark(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_auto_resolve_mark(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;
