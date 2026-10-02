-- =============================================================================
-- Adoption loop E.2 (2026-10-02): remind only people who have signed in lately
-- =============================================================================
-- Spec: specs/2026-09-16-adoption-loop.md, ruling 10. Director 2026-09-30, "a"
-- (walk-queue 29 Sep 10:45): remind only people who signed in within the last
-- 30 days, so the daily 100 reach people who will see them.
--
-- WHY (production, read 2026-09-29/30): of 400 reminders sent 27-30 Sep, 1 was
-- opened and 2 people then did the thing; of the 200 sent on 27-28 Sep only
-- 24 of the people had signed in at all since. Most never-users of a feature
-- have never signed in, so an in-app notice never reaches them, and each one
-- spends a slot of the daily cap.
--
-- THE CHANGE, and nothing else:
--   1. policy adoption.remind.signed_in_within_days (number, default 30):
--      N > 0 = remind only people whose last sign-in is within N days;
--      0 = no sign-in filter (the behaviour before this file).
--   2. fn_adoption_remind_signed_in_days() reads it. FAIL CLOSED: a missing,
--      switched-off or non-numeric row reads as 30, never as "no filter".
--   3. fn_adoption_remind_core: the body live on production since #4020
--      (20270324090000; live body compared equal to the repo copy 2026-10-02),
--      plus ONE clause in the who-to-remind query. Every other limit is
--      unchanged. The Ask-why question is not touched (it is shown at sign-in,
--      so it already reaches only people who sign in).
-- The rule can only ever remove people from a reminder, never add them.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1) the setting
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_widget, ui_category, is_system, is_active, publication_state)
SELECT
  'adoption.remind.signed_in_within_days',
  'global',
  NULL,
  to_jsonb(30),
  'The adoption loop''s automatic reminders go only to people who have signed in to MyJKKN within this many days. An in-app reminder to someone who never signs in is never seen, and it uses up a place in the daily cap. 0 = remind everyone eligible, signed in or not. The other limits (once a month per feature, one adoption message per person per day, the daily cap) apply whatever this is set to.',
  'number',
  'major',
  'number',
  'analytics',
  true,
  true,
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'adoption.remind.signed_in_within_days'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- ---------------------------------------------------------------------
-- 2) the reader — fail closed to 30
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_remind_signed_in_days()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  BEGIN
    SELECT (pp.value #>> '{}')::integer INTO v_days
    FROM public.platform_policies pp
    WHERE pp.policy_key = 'adoption.remind.signed_in_within_days'
      AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active
    LIMIT 1;
  EXCEPTION WHEN others THEN
    v_days := NULL;
  END;
  IF v_days IS NULL OR v_days < 0 THEN
    RETURN 30;
  END IF;
  RETURN v_days;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind_signed_in_days() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_remind_signed_in_days() TO service_role;

-- ---------------------------------------------------------------------
-- 3) fn_adoption_remind_core — #4020's body + the sign-in clause
-- ---------------------------------------------------------------------
-- Limits (unchanged from 20270324090000, plus the last one):
--   * never a super admin
--   * at most once per person per feature per 30 days (ruling 10)
--   * not on an IST day on which the person already had an adoption message
--   * people never reminded about this feature go first, then those reminded
--     longest ago
--   * p_limit / p_exclude / p_first_only / p_only as before
--   * NEW: only people who signed in within adoption.remind.signed_in_within_days
CREATE OR REPLACE FUNCTION public.fn_adoption_remind_core(
  p_feature_key text,
  p_actor       uuid,
  p_dry_run     boolean DEFAULT false,
  p_limit       integer DEFAULT NULL,
  p_exclude     uuid[]  DEFAULT '{}'::uuid[],
  p_first_only  boolean DEFAULT false,
  p_only        uuid[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feat    public.feature_registry%ROWTYPE;
  v_nid     uuid;
  v_n       integer := 0;
  v_targets uuid[] := '{}'::uuid[];
  v_body    text;
  v_days    integer := public.fn_adoption_remind_signed_in_days();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('adoption_messages'));

  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'adoption loop is switched off (policy adoption.loop.enabled)');
  END IF;

  SELECT * INTO v_feat FROM public.feature_registry WHERE feature_key = p_feature_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown feature');
  END IF;
  IF p_feature_key = 'app.login' THEN
    RETURN jsonb_build_object('success', false, 'error', 'the sign-in line is the app-wide measure, not a feature — nobody is reminded about it');
  END IF;
  IF v_feat.cadence = 'event' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this feature is used only when the occasion arises — nobody is reminded to use it');
  END IF;
  IF v_feat.skip_reason IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'this feature is skipped on purpose: ' || v_feat.skip_reason);
  END IF;
  IF NOT v_feat.usage_wired THEN
    RETURN jsonb_build_object('success', false, 'error', 'no usage recording for this feature yet — "never used" cannot be known');
  END IF;
  IF v_feat.usage_event_module IS NOT NULL
     AND (v_feat.usage_synced_at IS NULL OR v_feat.usage_synced_at < now() - interval '7 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'usage for this feature was last pulled from the log more than 7 days ago — pull first');
  END IF;
  IF v_feat.status = 'retired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is retired');
  END IF;
  IF v_feat.shipped_at > now() - interval '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is younger than 14 days');
  END IF;

  SELECT COALESCE(array_agg(t.user_id ORDER BY t.last_sent NULLS FIRST, t.user_id), '{}'::uuid[]) INTO v_targets
  FROM (
    SELECT DISTINCT pr.user_id,
           (SELECT max(ar.sent_at) FROM public.adoption_reminders ar
             WHERE ar.user_id = pr.user_id AND ar.feature_key = p_feature_key) AS last_sent
    FROM public.fn_adoption_person_roles() pr
    WHERE pr.is_super_admin = false
      AND (cardinality(v_feat.intended_roles) = 0
           OR 'all' = ANY (v_feat.intended_roles)
           OR pr.role = ANY (v_feat.intended_roles))
      -- never done the core action, ever
      AND NOT EXISTS (SELECT 1 FROM public.feature_usage fu
                      WHERE fu.user_id = pr.user_id AND fu.feature_key = p_feature_key)
      -- ruling 10: once a month per person per feature
      AND NOT EXISTS (SELECT 1 FROM public.adoption_reminders ar
                      WHERE ar.user_id = pr.user_id AND ar.feature_key = p_feature_key
                        AND ar.sent_at > now() - interval '30 days')
      -- p_first_only: only people never reminded about THIS feature (the tick's
      -- first rounds, so a big backlog on one feature cannot hold back others)
      AND NOT (COALESCE(p_first_only, false) AND EXISTS (SELECT 1 FROM public.adoption_reminders ar
                      WHERE ar.user_id = pr.user_id AND ar.feature_key = p_feature_key))
      -- p_only: the tick's cross-feature repeat round names exactly who to remind
      AND (p_only IS NULL OR pr.user_id = ANY (p_only))
      -- one adoption message per person per day, reminders and questions together
      AND NOT EXISTS (SELECT 1 FROM public.adoption_reminders ar
                      WHERE ar.user_id = pr.user_id AND ar.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))
      AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                      WHERE aa.user_id = pr.user_id AND aa.asked_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))
      AND NOT (pr.user_id = ANY (COALESCE(p_exclude, '{}'::uuid[])))
      -- Director 2026-09-30 ("a"): only people who have signed in recently.
      -- An in-app notice to someone who never signs in is never seen
      -- (27-28 Sep: 200 reminders, 24 of those people signed in since, 1 opened).
      AND (v_days = 0 OR EXISTS (SELECT 1 FROM auth.users u
                                  WHERE u.id = pr.user_id
                                    AND u.last_sign_in_at > now() - make_interval(days => v_days)))
    ORDER BY last_sent NULLS FIRST, pr.user_id
    LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit, 0) END
  ) t;

  v_n := cardinality(v_targets);
  IF v_n = 0 OR p_dry_run THEN
    RETURN jsonb_build_object('success', true, 'reminded', v_n, 'dry_run', COALESCE(p_dry_run, false),
                              'notification_id', NULL, 'targets', to_jsonb(v_targets));
  END IF;

  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no sender for the notice');
  END IF;

  v_body := 'MyJKKN has "' || v_feat.title || '" so you can ' || v_feat.core_action ||
            '. We have not seen you use it recently.' ||
            CASE WHEN v_feat.href IS NOT NULL THEN ' Open this notice to go straight to it.' ELSE '' END;

  INSERT INTO public.notifications
    (title, body, url, created_by, targeting, priority, category, metadata,
     requires_acknowledgment, expires_at)
  VALUES
    ('A reminder: ' || v_feat.title,
     v_body,
     v_feat.href,
     p_actor,
     jsonb_build_object('type', 'adoption_reminder', 'feature_key', p_feature_key),
     'low',
     'adoption',
     jsonb_build_object('kind', 'adoption_reminder', 'feature_key', p_feature_key, 'source', 'adoption_loop'),
     false,
     now() + interval '30 days')
  RETURNING id INTO v_nid;

  INSERT INTO public.user_notifications (user_id, notification_id)
  SELECT t, v_nid FROM unnest(v_targets) AS t;

  INSERT INTO public.adoption_reminders (user_id, feature_key, notification_id, sent_at)
  SELECT t, p_feature_key, v_nid, now() FROM unnest(v_targets) AS t;

  RETURN jsonb_build_object('success', true, 'reminded', v_n, 'dry_run', false,
                            'notification_id', v_nid, 'targets', to_jsonb(v_targets));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind_core(text, uuid, boolean, integer, uuid[], boolean, uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_remind_core(text, uuid, boolean, integer, uuid[], boolean, uuid[]) TO service_role;
