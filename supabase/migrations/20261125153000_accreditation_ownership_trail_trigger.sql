-- ============================================================================
-- The ownership trail must record EVERY hand-over, not only the delegated ones
--
-- Date: 2026-09-09
--
-- WHAT WAS WRONG
-- --------------
-- 20261122103000 created public.accreditation_ownership_events and gave it
-- exactly one writer: fn_accreditation_assign_metric_owner, which raises 22023
-- unless a metric code is supplied. That function is the DELEGATION path — a
-- body owner handing one metric to a colleague. Every IQAC path writes the
-- ownership row DIRECTLY and touches the trail not at all:
--
--   · /accreditation/manage/owners            assignScope        (upsert)
--   · /accreditation/manage/owners            bulkAssignCategory (upsert)
--   · /accreditation/manage/owners            clearScope         (delete)
--   · /accreditation/naac/narratives/owners   assign and clear   (upsert/delete)
--   · fn_accreditation_acknowledge_ownership  a Decline from /accreditation/my-gaps
--
-- accreditation-ownership-notify reads ONLY that trail, so when IQAC reassigned
-- or removed an owner, the previous owner, the body owner above and the IQAC
-- officer were told nothing — ever — while the owners page said on screen that
-- they "have been told". Measured on production 2026-09-09: 14 events, all 14
-- carrying the backfill note from 20261122103000, none written since; 0
-- notifications from source 'accreditation-ownership-notify-cron'; the only
-- trigger on accreditation_metric_owners was the first_seen one.
--
-- WHY A TRIGGER AND NOT FIVE CALL-SITE FIXES
-- ------------------------------------------
-- The trail is a property of the TABLE, not of whoever happened to write to it.
-- Five call sites across three pages and one RPC were dark; a sixth would be
-- dark tomorrow. A row-level trigger is the only shape where "the register
-- moved" and "the trail recorded it" cannot come apart, and it fixes the
-- narratives owners desk without editing that page.
--
-- WHY THE TRIGGER IS DEFERRED
-- ---------------------------
-- fn_accreditation_assign_metric_owner writes its OWN event, and it knows two
-- things this trigger cannot: which entitlement the actor used
-- (actor_is_body_owner) and the free-text note. Its event must win, and a
-- second event for the same change would double every message the notify cron
-- sends and print the hand-over twice on the owners page.
--
-- An ordinary AFTER ROW trigger fires DURING that function, before it inserts
-- its event, so it cannot see it. A DEFERRABLE INITIALLY DEFERRED constraint
-- trigger fires at COMMIT — after every statement in the transaction — so the
-- check below sees the function's event and stands down. The alternative was to
-- CREATE OR REPLACE the whole 100-line SECURITY DEFINER function to set a
-- suppression flag; re-declaring a security-sensitive function to add a guard
-- is a larger blast radius than deferring a trigger.
--
-- now() is the TRANSACTION timestamp, so `created_at >= now()` means "written
-- in this transaction and not before": a row inserted here with the column
-- default carries exactly now(), and every row from an earlier transaction
-- carries less.
--
-- THIS TRIGGER NEVER RAISES
-- -------------------------
-- A trigger that can fail is a trigger that can make the accreditation register
-- unwritable. Every column it writes is NOT NULL on the source row
-- (institution_id, body_code) or nullable in the trail; owner_row_id is either
-- a row that exists or NULL; and every `action` it produces is in the CHECK.
-- The one thing it can genuinely lack is the ACTOR, and there it declines to
-- write rather than name a person who may not have done it — the same choice
-- 20261122103000 made for its backfill, for the same reason.
--
-- TIER: ADDITIVE. One new trigger function, one new trigger. No existing table,
-- column, function, policy or permission key is altered or dropped.
-- ============================================================================

-- ── 1) What the trail records, and what it deliberately does not ────────────
CREATE OR REPLACE FUNCTION public.fn_accreditation_metric_owners_trail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_row       public.accreditation_metric_owners%ROWTYPE;
  v_row_id    uuid;
  v_action    text;
  v_from      uuid;
  v_to        uuid;
  v_note      text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  -- ── What happened ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_row_id := NEW.id;
    v_action := 'assigned';
    v_from   := NULL;
    v_to     := NEW.owner_user_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- owner_row_id stays NULL: the row is gone by the time this fires and the
    -- foreign key would reject it. The trail must outlive the row it describes,
    -- which is why that column is nullable in the first place.
    v_row_id := NULL;
    v_action := 'cleared';
    v_from   := OLD.owner_user_id;
    v_to     := NULL;

  ELSE
    v_row_id := NEW.id;

    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      v_action := 'reassigned';
      v_from   := OLD.owner_user_id;
      v_to     := NEW.owner_user_id;

    ELSIF NEW.assignment_status = 'declined'
      AND OLD.assignment_status IS DISTINCT FROM 'declined' THEN
      -- The named person refused. to_user_id is NULL because nobody is doing
      -- the work now, which is the fact the other three parties need; the row
      -- still names them, and the owners page still shows that.
      v_action := 'declined';
      v_from   := OLD.owner_user_id;
      v_to     := NULL;

    ELSIF NEW.assignment_status = 'pending'
      AND OLD.assignment_status = 'declined' THEN
      -- A refused assignment sent to the SAME person again. That is a fresh
      -- ask, not a move, so from_user_id is NULL exactly as on a first assign.
      v_action := 'assigned';
      v_from   := NULL;
      v_to     := NEW.owner_user_id;

    ELSE
      -- Everything else changes who is answerable for nothing: stamping
      -- first_seen_at when the owner opens their page, accepting an assignment
      -- (assignment IS ownership — accepting is not a change of ownership), a
      -- correction to created_by. Silence here is the point; announcing a read
      -- receipt to four people would make the real messages unwelcome.
      RETURN NULL;
    END IF;
  END IF;

  -- ── Did fn_accreditation_assign_metric_owner already record this? ────────
  -- See the header. This is the only reason the trigger is deferred.
  IF v_row_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.accreditation_ownership_events e
     WHERE e.owner_row_id = v_row_id
       AND e.created_at  >= now()
  ) THEN
    RETURN NULL;
  END IF;

  -- ── Who did it ───────────────────────────────────────────────────────────
  -- created_by is a fair fallback on INSERT only: the owners pages set it to
  -- the person doing the assigning, and on a brand-new row nobody else can have
  -- set it. On UPDATE and DELETE it is the person who created the row, not the
  -- person changing it, so using it would put a false name in an audit trail.
  IF v_actor IS NULL AND TG_OP = 'INSERT' THEN
    v_actor := NEW.created_by;
  END IF;

  IF v_actor IS NULL THEN
    -- Reached only by a write with no signed-in user: service_role, psql, a
    -- migration. Nothing in the application writes this table that way today.
    -- Refusing to write is a hole in the trail; writing a guessed actor would
    -- be a lie in it, and RAISE here would make the register unwritable.
    RETURN NULL;
  END IF;

  -- The trail has no programme column — it was specified for institution-level
  -- ownership, which is every one of the 14 live rows. A programme-scoped row
  -- (NBA's per-programme slice) would otherwise be recorded as though it were
  -- the whole institution's, so the scope is carried in the note rather than
  -- silently dropped.
  v_note := CASE
    WHEN v_row.programme_id IS NULL THEN NULL
    ELSE 'Scoped to programme ' || v_row.programme_id::text
         || '. The trail records institution-level scope only.'
  END;

  INSERT INTO public.accreditation_ownership_events
    (owner_row_id, institution_id, body_code, metric_code, action,
     from_user_id, to_user_id, actor_user_id, actor_is_body_owner, note)
  VALUES
    (v_row_id, v_row.institution_id, v_row.body_code, v_row.metric_code, v_action,
     v_from, v_to, v_actor,
     -- false, always, and correctly. A direct write to this table needs
     -- accreditation.naac.narrative.manage — the only INSERT/UPDATE/DELETE
     -- policy on it — so the actor reached it through the permission branch.
     -- A body owner delegating has no such grant and goes through
     -- fn_accreditation_assign_metric_owner, which sets this itself and whose
     -- event this trigger stands down for.
     false,
     v_note);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_accreditation_metric_owners_trail() IS
  'Writes public.accreditation_ownership_events for every ownership change made '
  'DIRECTLY on accreditation_metric_owners — the IQAC assign, bulk assign, clear '
  'and decline paths, none of which went through fn_accreditation_assign_metric_owner '
  'and none of which reached accreditation-ownership-notify before 2026-09-09. '
  'Deferred to commit so the delegation function''s own richer event wins.';

-- Hygiene, and the standing rule in CLAUDE.md: Supabase's default
-- ALTER DEFAULT PRIVILEGES hands anon a direct EXECUTE grant on every new
-- function. A trigger function cannot be called usefully from SQL, but the
-- grant is taken back anyway so the catalogue reads the same as every other
-- SECURITY DEFINER function here. Trigger EXECUTE rights are checked when the
-- trigger is CREATED, not when it fires, so this does not disarm it.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_metric_owners_trail()
  FROM anon, authenticated, PUBLIC;

-- ── 2) The trigger ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_accreditation_metric_owners_trail
  ON public.accreditation_metric_owners;

CREATE CONSTRAINT TRIGGER trg_accreditation_metric_owners_trail
  AFTER INSERT OR UPDATE OR DELETE ON public.accreditation_metric_owners
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_accreditation_metric_owners_trail();

-- ── 3) Assert, in this transaction, that it is armed and deferred ───────────
DO $$
DECLARE
  v_deferred boolean;
  v_deferrable boolean;
BEGIN
  SELECT tgdeferrable, tginitdeferred
    INTO v_deferrable, v_deferred
    FROM pg_trigger
   WHERE tgrelid = 'public.accreditation_metric_owners'::regclass
     AND tgname  = 'trg_accreditation_metric_owners_trail'
     AND NOT tgisinternal;

  IF v_deferrable IS NULL THEN
    RAISE EXCEPTION 'the ownership trail trigger was not created';
  END IF;

  IF NOT (v_deferrable AND v_deferred) THEN
    RAISE EXCEPTION
      'the ownership trail trigger is not deferred; it would double every event '
      'written by fn_accreditation_assign_metric_owner';
  END IF;

  IF has_function_privilege('anon',
       'public.fn_accreditation_metric_owners_trail()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_metric_owners_trail';
  END IF;
END $$;
