-- =============================================================================
-- Filing a squad request must NOTIFY the Principal of every participating
-- college — and a still-undecided request must chase itself.
--
-- Created: 2026-07-31
-- Applied: NOT APPLIED TO ANY DATABASE — Director-gated apply.
--          Nothing in this file has been run against production. The facts
--          quoted below were read from production READ-ONLY (SELECT only).
--
-- BUILDS ON, DOES NOT REPLACE: 20260808112000 and 20260808163000, both of which
-- ARE applied to production (verified in supabase_migrations.schema_migrations
-- on 2026-07-31; max applied version = 20260808163000). The per-college
-- approval rows, the derivation trigger and the RLS graph already exist. This
-- file adds no table, no column and no second approval mechanism.
--
-- -----------------------------------------------------------------------------
-- WHY THIS EXISTS — the feature's own kill criterion
--
--   Filing a squad request today notifies NOBODY. The Principal only discovers
--   a request is waiting if they happen to open /health/sports/approvals. The
--   stated kill criterion for this feature is that if zero requests are filed
--   within 60 days of go-live the paper letter still wins — and the likeliest
--   cause is precisely that filing notifies nobody.
--
-- -----------------------------------------------------------------------------
-- THE BUG THIS ALSO CLOSES — a live notification path that reaches nobody
--
--   Delivering an in-app notification takes TWO writes: a `notifications` row
--   AND one `user_notifications` row per recipient. There is NO trigger on
--   public.notifications that fans out (verified: zero non-internal triggers on
--   that table). The bell reads user_notifications ⨝ notifications
--   (lib/attention-bar/layers/layer-0.ts, app/api/notifications/*), so a
--   `notifications` row with no `user_notifications` child is invisible to
--   everyone, forever.
--
--   `fn_health_tournament_nudge_approver` — the D9 manual reminder, LIVE on
--   production — does only the FIRST write. Proved against production's own
--   catalogue, not inferred:
--
--       SELECT position('user_notifications' in prosrc) FROM pg_proc
--        WHERE proname = 'fn_health_tournament_nudge_approver';   -->  0
--
--   So it inserts a row, returns a count of "people reached", stamps
--   last_nudged_at, and reaches NOBODY. Its `targeting` JSON is not a delivery
--   mechanism: `notifications.targeting` is NOT NULL but its CONTENTS are
--   unvalidated, and production currently holds at least two different shapes
--   ({"type":"user","user_id":"…"} singular and {"type":"user","user_ids":[…]}
--   plural). Nothing reads it to decide who gets the bell.
--
--   This is not a one-off: 24,562 of the 102,795 notifications created in the
--   last 30 days (23.9%) have no user_notifications row at all.
--
--   Section 4 therefore re-points the D9 reminder at the shared writer below
--   instead of leaving a second, broken notification path inside the very
--   feature this migration is meant to make reachable. The replacement is safe:
--   production's live function body was read back and is BYTE-IDENTICAL to the
--   copy in 20260808112000 (3,986 chars both sides), so this CREATE OR REPLACE
--   cannot silently revert a newer in-database edit.
--
-- -----------------------------------------------------------------------------
-- ONE WRITER, TWO CALLERS
--
--   fn_health_tournament_notify_college() is the ONLY thing in this feature
--   that writes a notification. Three callers use it:
--     1. trigger on health_tournament_permission_approvals AFTER INSERT
--        — "filed" (also covers a college newly added by a squad amendment)
--     2. fn_health_tournament_nudge_stale_approvals() — the scheduled reminder
--     3. fn_health_tournament_nudge_approver() — the existing manual reminder
--
-- WHAT IS DELIBERATELY NOT HERE
--   Nothing in this file writes any approval status. D9 stands: a reminder is
--   the only remedy for a late decision, and a fabricated approval in the
--   record is worse than a late one. Every function below is notification-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The single notification writer for this feature.
--
-- Returns:  >0  reached that many approvers
--            0  NOBODY at that college holds health.sports.approve — the caller
--               decides whether that is fatal (manual nudge) or merely logged
--               (trigger / cron). Never silently treated as success.
--           -1  already said, same idempotency key — nothing sent.
--
-- Recipient rule is a VERBATIM copy of the one already in
-- fn_health_tournament_nudge_approver, so the reminder, the scheduled chase and
-- the on-file notice can never disagree about who the approver is.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_notify_college(
  p_permission_id   uuid,
  p_institution_id  uuid,
  p_reason          text,   -- 'filed' | 'reminder'
  p_idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.health_tournament_permissions%ROWTYPE;
  v_college  text;
  v_host     text;
  v_targets  uuid[];
  v_learners integer := 0;
  v_author   uuid;
  v_title    text;
  v_body     text;
  v_note_id  uuid;
BEGIN
  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- D10: a called-off trip is not awaiting anybody's decision.
  IF v_row.cancelled_at IS NOT NULL THEN
    RETURN -1;
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.notifications n
                  WHERE n.idempotency_key = p_idempotency_key) THEN
    RETURN -1;
  END IF;

  SELECT name INTO v_college FROM public.institutions WHERE id = p_institution_id;

  -- Whoever actually holds the approval permission at that college — resolved
  -- through user_roles (the supported multi-role model) AND the legacy
  -- profiles.role field, because a role assigned either way is a real holder.
  -- `->>` then ::boolean reads the VALUE: `permissions ? 'key'` would test mere
  -- EXISTENCE and report true for a key explicitly set to false.
  SELECT array_agg(DISTINCT p.id) INTO v_targets
    FROM public.profiles p
    JOIN public.custom_roles cr
      ON cr.is_active = true
     AND (cr.permissions->>'health.sports.approve')::boolean = true
     AND (
          EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p.id AND ur.role_id = cr.id)
          OR p.role = cr.role_key
         )
   WHERE p.institution_id = p_institution_id;

  IF v_targets IS NULL OR array_length(v_targets, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- How many of THIS college's learners are on the squad. The Principal must be
  -- able to act on the notification without opening the app first, and the only
  -- number that means anything to them is their OWN learner count — not the
  -- squad total, which spans colleges they have no authority over.
  --
  -- Same regex-guarded participant extraction as fn_health_tournament_sync_
  -- institutions: team_members is client-written jsonb, so a malformed
  -- learner_id must not raise inside a trigger on the filer's insert.
  WITH participants AS (
    SELECT v_row.learner_id AS learner_id
     WHERE v_row.learner_id IS NOT NULL
    UNION
    SELECT (m->>'learner_id')::uuid
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE(v_row.team_members, '[]'::jsonb)) = 'array'
                  THEN v_row.team_members ELSE '[]'::jsonb END) m
     WHERE jsonb_typeof(m) = 'object'
       AND m->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  SELECT count(DISTINCT lp.id) INTO v_learners
    FROM participants t
    JOIN public.learners_profiles lp ON lp.id = t.learner_id
   WHERE lp.institution_id = p_institution_id;

  -- D14: host_institution NULL means the event is held on a JKKN campus.
  v_host := COALESCE(NULLIF(btrim(COALESCE(v_row.host_institution, '')), ''), 'a JKKN campus');

  v_title := CASE WHEN p_reason = 'reminder'
                  THEN 'Reminder — squad permission still awaiting your decision'
                  ELSE 'Squad permission awaiting your decision' END;

  -- Names the tournament, the host, the dates and THIS college's learner count,
  -- so the decision can be taken from the notification itself.
  v_body := format(
    '%s (%s) hosted by %s, %s to %s. %s learner%s from %s %s named on this squad. '
    'They cannot travel until you approve or refuse for your college.',
    v_row.tournament_name,
    v_row.sport,
    v_host,
    to_char(v_row.start_date, 'DD Mon YYYY'),
    to_char(v_row.end_date,   'DD Mon YYYY'),
    v_learners,
    CASE WHEN v_learners = 1 THEN ''   ELSE 's'   END,
    COALESCE(v_college, 'your college'),
    CASE WHEN v_learners = 1 THEN 'is' ELSE 'are' END
  );

  -- notifications.created_by is NOT NULL. Prefer the person who filed; fall
  -- back to a system identity for the cron path, where auth.uid() is NULL.
  -- NEVER v_row.learner_id — that is a learners_profiles id, not a profiles id.
  v_author := v_row.filed_by_profile_id;
  IF v_author IS NULL THEN
    SELECT id INTO v_author FROM public.profiles
     WHERE is_super_admin = true ORDER BY created_at NULLS LAST LIMIT 1;
  END IF;
  IF v_author IS NULL THEN
    v_author := v_targets[1];
  END IF;

  -- WRITE 1 of 2 — the notification itself.
  INSERT INTO public.notifications (
    title, body, url, icon, priority, category, kind, idempotency_key,
    targeting, created_by, created_at, updated_at
  )
  VALUES (
    v_title,
    v_body,
    '/health/sports/approvals',
    'Trophy',
    CASE WHEN p_reason = 'reminder' THEN 'high' ELSE 'normal' END,
    'health',
    'work_item',                      -- a work item, not an announcement
    p_idempotency_key,
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_targets)),
    v_author,
    now(), now()
  )
  RETURNING id INTO v_note_id;

  -- WRITE 2 of 2 — THE ONE THAT ACTUALLY DELIVERS. Without this the row above
  -- is invisible in the bell to every one of these people.
  INSERT INTO public.user_notifications (notification_id, user_id, created_at)
  SELECT v_note_id, t, now() FROM unnest(v_targets) AS t
  ON CONFLICT DO NOTHING;

  RETURN array_length(v_targets, 1);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_notify_college(uuid, uuid, text, text) IS
  'The ONLY notification writer for tournament squad permission. Does BOTH required '
  'writes (notifications + user_notifications) — a notifications row alone reaches nobody, '
  'because nothing fans out targeting. Returns >0 reached, 0 = no approver holds '
  'health.sports.approve at that college, -1 = already sent / request cancelled. '
  'Writes no approval status of any kind.';

-- Internal helper: not callable by any client, only by the triggers and the two
-- reminder functions below (which run SECURITY DEFINER as the owner).
REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_notify_college(uuid, uuid, text, text)
  FROM anon, authenticated, PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. Filing notifies every participating college's Principal.
--
-- The trigger is on the CHILD table, not the parent, on purpose:
--   * the participating colleges are DERIVED by fn_health_tournament_sync_
--     institutions, so one row per college already exists by the time this
--     fires — one notification per college, never a broadcast;
--   * a college added LATER by a squad amendment (D8) gets its Principal
--     notified by the same code path, for free;
--   * it catches every current AND future writer of a filed request, including
--     the learner self-request form, not just the squad dialog.
--
-- It can never break the filing. A notification that fails to send is a warning
-- in the log; a squad request that fails to file is a Physical Director back on
-- paper. Same containment as fn_bridge_sh_notification_to_main.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_notify_on_new_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reached integer;
BEGIN
  BEGIN
    v_reached := public.fn_health_tournament_notify_college(
      NEW.permission_id,
      NEW.institution_id,
      'filed',
      'htp_filed:' || NEW.permission_id::text || ':' || NEW.institution_id::text
    );
    IF v_reached = 0 THEN
      -- Loud, not silent: a request nobody can be told about is the failure
      -- this whole migration exists to end (CLAUDE.md #27).
      RAISE WARNING '[htp notify] request % — nobody at institution % holds health.sports.approve, so filing told no one.',
        NEW.permission_id, NEW.institution_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[htp notify] request % college % failed: %',
      NEW.permission_id, NEW.institution_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_notify_on_new_approval()
  FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_htp_approvals_notify
  ON public.health_tournament_permission_approvals;
CREATE TRIGGER trg_htp_approvals_notify
  AFTER INSERT ON public.health_tournament_permission_approvals
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.fn_health_tournament_notify_on_new_approval();

-- -----------------------------------------------------------------------------
-- 3. The scheduled reminder, driven by /api/cron/health-sports-approval-nudge.
--
-- Mirrors fn_accreditation_narrative_reminders: SECURITY DEFINER, service_role
-- only, writes notifications + user_notifications, idempotent per college per
-- day. Safe to run repeatedly.
--
-- A request whose dates have already passed is NOT chased — there is nothing
-- left to decide, and a reminder about a trip that has been and gone trains
-- people to ignore the bell.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_nudge_stale_approvals(
  p_stale_hours int     DEFAULT 48,
  p_dry_run     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              record;
  v_today        text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  v_hours        int  := GREATEST(1, COALESCE(p_stale_hours, 48));
  v_due          int := 0;
  v_notified     int := 0;
  v_reached_tot  int := 0;
  v_no_approver  int := 0;
  v_already      int := 0;
  v_would        int := 0;
  v_failed       int := 0;
  v_reached      int;
BEGIN
  FOR r IN
    SELECT a.id, a.permission_id, a.institution_id
      FROM public.health_tournament_permission_approvals a
      JOIN public.health_tournament_permissions p ON p.id = a.permission_id
     WHERE a.status = 'pending'
       AND p.cancelled_at IS NULL
       -- nothing left to decide once the trip is over
       AND p.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
       -- give the Principal a fair window before the first chase
       AND a.created_at < now() - make_interval(hours => v_hours)
       AND (a.last_nudged_at IS NULL
            OR a.last_nudged_at < now() - make_interval(hours => v_hours))
     ORDER BY p.start_date ASC
  LOOP
    v_due := v_due + 1;

    IF p_dry_run THEN
      v_would := v_would + 1;
      CONTINUE;
    END IF;

    -- Per-college containment: one unnotifiable row must not abandon every
    -- other college in the run. A cron that dies on its first bad row is how a
    -- reminder loop silently stops working.
    BEGIN
      v_reached := public.fn_health_tournament_notify_college(
        r.permission_id, r.institution_id, 'reminder',
        'htp_nudge:' || r.permission_id::text || ':' || r.institution_id::text || ':' || v_today
      );

      IF v_reached > 0 THEN
        v_notified    := v_notified + 1;
        v_reached_tot := v_reached_tot + v_reached;
        -- fn_health_tournament_recompute_status sets myjkkn.htp_internal itself,
        -- but the flag is set here too so this UPDATE matches the shape the D9
        -- reminder already uses, and stays correct if that ever changes.
        PERFORM set_config('myjkkn.htp_internal', 'on', true);
        UPDATE public.health_tournament_permission_approvals
           SET last_nudged_at = now()
         WHERE id = r.id;
        PERFORM set_config('myjkkn.htp_internal', 'off', true);
      ELSIF v_reached = 0 THEN
        v_no_approver := v_no_approver + 1;
        RAISE WARNING '[htp nudge] request % — nobody at institution % holds health.sports.approve; reminder reached no one.',
          r.permission_id, r.institution_id;
      ELSE
        v_already := v_already + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Counted and logged, never swallowed into a clean-looking summary: the
      -- route reports `failed` so a persistent breakage is visible.
      v_failed := v_failed + 1;
      RAISE WARNING '[htp nudge] request % college % failed: %',
        r.permission_id, r.institution_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'due',            v_due,
    'notified',       v_notified,
    'approvers_reached', v_reached_tot,
    'no_approver',    v_no_approver,
    'already_sent',   v_already,
    'failed',         v_failed,
    'would_send',     v_would,
    'stale_hours',    v_hours,
    'dry_run',        COALESCE(p_dry_run, false)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_nudge_stale_approvals(int, boolean) IS
  'Scheduled reminder for squad permission requests still undecided after p_stale_hours. '
  'Idempotent per college per day; never chases a cancelled or already-finished trip; '
  'reports no_approver rather than pretending a reminder landed. Approves nothing.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_nudge_stale_approvals(int, boolean)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_nudge_stale_approvals(int, boolean)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Re-point the LIVE D9 manual reminder at the shared writer.
--
-- Every guard below is unchanged from 20260808112000 — same order, same
-- messages, same rate limit, same refusal to approve anything. The ONLY change
-- is that the notification is now written by fn_health_tournament_notify_college
-- (two writes) instead of the inline single INSERT that reached nobody.
--
-- Safe to CREATE OR REPLACE: production's live body was read back from pg_proc
-- and is byte-identical to the version in 20260808112000.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_nudge_approver(
  p_permission_id uuid,
  p_institution_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.health_tournament_permissions%ROWTYPE;
  v_approval  public.health_tournament_permission_approvals%ROWTYPE;
  v_college   text;
  v_reached   integer;
BEGIN
  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such tournament permission request.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only the person waiting on the decision may chase it.
  --
  -- The outer COALESCE is REQUIRED. `v_row.learner_id = get_my_learner_id()` is
  -- NULL for a team member (no learner row), `false OR NULL` is NULL, and
  -- `IF NOT NULL` DOES NOT EXECUTE — so without it the guard silently admits
  -- everyone it was written to exclude.
  IF NOT COALESCE(
       COALESCE(public.is_super_admin(), false)
       OR COALESCE(public.is_admin(), false)
       OR (v_row.filed_by_profile_id IS NOT NULL AND v_row.filed_by_profile_id = auth.uid())
       OR (v_row.learner_id IS NOT NULL AND v_row.learner_id = public.get_my_learner_id()),
       false) THEN
    RAISE EXCEPTION 'Only the person who filed this request can send a reminder about it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_approval
    FROM public.health_tournament_permission_approvals
   WHERE permission_id = p_permission_id AND institution_id = p_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That college is not part of this request.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'That college has already decided; there is nothing to remind them about.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_approval.last_nudged_at IS NOT NULL AND v_approval.last_nudged_at > now() - interval '12 hours' THEN
    RAISE EXCEPTION 'A reminder was already sent in the last 12 hours.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_college FROM public.institutions WHERE id = p_institution_id;

  v_reached := public.fn_health_tournament_notify_college(
    p_permission_id, p_institution_id, 'reminder',
    'htp_nudge:' || p_permission_id::text || ':' || p_institution_id::text || ':'
      || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
  );

  IF v_reached = 0 THEN
    -- Say so rather than reporting a reminder nobody received.
    RAISE EXCEPTION 'Nobody at % currently holds health.sports.approve, so a reminder would reach no one. Ask an administrator to assign an approver.',
      COALESCE(v_college, 'that college') USING ERRCODE = 'no_data_found';
  END IF;
  IF v_reached < 0 THEN
    RAISE EXCEPTION 'A reminder has already gone to % today.',
      COALESCE(v_college, 'that college') USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('myjkkn.htp_internal', 'on', true);
  UPDATE public.health_tournament_permission_approvals
     SET last_nudged_at = now()
   WHERE id = v_approval.id;
  PERFORM set_config('myjkkn.htp_internal', 'off', true);

  RETURN v_reached;
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) IS
  'D9: reminders are the remedy for a late decision — this function CANNOT approve anything '
  'and contains no write to any status column. Rate-limited to one reminder per college per '
  '12 hours, and it refuses (rather than silently reaching nobody) when no holder of '
  'health.sports.approve exists at that college. Since 20260808170000 the notification is '
  'written by fn_health_tournament_notify_college, which also fans out to user_notifications '
  '— without that second write the earlier version reached nobody at all.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Register the scheduled reminder with the AI-routine dispatcher.
--
-- NOT vercel.json: that file already carries 100 cron entries, which is the
-- plan ceiling — a 101st would risk failing every deployment, not just this
-- feature. The dispatcher (fired every 15 minutes from vercel.json) reads this
-- table, so the day and time stay editable from /admin/ai-routines with no
-- redeploy. Registry entry (triggerPath) lives in lib/ai-routines/misc-ai.ts;
-- the dispatcher looks the routine up by id.
--
-- 09:33 IST (573 minutes past midnight IST), daily. Safe to enable immediately:
-- with no filed requests the routine is an honest no-op, and once requests exist
-- it is idempotent per college per day.
-- -----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('health-sports-approval-nudge', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 573)
ON CONFLICT (routine_id) DO NOTHING;
