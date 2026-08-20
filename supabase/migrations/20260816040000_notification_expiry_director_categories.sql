-- ================================================================================
-- Notification expiry for the categories that actually make up the Director's
-- unread badge.
--
-- Created: 2026-08-09
-- Bodies below were captured VERBATIM from production `pg_get_functiondef`
--   (project kvizhngldtiuufknvehv, 2026-08-09) and edited ONLY at the lines
--   marked `-- 2026-08-09 expiry:`, plus exactly TWO non-expiry edits, both in
--   fn_generate_super_admin_daily_digest and both marked:
--     `-- 2026-08-09 REVIVAL:`     one executable line (see the ORDERING WARNING
--                                  on section 2 — shipping the broken body
--                                  verbatim would have made this file a time bomb
--                                  that silently reverts whoever fixes it first).
--     `-- 2026-08-09 COMMENT FIX:` comment only, no executable line. Deletes a
--                                  carried-in note that misdescribed the
--                                  ai_pulse_policies columns in both directions.
--
-- ✅ APPLIED TO PRODUCTION 2026-08-10 by hand (Management API, single batch,
--    myjkkn.apply_notification_expiry_ddl='yes'), NOT via the blanket-push
--    workflow. Recorded in supabase_migrations.schema_migrations as
--    ('20260816040000','notification_expiry_director_categories').
--    Verified afterwards by catalog read, not by an empty API response:
--    fn_create_dashboard_work_item pronargs 8 -> 9 with p_expires_hours, and
--    the three generators now pass a 36h TTL. Everything below is history; do
--    not re-run it, and do not edit the executable SQL in this file — prod
--    already carries these bodies and an edit here would silently diverge from
--    it. Comments may be corrected.
--
-- ############################################################################
-- ##  APPLY-TIME CONSTRAINT -- READ BEFORE RUNNING ANYTHING                 ##
-- ############################################################################
-- The repo's only apply mechanism (.github/workflows/supabase-migration-apply.yml)
-- is a blanket `supabase db push`: it applies EVERY pending migration in version
-- order, not just this one. The local ledger is diverged, so that run would also
-- drag in 20260803080000_backfill_expire_stale_broadcast_notifications.sql (an
-- earlier unapplied 'DO NOT AUTO-APPLY' backfill whose data UPDATE has no guard
-- of any kind) and whatever else is pending.
--
-- THIS FILE IS GUARDED. The DO $gate$ block below raises unless
-- myjkkn.apply_notification_expiry_ddl='yes', and it sits BEFORE the first DDL
-- statement, so a blanket `supabase db push` aborts here and applies nothing
-- from this file. (An earlier revision of this header said the opposite; that
-- text predated the gate and was stale. Corrected 2026-08-10.)
--
-- The gate exists because this file is more than a TTL tweak: it replaces five
-- function bodies AND revives fn_generate_super_admin_daily_digest, dead on prod
-- since 2026-05-08. Reviving it restarts a daily emitter -- measured inside
-- BEGIN..ROLLBACK on 2026-08-09 the revived function creates 129 rows for one
-- day (each with a 36h TTL); over its last eight days alive
-- (2026-05-01..2026-05-08) it emitted 46-49 rows/day. That is a deliberate
-- change in traffic, not a side effect, which is why it is Director-gated.
--
-- Note the gate does NOT protect the rest of the ledger: 20260803080000 sorts
-- BEFORE this file and carries no guard of its own, so a blanket push still runs
-- that one first, before this file can abort the push.
--
-- To apply THIS file alone, hand-run its contents once via Supabase Studio's SQL
-- editor (or the Management API) against project kvizhngldtiuufknvehv, then record
-- it in supabase_migrations.schema_migrations so a later `db push` skips it:
--     INSERT INTO supabase_migrations.schema_migrations (version, name)
--     VALUES ('20260816040000', 'notification_expiry_director_categories')
--     ON CONFLICT DO NOTHING;
-- Do NOT reach for the workflow to "just apply migration 1".
--
-- --------------------------------------------------------------------------------
-- WHY
-- --------------------------------------------------------------------------------
-- The Director's installed PWA shows 680 unread. Measured on production
-- 2026-08-09 for profiles.email='director@jkkn.ac.in': 678 of those 680 rows
-- have notifications.expires_at IS NULL, the oldest dating to 2026-04-23. The
-- two exceptions are the daily-intel pair, which already carry a future expiry.
--
-- The read path already honours expires_at (liveNotificationOrFilter() in
-- lib/services/notification/notification-service.ts, applied to
-- getNotificationCounts / getNotifications / getNotificationEventRollups), but
-- the only generators that ever SET expires_at are three learner-facing crons
-- (dashboard:scf_nudge, doctrines:friday-reflection, doctrines:sunday-wrap).
-- None of the Director's 680 come from those. Everything else accumulates
-- forever.
--
-- --------------------------------------------------------------------------------
-- WHAT IS EXPIRED HERE, AND WHAT IS DELIBERATELY NOT
-- --------------------------------------------------------------------------------
-- The rule applied: a row is given a TTL only when the SAME underlying fact is
-- re-announced on a fixed cycle under a per-day idempotency key. Expiring such a
-- row hides nothing -- tomorrow's edition restates it, and the real work lives
-- in a queue page, not in the notification. A row that is the ONLY record of a
-- specific un-actioned item is left alone, even though leaving it keeps the
-- badge number higher.
--
--   EXPIRED (self-obsoleting, re-emitted daily under a per-day key)
--   * every `Daily digest --- ...` row from fn_generate_super_admin_daily_digest
--     (dashboard:escalation / rescue / approval / anomaly / ai_pulse).
--     Idempotency key is 'digest:<user>:<category>:<YYYY-MM-DD>'. TTL 36h.
--   * dashboard:hr_brief, the daily HR Command Center brief. Key is
--     'hr_brief:<user>:<YYYY-MM-DD>'. The function already declares a 20h
--     acknowledgment deadline. TTL 36h. Generator patched in section 5 -- without
--     that the backfill would have cleared 34 rows and then let ~1 unexpiring row
--     per recipient per day start accruing again.
--   * dashboard:anomaly per-timetable 'Attendance not marked today --- X'. The
--     claim is scoped to CURRENT_DATE and the generator's own config already
--     declares "ttl_hours": 8. A 2026-04-23 copy of it is not actionable. TTL 36h,
--     deliberately more generous than the generator's own declared intent.
--     NOTE: this one does NOT satisfy the "same fact re-announced" rule -- see
--     the long note on section 3 for the justification it stands on instead, and
--     for the config key that switches it off without a deploy. THIS FILE is
--     forward-only: it changes nothing about rows that already exist. The
--     existing 42,772 per-timetable rows are expired by the companion backfill
--     20260816040100 under an explicit Director decision recorded in that file's
--     header -- the Director was shown, and accepted, that afterwards those
--     rows (the fan-out of 5,258 distinct (timetable, day) unmarked sessions
--     over 110 days) are visible nowhere in the product but /notifications/admin.
--   * accreditation narrative nudge + escalation. Keys are
--     'accred_narr_nudge:<narrative>:<YYYY-MM-DD>' and 'accred_narr_esc:...'.
--     Measured on production: the Director's 187 unread accreditation rows
--     represent only 46 distinct narratives (12 nudged + 34 escalated) restated
--     every day for 7-11 days. The work list is /accreditation/naac/narratives.
--     TTL 36h.
--
--   NOT EXPIRED (a genuine, individually un-actioned item)
--   * dashboard:approval emitted per item --- pending leave requests
--     (fn_generate_pending_leave_approval_items), recruitment and service-request
--     approvals, and 'Verdict: WRONG' / 'Manual verdict required' rows from
--     fn_decision_outcome_check. Those functions are untouched. Three of the
--     Director's 16 dashboard:approval rows are real pending leave approvals and
--     two are real decision verdicts; they stay in the badge.
--   * dashboard:rescue emitted per lead or per bug
--     (fn_generate_stale_lead_rescue_items, fn_generate_unresolved_bug_items).
--     Untouched. Two of the Director's 15 are 'Bug BUG-0032xx aging 110d'.
--   * missing_data:gap-escalated (6) and attendance:breach-escalated (4) ---
--     'Review meeting warranted --- <college>'. These are escalations, not digests.
--   * rcltp (3) --- decisions stalled two weeks. Genuine.
--   * accreditation capout notices (7, source
--     'accreditation-narrative-capout-cron') --- one row per narrative, not
--     re-emitted. Genuine.
--
-- Why 36h and not 24h: these are all daily emitters, so 24h leaves no margin at
-- all -- the row dies at the same moment its replacement is due, and any slip
-- empties the bell. 36h is 1.5x the cycle, which buys tolerance of a LATE run
-- (up to 12h of slip still overlaps the previous row) while capping the stack at
-- 2 instead of letting it grow without bound. It does NOT cover a fully SKIPPED
-- day: successful emissions would then be 48h apart while the surviving row dies
-- at 36h, leaving a ~12h window with no live row. Surviving a skipped day needs
-- >= 2x the cycle. The accepted consequence is a bounded, at-most-12h under-count
-- of the badge on a day the cron did not run at all. For the digest,
-- accreditation and hr_brief families that costs nothing -- the work itself lives
-- on a queue page and the notification is only a pointer to it. It is NOT free
-- for the unmarked-attendance rows, whose only surface for a past day IS the
-- notification; that trade-off is the subject of the HONEST SCOPE note on
-- section 3 and of the Director decision recorded in the companion backfill.
--
-- Why a LITERAL 36 is safe here but not in the loop crons (review, 2026-08-09).
-- A hardcoded TTL is only sound while it cannot be silently outrun by a cadence
-- change. Every cadence behind THIS file is deploy-gated in vercel.json --
--   super-admin-digest              '3 3 * * *'   (daily)
--   accreditation-narrative-reminders '12 3 * * *' (daily)
--   dashboard-work-items            '7 * * * *'   (hourly sweep; the hr_brief and
--                                                  unmarked-attendance generators
--                                                  are keyed per DAY inside it)
-- -- so slowing one of them down requires editing the same repo, in the same
-- deploy, that carries these TTLs; the margin cannot invert behind your back. The
-- two loop crons are the opposite case: their schedules live in
-- ai_routine_schedules and are editable on /admin/ai-routines with no deploy, so
-- app/api/cron/loop-*/route.ts now DERIVE the TTL from their own dispatcher row
-- (staleThresholdMs) instead of hardcoding it. Same reasoning applies to the
-- companion backfill's Instagram bucket, which reads ig.silence_realert_days
-- live rather than assuming 7.
--
-- --------------------------------------------------------------------------------
-- MECHANISM
-- --------------------------------------------------------------------------------
-- fn_create_dashboard_work_item gains a NINTH parameter, p_expires_hours, which
-- DEFAULTS TO NULL. NULL means "no expiry" --- i.e. every one of the twelve
-- existing callers that passes eight arguments keeps its current behaviour
-- exactly. Only the call sites edited below opt in.
--
-- p_deadline_hours is NOT reused for this. It writes
-- notifications.acknowledgment_deadline_hours (an acknowledgment SLA) and is set
-- to 168h / emergency-dependent values on genuine approval items; binding expiry
-- to it would silently expire real work.
--
-- Nothing is deleted. Admin/manage/stats read paths deliberately do NOT apply
-- the expiry filter, so every row below stays auditable at /notifications/admin.
-- ================================================================================

-- --------------------------------------------------------------------------------
-- 0. GATE. This file does not apply itself.
-- --------------------------------------------------------------------------------
-- Unless myjkkn.apply_notification_expiry_ddl = 'yes' is set in the session, the
-- statement below ABORTS the migration. A blanket `supabase db push` runs with it
-- unset, so it cannot apply the DROP FUNCTION, the five function bodies, or the
-- digest revival without someone deciding to.
--
-- Why this one RAISES rather than quietly returning (the companion backfill does
-- the opposite): a no-op here would let db push record 20260816040000 in
-- supabase_migrations.schema_migrations while the function bodies were never
-- replaced -- a ledger that says "applied" over a database where nothing changed,
-- which is worse than a loud refusal. Failing keeps the ledger honest.
--
-- The companion backfill 20260816040100 is a DATA migration and takes the other
-- branch: it no-ops so a stray push cannot stamp 44,855 rows. Known consequence,
-- stated plainly: a blanket push WILL record that version as applied even though
-- the rows were not touched, so the hand-apply recipe in that file's header stays
-- the way it runs -- paste the body, do not reach for db push afterwards.
--
-- Neither gate makes the apply WORKFLOW safe. It is a blanket push over a diverged
-- ledger; 20260803080000_backfill_expire_stale_broadcast_notifications.sql sorts
-- BEFORE both of these files and has no guard at all, so it would already have run
-- by the time this statement raises.
--
-- To apply this file by hand:
--     SET myjkkn.apply_notification_expiry_ddl = 'yes';
--     <paste the rest of this file>
--     RESET myjkkn.apply_notification_expiry_ddl;
DO $gate$
BEGIN
  IF current_setting('myjkkn.apply_notification_expiry_ddl', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'migration 20260816040000 is Director-gated and was NOT applied'
      USING HINT = 'Set myjkkn.apply_notification_expiry_ddl to yes first. This file replaces five function bodies AND revives fn_generate_super_admin_daily_digest, dead on prod since 2026-05-08.';
  END IF;
END
$gate$;

-- --------------------------------------------------------------------------------
-- 1. fn_create_dashboard_work_item --- add opt-in p_expires_hours (DEFAULT NULL)
-- --------------------------------------------------------------------------------
-- DROP first: CREATE OR REPLACE cannot change a function's argument list, and
-- leaving the 8-arg version in place alongside a 9-arg one would make every
-- existing 8-argument call ambiguous.
DROP FUNCTION IF EXISTS public.fn_create_dashboard_work_item(text,text,text,text,jsonb,uuid,text,integer);

CREATE OR REPLACE FUNCTION public.fn_create_dashboard_work_item(p_category text, p_priority text, p_title text, p_body text, p_action_config jsonb, p_target_user uuid, p_idempotency_key text, p_deadline_hours integer DEFAULT 48,
-- 2026-08-09 expiry: NEW, opt-in. NULL (the default) reproduces today's
-- behaviour exactly for all twelve existing callers.
 p_expires_hours integer DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_notif_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM notifications WHERE idempotency_key = p_idempotency_key) THEN
    RETURN 0;
  END IF;
  INSERT INTO notifications (
    id, title, body, category, kind, priority, requires_acknowledgment,
    acknowledgment_deadline_hours, action_type, action_config, idempotency_key,
    created_by, targeting, created_at, updated_at,
    is_layer_0,
    -- 2026-08-09 expiry: honoured by liveNotificationOrFilter() in the bell /
    -- inbox / rollup read path. NULL = never expires (unchanged default).
    expires_at
  ) VALUES (
    -- 2026-04-23 decoupling: requires_acknowledgment=FALSE so work items don't
    -- trigger the Mandatory Acknowledgment blocking modal. Queue filter uses
    -- category only.
    -- 2026-04-24 split: kind='work_item' keeps these out of /admin/notifications
    -- (which filters to kind='announcement'). Work items surface via dashboard
    -- widgets + super-admin digest instead.
    -- Wave B.4 (2026-04-29): is_layer_0 is the new dedicated Attention Bar
    -- Layer 0 signal. Setting it for urgent priorities makes the bar's
    -- split-rendering path eligible to surface this work item, without
    -- coupling to the gate's ack semantics.
    gen_random_uuid(), p_title, p_body, p_category, 'work_item', p_priority, FALSE,
    p_deadline_hours, 'open_url', p_action_config, p_idempotency_key,
    p_target_user, jsonb_build_object('type','user','user_ids', jsonb_build_array(p_target_user)),
    NOW(), NOW(),
    (p_priority = 'urgent'),
    CASE WHEN p_expires_hours IS NULL THEN NULL
         ELSE NOW() + make_interval(hours => p_expires_hours) END
  ) RETURNING id INTO v_notif_id;
  INSERT INTO user_notifications (id, notification_id, user_id, created_at)
  VALUES (gen_random_uuid(), v_notif_id, p_target_user, NOW());
  RETURN 1;
END
$function$;

-- Production ACL for this function is postgres + service_role only (verified
-- 2026-08-09). Re-assert it after the DROP; the explicit anon revoke is required
-- because Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- function to anon and to authenticated.
REVOKE ALL ON FUNCTION public.fn_create_dashboard_work_item(text,text,text,text,jsonb,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_dashboard_work_item(text,text,text,text,jsonb,uuid,text,integer,integer) TO service_role;

-- --------------------------------------------------------------------------------
-- 2. fn_generate_super_admin_daily_digest --- 36h TTL on all seven digest rows
--    + the one-line REVIVAL of a function dead on prod since 2026-05-08
-- --------------------------------------------------------------------------------
-- Every call site in this function builds a row titled 'Daily digest --- N ...'
-- under the key 'digest:<user>:<category>:<YYYY-MM-DD>'. All seven are the same
-- shape and all seven already declare a 24h acknowledgment deadline.
--
-- ############################################################################
-- ##  ORDERING WARNING -- THIS BODY IS NOT THE ONE RUNNING ON PROD          ##
-- ############################################################################
-- The production body carries a dead column reference, `se.event_type`, in the
-- Category 5 (dashboard:ai_pulse) block. public.startup_events has no such
-- column (information_schema, 2026-08-09), so the statement raises 42703 the
-- moment the loop reaches its first super-admin -- which aborts the whole call
-- and rolls back every digest row the earlier categories built. That is why the
-- newest 'digest:%' notification on prod is dated 2026-05-08 while the cron
-- (vercel.json '3 3 * * *') has fired every day since.
--
-- MEASURED, production, BEGIN..ROLLBACK, 2026-08-09 (prod re-verified unchanged
-- afterwards -- 8-arg signature intact, digest row count still 687):
--   * body EXACTLY as it stands on prod  -> ERROR 42703 'column se.event_type
--     does not exist', PL/pgSQL line 207.
--   * same body with the dead disjunct removed -> returns 129 (rows it would
--     have created), no error.
--
-- Shipping the prod body verbatim would have frozen that bug into two files. A
-- later PR that fixes it, applied BEFORE this one, would then be silently
-- reverted -- CREATE OR REPLACE does not validate a plpgsql body, so the dead
-- reference would come back with no error and the digest would die again.
-- So the fix is CARRIED here rather than copied around, marked `2026-08-09
-- REVIVAL`. It is a one-line deletion: the two surviving disjuncts
-- (config->>'kind' and config->'ai_pulse') already express the same intent.
--
-- IF YOU ARE THE OTHER PR: this file already contains the fix. Do not apply an
-- older copy of fn_generate_super_admin_daily_digest after this one, and do not
-- re-add `se.event_type`. The same warning sits above the same function in
-- supabase/setup/02_functions.sql.
--
-- CONSEQUENCE OF APPLYING THIS FILE: the super-admin daily digest starts
-- producing rows again every day -- 129 for the day measured 2026-08-09, and
-- 46-49/day over its last eight days alive (2026-05-01..2026-05-08), all
-- with a 36h TTL. That is the intended repair, but it is a behaviour change on
-- top of the TTL work and the Director should be told it is in the same apply.
-- It also cannot be rolled back independently of the TTL work: both live in this
-- one CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.fn_generate_super_admin_daily_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_total INT;
  v_breakdown TEXT;
  v_body TEXT;
  v_emit_escalation BOOLEAN;
  v_emit_rescue BOOLEAN;
  v_emit_approval BOOLEAN;
  v_emit_anomaly BOOLEAN;
  v_last_cycle_id       UUID;
  v_enrolled_teams      INT;
  v_engaged_teams       INT;
  v_engagement_pct      NUMERIC(5,1);
  v_anomaly_count       INT;
  v_gold_count          INT;
  v_red_flag_depts      TEXT;
  v_red_flag_count      INT;
  v_quiz_pass_threshold INT;
  v_escalation_t2_pct   NUMERIC(5,1);
  v_ai_pulse_active     BOOLEAN;
  v_ai_pulse_parts      TEXT[];
BEGIN
  FOR v_user IN
    SELECT id, role, is_super_admin
    FROM profiles
    WHERE is_super_admin = TRUE
       OR role IN ('ceo','cao','cbo','executive_admin_officer','registrar',
                   'hr_admin','system_admin','admission_counselor','expo_counselor',
                   'admission_staff','accountant_assistant')
  LOOP
    v_emit_escalation := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cbo','accountant_assistant');
    v_emit_rescue     := v_user.is_super_admin
                      OR v_user.role IN ('cbo','admission_counselor','expo_counselor','admission_staff');
    v_emit_approval   := v_user.is_super_admin
                      OR v_user.role IN ('ceo','cao','executive_admin_officer','registrar','hr_admin');
    v_emit_anomaly    := v_user.is_super_admin
                      OR v_user.role IN ('cao','registrar','system_admin');

    -- Category 1: dashboard:escalation
    IF v_emit_escalation THEN
      WITH counts AS (
        SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
        FROM billing_invoices bi
        JOIN institutions i ON bi.institution_id = i.id
        WHERE bi.due_date < CURRENT_DATE - INTERVAL '30 days' AND bi.grand_total > 0
          AND COALESCE((SELECT SUM(br.payment_amount) FROM billing_receipts br
                        WHERE br.student_id = bi.student_id
                          AND br.receipt_date >= bi.billing_period_from), 0) < bi.grand_total
        GROUP BY i.id, i.name
      )
      SELECT COALESCE(SUM(cnt), 0),
             STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
      INTO v_total, v_breakdown FROM counts;
      IF v_total > 0 THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:escalation:' || v_today;
        v_body := v_total || ' overdue invoice(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:escalation', 'high',
          'Daily digest — ' || v_total || ' overdue invoice(s)',
          v_body,
          jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aescalation',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
      END IF;
    END IF;

    -- Category 2: dashboard:rescue
    IF v_emit_rescue THEN
      WITH counts AS (
        SELECT REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '') AS inst, COUNT(*) AS cnt
        FROM admission_leads al
        JOIN institutions i ON al.institution_id = i.id
        WHERE COALESCE(al.last_activity_at, al.created_at) < NOW() - INTERVAL '24 hours'
          AND COALESCE(al.last_activity_at, al.created_at) > NOW() - INTERVAL '30 days'
        GROUP BY i.id, i.name
      )
      SELECT COALESCE(SUM(cnt), 0),
             STRING_AGG(inst || ': ' || cnt, ', ' ORDER BY cnt DESC)
      INTO v_total, v_breakdown FROM counts;
      IF v_total > 0 THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:rescue:' || v_today;
        v_body := v_total || ' stale lead(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:rescue', 'normal',
          'Daily digest — ' || v_total || ' stale lead(s)',
          v_body,
          jsonb_build_object('url', '/admission/leads?stale_min_days=30',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
      END IF;
    END IF;

    -- Category 3: dashboard:approval
    IF v_emit_approval THEN
      WITH leave_counts AS (
        SELECT 'leaves' AS src, COUNT(*) AS cnt
        FROM hr_leave_applications la
        WHERE la.status = 'pending' AND la.created_at < NOW() - INTERVAL '48 hours'
          AND la.created_at > NOW() - INTERVAL '30 days' AND la.superseded_by IS NULL
      ),
      recruit_counts AS (
        SELECT 'recruitment' AS src, COUNT(*) AS cnt
        FROM hr_recruitment_candidates
        WHERE status = 'pending_approval' AND submitted_at < NOW() - INTERVAL '24 hours'
          AND submitted_at > NOW() - INTERVAL '90 days'
      ),
      sr_counts AS (
        SELECT 'service_requests' AS src, COUNT(*) AS cnt
        FROM service_requests sr
        WHERE sr.status::text IN ('submitted','in_review','returned')
          AND COALESCE(sr.submitted_at, sr.created_at) < NOW() - INTERVAL '24 hours'
          AND COALESCE(sr.submitted_at, sr.created_at) > NOW() - INTERVAL '180 days'
      ),
      all_counts AS (
        SELECT src, cnt FROM leave_counts WHERE cnt > 0
        UNION ALL SELECT src, cnt FROM recruit_counts WHERE cnt > 0
        UNION ALL SELECT src, cnt FROM sr_counts WHERE cnt > 0
      )
      SELECT COALESCE(SUM(cnt), 0),
             STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
      INTO v_total, v_breakdown FROM all_counts;
      IF v_total > 0 THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:approval:' || v_today;
        v_body := v_total || ' approval(s) pending. ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:approval', 'normal',
          'Daily digest — ' || v_total || ' approval(s) pending',
          v_body,
          jsonb_build_object('url', '/admin/notifications?category=dashboard%3Aapproval',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
      END IF;
    END IF;

    -- Category 4: dashboard:anomaly
    IF v_emit_anomaly THEN
      WITH attn AS (
        SELECT 'unmarked_attendance' AS src, COUNT(*) AS cnt
        FROM timetables t
        WHERE t.is_active = TRUE AND t.start_date <= CURRENT_DATE
          AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
          AND NOT EXISTS (SELECT 1 FROM student_attendance sa
            WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
          AND EXISTS (SELECT 1 FROM student_attendance sa2
            WHERE sa2.timetable_id = t.id
              AND sa2.attendance_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '1 day')
      ),
      bugs AS (
        SELECT 'untriaged_bugs' AS src, COUNT(*) AS cnt
        FROM bug_reports
        WHERE status = 'new'
          AND created_at < NOW() - INTERVAL '72 hours'
          AND created_at > NOW() - INTERVAL '180 days'
          AND COALESCE(metadata->'triage'->>'tag', '')
            NOT IN ('not_a_bug','duplicate','content_only','obsolete','feature_request')
      ),
      all_anomaly AS (
        SELECT src, cnt FROM attn WHERE cnt > 0
        UNION ALL SELECT src, cnt FROM bugs WHERE cnt > 0
      )
      SELECT COALESCE(SUM(cnt), 0),
             STRING_AGG(src || ': ' || cnt, ', ' ORDER BY cnt DESC)
      INTO v_total, v_breakdown FROM all_anomaly;
      IF v_total > 0 THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:anomaly:' || v_today;
        v_body := v_total || ' anomaly signal(s). ' || COALESCE(v_breakdown, '') || '.';
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:anomaly', 'normal',
          'Daily digest — ' || v_total || ' anomaly signal(s)',
          v_body,
          jsonb_build_object('url', '/academic/attendance/dashboard',
            'digest', true, 'total', v_total),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
      END IF;
    END IF;

    -- Category 5: dashboard:ai_pulse (super_admin only)
    IF v_user.is_super_admin THEN
      v_ai_pulse_active := EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_pulse_policies'
      );

      IF NOT v_ai_pulse_active THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:pending:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', 'low',
          'AI Pulse — module not yet active',
          'AI Pulse Wave A.1 (PR #644) has not merged yet. No cycle data available.',
          jsonb_build_object('url', '/ai-pulse', 'digest', true, 'active', false,
            'reason', 'No AI Pulse cycle data yet'),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
        CONTINUE;
      END IF;

      SELECT se.id INTO v_last_cycle_id
      FROM startup_events se
      -- 2026-08-09 REVIVAL: `se.event_type = 'ai_pulse'` removed from this
      -- disjunction. startup_events has no event_type column, so the prod body
      -- raised 42703 here and killed the whole digest (last row 2026-05-08).
      -- The two remaining disjuncts carry the same intent. Do NOT re-add it.
      WHERE (
              (se.config->>'kind') = 'ai_pulse'
           OR (se.config->'ai_pulse') IS NOT NULL
        )
        AND se.status IN ('closed', 'completed')
      ORDER BY se.end_date DESC NULLS LAST, se.created_at DESC
      LIMIT 1;

      IF v_last_cycle_id IS NULL THEN
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:no_cycle:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', 'low',
          'AI Pulse — no completed cycle yet',
          'AI Pulse module is active but no cycle has reached "completed" status yet.',
          jsonb_build_object('url', '/ai-pulse/admin/cycles', 'digest', true,
            'active', true, 'reason', 'No completed AI Pulse cycle found'),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
        CONTINUE;
      END IF;

      -- 2026-08-09 COMMENT FIX: the note that stood here claimed this block
      -- "queries policy_key/value" while the real columns are
      -- config_key/value_jsonb, and would "silently fail at runtime". Both halves
      -- were wrong. Verified on production 2026-08-09: ai_pulse_policies HAS
      -- config_key, value_jsonb and is_active, which is exactly what the two
      -- SELECTs below use -- so the code is correct; and an undefined column
      -- would raise 42703, not fail silently. The note was carried in from the
      -- captured body and caused a review panel to raise a false HIGH, so it is
      -- deleted rather than reproduced. No executable line changed here.
      SELECT COALESCE(
        (SELECT (value_jsonb->>'value')::int
         FROM ai_pulse_policies
         WHERE config_key = 'quiz_pass_threshold_live'
           AND is_active = TRUE
         LIMIT 1),
        60
      ) INTO v_quiz_pass_threshold;

      SELECT COALESCE(
        (SELECT (value_jsonb->>'value')::numeric
         FROM ai_pulse_policies
         WHERE config_key = 'escalation_t2_percent'
           AND is_active = TRUE
         LIMIT 1),
        100
      ) INTO v_escalation_t2_pct;

      SELECT COALESCE(COUNT(*), 0) INTO v_enrolled_teams
      FROM event_registrations er
      WHERE er.event_id = v_last_cycle_id
        AND er.status != 'disqualified';

      SELECT COALESCE(COUNT(DISTINCT eta.registration_id), 0) INTO v_engaged_teams
      FROM event_team_attendance eta
      WHERE eta.event_id = v_last_cycle_id
        AND (
          (eta.day_type = 'live_session'
           AND (eta.engagement_signals->>'quiz_score')::int >= v_quiz_pass_threshold)
          OR
          (eta.day_type = 'async_makeup'
           AND (eta.engagement_signals->>'async_passed')::boolean IS TRUE)
        );

      v_engagement_pct := CASE
        WHEN v_enrolled_teams = 0 THEN 0
        ELSE ROUND((v_engaged_teams::numeric / v_enrolled_teams::numeric) * 100, 1)
      END;

      SELECT COALESCE(COUNT(*), 0) INTO v_anomaly_count
      FROM ai_pulse_anomaly_flags apaf
      WHERE (apaf.review_outcome IS NULL OR apaf.review_outcome = 'pending')
        AND apaf.created_at > NOW() - INTERVAL '7 days';

      SELECT COALESCE(COUNT(*), 0) INTO v_gold_count
      FROM event_submissions es
      WHERE es.event_id = v_last_cycle_id
        AND es.proof_urls IS NOT NULL
        AND jsonb_array_length(es.proof_urls) > 0;

      v_red_flag_count := 0;
      v_red_flag_depts := NULL;

      SELECT
        COUNT(*) AS dept_count,
        STRING_AGG(
          REPLACE(REPLACE(i.name, 'JKKN College of ', ''), 'JKKN ', '')
            || ': ' || missed_teams || '/' || total_teams || ' missed',
          '; '
          ORDER BY (missed_teams::numeric / NULLIF(total_teams,0)) DESC
        )
      INTO v_red_flag_count, v_red_flag_depts
      FROM (
        SELECT
          er.institution_id,
          COUNT(*) AS total_teams,
          COUNT(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM event_submissions es
            WHERE es.event_id = v_last_cycle_id
              AND es.registration_id = er.id
          )) AS missed_teams
        FROM event_registrations er
        WHERE er.event_id = v_last_cycle_id
          AND er.status != 'disqualified'
        GROUP BY er.institution_id
        HAVING COUNT(*) > 0
      ) dept_stats
      JOIN institutions i ON i.id = dept_stats.institution_id
      WHERE dept_stats.total_teams > 0
        AND (dept_stats.missed_teams::numeric / dept_stats.total_teams::numeric) * 100
            >= v_escalation_t2_pct;

      v_ai_pulse_parts := ARRAY[]::TEXT[];

      v_ai_pulse_parts := v_ai_pulse_parts || (
        'Engagement: ' || v_engaged_teams || '/' || v_enrolled_teams
        || ' teams (' || v_engagement_pct || '%)'
      );

      IF v_red_flag_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          'Red-flag institutions (' || v_red_flag_count || '): ' || COALESCE(v_red_flag_depts, '')
        );
      END IF;

      IF v_anomaly_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          v_anomaly_count || ' unreviewed anomaly flag(s) this week'
        );
      END IF;

      IF v_gold_count > 0 THEN
        v_ai_pulse_parts := v_ai_pulse_parts || (
          v_gold_count || ' Gold Standard candidate(s) this cycle'
        );
      END IF;

      v_body := ARRAY_TO_STRING(v_ai_pulse_parts, '. ') || '.';

      DECLARE
        v_pulse_priority TEXT := CASE
          WHEN v_engagement_pct < 70 OR v_red_flag_count > 0 THEN 'high'
          ELSE 'normal'
        END;
      BEGIN
        v_key := 'digest:' || v_user.id::text || ':dashboard:ai_pulse:' || v_today;
        v_created := v_created + fn_create_dashboard_work_item(
          'dashboard:ai_pulse', v_pulse_priority,
          'AI Pulse digest — ' || v_engagement_pct || '% engaged (' || v_enrolled_teams || ' teams)',
          v_body,
          jsonb_build_object(
            'url', '/ai-pulse/admin/cycles', 'digest', true, 'active', true,
            'cycle_id', v_last_cycle_id, 'enrolled_teams', v_enrolled_teams,
            'engaged_teams', v_engaged_teams, 'engagement_pct', v_engagement_pct,
            'anomaly_flag_count', v_anomaly_count, 'gold_standard_count', v_gold_count,
            'red_flag_institution_count', v_red_flag_count
          ),
          v_user.id, v_key, 24,
          36); -- 2026-08-09 expiry: 36h, 1.5x the daily cycle
      END;
    END IF;
  END LOOP;
  RETURN v_created;
END $function$;


-- CREATE OR REPLACE preserves existing grants, but assert them anyway: Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to anon AND to
-- authenticated, so an explicit revoke is the only thing keeping this cron-only
-- generator off the public anon key. Production ACL verified 2026-08-09:
-- postgres + service_role only.
REVOKE EXECUTE ON FUNCTION public.fn_generate_super_admin_daily_digest() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_generate_super_admin_daily_digest() TO service_role;

-- --------------------------------------------------------------------------------
-- 3. fn_generate_unmarked_attendance_items --- 36h TTL, config-overridable
-- --------------------------------------------------------------------------------
-- 'Attendance not marked today --- X' is scoped to CURRENT_DATE and re-keyed daily
-- ('unmarked_attendance:<timetable>:<date>:<user>'). The generator already
-- declares "ttl_hours": 8; expires_hours is a separate, more generous key so the
-- existing acknowledgment deadline is not disturbed.
--
-- HONEST SCOPE OF THIS ONE (review, 2026-08-09). Unlike the other three, this
-- row is NOT a restatement: the key embeds the DATE, so 'timetable T was unmarked
-- on date D' is announced EXACTLY ONCE and tomorrow's row is a different fact.
-- It therefore does NOT satisfy the "same fact re-announced daily" rule this
-- migration otherwise applies, and the justification has to stand on its own:
--   * the row's own text is 'not marked TODAY ... as of 11am' -- a claim that is
--     literally false 36 hours later, and its action URL
--     (/academic/attendance/dashboard?timetable=<id>) carries no date, so an old
--     copy cannot even navigate you to the day it is about;
--   * the durable record of the gap is the ABSENCE of student_attendance rows,
--     not the notification;
--   * after the TTL the row is still fully visible at /notifications/admin --
--     only the bell/inbox read path applies liveNotificationOrFilter().
-- The cost, stated plainly: past days' unmarked sessions become invisible in the
-- bell, and the only live query, fn_aqs_attendance_unmarked_periods_today, is
-- CURRENT_DATE-only, so there is no other in-app surface for history.
-- It is therefore REVERSIBLE WITHOUT A DEPLOY: set the generator config key
-- unmarked_attendance.expires_hours to 0 and rows stop expiring (0 maps to NULL
-- below). The 42,772 historical rows of this category are a separate question,
-- and it was decided by the Director on 2026-08-09, not by code: expire them,
-- accepting that afterwards they are visible nowhere in the product but
-- /notifications/admin. The companion backfill 20260816040100 carries that
-- decision and its full wording.
CREATE OR REPLACE FUNCTION public.fn_generate_unmarked_attendance_items()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created INT := 0; v_tt RECORD; v_target RECORD; v_key TEXT;
  -- Wave B.2: config-driven constants
  v_cfg JSONB;
  v_category TEXT;
  v_time_gate_ist_hour INT;
  v_batch_limit_outer INT;
  v_batch_limit_inner INT;
  v_target_roles TEXT[];
  v_exclude_super_admin BOOLEAN;
  v_priority TEXT;
  v_ttl_hours INT;
  v_expires_hours INT; -- 2026-08-09 expiry
  v_learning_window_days INT;
  v_prioritize_emails TEXT[];
BEGIN
  v_cfg := fn_get_generator_config('unmarked_attendance', '{
    "category": "dashboard:anomaly",
    "time_gate_ist_hour": 11,
    "batch_limit_outer": 100,
    "batch_limit_inner": 50,
    "target_roles": ["director","principal","hod","admin"],
    "exclude_super_admin": true,
    "priority": "normal",
    "ttl_hours": 8,
    "expires_hours": 36,
    "learning_window_days": 14,
    "prioritize_emails": ["director@jkkn.ac.in"]
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:anomaly');
  v_time_gate_ist_hour   := COALESCE((v_cfg->>'time_gate_ist_hour')::INT, 11);
  v_batch_limit_outer    := COALESCE((v_cfg->>'batch_limit_outer')::INT, 100);
  v_batch_limit_inner    := COALESCE((v_cfg->>'batch_limit_inner')::INT, 50);
  v_target_roles         := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'target_roles')),
                              ARRAY['director','principal','hod','admin']
                            );
  v_exclude_super_admin  := COALESCE((v_cfg->>'exclude_super_admin')::BOOLEAN, true);
  v_priority             := COALESCE(v_cfg->>'priority', 'normal');
  v_ttl_hours            := COALESCE((v_cfg->>'ttl_hours')::INT, 8);
  -- 2026-08-09 expiry: 36h = 1.5x the daily re-emit cycle. 0 (or any value <= 0)
  -- is the OFF switch: it maps to NULL = never expires, so the TTL can be
  -- withdrawn from generator config with no deploy. Without this mapping a 0 in
  -- config would mean "expire instantly", the opposite of what an operator
  -- typing 0 intends.
  v_expires_hours        := COALESCE((v_cfg->>'expires_hours')::INT, 36);
  IF v_expires_hours IS NOT NULL AND v_expires_hours <= 0 THEN
    v_expires_hours := NULL;
  END IF;
  v_learning_window_days := COALESCE((v_cfg->>'learning_window_days')::INT, 14);
  v_prioritize_emails    := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'prioritize_emails')),
                              ARRAY['director@jkkn.ac.in']
                            );

  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Kolkata')) < v_time_gate_ist_hour THEN
    RETURN 0;
  END IF;

  FOR v_tt IN
    SELECT t.id, t.institution_id, t.section_id, t.timetable_name
    FROM timetables t
    WHERE t.is_active = TRUE AND t.start_date <= CURRENT_DATE
      AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
      AND NOT EXISTS (SELECT 1 FROM student_attendance sa
        WHERE sa.timetable_id = t.id AND sa.attendance_date = CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM student_attendance sa2
        WHERE sa2.timetable_id = t.id
          AND sa2.attendance_date BETWEEN
            CURRENT_DATE - make_interval(days => v_learning_window_days)
            AND CURRENT_DATE - INTERVAL '1 day')
    LIMIT v_batch_limit_outer
  LOOP
    v_key := 'unmarked_attendance:' || v_tt.id::text || ':' || CURRENT_DATE::text;
    -- 2026-04-23 targeting fix: (a) LIMIT 50 was LIMIT 5 — cut director off;
    -- (b) no DISTINCT so ORDER BY by email works; (c) prioritize by email
    -- because director's profile.role='super_admin', NOT 'director'.
    -- Updated: 2026-04-24 - Exclude super_admin from per-item fanout.
    FOR v_target IN
      SELECT p.id AS uid, p.email, p.institution_id AS p_inst
      FROM profiles p
      WHERE p.institution_id = v_tt.institution_id
        AND (NOT v_exclude_super_admin OR p.is_super_admin = FALSE)
        AND p.role = ANY(v_target_roles)
      ORDER BY
        CASE WHEN p.email = ANY(v_prioritize_emails) THEN 0
             WHEN p.institution_id = v_tt.institution_id THEN 1
             ELSE 2 END,
        p.id
      LIMIT v_batch_limit_inner
    LOOP
      v_created := v_created + fn_create_dashboard_work_item(
        v_category, v_priority,
        'Attendance not marked today — ' || COALESCE(v_tt.timetable_name, 'Section timetable'),
        'No attendance rows for this timetable today as of ' || v_time_gate_ist_hour::text || 'am. Faculty may need a nudge.',
        jsonb_build_object('timetable_id', v_tt.id, 'section_id', v_tt.section_id,
          'url', '/academic/attendance/dashboard?timetable=' || v_tt.id::text),
        v_target.uid, v_key || ':' || v_target.uid::text, v_ttl_hours,
        v_expires_hours); -- 2026-08-09 expiry
    END LOOP;
  END LOOP;
  RETURN v_created;
END $function$;


-- Cron-only generator; anon/authenticated explicitly locked out (see above).
REVOKE EXECUTE ON FUNCTION public.fn_generate_unmarked_attendance_items() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_generate_unmarked_attendance_items() TO service_role;

-- --------------------------------------------------------------------------------
-- 4. fn_accreditation_narrative_reminders --- 36h TTL on both daily nudges
-- --------------------------------------------------------------------------------
-- Both branches key on ':<YYYY-MM-DD>', so the same narrative is re-announced
-- every day it stays stuck. Measured 2026-08-09: 187 unread rows for the
-- Director, 46 distinct narratives behind them. Expiring yesterday's copy leaves
-- today's copy live and leaves /accreditation/naac/narratives untouched.
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_reminders(p_nudge_days integer DEFAULT 3, p_escalate_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- 2026-08-09 expiry: expires_at added; 36h = 1.5x the daily re-emit cycle.
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at, expires_at)
    SELECT gen_random_uuid(),
      'NAAC narrative awaiting your review',
      'An AI-drafted NAAC narrative for metric '||s.metric_code||' is waiting for you to review and okay it.',
      '/accreditation/naac/narratives/'||s.id::text, 'FileText', 'normal', 'accreditation', 'work_item',
      s.ik, jsonb_build_object('type','user','user_ids', jsonb_build_array(s.uid)), v_sys, now(), now(),
      now() + interval '36 hours'
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
      -- 2026-08-09 expiry: expires_at added; 36h = 1.5x the daily re-emit cycle.
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at, expires_at)
    SELECT gen_random_uuid(),
      'Overdue NAAC narrative needs attention',
      'A NAAC narrative for metric '||s.metric_code||' has been waiting more than '||p_escalate_days||' days for review.',
      '/accreditation/naac/narratives/'||s.id::text, 'AlertTriangle', 'high', 'accreditation', 'work_item',
      s.ik, jsonb_build_object('type','role','roles', jsonb_build_array('super_admin')), v_sys, now(), now(),
      now() + interval '36 hours'
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
END; $function$;

-- Cron-only generator; anon/authenticated explicitly locked out (see above).
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(integer, integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(integer, integer) TO service_role;

-- --------------------------------------------------------------------------------
-- 5. fn_generate_hr_command_center_brief_items --- 36h TTL on the daily HR brief
-- --------------------------------------------------------------------------------
-- Added 2026-08-09 in review: the first cut of this migration backfilled
-- dashboard:hr_brief but left its generator alone, so 34 of the Director's 35
-- rows would have lapsed and then ~1 unexpiring row per recipient per day would
-- have started accruing again (860 rows since 2026-04-28, newest today). Same
-- shape as the digest: key is 'hr_brief:<user>:<YYYY-MM-DD>', body is a snapshot
-- of TODAY's pending-leave / recruitment / holiday counts, re-emitted every day
-- by the hourly /api/cron/dashboard-work-items sweep. 36h = 1.5x that daily
-- re-key: it absorbs a late run, not a fully skipped day (see the "Why 36h and
-- not 24h" note in the file header).
--
-- Body captured VERBATIM from production pg_get_functiondef 2026-08-09; the only
-- edit is the ninth argument on the fn_create_dashboard_work_item call.
CREATE OR REPLACE FUNCTION public.fn_generate_hr_command_center_brief_items()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created INT := 0;
  v_user RECORD;
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
  v_key TEXT;
  v_pending_leaves INT;
  v_active_recruitment INT;
  v_todays_holidays INT;
  v_staff_on_leave INT;
  v_total INT;
  v_priority TEXT;
  v_title TEXT;
  v_body TEXT;
  v_signal_parts TEXT[];
BEGIN
  -- Aggregate metrics ONCE (institution-wide, same as previous version)
  SELECT COUNT(*) INTO v_pending_leaves
  FROM hr_leave_applications la
  WHERE la.status = 'pending'
    AND la.created_at < NOW() - INTERVAL '24 hours'
    AND la.created_at > NOW() - INTERVAL '30 days'
    AND la.superseded_by IS NULL;

  SELECT COUNT(*) INTO v_active_recruitment
  FROM hr_recruitment_candidates
  WHERE status IN ('pending_approval', 'in_process', 'submitted')
    AND COALESCE(submitted_at, created_at) > NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_todays_holidays
  FROM institution_leaves
  WHERE CURRENT_DATE BETWEEN start_date AND end_date
    AND status IN ('approved', 'active');

  SELECT COUNT(*) INTO v_staff_on_leave
  FROM hr_leave_applications
  WHERE status = 'approved'
    AND CURRENT_DATE BETWEEN start_date AND end_date
    AND superseded_by IS NULL;

  v_total := v_pending_leaves + v_active_recruitment + v_todays_holidays + v_staff_on_leave;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  v_signal_parts := ARRAY[]::TEXT[];
  IF v_pending_leaves > 0 THEN
    v_signal_parts := v_signal_parts || (v_pending_leaves || ' pending leave(s)');
  END IF;
  IF v_active_recruitment > 0 THEN
    v_signal_parts := v_signal_parts || (v_active_recruitment || ' active recruitment');
  END IF;
  IF v_todays_holidays > 0 THEN
    v_signal_parts := v_signal_parts || (v_todays_holidays || ' holiday today');
  END IF;
  IF v_staff_on_leave > 0 THEN
    v_signal_parts := v_signal_parts || (v_staff_on_leave || ' staff on leave today');
  END IF;

  v_priority := CASE
    WHEN v_pending_leaves >= 5 OR v_todays_holidays > 0 THEN 'high'
    ELSE 'normal'
  END;

  v_title := 'HR brief — ' || array_to_string(v_signal_parts, ', ');
  v_body := 'Daily HR Command Center summary: ' || array_to_string(v_signal_parts, ', ') || '. Open /hr for full breakdown across institutions.';

  -- Fan out via config-driven recipient set
  FOR v_user IN SELECT user_id FROM get_digest_recipients('hr_command_brief')
  LOOP
    v_key := 'hr_brief:' || v_user.user_id::text || ':' || v_today;

    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:hr_brief',
      v_priority,
      v_title,
      v_body,
      jsonb_build_object(
        'url', '/hr',
        'digest', true,
        'pending_leaves', v_pending_leaves,
        'active_recruitment', v_active_recruitment,
        'todays_holidays', v_todays_holidays,
        'staff_on_leave', v_staff_on_leave,
        'total', v_total
      ),
      v_user.user_id,
      v_key,
      20,
      36); -- 2026-08-09 expiry: 36h, 1.5x the daily re-key
  END LOOP;

  RETURN v_created;
END
$function$;

-- ACL note: unlike the other four, this function's production ACL includes
-- `authenticated=X` -- and that grant is DELIBERATE, written by hand in
-- supabase/migrations/20260428_hr_command_center_brief_digest.sql line 186, not
-- a Supabase default. It is preserved here rather than quietly tightened: this
-- migration is about expiry, and revoking a standing grant belongs in its own
-- change with its own caller sweep. anon/PUBLIC are still explicitly revoked --
-- Supabase's ALTER DEFAULT PRIVILEGES would otherwise hand anon EXECUTE.
-- (Flagged for follow-up: a SECURITY DEFINER generator callable by every logged-in
-- user can be fired to fan out notifications; worth a separate look.)
REVOKE EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items() TO service_role;
GRANT  EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items() TO authenticated;
