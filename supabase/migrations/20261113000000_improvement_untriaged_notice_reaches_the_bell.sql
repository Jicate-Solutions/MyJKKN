-- ============================================================================
-- Improvement Board — the untriaged notice never reached a bell. Deliver it.
-- File: 20261113000000_improvement_untriaged_notice_reaches_the_bell.sql
-- Date: 2026-09-06
--
-- WHAT IS WRONG
--   20260816050000_improvement_untriaged_idea_notice.sql built the sweep that
--   tells a department owner nobody has looked at an idea. It runs. It writes the
--   ledger row, it writes the 'escalated' activity row, and it writes the
--   notifications row. It does not write user_notifications, and the bell reads
--   user_notifications.
--
--   Measured on production 2026-09-06, before this migration:
--     improvement_untriaged_notices                       10 rows
--     notifications WHERE category='improvement:triage'   10 rows
--     user_notifications JOINed to those                   0 rows
--     improvement_idea_activity WHERE action='escalated'  10 rows
--   Ten neglected ideas were "announced" to three department owners and not one
--   of them was told anything. The sweep's own ledger then recorded the
--   announcement as delivered.
--
--   There is no fan-out trigger on public.notifications that would close the gap
--   later — the only triggers on that table are safety_log_delete and
--   set_timestamp_notifications. The junction row is written by the writer, or it
--   is never written at all.
--
--   The read path is explicit about this. Every user-facing query in
--   lib/services/notification/notification-service.ts selects FROM
--   user_notifications with an `!inner` join to notifications (getNotifications,
--   getNotificationCounts, the rollups). A notifications row with no junction row
--   is invisible to the badge, the inbox list and the counts alike.
--
-- WHY THIS IS AN OMISSION AND NOT A DESIGN CHOICE
--   20260816050000 says in its own header that the no-owner rule came "straight
--   from the lapse sweep" — fn_gemba_official_lapse_notify. That sibling ends its
--   notifications INSERT with exactly the statement this one is missing:
--     INSERT INTO public.user_notifications (notification_id, user_id)
--     SELECT v_notif, s.u FROM unnest(v_recipients) AS s(u) ...
--   The pattern was in front of the author and one statement of it was dropped.
--   This migration restores it in the sibling's own shape.
--
-- WHY NOT ROUTE THROUGH fn_cr_notify
--   fn_cr_notify (20260725000000_project_change_requests_rpcs.sql:64) is the
--   canonical two-table writer and is the right answer in most places. It is the
--   wrong answer here, on six counts, five of them silent:
--     1. It filters recipients with `r IS DISTINCT FROM p_creator`. This sweep
--        passes the IDEA'S AUTHOR as created_by, so an owner who filed an idea in
--        their own area would be dropped and the notice would vanish entirely
--        (fn_cr_notify RETURNs early on an empty recipient list). That is a change
--        to WHO gets notified, which this change is explicitly not allowed to make.
--        Currently 0 such author/owner pairs exist in production, so the bug is
--        latent rather than biting — but it is a landmine, not a non-issue.
--     2. It hardcodes category='projects:change_request'. 'improvement:triage'
--        would disappear, taking the category rollups with it.
--     3. It writes no idempotency_key, so Guard 2 (idx_notifications_idempotency,
--        the defence that survives a corrupted ledger) would be gone.
--     4. It writes no expires_at, so improvement.triage_notice_expiry_days becomes
--        dead config. Notifications that never lapse are precisely the bug fixed on
--        2026-07-26, after ~170K unread cron nudges had accumulated forever.
--     5. It writes no metadata, losing idea_id / area_id / waited_days.
--     6. It RETURNS void, so improvement_untriaged_notices.notification_id could
--        never be populated again.
--   Reuse the pattern, not the function.
--
-- WHAT THIS CHANGES
--   1. fn_improvement_untriaged_notify — adds the junction write, and nothing else
--      that alters behaviour. Same recipients, same eligibility window, same
--      once-per-idea ledger, same message, same category, same expiry.
--   2. A one-time backfill of the notices that were already fired into the void.
--
-- WHY THE BACKFILL IS THE LARGER HALF
--   improvement_untriaged_notices is UNIQUE (idea_id) and 20260816050000 argues at
--   length that this is deliberate: an idea is announced ONCE, EVER. So the ten
--   ideas already in the ledger are never swept again. Fixing only the function
--   leaves them permanently silent. Counted on production 2026-09-06, of the
--   logged ideas already past improvement.triage_after_days:
--     already announced (unreachable by any code fix)   10
--     eligible on the next nightly run                   1
--     skipped — the area has no current owner           23
--   A forward-only fix delivers one bell item. The backfill delivers ten.
--
--   The backfill invents no recipients. It reads each notification's OWN
--   targeting->'user_ids' — the list the sweep already computed and stored — and
--   materialises the junction rows that should have been written beside it. It
--   touches only category='improvement:triage' rows that today have zero junction
--   rows, so it is a no-op on a second run and cannot disturb a delivered notice.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   No change to who is notified, to the 3-day window, to the once-ever rule, to
--   the no-owner skip, or to the notice text. Eight sibling functions share this
--   same junction omission; they are listed in the pull request and left alone.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The sweep, with delivery.
--
--    Only two things differ from 20260816050000: v_notif is resolved from the
--    idempotency key when ON CONFLICT swallowed the RETURNING (otherwise a notice
--    that already exists is delivered to nobody AND recorded in the ledger with a
--    NULL notification_id), and the junction rows are written.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_untriaged_notify(
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  idea_id         uuid,
  area_id         uuid,
  area_label      text,
  waited_days     integer,
  recipients      integer,
  notification_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- The RETURNS TABLE names above are also PL/pgSQL variables, and three of them —
-- idea_id, area_id and notification_id — are column names on tables this function
-- INSERTs into. That makes the INSERT column lists and the ON CONFLICT targets
-- ambiguous, and PostgreSQL raises 42702 at RUN time, not at CREATE time: the
-- function applies perfectly and then throws the first night it finds work.
--
-- Caught by executing the sweep inside a rolled-back transaction on production
-- 2026-08-10, after the migration had applied cleanly and every apply-time assert
-- had passed. An INSERT column list cannot be schema-qualified, so this directive
-- is the fix: where a bare name could mean either, the COLUMN wins. Proven in
-- production — all 10 improvement_untriaged_notices rows carry a non-NULL
-- notification_id, which is only possible if the column won there.
--
-- Safe here specifically because the output variables are only ever written to
-- (idea_id := r.iid and friends, at the bottom of the loop) and assignment targets
-- are never ambiguous. Every read of a table column in this function is already
-- alias-qualified. Nothing else in the body changes meaning.
#variable_conflict use_column
DECLARE
  v_after_days  integer := public.fn_get_policy_int('improvement.triage_after_days', 3);
  v_expiry_days integer := public.fn_get_policy_int('improvement.triage_notice_expiry_days', 30);
  v_cap         integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
  r             record;
  v_recipients  uuid[];
  v_author      uuid;
  v_key         text;
  v_notif       uuid;
  v_waited      integer;
BEGIN
  FOR r IN
    SELECT i.id         AS iid,
           i.area_id    AS area,
           i.title      AS title,
           i.created_at AS since,
           i.author_id  AS by_uid,
           ar.label     AS label
      FROM public.improvement_ideas i
      JOIN public.improvement_areas ar ON ar.id = i.area_id
     WHERE i.status = 'logged'
       -- area_id is nullable on improvement_ideas; the JOIN drops those rows on
       -- purpose. An idea with no area has no owner to tell, and guessing one from
       -- target_department_id would notify somebody who never accepted the role.
       AND i.created_at <= now() - make_interval(days => GREATEST(1, v_after_days))
       -- Guard 1: this idea has already been announced.
       AND NOT EXISTS (
             SELECT 1 FROM public.improvement_untriaged_notices n
              WHERE n.idea_id = i.id
           )
     ORDER BY i.created_at ASC
     LIMIT v_cap
  LOOP
    -- Whoever currently holds the role for this area. Targeted, never broadcast.
    -- Capped at 50: the notifications pipeline does not fan out beyond that.
    SELECT array_agg(u) INTO v_recipients
      FROM (
        SELECT DISTINCT s.profile_id AS u
          FROM public.hr_additional_roles h
          JOIN public.staff s ON s.id = h.staff_id
          JOIN public.profiles pr ON pr.id = s.profile_id
         WHERE h.improvement_area_id = r.area
           AND h.is_current
           AND s.profile_id IS NOT NULL
         LIMIT 50
      ) t;

    -- No current owner → announce nothing and record nothing, so this idea is
    -- still eligible the day somebody is named to the area.
    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_waited := GREATEST(0, EXTRACT(DAY FROM (now() - r.since))::integer);

    -- notifications.created_by is NOT NULL and references profiles. The natural
    -- author is whoever filed the idea; fall back to a stable super admin, then to
    -- a recipient, so the notice can never fail to have an author.
    SELECT pr.id INTO v_author FROM public.profiles pr WHERE pr.id = r.by_uid;
    IF v_author IS NULL THEN
      SELECT pr.id INTO v_author
        FROM public.profiles pr
       WHERE COALESCE(pr.is_super_admin, false)
         AND COALESCE(pr.is_active, true)
       ORDER BY pr.id
       LIMIT 1;
    END IF;
    IF v_author IS NULL THEN
      v_author := v_recipients[1];
    END IF;

    -- Guard 2, independent of the ledger: one deterministic key per idea, enforced
    -- by idx_notifications_idempotency.
    v_key := 'improvement.untriaged|' || r.iid::text;

    -- notifications.body is NOT NULL, and a NULL anywhere in a || chain makes the
    -- WHOLE string NULL — which raises 23502 and, with no EXCEPTION block, would end
    -- the sweep for every remaining idea. Every input below audited against the live
    -- schema 2026-08-10:
    --   r.title  <- improvement_ideas.title      NOT NULL
    --   r.label  <- improvement_areas.label      NOT NULL (COALESCE anyway)
    --   r.since  <- improvement_ideas.created_at NOT NULL DEFAULT now()
    --   v_waited <- computed above, never NULL
    v_notif := NULL;

    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority,
       created_by, expires_at, idempotency_key, metadata)
    VALUES (
      'Nobody has looked at this idea — ' || COALESCE(r.label, 'department'),
      'An improvement idea for ' || COALESCE(r.label, 'this department')
        || ', "' || r.title || '", was filed on '
        || to_char(r.since, 'DD Mon YYYY')
        || ' and has been sitting in Logged for ' || v_waited::text
        || CASE WHEN v_waited = 1 THEN ' day' ELSE ' days' END
        || ' without anyone opening it. The person who wrote it has had no reply. '
        || 'Moving it to Under Review — or rejecting it with a reason — both count as an answer. '
        || 'Leaving it where it is does not.',
      'improvement:triage',
      -- work_item, not announcement: a cron-emitted operational nudge, and
      -- kind='work_item' is what keeps it out of the human-authored broadcast
      -- outbox (lib/services/notification/sent-service.ts filters on exactly this).
      'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
      '/improvement-board',
      'normal',
      v_author,
      now() + make_interval(days => GREATEST(1, v_expiry_days)),
      v_key,
      jsonb_build_object(
        'source',      'improvement.untriaged',
        'idea_id',     r.iid,
        'area_id',     r.area,
        'waited_days', v_waited
      )
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_notif;

    -- ON CONFLICT DO NOTHING returns no row, so RETURNING leaves v_notif NULL when
    -- the notice already existed. Before this migration that path recorded a ledger
    -- row with a NULL notification_id and — now that delivery is the point — would
    -- also skip the junction write, leaving the owner untold about a notice that
    -- demonstrably exists. Resolve it from the deterministic key instead.
    IF v_notif IS NULL THEN
      SELECT n.id INTO v_notif
        FROM public.notifications n
       WHERE n.idempotency_key = v_key;
    END IF;

    -- THE FIX. The bell reads user_notifications; without this the notice above is
    -- invisible to the badge, the inbox and the counts. Shape taken verbatim from
    -- fn_gemba_official_lapse_notify, the sibling this sweep was modelled on.
    -- ON CONFLICT keys on user_notifications_notification_id_user_id_key, so a
    -- re-run adds nothing.
    IF v_notif IS NOT NULL THEN
      INSERT INTO public.user_notifications (notification_id, user_id)
      SELECT v_notif, s.u
        FROM unnest(v_recipients) AS s(u)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;

    INSERT INTO public.improvement_untriaged_notices
      (idea_id, area_id, waited_days, notification_id, recipient_count)
    VALUES (r.iid, r.area, v_waited, v_notif, array_length(v_recipients, 1))
    ON CONFLICT (idea_id) DO NOTHING;

    -- The timeline entry, in the board's existing vocabulary. actor_id is NULL:
    -- no human did this, and attributing a cron sweep to the author or the owner
    -- would put words in the mouth of somebody who did nothing.
    INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
    VALUES (r.iid, NULL, 'escalated',
            'Untriaged for ' || v_waited::text || ' days — the department owner was notified.');

    idea_id         := r.iid;
    area_id         := r.area;
    area_label      := r.label;
    waited_days     := v_waited;
    recipients      := array_length(v_recipients, 1);
    notification_id := v_notif;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_improvement_untriaged_notify(integer) IS
  'Daily sweep: for every improvement idea still in Logged past improvement.triage_after_days whose neglect has not already been announced, tell the current holder of that department''s area role. Writes BOTH notifications and user_notifications — the bell reads the junction table, so the second write is the delivery. Targeted, never broadcast. Idempotent three times over — the improvement_untriaged_notices ledger, notifications.idempotency_key, and user_notifications'' UNIQUE (notification_id, user_id) — so a second run the same night adds nothing. Announces neglect; changes no idea status.';

-- ACLs are re-stated because a fresh environment applying migrations in order
-- needs them, and Supabase default-grants anon EXECUTE on every function.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Backfill: deliver the notices that were already fired into the void.
--
--    Scope is deliberately narrow — only category='improvement:triage', only
--    notifications that today have NO junction row at all, only the user_ids the
--    notification itself already names. A notice that was partially delivered is
--    left untouched rather than topped up: partial delivery is a different failure
--    and this migration is not diagnosing it.
-- ----------------------------------------------------------------------------
INSERT INTO public.user_notifications (notification_id, user_id)
SELECT n.id, t.uid
  FROM public.notifications n
 CROSS JOIN LATERAL (
   SELECT (jsonb_array_elements_text(n.targeting -> 'user_ids'))::uuid AS uid
 ) t
 -- user_notifications.user_id is NOT NULL REFERENCES profiles(id); a stale id in
 -- targeting would abort the whole migration rather than skip one recipient.
 JOIN public.profiles p ON p.id = t.uid
 WHERE n.category = 'improvement:triage'
   AND jsonb_typeof(n.targeting -> 'user_ids') = 'array'
   AND NOT EXISTS (
         SELECT 1 FROM public.user_notifications un WHERE un.notification_id = n.id
       )
ON CONFLICT (notification_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Apply-time asserts. The failure being fixed was silent; refuse to let the
--    fix be silent too.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_undelivered integer;
  v_src         text := pg_get_functiondef('public.fn_improvement_untriaged_notify(integer)'::regprocedure);
BEGIN
  -- The whole point of the migration.
  IF v_src !~* 'insert into[[:space:]]+public\.user_notifications' THEN
    RAISE EXCEPTION 'fn_improvement_untriaged_notify still does not write user_notifications — the bell would stay empty';
  END IF;

  -- Every triage notice that names a recipient must now reach at least one bell.
  SELECT count(*) INTO v_undelivered
    FROM public.notifications n
   WHERE n.category = 'improvement:triage'
     AND jsonb_typeof(n.targeting -> 'user_ids') = 'array'
     AND jsonb_array_length(n.targeting -> 'user_ids') > 0
     AND NOT EXISTS (
           SELECT 1 FROM public.user_notifications un WHERE un.notification_id = n.id
         );
  IF v_undelivered > 0 THEN
    RAISE EXCEPTION 'backfill left % improvement:triage notice(s) with no bell row', v_undelivered;
  END IF;

  -- The lockdown from 20260816050000 must survive CREATE OR REPLACE.
  IF has_function_privilege('anon', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_improvement_untriaged_notify is reachable outside cron — the lockdown failed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE fn_improvement_untriaged_notify — the sweep would never run';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
