-- ============================================================================
-- AI Pulse moderation #11 — tell the author their prompt is no longer shared,
-- WITHOUT the reason.
--
-- Director decision (specs/ai-pulse-feed-moderation-decisions-2026-07-30.md §11):
--   "When a champion hides a prompt, notify the author that it is no longer
--    shared; do not include the reason."
--   Why: work vanishing with no explanation is what makes people quietly stop
--   participating (the CARRE dignity pillar). Withholding the reason avoids
--   handing over a checklist for evading the safety checks, and avoids a blunt
--   reason reaching a young learner.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. Validated on prod ref
-- kvizhngldtiuufknvehv inside BEGIN..ROLLBACK only (see the dry-run notes at the
-- bottom of this file). There is no COMMIT anywhere in this file.
--
-- BASED ON THE LIVE DEFINITION, not on a repo file. pg_get_functiondef() was
-- read from prod before editing and its md5 recorded
-- (bb7900cd76af19debb6ee62ddb8a107c). The guard below is byte-for-byte the
-- deployed guard. See feedback_secdef_replace_silently_reverted_money_gate:
-- authoring a CREATE OR REPLACE from a stale migration file has already
-- silently reverted a live money gate in this repo once.
--
-- GUARD IS UNCHANGED AND MUST STAY UNCHANGED:
--   * auth.uid() IS NULL  → 42501. An unauthenticated caller is stopped before
--     any row is read.
--   * COALESCE(is_super_admin() OR user_has_permission('aiPulse:lab.score')
--                              OR user_has_permission('aiPulse:anomaly.review'),
--              false)
--     Both permission keys are load-bearing and BOTH are live. Measured on prod
--     2026-07-30: `aiPulse:anomaly.review` is granted true by exactly one role,
--     `ai_pulse_champion` (3 members); `aiPulse:lab.score` is granted true by
--     `faculty` (483 members), `hod` (102) and `school_faculty` (1). So
--     `lab.score` is not decorative — dropping it would remove the hide from
--     every one of those 586 holders. The COALESCE is load-bearing too: NOT(NULL OR
--     false OR false) evaluates to NULL, plpgsql does not take a NULL IF branch,
--     and the guard would fall silently OPEN
--     (feedback_secdef_guard_not_null_safe_falls_through).
--
-- WHAT CHANGES (three things, nothing else):
--   1. The UPDATE gains `AND disqualified_at IS NULL` and
--      `RETURNING learner_id INTO v_learner_id`, making a repeat hide a no-op.
--   2. The author's own notification row is written, with no reason text.
--   3. The notification is wrapped so it can never block the hide.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_disqualify_prompt_build(p_build_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_learner_id      uuid;
    v_author_profile  uuid;
    v_notification_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(is_super_admin()
                    OR user_has_permission('aiPulse:lab.score')
                    OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can disqualify a build.' USING ERRCODE = '42501';
    END IF;

    -- NOTIFY-ONCE. `AND disqualified_at IS NULL` makes a repeat call a no-op:
    -- until now a second call re-stamped disqualified_at, so once this function
    -- also notifies, a champion double-click would have sent the author two
    -- copies of the same "no longer shared" message. The reason column is still
    -- written on the FIRST hide, so the audit trail is unchanged for the only
    -- call that changes state. A champion RESTORE (disqualified_at back to NULL)
    -- leaves the row eligible to be hidden — and notified — again, which is
    -- correct: that is a new decision, not a duplicate of the old one.
    UPDATE ai_pulse_prompt_builds
    SET disqualified_at     = now(),
        disqualified_by     = auth.uid(),
        disqualified_reason = left(nullif(btrim(coalesce(p_reason,'')),''), 500),
        updated_at          = now()
    WHERE id = p_build_id
      AND disqualified_at IS NULL
    RETURNING learner_id INTO v_learner_id;

    -- Nothing was newly hidden (unknown id, or already hidden) → nothing to
    -- tell anyone. Checked immediately after the UPDATE; FOUND is only valid
    -- for the statement that just ran.
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Belt-and-braces only: `ai_pulse_prompt_builds.learner_id` is NOT NULL on
    -- prod today, so this branch is unreachable. Kept because it costs nothing
    -- and a build with no author simply cannot be notified — if the column is
    -- ever relaxed, this skips the notice instead of inserting a row targeted
    -- at NULL, which would insert happily and reach nobody.
    IF v_learner_id IS NULL THEN
        RETURN;
    END IF;

    -- Resolve the AUTHOR's notification recipient. Identity chain in this
    -- codebase: ai_pulse_prompt_builds.learner_id → learners_profiles.id, and
    -- profiles.learner_id → learners_profiles.id. notifications /
    -- user_notifications are keyed on profiles.id, so the hop through profiles
    -- is required — a learners_profiles id is NOT a valid recipient and would
    -- fail the user_notifications FK.
    SELECT p.id
      INTO v_author_profile
      FROM profiles p
     WHERE p.learner_id = v_learner_id
     LIMIT 1;

    -- No profile row resolves → skip the notification silently. The hide has
    -- already been written and must stand.
    IF v_author_profile IS NULL THEN
        RETURN;
    END IF;

    -- ------------------------------------------------------------------
    -- THE NOTIFICATION MUST NEVER BLOCK MODERATION.
    -- The hide is the safeguarding action; the notification is a courtesy. If
    -- the notifications tables are misconfigured, a column is added with a new
    -- NOT NULL, or an RLS/FK change rejects the write, the champion's decision
    -- still has to land. Swallowing the error is deliberate: the alternative is
    -- a champion clicking "hide" on genuinely unsafe content and getting an
    -- error instead of a hidden prompt.
    -- ------------------------------------------------------------------
    BEGIN
        -- ROW SHAPE COPIED FROM A WORKING, PROVEN-DELIVERED INSERT — not
        -- invented. Source: app/api/cron/ai-pulse-tick/route.ts as fixed by
        -- merged PR #2537 ("fix(notifications): ai-pulse-tick / bug-report /
        -- telephony / work-pulse inserts use real columns"), and the same shape
        -- in lib/services/notification/notification-service.ts createNotification().
        --
        -- Two independent failure modes are being avoided here:
        --   (a) notifications.targeting is NOT NULL — an insert without it just
        --       fails (feedback_ai_rpc_send_notification_broken). So is
        --       created_by; the table has NO type/message/user_id column.
        --   (b) targeting's CONTENTS are UNVALIDATED, so a wrong key inserts
        --       happily and reaches NOBODY — a green insert is not proof of
        --       delivery (feedback_notifications_targeting_contents_unvalidated).
        --       Measured on prod 2026-07-30: 114,070 rows use
        --       {"type":"user","user_ids":[…]} and 106,212 use {"user_ids":[…]};
        --       3,192 rows use the singular "user_id" — that is the broken
        --       shape. This uses the dominant plural key.
        --
        -- AND THE PART THAT ACTUALLY DELIVERS: the bell/inbox read does NOT read
        -- targeting at all. getNotifications() in
        -- lib/services/notification/notification-service.ts selects FROM
        -- user_notifications joined !inner to notifications. There is no
        -- fan-out trigger on notifications (checked live: only
        -- safety_log_delete and set_timestamp_notifications), so the
        -- user_notifications row below is what makes this reach the author.
        -- Without it the notification exists and is invisible.
        --
        -- created_by is the AUTHOR, not the champion. It is NOT NULL with no
        -- default, and anchoring it to a recipient is the established pattern
        -- (ai-pulse-tick uses passerIds[0]; byow-notification-service uses
        -- recipient.id). It also keeps the champion's identity out of a row the
        -- author can read — components/notifications/*-gate.tsx renders
        -- "From: created_by_name". Who decided is still auditable: it is on
        -- ai_pulse_prompt_builds.disqualified_by.
        --
        -- category 'ai_pulse' matches the 508 existing AI Pulse rows on prod
        -- (507 of them carry the user_notifications fan-out, i.e. this exact
        -- combination is proven to deliver). kind 'work_item' matches all of
        -- them and keeps a system-generated courtesy notice out of the admin
        -- "Sent announcements" view, which filters kind <> 'work_item'.
        --
        -- NO REASON TEXT. p_reason / disqualified_reason are deliberately NOT
        -- interpolated into title, body, url or metadata. The reason stays in
        -- ai_pulse_prompt_builds.disqualified_reason for the champion audit
        -- trail only.
        INSERT INTO notifications (
            title,
            body,
            url,
            created_by,
            targeting,
            category,
            kind,
            metadata
        ) VALUES (
            'Your prompt is no longer shared',
            'A reviewer looked at one of your AI Pulse prompts, and it is no longer shared with your classmates. '
            || 'This does not affect your marks or your standing in any way. '
            || 'You are welcome to write another prompt whenever you like.',
            '/ai-pulse/my-pulse',
            v_author_profile,
            jsonb_build_object(
                'type', 'user',
                'user_ids', jsonb_build_array(v_author_profile)
            ),
            'ai_pulse',
            'work_item',
            jsonb_build_object(
                'source', 'ai_pulse_prompt_build_disqualified',
                'prompt_build_id', p_build_id
            )
        )
        RETURNING id INTO v_notification_id;

        -- The delivery row. UNIQUE (notification_id, user_id) exists; the
        -- ON CONFLICT keeps this harmless if it is ever reached twice.
        INSERT INTO user_notifications (notification_id, user_id)
        VALUES (v_notification_id, v_author_profile)
        ON CONFLICT (notification_id, user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$function$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new/replaced
-- function, separate from PUBLIC — so both must be revoked in this same file or
-- the CREATE OR REPLACE silently re-opens the function to the public anon key
-- that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) IS
  'AI Pulse moderation: a champion hides a prompt build (aiPulse:anomaly.review OR aiPulse:lab.score OR super admin). Moderation #11 (2026-07-30): also tells the AUTHOR their prompt is no longer shared, deliberately WITHOUT the reason — the reason stays in disqualified_reason for audit only. Notify-once: the UPDATE requires disqualified_at IS NULL, so a repeat call is a no-op and cannot send a second message. The notification (notifications + the user_notifications delivery row) is wrapped in an exception-swallowing block: the hide is the safeguarding action and must succeed even if notifications are misconfigured.';

-- ============================================================================
-- DRY-RUN RESULT — prod ref kvizhngldtiuufknvehv, 2026-07-30, BEGIN..ROLLBACK.
-- Rehearsed only. This file has NOT been applied to any database.
--
-- ACTOR: profile 00ade244-d59a-4341-9638-ef98028aada3 — is_super_admin() FALSE,
-- user_has_permission('aiPulse:lab.score') TRUE, ('aiPulse:anomaly.review')
-- FALSE. So the guard's PERMISSION branch is what admitted the call, not the
-- super-admin bypass. (Needed a faculty deliberately: all 3 ai_pulse_champion
-- members are themselves super admins, so a champion would have proved nothing
-- about the permission path.)
--
-- IN-TRANSACTION, after the replace:
--   md5(pg_get_functiondef)            bb7900cd… -> a871ecee59c6183dffa1391625e21d61
--   anon EXECUTE                       false   (authenticated EXECUTE true)
--   1st call: notifications 223511 -> 223512, user_notifications 169472 -> 169473,
--             disqualified builds 0 -> 1
--             the ONE new row: title 'Your prompt is no longer shared',
--             url '/ai-pulse/my-pulse', category 'ai_pulse', kind 'work_item',
--             targeting {"type":"user","user_ids":["542e2cfe…"]} (NOT NULL),
--             created_by = the author, and 1 matching user_notifications row
--             LEAK CHECK: the reason 'test reason string DO-NOT-LEAK' appears in
--             NO user-visible column — and in fact nowhere in the whole row
--             (title/body/url/metadata all clean); it IS present on
--             ai_pulse_prompt_builds.disqualified_reason, i.e. audit kept,
--             learner not told
--   2nd call on the same build: 0 additional notifications, 0 additional
--             delivery rows, and disqualified_reason still holds the FIRST
--             reason — proving the row was not re-stamped
--
-- SEPARATE CALL AFTERWARDS (proof the rollback held):
--   md5(pg_get_functiondef) = bb7900cd76af19debb6ee62ddb8a107c — the STEP B
--   value, i.e. the live function is byte-identical and UNMODIFIED
--   notifications 223511, user_notifications 169472, disqualified builds 0
--   test build's disqualified_at and disqualified_reason both back to NULL
--   no row anywhere carries the test reason string
-- ============================================================================
