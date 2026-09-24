-- =====================================================================
-- Adoption loop — Migration E: ask why and remind on their own, daily
-- Date: 2026-09-24
-- Spec: specs/2026-09-16-adoption-loop.md, rulings 2, 6, 9 and 10
--       (9 and 10: Director 2026-09-24 17:52, reply "A").
--
-- WHY. The loop measures use and was meant to ask non-users why (ruling 2),
-- but the why-not question has NEVER been sent: fn_adoption_ask_why needs a
-- super admin to press a button on /admin/adoption, nobody has, and
-- adoption_asks held 0 rows on production on 2026-09-24. Ruling 9 makes the
-- desk an actor and ruling 10 adds a reminder. This migration makes both
-- steps run on their own, once a day, with every limit enforced HERE, in the
-- database, not in the route that calls it.
--
-- WHAT.
--   feature_registry.href      where a reminder may link to (nullable; set by
--                              the desk when the route is known — never guessed)
--   adoption_reminders         one row per person × feature × reminder sent
--   fn_adoption_ask_why_core   the why-not body, moved verbatim out of
--                              fn_adoption_ask_why so the daily tick can reuse
--                              it; adds only a sender, a dry run, a per-call cap
--                              and an exclusion list — every one of them can
--                              only send FEWER questions, never more
--   fn_adoption_ask_why        unchanged for people: super admin only, same
--                              signature, same answers
--   fn_adoption_remind_core    ruling 10 (see its header for every limit)
--   fn_adoption_remind         super admin or the service role
--   fn_adoption_daily_tick     service role only: ask on near-zero features,
--                              remind on eligible ones, at most
--                              adoption.tick.max_notifications people per run
--                              and at most ONE adoption message per person per run
--   fn_adoption_reminder_summary  per-feature totals for /admin/adoption
--                              (SECURITY INVOKER — RLS keeps it super-admin only)
--   ai_routine_schedules 'adoption-daily-tick'  daily 10:33 IST, via the
--                              AI-routine dispatcher (vercel.json is at its cap)
--
-- LIMITS, all in this file:
--   why-not (ruling 6, unchanged): once per feature ever, once per person per
--     7 days, never a super admin, never an event / skipped / unrecorded /
--     retired / stale / under-14-day feature, never the sign-in line, a term
--     feature only in the last 14 days of its term. The tick adds: only when
--     the feature is near-zero (every intended role under 5 % in the last 7
--     days, or this term for a term feature — the page's own dead bar).
--   reminder (ruling 10): only to intended people who have NEVER done the core
--     action; at most once per person per feature per 30 days; not a super
--     admin; not an event / skipped / unrecorded / retired / stale / under-14-day
--     feature, never the sign-in line. Tighter than the ruling on purpose:
--     nobody gets a reminder on a day they already had an adoption message.
--   per run: at most adoption.tick.max_notifications recipients (default 500),
--     and one adoption message per person. Questions go out before reminders;
--     reminders newest feature first. Whoever the cap leaves out is reached on
--     a later day.
--   master switch adoption.loop.enabled: off = nothing is asked or reminded.
--
-- Rehearsed on production inside BEGIN … ROLLBACK with p_dry_run => true
-- (counts only; nothing inserted). Local harness: supabase/tests/adoption/run.sh
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) feature_registry.href — the one link a reminder may carry
-- ---------------------------------------------------------------------
ALTER TABLE public.feature_registry
  ADD COLUMN IF NOT EXISTS href text;
ALTER TABLE public.feature_registry
  DROP CONSTRAINT IF EXISTS feature_registry_href_internal_check;
-- An in-app path only ("/learners/leave"), never an outside address: a
-- reminder sent to thousands of people must not be able to carry an off-site link.
ALTER TABLE public.feature_registry
  ADD CONSTRAINT feature_registry_href_internal_check
  CHECK (href IS NULL OR href ~ '^/[A-Za-z0-9_\-/\[\]\.?=&%]*$' AND href !~ '^//');
COMMENT ON COLUMN public.feature_registry.href IS
  'In-app path of the page where the core action is done, e.g. /hr/leave. A reminder links here; NULL = no link (routes are never guessed). Set by the desk when the route is known (2026-09-24).';

-- ---------------------------------------------------------------------
-- 2) adoption_reminders — the ruling-10 guard and the page's count
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adoption_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key     text NOT NULL REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  notification_id uuid,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.adoption_reminders IS
  'Adoption loop ruling 10 (Director 2026-09-24): one row per reminder sent — a plain in-app notice to an intended person who has never done a feature''s core action. fn_adoption_remind_core reads it to send at most one per person per feature per 30 days. Written only by that function.';

-- the 30-day lookup (person × feature, newest first) and the per-person day check
CREATE INDEX IF NOT EXISTS idx_adoption_reminders_user_feature_sent
  ON public.adoption_reminders (user_id, feature_key, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_adoption_reminders_user_sent
  ON public.adoption_reminders (user_id, sent_at DESC);
-- the page's per-feature count and last date
CREATE INDEX IF NOT EXISTS idx_adoption_reminders_feature_sent
  ON public.adoption_reminders (feature_key, sent_at DESC);

ALTER TABLE public.adoption_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adoption_reminders FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.adoption_reminders FROM authenticated;
GRANT SELECT ON TABLE public.adoption_reminders TO authenticated;
GRANT ALL    ON TABLE public.adoption_reminders TO service_role;

-- Read: super admins only (who was reminded is per-person data, ruling 7).
-- No INSERT/UPDATE/DELETE policy on purpose — rows come only from
-- fn_adoption_remind_core (SECURITY DEFINER).
DROP POLICY IF EXISTS "adoption_reminders_select_super_admin" ON public.adoption_reminders;
CREATE POLICY "adoption_reminders_select_super_admin" ON public.adoption_reminders
  FOR SELECT TO authenticated USING ((SELECT is_super_admin()));

-- ---------------------------------------------------------------------
-- 3) The per-run cap, as a config row (config-table pattern)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_widget, ui_category, is_system, is_active, publication_state)
SELECT
  'adoption.tick.max_notifications',
  'global',
  NULL,
  to_jsonb(500),
  'The most people the adoption loop''s daily run may message in one run — why-not questions and reminders together. A safety cap so a fault can never message everyone at once; people left over are reached on the next day''s run. 0 = the daily run sends nothing. The per-person limits (why-not once per feature ever and once a week; a reminder once a month per feature; one adoption message per person per day) apply whatever this is set to.',
  'number',
  'major',
  'number',
  'analytics',
  true,
  true,
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'adoption.tick.max_notifications'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- ---------------------------------------------------------------------
-- 4) fn_adoption_ask_why_core — the why-not body, reusable by the tick
-- ---------------------------------------------------------------------
-- Every rule below is fn_adoption_ask_why's as applied on production
-- (20260918230000; live body md5 af2d51ee… read 2026-09-24, identical). The
-- only additions, each able only to send FEWER questions:
--   p_actor    who the notice is from (a person, or the loop owner for the tick)
--   p_dry_run  count who WOULD be asked, write nothing
--   p_limit    ask at most this many people (the tick's per-run cap)
--   p_exclude  people this run has already messaged
-- Service-only: no signed-in person may call it (the super-admin check lives
-- in fn_adoption_ask_why; the tick is service-role only).
CREATE OR REPLACE FUNCTION public.fn_adoption_ask_why_core(
  p_feature_key text,
  p_as_of       date,
  p_actor       uuid,
  p_dry_run     boolean DEFAULT false,
  p_limit       integer DEFAULT NULL,
  p_exclude     uuid[]  DEFAULT '{}'::uuid[]
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
  v_options jsonb := '["Did not know it exists","Tried it, too hard","Do not need it","Use something else"]'::jsonb;
  v_tstart  date;
  v_tend    date;
  v_today   date := COALESCE(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_from    date;   -- "no use since" boundary: term start for term features, forever for weekly
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fn_adoption_ask_why'));

  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'adoption loop is switched off (policy adoption.loop.enabled)');
  END IF;

  SELECT * INTO v_feat FROM public.feature_registry WHERE feature_key = p_feature_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown feature');
  END IF;
  IF v_feat.cadence = 'event' THEN
    -- "Used when needed": a low share means few occasions arose, not that the
    -- feature failed. There is nothing to ask about (2026-09-23).
    RETURN jsonb_build_object('success', false, 'error', 'this feature is used only when the occasion arises, so a low share is not evidence — it is never judged dead');
  END IF;
  IF v_feat.skip_reason IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'this feature is skipped on purpose: ' || v_feat.skip_reason);
  END IF;
  IF p_feature_key = 'app.login' THEN
    -- The sign-in line is the app-wide denominator (ruling 1c), not a feature,
    -- and asking about it refutes itself twice over. The question arrives on a
    -- blocking screen that a person can only reach BY signing in, so every
    -- recipient has just done the thing they are being asked why they never do.
    -- And the recipient list is not a population of non-users: sign-in recording
    -- began on 2026-09-18, so "no row" means "we had not started counting", not
    -- "never signed in". Measured 2026-09-23: one call would have messaged 6,643
    -- people, against 458 with a recorded sign-in.
    RETURN jsonb_build_object('success', false, 'error', 'the sign-in line is the app-wide measure, not a feature — it is never asked about');
  END IF;
  IF NOT v_feat.usage_wired THEN
    RETURN jsonb_build_object('success', false, 'error', 'no usage recording for this feature yet — it cannot be judged dead');
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

  IF v_feat.cadence = 'term' THEN
    SELECT w.term_start, w.term_end INTO v_tstart, v_tend FROM public.fn_adoption_term_window(v_today) w;
    IF v_today < v_tend - 14 THEN
      RETURN jsonb_build_object('success', false,
        'error', 'a term-judged feature is asked about only in the last 14 days of the term (term ends ' || v_tend::text || ')');
    END IF;
    v_from := v_tstart;
  ELSE
    v_from := DATE '1900-01-01';
  END IF;

  SELECT COALESCE(array_agg(t.user_id ORDER BY t.user_id), '{}'::uuid[]) INTO v_targets
  FROM (
    SELECT DISTINCT pr.user_id
    FROM public.fn_adoption_person_roles() pr
    WHERE pr.is_super_admin = false
      AND (cardinality(v_feat.intended_roles) = 0
           OR 'all' = ANY (v_feat.intended_roles)
           OR pr.role = ANY (v_feat.intended_roles))
      AND NOT EXISTS (SELECT 1 FROM public.feature_usage fu
                      WHERE fu.user_id = pr.user_id AND fu.feature_key = p_feature_key
                        AND fu.day >= v_from)
      AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                      WHERE aa.user_id = pr.user_id AND aa.feature_key = p_feature_key)
      AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                      WHERE aa.user_id = pr.user_id AND aa.asked_at > now() - interval '7 days')
      AND NOT (pr.user_id = ANY (COALESCE(p_exclude, '{}'::uuid[])))
    ORDER BY pr.user_id
    LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit, 0) END
  ) t;

  v_n := cardinality(v_targets);
  IF v_n = 0 OR p_dry_run THEN
    RETURN jsonb_build_object('success', true, 'asked', v_n, 'dry_run', COALESCE(p_dry_run, false),
                              'notification_id', NULL, 'targets', to_jsonb(v_targets));
  END IF;

  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no sender for the notice');
  END IF;

  BEGIN
    INSERT INTO public.notifications
      (title, body, url, created_by, targeting, priority, category, metadata,
       requires_acknowledgment, requires_answer, answer_options, expires_at)
    VALUES
      ('Have you used ' || v_feat.title || '?',
       'MyJKKN added "' || v_feat.title || '" so you can ' || v_feat.core_action ||
       '. You have not used it yet. One tap tells us why, so we can make it simpler, show how it works, or retire it.',
       '/',
       p_actor,
       jsonb_build_object('type', 'adoption_why', 'feature_key', p_feature_key),
       'normal',
       'adoption',
       jsonb_build_object('kind', 'adoption_why', 'feature_key', p_feature_key, 'source', 'adoption_loop'),
       false,
       true,
       v_options,
       now() + interval '30 days')
    RETURNING id INTO v_nid;
  EXCEPTION
    WHEN undefined_column THEN
      RETURN jsonb_build_object('success', false,
        'error', 'feedback gate not applied yet (PR #3829: notifications.requires_answer)');
  END;

  INSERT INTO public.user_notifications (user_id, notification_id)
  SELECT t, v_nid FROM unnest(v_targets) AS t;

  INSERT INTO public.adoption_asks (user_id, feature_key, notification_id, asked_at)
  SELECT t, p_feature_key, v_nid, now() FROM unnest(v_targets) AS t;

  RETURN jsonb_build_object('success', true, 'asked', v_n, 'dry_run', false,
                            'notification_id', v_nid, 'targets', to_jsonb(v_targets));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_ask_why_core(text, date, uuid, boolean, integer, uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_ask_why_core(text, date, uuid, boolean, integer, uuid[]) TO service_role;

-- ---------------------------------------------------------------------
-- 5) fn_adoption_ask_why — the button, unchanged for people
-- ---------------------------------------------------------------------
-- Same signature and grants as 20260918230000. Still super admin only, still
-- one call = everyone eligible (no cap, no exclusions), and still never
-- returns person ids: the core's 'targets' list is stripped here.
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin(); only the Adoption desk / super admins may send the why-not question.
CREATE OR REPLACE FUNCTION public.fn_adoption_ask_why(p_feature_key text, p_as_of date DEFAULT NULL)
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

  RETURN public.fn_adoption_ask_why_core(p_feature_key, p_as_of, auth.uid(), false, NULL, '{}'::uuid[])
         - 'targets' - 'dry_run';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_ask_why(text, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_ask_why(text, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) fn_adoption_remind_core — ruling 10
-- ---------------------------------------------------------------------
-- One plain in-app notice (NOT must-answer, not blocking, no acknowledgement)
-- to each intended person who has NEVER done the core action. Refuses the same
-- features the why-not question refuses, plus 'event' (a when-needed feature
-- is used when the occasion arises; reminding everyone to apply for leave is
-- wrong). Limits:
--   * never a super admin
--   * at most once per person per feature per 30 days (ruling 10)
--   * not on a day the person already had an adoption reminder or question
--     (20 hours, so a daily run a little early still counts as the next day)
--   * p_limit / p_exclude as in the ask core
-- Service-only: signed-in callers go through fn_adoption_remind.
CREATE OR REPLACE FUNCTION public.fn_adoption_remind_core(
  p_feature_key text,
  p_actor       uuid,
  p_dry_run     boolean DEFAULT false,
  p_limit       integer DEFAULT NULL,
  p_exclude     uuid[]  DEFAULT '{}'::uuid[]
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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fn_adoption_remind'));

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

  SELECT COALESCE(array_agg(t.user_id ORDER BY t.user_id), '{}'::uuid[]) INTO v_targets
  FROM (
    SELECT DISTINCT pr.user_id
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
      -- one adoption message per person per day, reminders and questions together
      AND NOT EXISTS (SELECT 1 FROM public.adoption_reminders ar
                      WHERE ar.user_id = pr.user_id AND ar.sent_at > now() - interval '20 hours')
      AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                      WHERE aa.user_id = pr.user_id AND aa.asked_at > now() - interval '20 hours')
      AND NOT (pr.user_id = ANY (COALESCE(p_exclude, '{}'::uuid[])))
    ORDER BY pr.user_id
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
            '. You have not used it yet.' ||
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
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind_core(text, uuid, boolean, integer, uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_remind_core(text, uuid, boolean, integer, uuid[]) TO service_role;

-- ---------------------------------------------------------------------
-- 7) fn_adoption_loop_sender — who a machine-sent notice is from
-- ---------------------------------------------------------------------
-- notifications.created_by is NOT NULL and references profiles. A person's
-- call sends as that person; the daily run sends as the loop's owner (the
-- Director owns this loop, loop_registry.feature-adoption.owner_email), the
-- same account the Owners panel on /admin/loops shows. NULL = no sender, and
-- the cores then refuse rather than invent one.
CREATE OR REPLACE FUNCTION public.fn_adoption_loop_sender()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.loop_registry lr
  JOIN public.profiles p ON lower(p.email) = lower(lr.owner_email)
  WHERE lr.loop_key = 'feature-adoption'
  ORDER BY p.is_active DESC NULLS LAST, p.id
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_loop_sender() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_loop_sender() TO service_role;

-- ---------------------------------------------------------------------
-- 8) fn_adoption_remind — the callable reminder
-- ---------------------------------------------------------------------
-- A super admin (sends as themself) or the service role (sends as the loop
-- owner). Returns counts only — never who.
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin() or the caller is the service role (auth.role()).
CREATE OR REPLACE FUNCTION public.fn_adoption_remind(p_feature_key text, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF COALESCE(is_super_admin(), false) THEN
    v_actor := auth.uid();
  ELSIF auth.uid() IS NULL AND COALESCE(auth.role(), '') = 'service_role' THEN
    v_actor := public.fn_adoption_loop_sender();
  ELSE
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;

  RETURN public.fn_adoption_remind_core(p_feature_key, v_actor, COALESCE(p_dry_run, false), NULL, '{}'::uuid[])
         - 'targets';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind(text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_remind(text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9) fn_adoption_daily_tick — the clock's one call
-- ---------------------------------------------------------------------
-- Looks at every live, recorded, labelled feature at least 14 days old (never
-- skipped, never when-needed, never the sign-in line), in two passes:
--   1) ASK first. A feature is near-zero when every intended role is under
--      5 % — in the last 7 days for a weekly feature, this term for a term
--      feature (the page's dead bar, lib/adoption/summarise.ts
--      DEAD_WEEKLY_PCT). Its non-users get the why-not question through the
--      same core the button uses, so every ruling-6 limit holds unchanged.
--      Asking goes first because it is the step that has never run and the
--      one the loop's next decision (ruling 8/9) is waiting on.
--   2) REMIND next (ruling 10), newest feature first: the people most likely
--      not to know a feature exists are the ones it was built for last month,
--      not last year.
-- Stops at adoption.tick.max_notifications people; people left over are
-- reached on the next day's run. Nobody gets more than one adoption message
-- from one run, and nobody reminded in the last 20 hours is messaged again.
-- Service role only: a signed-in person cannot run it (EXECUTE is not granted
-- and the body refuses any caller with a user id).
CREATE OR REPLACE FUNCTION public.fn_adoption_daily_tick(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dry       boolean := COALESCE(p_dry_run, false);
  v_cap       integer;
  v_left      integer;
  v_actor     uuid;
  v_touched   uuid[] := '{}'::uuid[];
  v_week_from date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 6;
  v_tstart    date;
  v_feat      record;
  v_from      date;
  v_near_zero boolean;
  v_res       jsonb;
  v_n         integer;
  v_total_ask integer := 0;
  v_total_rem integer := 0;
  v_rows      jsonb := '{}'::jsonb;   -- feature_key → what this run did
  v_capped    boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'the adoption daily run is started by the scheduler, not by a person' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'adoption loop is switched off (policy adoption.loop.enabled)',
                              'dry_run', v_dry, 'asked', 0, 'reminded', 0, 'features', '{}'::jsonb);
  END IF;

  -- one run at a time: a manual run and the scheduled one cannot interleave
  PERFORM pg_advisory_xact_lock(hashtext('fn_adoption_daily_tick'));

  v_cap := GREATEST(COALESCE(public.fn_get_policy_int('adoption.tick.max_notifications', 500), 500), 0);
  v_left := v_cap;

  v_actor := public.fn_adoption_loop_sender();
  IF v_actor IS NULL AND NOT v_dry THEN
    RETURN jsonb_build_object('success', false,
      'error', 'no sender: the feature-adoption loop''s owner_email matches no profile');
  END IF;

  SELECT w.term_start INTO v_tstart FROM public.fn_adoption_term_window() w;

  -- One adoption message per person per day holds across runs too: anyone
  -- reminded in the last 20 hours is not messaged by this run. (Anyone asked
  -- in the last 7 days is excluded by the ask core; anyone asked in the last
  -- 20 hours by the remind core.)
  SELECT COALESCE(array_agg(DISTINCT ar.user_id), '{}'::uuid[]) INTO v_touched
  FROM public.adoption_reminders ar
  WHERE ar.sent_at > now() - interval '20 hours';

  -- ---- pass 1: ask why, on near-zero features ----
  FOR v_feat IN
    SELECT fr.*
    FROM public.feature_registry fr
    WHERE fr.feature_key <> 'app.login'
      AND fr.status <> 'retired'
      AND fr.skip_reason IS NULL
      AND fr.usage_wired
      AND fr.cadence <> 'event'
      AND fr.shipped_at <= now() - interval '14 days'
    ORDER BY fr.shipped_at, fr.feature_key
  LOOP
    v_from := CASE WHEN v_feat.cadence = 'term' THEN v_tstart ELSE v_week_from END;
    WITH roles AS (
      SELECT DISTINCT r AS role
      FROM unnest(CASE WHEN cardinality(v_feat.intended_roles) = 0 THEN ARRAY['all']
                       ELSE v_feat.intended_roles END) AS r
    ),
    people AS (
      SELECT DISTINCT ro.role, pr.user_id
      FROM roles ro
      JOIN public.fn_adoption_person_roles() pr ON (ro.role = 'all' OR pr.role = ro.role)
    ),
    agg AS (
      SELECT p.role,
             count(*) AS intended,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.feature_usage fu
               WHERE fu.user_id = p.user_id AND fu.feature_key = v_feat.feature_key
                 AND fu.day >= v_from)) AS active
      FROM people p
      GROUP BY p.role
    )
    SELECT count(*) > 0 AND bool_and(active * 100 < 5 * intended)
      INTO v_near_zero
    FROM agg;
    v_near_zero := COALESCE(v_near_zero, false);

    v_rows := v_rows || jsonb_build_object(v_feat.feature_key,
      jsonb_build_object('near_zero', v_near_zero, 'asked', 0, 'reminded', 0));

    IF NOT v_near_zero THEN
      CONTINUE;
    END IF;
    IF v_left <= 0 THEN
      v_capped := true;
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'ask_note'], to_jsonb('run cap reached'::text));
      CONTINUE;
    END IF;

    v_res := public.fn_adoption_ask_why_core(v_feat.feature_key, NULL, v_actor, v_dry, v_left, v_touched);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_n := COALESCE((v_res->>'asked')::integer, 0);
      v_touched := v_touched || ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb))::uuid);
      v_left := v_left - v_n;
      v_total_ask := v_total_ask + v_n;
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'asked'], to_jsonb(v_n));
    ELSE
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'ask_note'], to_jsonb(v_res->>'error'));
    END IF;
  END LOOP;

  -- ---- pass 2: remind the never-users, newest feature first ----
  FOR v_feat IN
    SELECT fr.feature_key
    FROM public.feature_registry fr
    WHERE fr.feature_key <> 'app.login'
      AND fr.status <> 'retired'
      AND fr.skip_reason IS NULL
      AND fr.usage_wired
      AND fr.cadence <> 'event'
      AND fr.shipped_at <= now() - interval '14 days'
    ORDER BY fr.shipped_at DESC, fr.feature_key
  LOOP
    IF v_left <= 0 THEN
      v_capped := true;
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'remind_note'], to_jsonb('run cap reached'::text));
      CONTINUE;
    END IF;

    v_res := public.fn_adoption_remind_core(v_feat.feature_key, v_actor, v_dry, v_left, v_touched);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_n := COALESCE((v_res->>'reminded')::integer, 0);
      v_touched := v_touched || ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb))::uuid);
      v_left := v_left - v_n;
      v_total_rem := v_total_rem + v_n;
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'reminded'], to_jsonb(v_n));
    ELSE
      v_rows := jsonb_set(v_rows, ARRAY[v_feat.feature_key, 'remind_note'], to_jsonb(v_res->>'error'));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',  true,
    'dry_run',  v_dry,
    'cap',      v_cap,
    'capped',   v_capped,
    'asked',    v_total_ask,
    'reminded', v_total_rem,
    'features', v_rows);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_daily_tick(boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_daily_tick(boolean) TO service_role;

-- ---------------------------------------------------------------------
-- 10) fn_adoption_reminder_summary — the page's count per feature
-- ---------------------------------------------------------------------
-- SECURITY INVOKER on purpose: RLS on adoption_reminders already limits rows to
-- super admins, so anyone else simply reads nothing. Totals only, no names.
CREATE OR REPLACE FUNCTION public.fn_adoption_reminder_summary()
RETURNS TABLE (feature_key text, sent_count bigint, last_sent_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ar.feature_key, count(*)::bigint, max(ar.sent_at)
  FROM public.adoption_reminders ar
  GROUP BY ar.feature_key
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_reminder_summary() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_reminder_summary() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11) The clock: daily 10:33 IST through the AI-routine dispatcher
-- ---------------------------------------------------------------------
-- vercel.json is deliberately untouched (hard 100-cron cap). Registered in
-- lib/ai-routines/loop-governance.ts ('adoption-daily-tick'); day and time
-- editable on /admin/ai-routines; 633 is a free minute on the 24 Sep schedule.
-- ON CONFLICT DO NOTHING: a re-run never clobbers a retuned row.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('adoption-daily-tick', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 633, false)
ON CONFLICT (routine_id) DO NOTHING;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.ai_routine_schedules WHERE routine_id = 'adoption-daily-tick';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'adoption-daily-tick schedule row missing after seed (count=%)', v_count;
  END IF;
  IF to_regclass('public.adoption_reminders') IS NULL THEN
    RAISE EXCEPTION 'adoption_reminders was not created';
  END IF;
END $$;
