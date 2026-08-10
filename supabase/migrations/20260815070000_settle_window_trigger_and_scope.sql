-- 2026-08-10 CORRECTION: hostel_rooms has NO institution_id column, so this
-- file could not be applied at all (42703 on the first policy). A room's
-- institution is carried by its beds; hostel_rooms' own RLS scopes with
-- fn_user_can_access_room(id) / role_has_block_access(block_id). Corrected in
-- place because this migration had never been applied to any environment.
-- ============================================================================
-- 20260815070000_settle_window_trigger_and_scope.sql
-- Start the settle clock on every move-in, and stop an admin billing another
-- college's rooms.
-- ----------------------------------------------------------------------------
-- 🛑 FILE ONLY — NOT APPLIED. Director-gated. Nothing here has been run against
--    production. It also changes NO switch: hostel.settle_bill.enabled stays
--    false, so applying this file still opens zero windows and bills nobody.
--    The apply-time assert at the bottom fails the migration if that switch
--    ever reads true at apply, exactly as the engine's own assert does.
--
-- WHY IT EXISTS — both of these were DISCLOSED as gaps in PR #2954 (the engine,
-- 20260815060000_hostel_settle_then_bill.sql) and DECIDED by the Director in
-- the 2026-08-10 interview:
--
--   GAP 1 — "Rules 1–3 have no trigger yet." Nothing anywhere calls
--   fn_settle_window_open. Flipping the master switch on today opens ZERO
--   windows, so the whole engine is inert no matter what the switch says.
--
--   GAP 2 — fn_settle_can_manage returns true on `is_super_admin() OR
--   is_admin()` BEFORE it ever reads the room's institution, so any of the 17
--   admin-flagged people can bill rooms in a college that is not theirs.
--
-- ── DIRECTOR'S DECISION FOR THE TRIGGER (2026-08-10), verbatim intent ───────
--   ARRIVALS ONLY. A learner joining a room starts or restarts that room's
--   clock. A learner LEAVING does NOT touch any clock — otherwise a departure
--   would postpone the remaining residents' bills, which is backwards: the
--   people still in the room would wait longer to be billed because someone
--   else went home. A learner who moves from room A to room B: room A keeps
--   its clock (minus her), her arrival starts/restarts room B's. She is only
--   ever billed for where she ends up.
--
-- ── WHAT "ARRIVAL" MEANS, PRECISELY ────────────────────────────────────────
--   Active occupancy is `status = 'active' AND check_out_date IS NULL` — the
--   same pair v_hostel_room_occupancy and the whole engine count on. The
--   second "has left" date (actual_vacate_date) is deliberately NOT consulted;
--   see the engine's header for why (the bed-uniqueness index reads only
--   check_out_date, and the two have already drifted in production once).
--
--   An arrival is a row BECOMING an active occupancy of a room it was not
--   already actively occupying:
--     * INSERT  — the new row is an active occupancy.
--     * UPDATE  — the row is an active occupancy NOW, and either it was not
--                 one before (pending_approval → active, or a check_out_date
--                 cleared on a re-admission), or its room_id changed.
--   Everything else is not an arrival and must not touch a clock:
--     * status flipped to vacated/transferred/suspended → NOT an arrival.
--     * check_out_date set → NOT an arrival.
--     * any edit to an already-active row in the same room (fee_status,
--       emergency contact, bed swap inside the room) → NOT an arrival, so a
--       routine admin edit can never silently postpone a room's bill.
--   Those conditions live in the triggers' WHEN clauses, so on a departure the
--   function is never even entered.
--
-- ── WHY THE TRIGGER FUNCTION IS SECURITY DEFINER ───────────────────────────
--   A plain (SECURITY INVOKER) trigger runs under the writer's own RLS, and
--   RLS denial in Postgres is always silent — 0 rows, no error. The window
--   lookup inside fn_settle_window_open would then read nothing and the clock
--   would silently fail to restart for exactly the callers whose RLS is
--   narrowest. SET search_path = public closes the search_path-hijack class.
--   REVOKE EXECUTE FROM anon, PUBLIC is asserted even though only the triggers
--   invoke it (Postgres never checks EXECUTE when a trigger fires) — the
--   CLAUDE.md rule and the CI gate both require it.
--
-- ── PLACING A LEARNER IN A BED OUTRANKS OPENING A BILLING WINDOW ───────────
--   fn_settle_window_open can raise: it RAISEs 42501 when the writer holds
--   neither campus_living.allocations.create nor campus_living.fees.config,
--   and the whole settle schema may simply be ABSENT on an environment where
--   the engine migration has not been applied (this one and the engine are
--   both file-only and may land in either order). An AFTER trigger that
--   raises ABORTS THE INSERT — a learner would fail to get a bed because a
--   billing window could not be opened. The call is therefore wrapped in a
--   BEGIN … EXCEPTION WHEN OTHERS block: plpgsql opens an internal savepoint,
--   so a failure rolls back only the window write and the allocation stands.
--   The failure is surfaced with RAISE WARNING, never swallowed silently.
--
-- ── ORDERING AGAINST THE 5 TRIGGERS ALREADY ON hostel_allocations ──────────
--   trg_allocation_guard_reserved_bed        BEFORE INSERT/UPDATE OF bed,room
--   trg_validate_hostel_allocation_gender    BEFORE
--   trg_allocation_sync_learner_categories   AFTER
--   trg_hostel_premium_audit                 AFTER
--   trg_hostel_allocations_updated_at        BEFORE UPDATE
--   The reserved-bed guard can REJECT a row; it is BEFORE, ours is AFTER, so
--   ours only ever runs on rows that already survived it — we never open a
--   window for an allocation that was refused. Among AFTER triggers Postgres
--   fires in trigger-name order, so "trg_allocation_settle_arrival_*" runs
--   before "trg_allocation_sync_learner_categories" and "trg_hostel_premium_
--   audit"; the order is immaterial either way, because ours neither reads nor
--   writes anything they touch (they write learners_profiles categories and an
--   audit log; we write only hostel_room_settle_windows — so there is also no
--   re-entry into hostel_allocations and no trigger recursion).
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
--   No switch is flipped, no cron is scheduled, no TS/route is touched, no fee
--   formula is restated. It adds one trigger function, two triggers, and
--   rebuilds ONE existing function with a scoped admin branch.
--
-- Idempotent and safe to re-apply.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The arrival trigger function.
--
--    The hostel year is resolved INSIDE fn_settle_window_open (it COALESCEs a
--    NULL p_hostel_year_id to fn_settle_current_hostel_year()). Passing NULL
--    rather than re-resolving here is deliberate: one resolver means the
--    trigger can never disagree with the close and credit paths about which
--    year a window belongs to, and fn_settle_current_hostel_year() is the
--    engine's single source of truth for it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_allocation_settle_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Arrival-only is enforced by the triggers' WHEN clauses below; by the time
  -- this body runs, NEW is an active occupancy of a room it was not already
  -- actively occupying.
  BEGIN
    PERFORM fn_settle_window_open(NEW.room_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never abort the allocation. A bed placement that succeeded must not be
    -- undone because a billing window could not be opened; the window is
    -- recoverable (the next arrival, or an admin call, opens it), a refused
    -- allocation is not.
    RAISE WARNING
      '[campus-living] settle window not opened for room % (allocation %): % [%]',
      NEW.room_id, NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NULL;  -- AFTER trigger: the return value is ignored.
END;
$function$;

-- No GRANT TO authenticated on purpose: this function has no legitimate direct
-- caller, only the two triggers below. Revoked anyway per the CLAUDE.md rule
-- and the CI gate (check-secdef-anon-revoke.mjs).
REVOKE EXECUTE ON FUNCTION public._on_allocation_settle_arrival() FROM anon, PUBLIC;

COMMENT ON FUNCTION public._on_allocation_settle_arrival() IS
  'Starts or restarts a room''s settle window when a learner ARRIVES in it '
  '(Director 2026-08-10). Departures never touch a clock. Failures are warned '
  'and swallowed — placing a learner in a bed outranks opening a billing '
  'window. Inert while hostel.settle_bill.enabled is false.';

-- ----------------------------------------------------------------------------
-- 2. The two triggers. The arrival test lives here so a departure never even
--    enters the function.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_allocation_settle_arrival_insert ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_settle_arrival_insert
  AFTER INSERT ON public.hostel_allocations
  FOR EACH ROW
  WHEN (NEW.status = 'active'::allocation_status_enum
        AND NEW.check_out_date IS NULL)
  EXECUTE FUNCTION public._on_allocation_settle_arrival();

DROP TRIGGER IF EXISTS trg_allocation_settle_arrival_update ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_settle_arrival_update
  AFTER UPDATE ON public.hostel_allocations
  FOR EACH ROW
  WHEN (
    -- It is an active occupancy NOW …
    NEW.status = 'active'::allocation_status_enum
    AND NEW.check_out_date IS NULL
    AND (
      -- … and it was not one before (came into active occupancy) …
      OLD.status IS DISTINCT FROM 'active'::allocation_status_enum
      OR OLD.check_out_date IS NOT NULL
      -- … or it moved into a different room while active.
      OR NEW.room_id IS DISTINCT FROM OLD.room_id
    )
  )
  EXECUTE FUNCTION public._on_allocation_settle_arrival();

-- ----------------------------------------------------------------------------
-- 3. fn_settle_can_manage — close the cross-tenant gap.
--
--    Rebuilt from the definition in 20260815060000_hostel_settle_then_bill.sql
--    VERBATIM except for the admin branch. 45 lines before, 55 after; the only
--    behavioural change is the four lines marked 2026-08-10.
--
--    BEFORE: `IF is_super_admin() OR is_admin() THEN RETURN true;` ran BEFORE
--    the room's institution was ever read, so a plain admin of College A could
--    bill College B's rooms — and because every writer and both read lists in
--    the engine route through this one function, that hole was the engine's
--    entire cross-tenant surface.
--
--    AFTER: is_super_admin() keeps unconditional reach (the platform owner is
--    deliberately cluster-wide, and keeping the check above the NULL-room test
--    preserves its behaviour on a room that does not exist). A plain
--    is_admin() must ALSO satisfy role_has_institution_access() on the room's
--    own institution — the same test the permission path below it already
--    applied. An admin with no access to the room's institution now reads
--    false instead of true.
--
--    The service_role cron bypass is UNCHANGED. It was deliberately narrowed
--    in #2954 and its reasoning is reproduced verbatim below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_can_manage(
  p_room_id    uuid,
  p_permission text DEFAULT 'campus_living.fees.config'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  -- The cron bypass is deliberately NARROW. "No resolvable auth.uid()" alone is
  -- too broad: a token missing `sub`, a psql session holding EXECUTE, pg_cron,
  -- or a nested SECURITY DEFINER that reset request.jwt.claims would all land
  -- here and get unconditional cross-tenant write. The session role must ALSO
  -- name itself. If the deployed cron runtime reports some other role this gate
  -- refuses it — which is the correct direction to be wrong in: the mechanism
  -- is OFF and unwired, so a too-tight gate surfaces in the first dry run,
  -- whereas a too-loose one is a silent cross-tenant billing hole. Widen it
  -- deliberately after observing the real role, never pre-emptively.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(
             (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role',
             ''
           ) = 'service_role'
        OR COALESCE(current_setting('role', true), '') = 'service_role';
  END IF;

  -- 2026-08-10: the room's institution is resolved BEFORE the admin branch.
  -- It used to be read after it, which is precisely why the admin branch could
  -- not be scoped.
  SELECT b.institution_id INTO v_institution_id
  FROM hostel_beds b
  WHERE b.room_id = p_room_id AND b.institution_id IS NOT NULL
  LIMIT 1;

  -- Platform owner: unconditional, and above the NULL-room test so a super
  -- admin's answer is byte-for-byte what it was before this change.
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF v_institution_id IS NULL THEN
    RETURN false;
  END IF;

  -- 2026-08-10: a plain admin is an admin OF SOMEWHERE. Scoped to the room's
  -- institution, exactly like the permission path below.
  IF is_admin() THEN
    RETURN role_has_institution_access(v_institution_id);
  END IF;

  RETURN user_has_permission(p_permission)
     AND role_has_institution_access(v_institution_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_can_manage(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_can_manage(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Apply-time asserts. Same shape and same intent as the engine's, so this
--    file cannot land in a state the engine's own assert would have refused.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_open text;
BEGIN
  -- Nothing here flips the switch, and the file must refuse to apply into an
  -- already-armed database.
  IF fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'hostel.settle_bill.enabled must be FALSE — it reads true';
  END IF;

  -- anon must hold EXECUTE on neither the rebuilt gate nor the new trigger
  -- function. Supabase's default privileges re-GRANT to anon on every new
  -- function, so a revoke that silently did nothing is the failure worth
  -- catching.
  SELECT string_agg(p.proname, ', ')
    INTO v_open
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE 'fn_settle%'
         OR p.proname = '_on_allocation_settle_arrival')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on: %', v_open;
  END IF;

  -- The engine's money-writer guard assert, re-run here: this file replaces
  -- fn_settle_can_manage, and a rebuild that dropped the call from any writer
  -- must fail the migration rather than open the door quietly.
  SELECT string_agg(p.proname, ', ')
    INTO v_open
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_settle_window_open','fn_settle_bill_close',
                      'fn_settle_late_join_credit')
    AND pg_get_functiondef(p.oid) NOT LIKE '%fn_settle_can_manage%';
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'money-writer(s) missing an authorization guard: %', v_open;
  END IF;

  -- The gate must still scope the admin path. A later CREATE OR REPLACE that
  -- restores the unconditional `is_super_admin() OR is_admin()` branch fails
  -- here instead of silently reopening the cross-tenant hole.
  IF pg_get_functiondef('public.fn_settle_can_manage(uuid, text)'::regprocedure)
       LIKE '%is_super_admin() OR is_admin()%' THEN
    RAISE EXCEPTION
      'fn_settle_can_manage still short-circuits on an unscoped admin branch';
  END IF;

  -- Both arrival triggers must exist and be AFTER-row triggers on
  -- hostel_allocations. A window that no move-in opens is the gap this file
  -- exists to close.
  IF (SELECT count(*)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'hostel_allocations'
         AND NOT t.tgisinternal
         AND t.tgname IN ('trg_allocation_settle_arrival_insert',
                          'trg_allocation_settle_arrival_update')
         -- TRIGGER_TYPE_ROW = 1, TRIGGER_TYPE_BEFORE = 2. AFTER-row means the
         -- row bit set and the before bit clear.
         AND (t.tgtype & 1) = 1
         AND (t.tgtype & 2) = 0) <> 2 THEN
    RAISE EXCEPTION 'the two AFTER-row settle arrival triggers are not both present';
  END IF;
END
$assert$;

COMMIT;
