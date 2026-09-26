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
--   fn_adoption_remind         super admin only; same day cap and exclusion list
--   fn_adoption_day_remaining / fn_adoption_tick_excluded  the two shared limits
--   fn_adoption_daily_tick     service role only: ask on near-zero features,
--                              remind on eligible ones, at most
--                              adoption.tick.max_notifications people per IST day
--                              and at most ONE adoption message per person per IST day
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
--   per IST day: at most adoption.tick.max_notifications recipients (default
--     100), counting every why-not question and reminder already sent that
--     day, whoever sent it; one adoption message per person per IST day. Questions go out before reminders;
--     each feature gets an equal share (floor share, remainder in order); first
--     reminders before any repeat; repeats oldest reminder first across all
--     features. Whoever the cap leaves out is reached on a later day.
--   excluded features: adoption.tick.exclude_features (seeded with
--     induction.my_sessions_open, guide.open and learners.create_profile) —
--     the daily run neither asks nor reminds. If that row is missing,
--     inactive, not a list or unreadable, the run sends NOTHING (fail closed).
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
-- 3) The per-day cap, as a config row (config-table pattern)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_widget, ui_category, is_system, is_active, publication_state)
SELECT
  'adoption.tick.max_notifications',
  'global',
  NULL,
  -- 100 for the first rollout (coordinator, 2026-09-24): read the first
  -- answers before the volume grows. Raise it on Platform Policies.
  to_jsonb(100),
  'The most people the adoption loop''s daily run may message in one IST day — why-not questions and reminders together, shared with the Ask why button. A safety cap so a fault can never message everyone at once; people left over are reached on the next day''s run. 0 = the daily run sends nothing. Starts at 100 so the first answers can be read before the volume grows. The per-person limits (why-not once per feature ever and once a week; a reminder once a month per feature; one adoption message per person per day) apply whatever this is set to.',
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

-- Features the daily run leaves alone entirely — no question, no reminder.
-- Seeded with induction.my_sessions_open: it is labelled for every learner,
-- faculty member and HOD, but induction is used mainly by new learners
-- (ever opened, 24 Sep: 318 learners, 14 faculty, 7 HODs). Asking 6,406
-- people a blocking "why not?" would mostly reach people it was never meant
-- for. Fix the label, then take the key out of this list.
-- Also guide.open: a blocking "why not?" to 6,450 people about opening the
-- help guide is a nag, not a question worth their time (coordinator,
-- 2026-09-24).
-- Also learners.create_profile: its recording is a browser beacon that has
-- seen 6 people EVER, while learners_profiles.created_by shows 426 profiles
-- made by admission and 125 by admission_staff in the last 90 days (W12 desk
-- review, 2026-09-25). The beacon misses the real work, so the heaviest real
-- users would be asked why they never create profiles. Take it off this list
-- once its recording counts the profiles actually created.
-- The Ask why button is not affected by this row.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT
  'adoption.tick.exclude_features',
  'global',
  NULL,
  '["induction.my_sessions_open", "guide.open", "learners.create_profile"]'::jsonb,
  'Feature keys the adoption loop''s daily run skips completely: nobody is asked why or reminded about them. Use it for a feature whose "intended for" label is wider than the people it really serves, until the label is corrected. Starts with induction.my_sessions_open (labelled for every learner, faculty member and HOD; used mainly by new learners) guide.open (a blocking question to everyone about opening the help guide is a nag, not a question worth their time) and learners.create_profile (its recording misses the profiles admission really creates). If this row is missing, switched off or not a list, the daily run sends nothing at all. Does not affect the Ask why button on /admin/adoption.',
  'array',
  'major',
  'analytics',
  true,
  true,
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'adoption.tick.exclude_features'
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
--   p_limit    ask at most this many people (what is left of the day's budget)
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
  PERFORM pg_advisory_xact_lock(hashtext('adoption_messages'));

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
      -- one adoption message per person per IST day, whoever sends it (review 3)
      AND NOT EXISTS (SELECT 1 FROM public.adoption_reminders ar
                      WHERE ar.user_id = pr.user_id AND ar.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))
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
DECLARE
  v_left integer;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;

  -- The button shares the daily run's budget and its one-message-per-day rule
  -- (review 3): a press after the run has spent the day's budget sends nothing.
  -- It does NOT read the exclusion list — that list steers the automatic run;
  -- a super admin pressing Ask why on a feature is a deliberate choice.
  -- The shared lock is taken BEFORE the budget is read (review 4): two presses,
  -- or a press during the daily run, cannot both spend the same remainder.
  PERFORM pg_advisory_xact_lock(hashtext('adoption_messages'));
  v_left := public.fn_adoption_day_remaining();
  IF v_left <= 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'today''s adoption message budget is used up — try again tomorrow');
  END IF;

  RETURN public.fn_adoption_ask_why_core(p_feature_key, p_as_of, auth.uid(), false, v_left, '{}'::uuid[])
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
--   * not on an Indian calendar day (IST) on which the person already had an
--     adoption reminder or question
--   * people never reminded about this feature go first, then those reminded
--     longest ago, so a backlog larger than the cap is worked through in turn
--   * p_limit / p_exclude as in the ask core
-- Service-only: signed-in callers go through fn_adoption_remind.
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
-- 7b) The two shared limits: the day's remaining budget and the exclusion list
-- ---------------------------------------------------------------------
-- The cap is per Indian calendar DAY, not per call: a second run, a manual
-- run or a reminder sent by hand all draw from the same daily budget. Every
-- why-not question and reminder sent since midnight IST counts, including
-- questions sent with the Ask why button.
-- The daily cap, read from the GLOBAL row only (review 7). fn_get_policy_int
-- honours user- and role-level overrides, so the scheduler (no user) and the
-- Ask why button (a super admin) could see different caps and together exceed
-- the global one. Every entry point reads this instead. A missing or unreadable
-- row falls back to 100; a negative value counts as 0.
CREATE OR REPLACE FUNCTION public.fn_adoption_tick_cap()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap integer;
BEGIN
  BEGIN
    SELECT (pp.value #>> '{}')::integer INTO v_cap
    FROM public.platform_policies pp
    WHERE pp.policy_key = 'adoption.tick.max_notifications'
      AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active
    LIMIT 1;
  EXCEPTION WHEN others THEN
    v_cap := NULL;
  END;
  RETURN GREATEST(COALESCE(v_cap, 100), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_tick_cap() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_tick_cap() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_adoption_day_remaining()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap        integer;
  v_day_start  timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  v_sent       integer;
BEGIN
  v_cap := public.fn_adoption_tick_cap();
  SELECT (SELECT count(*) FROM public.adoption_asks WHERE asked_at >= v_day_start)
       + (SELECT count(*) FROM public.adoption_reminders WHERE sent_at >= v_day_start)
    INTO v_sent;
  RETURN GREATEST(v_cap - COALESCE(v_sent, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_day_remaining() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_day_remaining() TO service_role;

-- The exclusion list FAILS CLOSED: NULL means "cannot tell what is excluded",
-- and every caller then sends nothing. That covers a missing row, a
-- switched-off row, a value that is not a list, and any element that is not
-- a text key. An empty list [] is a deliberate "exclude nothing" and is fine.
CREATE OR REPLACE FUNCTION public.fn_adoption_tick_excluded()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value  jsonb;
  v_active boolean;
  v_keys   text[];
BEGIN
  SELECT pp.value, pp.is_active INTO v_value, v_active
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'adoption.tick.exclude_features'
    AND pp.scope_type = 'global' AND pp.scope_id IS NULL
  ORDER BY pp.updated_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(v_active, false) OR v_value IS NULL
     OR jsonb_typeof(v_value) <> 'array' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_value) e WHERE jsonb_typeof(e) <> 'string') THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(array_agg(e), '{}'::text[]) INTO v_keys FROM jsonb_array_elements_text(v_value) e;
  RETURN v_keys;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_tick_excluded() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_tick_excluded() TO service_role;

-- ---------------------------------------------------------------------
-- 8) fn_adoption_remind — the callable reminder
-- ---------------------------------------------------------------------
-- Super admins only; the daily run goes through the core directly. A call
-- obeys the same two limits as the run: it never sends more than what is
-- left of today's cap, and it refuses a feature on the exclusion list (or
-- anything at all while that list cannot be read). Returns counts only.
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin().
CREATE OR REPLACE FUNCTION public.fn_adoption_remind(p_feature_key text, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluded text[];
  v_left     integer;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;

  -- same lock as the daily run: the day's budget is read and spent by one
  -- caller at a time
  PERFORM pg_advisory_xact_lock(hashtext('adoption_messages'));

  v_excluded := public.fn_adoption_tick_excluded();
  IF v_excluded IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'the exclusion list (policy adoption.tick.exclude_features) is missing, switched off or not a list — nothing is sent until it is fixed');
  END IF;
  IF p_feature_key = ANY (v_excluded) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'this feature is on the exclusion list (policy adoption.tick.exclude_features)');
  END IF;

  v_left := public.fn_adoption_day_remaining();
  IF v_left <= 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'today''s limit (policy adoption.tick.max_notifications) is already used up');
  END IF;

  RETURN public.fn_adoption_remind_core(p_feature_key, auth.uid(), COALESCE(p_dry_run, false), v_left, '{}'::uuid[])
         - 'targets';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind(text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_remind(text, boolean) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_remind(text, boolean) TO authenticated;

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
-- Features listed in adoption.tick.exclude_features are skipped in both
-- passes (and if that list cannot be read, nothing is sent). Stops when the
-- day's adoption.tick.max_notifications budget is used up, counting what was
-- already sent today; people left over are reached on a later day. Nobody gets more than one adoption message
-- from one run, and nobody who had one earlier the same IST day is messaged again.
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
  v_excluded  text[];
  v_keys      text[] := '{}'::text[];  -- features for the current pass, in order
  v_key       text;
  v_share     integer;
  v_round     integer;
  v_extra     integer;   -- round 1: features that get one more than the floor share
  v_i         integer;
  v_lim       integer;
  v_cand      jsonb;     -- round 3: repeat candidates across every feature
  v_pick      record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'the adoption daily run is started by the scheduler, not by a person' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'adoption loop is switched off (policy adoption.loop.enabled)',
                              'dry_run', v_dry, 'asked', 0, 'reminded', 0, 'features', '{}'::jsonb);
  END IF;

  -- one run at a time: a manual run and the scheduled one cannot interleave
  PERFORM pg_advisory_xact_lock(hashtext('adoption_messages'));

  -- Features this run leaves alone entirely. FAIL CLOSED: if the list
  -- cannot be read, nothing is sent at all, and the run says why.
  v_excluded := public.fn_adoption_tick_excluded();
  IF v_excluded IS NULL THEN
    RETURN jsonb_build_object('success', false, 'dry_run', v_dry, 'asked', 0, 'reminded', 0,
      'error', 'the exclusion list (policy adoption.tick.exclude_features) is missing, switched off or not a list — nothing was sent');
  END IF;

  -- The cap is per IST day: whatever was already sent today (by an earlier
  -- run, a manual run or the Ask why button) comes off it.
  v_cap := public.fn_adoption_tick_cap();
  v_left := public.fn_adoption_day_remaining();
  v_capped := v_left <= 0;

  v_actor := public.fn_adoption_loop_sender();
  IF v_actor IS NULL AND NOT v_dry THEN
    RETURN jsonb_build_object('success', false,
      'error', 'no sender: the feature-adoption loop''s owner_email matches no profile');
  END IF;

  SELECT w.term_start INTO v_tstart FROM public.fn_adoption_term_window() w;

  -- One adoption message per person per day holds across runs too: anyone
  -- reminded earlier the same IST day is not messaged by this run. (Anyone asked
  -- in the last 7 days is excluded by the ask core; anyone asked the same IST
  -- day by the remind core.)
  SELECT COALESCE(array_agg(DISTINCT ar.user_id), '{}'::uuid[]) INTO v_touched
  FROM public.adoption_reminders ar
  WHERE ar.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');

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
      AND NOT (fr.feature_key = ANY (v_excluded))
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

    IF v_near_zero THEN
      v_keys := v_keys || v_feat.feature_key;
    END IF;
  END LOOP;

  -- Fair order (review 5): round 1 gives every near-zero feature an equal share
  -- of what is left today, oldest feature first; round 2 spends any leftover in
  -- the same order. A feature with thousands to ask cannot hold the others back.
  -- Questions come before reminders on purpose: a question backlog can pause
  -- reminders, never the other way round.
  -- Round 1 share (review 6): the FLOOR of what is left divided by the number of
  -- features, plus one more for the first (remainder) features in order — so the
  -- whole budget can reach every feature, never 2 each to the first few and 0 to the rest.
  FOR v_round IN 1..2 LOOP
    IF cardinality(v_keys) > 0 THEN
      v_share := floor(v_left::numeric / cardinality(v_keys))::integer;
      v_extra := v_left - v_share * cardinality(v_keys);
    END IF;
    v_i := 0;
    FOREACH v_key IN ARRAY v_keys LOOP
      v_i := v_i + 1;
      IF v_left <= 0 THEN
        v_capped := true;
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'ask_note'], to_jsonb('run cap reached'::text));
        CONTINUE;
      END IF;
      v_lim := CASE WHEN v_round = 1
                    THEN LEAST(v_share + CASE WHEN v_i <= v_extra THEN 1 ELSE 0 END, v_left)
                    ELSE v_left END;
      CONTINUE WHEN v_lim <= 0;
      v_res := public.fn_adoption_ask_why_core(v_key, NULL, v_actor, v_dry, v_lim, v_touched);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_n := COALESCE((v_res->>'asked')::integer, 0);
        v_touched := v_touched || ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb))::uuid);
        v_left := v_left - v_n;
        v_total_ask := v_total_ask + v_n;
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'asked'],
                    to_jsonb(COALESCE((v_rows->v_key->>'asked')::integer, 0) + v_n));
      ELSE
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'ask_note'], to_jsonb(v_res->>'error'));
      END IF;
    END LOOP;
  END LOOP;

  -- ---- pass 2: remind the never-users ----
  -- Fair order (review 5), in three rounds over the eligible features, newest first:
  --   1. first reminders only, the floor share per feature plus the remainder in order
  --   2. first reminders only, any leftover
  --   3. repeat reminders (30 days on), ranked ACROSS features, oldest reminder first
  -- So nobody gets a repeat while anyone on any feature still awaits a first one.
  v_keys := '{}'::text[];
  FOR v_feat IN
    SELECT fr.feature_key
    FROM public.feature_registry fr
    WHERE fr.feature_key <> 'app.login'
      AND fr.status <> 'retired'
      AND fr.skip_reason IS NULL
      AND fr.usage_wired
      AND fr.cadence <> 'event'
      AND fr.shipped_at <= now() - interval '14 days'
      AND NOT (fr.feature_key = ANY (v_excluded))
    ORDER BY fr.shipped_at DESC, fr.feature_key
  LOOP
    v_keys := v_keys || v_feat.feature_key;
  END LOOP;

  -- Rounds 1 and 2: first reminders only — round 1 the floor share plus the
  -- remainder in order (review 6), round 2 any leftover.
  FOR v_round IN 1..2 LOOP
    IF cardinality(v_keys) > 0 THEN
      v_share := floor(v_left::numeric / cardinality(v_keys))::integer;
      v_extra := v_left - v_share * cardinality(v_keys);
    END IF;
    v_i := 0;
    FOREACH v_key IN ARRAY v_keys LOOP
      v_i := v_i + 1;
      IF v_left <= 0 THEN
        v_capped := true;
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'remind_note'], to_jsonb('run cap reached'::text));
        CONTINUE;
      END IF;
      v_lim := CASE WHEN v_round = 1
                    THEN LEAST(v_share + CASE WHEN v_i <= v_extra THEN 1 ELSE 0 END, v_left)
                    ELSE v_left END;
      CONTINUE WHEN v_lim <= 0;
      v_res := public.fn_adoption_remind_core(v_key, v_actor, v_dry, v_lim, v_touched, true, NULL);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_n := COALESCE((v_res->>'reminded')::integer, 0);
        v_touched := v_touched || ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb))::uuid);
        v_left := v_left - v_n;
        v_total_rem := v_total_rem + v_n;
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'reminded'],
                    to_jsonb(COALESCE((v_rows->v_key->>'reminded')::integer, 0) + v_n));
      ELSE
        v_rows := jsonb_set(v_rows, ARRAY[v_key, 'remind_note'], to_jsonb(v_res->>'error'));
      END IF;
    END LOOP;
  END LOOP;

  -- Round 3 (review 6): repeat reminders ranked ACROSS features. Gather everyone
  -- due a repeat on any feature (a dry look, writes nothing), keep each person's
  -- longest-ago reminder only (one message a day), take the oldest first up to
  -- what is left, then send per feature to exactly those people.
  IF v_left > 0 AND cardinality(v_keys) > 0 THEN
    v_cand := '[]'::jsonb;
    FOREACH v_key IN ARRAY v_keys LOOP
      v_res := public.fn_adoption_remind_core(v_key, v_actor, true, NULL, v_touched, false, NULL);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_cand := v_cand || COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'k', v_key, 'u', t.u,
                   'at', (SELECT max(ar.sent_at) FROM public.adoption_reminders ar
                           WHERE ar.user_id = t.u::uuid AND ar.feature_key = v_key)))
          FROM jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb)) AS t(u)), '[]'::jsonb);
      END IF;
    END LOOP;

    FOR v_pick IN
      WITH c AS (
        SELECT x.k, x.u, x.at FROM jsonb_to_recordset(v_cand) AS x(k text, u uuid, at timestamptz)
      ),
      one AS (
        SELECT DISTINCT ON (c.u) c.k, c.u, c.at FROM c ORDER BY c.u, c.at NULLS FIRST, c.k
      ),
      chosen AS (
        SELECT one.k, one.u FROM one ORDER BY one.at NULLS FIRST, one.u LIMIT v_left
      )
      SELECT chosen.k, array_agg(chosen.u) AS us FROM chosen GROUP BY chosen.k ORDER BY chosen.k
    LOOP
      v_res := public.fn_adoption_remind_core(v_pick.k, v_actor, v_dry, cardinality(v_pick.us),
                                              v_touched, false, v_pick.us);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_n := COALESCE((v_res->>'reminded')::integer, 0);
        v_touched := v_touched || ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_res->'targets', '[]'::jsonb))::uuid);
        v_left := v_left - v_n;
        v_total_rem := v_total_rem + v_n;
        v_rows := jsonb_set(v_rows, ARRAY[v_pick.k, 'reminded'],
                    to_jsonb(COALESCE((v_rows->v_pick.k->>'reminded')::integer, 0) + v_n));
      ELSE
        v_rows := jsonb_set(v_rows, ARRAY[v_pick.k, 'remind_note'], to_jsonb(v_res->>'error'));
      END IF;
    END LOOP;
  END IF;
  IF v_left <= 0 THEN v_capped := true; END IF;

  RETURN jsonb_build_object(
    'success',  true,
    'dry_run',  v_dry,
    'cap',      v_cap,
    'day_left', v_left,
    'capped',   v_capped,
    'excluded', to_jsonb(v_excluded),
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
