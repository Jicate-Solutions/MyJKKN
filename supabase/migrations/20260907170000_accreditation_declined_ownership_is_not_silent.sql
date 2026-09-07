-- ============================================================================
-- A declined ownership now tells somebody.
--
-- Date: 2026-09-07
-- Spec: specs/iqac-apex-collect-once-report-many.md (Director decision 8)
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Migration FILE only; apply is Director-gated.
--
-- THE BUG THIS CLOSES
-- -------------------
-- Decision 8 made an assignment PENDING until the named person answers it, and
-- 20260809100600 gave them the button. Both halves of that answer are real:
-- fn_accreditation_acknowledge_ownership accepts 'confirmed' AND 'declined',
-- and the invitation that goes out to the 14 body-level owners says in as many
-- words that declining is a genuine option.
--
-- A decline then goes nowhere. Verified on production 2026-09-07:
--
--   * accreditation_metric_owners carries NO trigger at all (pg_trigger, minus
--     the internal FK ones: zero rows).
--   * fn_accreditation_acknowledge_ownership writes exactly three columns —
--     assignment_status, acknowledged_at, acknowledged_by — and raises nothing.
--   * No function, cron or view anywhere reads assignment_status = 'declined'.
--
-- So the row flips to 'declined', the awarding body silently returns to having
-- no accepted owner, and the only way anybody learns is if a person holding
-- accreditation.naac.narrative.manage happens to open /accreditation/manage/owners
-- for that exact campus. "Accountability is accepted, not imposed" only works
-- if a refusal lands somewhere; otherwise declining is indistinguishable from
-- the assignment quietly evaporating.
--
-- WHY A TRIGGER AND NOT A LINE INSIDE THE RPC
-- -------------------------------------------
-- The RPC is not the only writer. /accreditation/manage/owners also UPDATEs the
-- table directly through RLS (policy accred_metric_owners_manage, FOR ALL on
-- the .manage key), which is how an assignment is reassigned or corrected. A
-- notice bolted into the RPC would cover the owner's own decline and miss every
-- other path to the same state. The trigger is on the STATE, so it fires for
-- whoever produced it.
--
-- It also leaves fn_accreditation_acknowledge_ownership — and its grants —
-- untouched, which is the right blast radius for a change that only needs to
-- observe.
--
-- WHO IS TOLD, AND WHY THEM
-- -------------------------
-- Two groups, both able to actually do the one thing a decline demands: name
-- somebody else.
--
--   1. The person who made the assignment (created_by). On all 14 live rows
--      that is one IQAC coordinator; they own the follow-up.
--   2. Holders of accreditation.naac.narrative.manage — the ASSIGN key, the
--      same key the table's write policy demands (see 20260809100100, which
--      deliberately gave principals and HODs the view key and NOT this one).
--      Live that is 4 people across 3 roles: accreditation_officer, ceo,
--      managing_director.
--
-- Resolved the way user_has_permission() resolves it: user_roles first, then
-- the legacy profiles.role fallback, skipping deactivated and login-disabled
-- accounts. Institution scope is honoured the way role_has_institution_access()
-- honours it — scope 'all', or own institution, or an active
-- user_institution_access grant. (All three manage roles are scope 'all' today,
-- so the clause changes nothing yet; it is written so that a future
-- campus-scoped manage role does not silently receive another college's decline.)
--
-- Deliberately NOT every super admin. tms_users_with_permission() returns all
-- 14 of them by construction, and 20260807140001 already established the house
-- rule after a dropped role pinged 19 people on a platform carrying ~170k
-- unread notifications: notify the office that can act, not the whole admin
-- bench. tms_users_with_permission() is kept only as a LAST-RESORT fallback for
-- the case where the scoped query returns nobody — a decline with no recipient
-- would be the exact silence this migration exists to end.
--
-- The decliner is removed from the list. Telling somebody what they just did is
-- noise, and on a campus-scoped setup they could plausibly hold both keys.
--
-- IDEMPOTENCY
-- -----------
-- notifications.idempotency_key has a UNIQUE partial index
-- (idx_notifications_idempotency, WHERE idempotency_key IS NOT NULL). The key
-- here is
--     accred_owner_declined:<assignment id>:<owner id>:<IST date>
-- so the same person declining the same assignment can raise at most one notice
-- per day no matter how many times the RPC is called — a decline cannot be used
-- to spam an inbox. The owner id is IN the key because reassignment reuses the
-- row (previous_owner_user_id / owner_changed_at exist for exactly that), so a
-- key without it would suppress a genuinely new person's refusal months later.
-- The date is in it so that a real second refusal, after a real reassignment, is
-- still heard.
--
-- A FAILED NOTICE MUST NOT UNDO A DECLINE
-- ---------------------------------------
-- The whole notify block is wrapped in an EXCEPTION handler that downgrades any
-- failure to a WARNING. A trigger that raised would roll the UPDATE back, and
-- the owner's refusal — the thing they were explicitly invited to give — would
-- be lost to a notifications-table problem. Losing the notice is bad; losing the
-- answer is worse.
--
-- Reuses the platform's existing bell mechanism exactly: one notifications row
-- plus one user_notifications row per recipient (there is no DB fan-out trigger;
-- anything that misses the second write never appears in the bell), with the
-- same category/kind/priority/url shape as the invitation cron that was verified
-- live end to end this morning.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_notify_ownership_declined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key         constant text := 'accreditation.naac.narrative.manage';
  v_decliner    uuid;
  v_recipients  uuid[];
  v_created_by  uuid;
  v_notif       uuid;
  v_ik          text;
  v_owner_name  text;
  v_inst_name   text;
  v_what        text;
  v_title       text;
  v_body        text;
BEGIN
  -- Only the transition INTO 'declined'. A later edit of any other column on an
  -- already-declined row (a note, a reassignment being prepared) must not
  -- re-announce a refusal that was already heard.
  IF NEW.assignment_status IS DISTINCT FROM 'declined'
     OR OLD.assignment_status IS NOT DISTINCT FROM 'declined' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- acknowledged_by is what the RPC stamps; a direct RLS update by a manage
    -- holder may leave it null, in which case there is nobody to exclude.
    v_decliner := COALESCE(NEW.acknowledged_by, NEW.owner_user_id);

    v_ik := 'accred_owner_declined:' || NEW.id::text
            || ':' || NEW.owner_user_id::text
            || ':' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');

    -- Cheap exit before any work: this decline was already announced today.
    IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.idempotency_key = v_ik) THEN
      RETURN NEW;
    END IF;

    -- ── Recipients ────────────────────────────────────────────────────────────
    WITH holders AS (
      -- Multi-role assignment — the primary path user_has_permission() takes.
      SELECT ur.user_id AS uid, cr.institution_scope
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
       WHERE COALESCE(cr.is_active, true)
         AND COALESCE((cr.permissions ->> v_key)::boolean, false)
      UNION
      -- Legacy single-role fallback. user_has_permission() still consults it, so
      -- a person who can assign through profiles.role alone is a real holder.
      SELECT p.id, cr.institution_scope
        FROM public.profiles p
        JOIN public.custom_roles cr ON cr.role_key = p.role
       WHERE COALESCE(cr.is_active, true)
         AND COALESCE((cr.permissions ->> v_key)::boolean, false)
    ),
    scoped AS (
      SELECT DISTINCT h.uid
        FROM holders h
        JOIN public.profiles pr ON pr.id = h.uid
       WHERE COALESCE(pr.is_active, true) = true
         AND COALESCE(pr.is_login_disabled, false) = false
         AND (
              h.institution_scope = 'all'
           OR pr.institution_id = NEW.institution_id
           OR EXISTS (
                SELECT 1 FROM public.user_institution_access uia
                 WHERE uia.user_id = h.uid
                   AND uia.institution_id = NEW.institution_id
                   AND COALESCE(uia.is_active, true)
              )
         )
    )
    SELECT array_agg(DISTINCT uid)
      INTO v_recipients
      FROM (
        SELECT uid FROM scoped
        UNION
        -- Whoever made the assignment, whether or not they still hold the key.
        SELECT NEW.created_by WHERE NEW.created_by IS NOT NULL
      ) r(uid)
     WHERE uid IS DISTINCT FROM v_decliner;

    -- Last resort. Wider than we want (it includes every super admin) but a
    -- decline heard by too many beats a decline heard by nobody.
    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      SELECT array_agg(DISTINCT t.uid)
        INTO v_recipients
        FROM public.tms_users_with_permission(v_key) AS t(uid)
       WHERE t.uid IS DISTINCT FROM v_decliner;
    END IF;

    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      RAISE WARNING 'accreditation decline % has no reachable recipient', NEW.id;
      RETURN NEW;
    END IF;

    -- ── Wording ───────────────────────────────────────────────────────────────
    SELECT p.full_name INTO v_owner_name
      FROM public.profiles p WHERE p.id = NEW.owner_user_id;
    SELECT i.name INTO v_inst_name
      FROM public.institutions i WHERE i.id = NEW.institution_id;

    -- metric_code NULL is the body-level row: one accountable person for the
    -- whole submission (level 1). A set metric_code is the level-3 exception.
    v_what := CASE
                WHEN NEW.metric_code IS NULL
                  THEN 'the whole ' || NEW.body_code || ' submission'
                ELSE NEW.body_code || ' metric ' || NEW.metric_code
              END;

    v_title := NEW.body_code || ' ownership declined — a new owner is needed';
    v_body  := COALESCE(v_owner_name, 'The named owner')
               || ' has declined ' || v_what
               || COALESCE(' for ' || v_inst_name, '')
               || '. Nobody is accountable for it until someone else is named.';

    -- notifications.created_by is NOT NULL. Use the same system identity the
    -- invitation cron uses (first super admin by id) so the two halves of this
    -- conversation are attributed alike; fall back down the chain rather than
    -- lose the notice.
    SELECT p.id INTO v_created_by
      FROM public.profiles p
     WHERE p.is_super_admin = true
     ORDER BY p.id
     LIMIT 1;
    v_created_by := COALESCE(v_created_by, NEW.created_by, v_decliner, NEW.owner_user_id);

    -- ── The bell: one notifications row, then the fan-out links ──────────────
    INSERT INTO public.notifications
      (id, title, body, url, priority, category, kind,
       idempotency_key, targeting, metadata, created_by, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_title, v_body,
       '/accreditation/manage/owners', 'high', 'accreditation', 'work_item',
       v_ik,
       jsonb_build_object('user_ids', to_jsonb(v_recipients)),
       jsonb_build_object(
         'source',         'accreditation-ownership-declined-trigger',
         'assignment_id',  NEW.id,
         'body_code',      NEW.body_code,
         'metric_code',    NEW.metric_code,
         'institution_id', NEW.institution_id,
         'declined_by',    v_decliner
       ),
       v_created_by, now(), now())
    RETURNING id INTO v_notif;

    -- No fan-out trigger exists on notifications; without this second write the
    -- row is invisible in the bell.
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), v_notif, u, now()
      FROM unnest(v_recipients) u;

  EXCEPTION WHEN OTHERS THEN
    -- unique_violation on the idempotency key (two declines racing) lands here
    -- too, and is the correct outcome: the notice already exists.
    RAISE WARNING 'accreditation decline notice failed for % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_accreditation_notify_ownership_declined() IS
  'AFTER UPDATE on accreditation_metric_owners: when an assignment is declined, '
  'tells the people who can name a replacement — the assigner plus holders of '
  'accreditation.naac.narrative.manage scoped to that institution. Before this, '
  'a decline was written and read by nobody. Never raises: a failed notice must '
  'not roll back the owner''s answer.';

-- A trigger function cannot be invoked directly (PostgreSQL refuses to call a
-- function RETURNS trigger from SQL), and firing a trigger does not check
-- EXECUTE. The REVOKE is still written explicitly because Supabase's default
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` hands anon a
-- direct grant on every new function, and an audit that greps for the revoke
-- should find it here like everywhere else. No GRANT TO authenticated follows,
-- deliberately: there is nothing an authenticated caller could do with it.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_notify_ownership_declined()
  FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_accreditation_ownership_declined
  ON public.accreditation_metric_owners;

CREATE TRIGGER trg_accreditation_ownership_declined
  AFTER UPDATE OF assignment_status ON public.accreditation_metric_owners
  FOR EACH ROW
  WHEN (NEW.assignment_status = 'declined'
        AND OLD.assignment_status IS DISTINCT FROM 'declined')
  EXECUTE FUNCTION public.fn_accreditation_notify_ownership_declined();

-- ----------------------------------------------------------------------------
-- Assert, in this transaction, that the lock and the wiring actually took.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_accreditation_notify_ownership_declined()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_notify_ownership_declined';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_accreditation_ownership_declined'
       AND tgrelid = 'public.accreditation_metric_owners'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'the decline trigger is not attached to accreditation_metric_owners';
  END IF;

  RAISE NOTICE 'a declined accreditation ownership now raises a bell notice';
END $$;
