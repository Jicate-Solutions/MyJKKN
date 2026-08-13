-- ============================================================================
-- Empty-bed settlement — scope it to the categories an admin opts in
-- ============================================================================
-- 2026-08-13. Director's call: start with Premium only.
--
-- The settle engine is category-agnostic: its trigger opens a window on EVERY
-- active arrival, in every room, of every category. Left alone, arming it would
-- reach all 84 learners currently in under-filled multi-bed rooms — Classic and
-- Deluxe included.
--
-- The opt-in is a column on hostel_categories rather than a hardcoded name test
-- (`name ILIKE 'Premium%'` would silently capture a future "Premium Economy"
-- and silently miss a rename) and rather than a platform policy holding a list
-- of uuids (invisible next to the fee it modifies). As a column it is editable
-- from the Room Sharing tab beside the category's own fee, which is where an
-- admin is already standing when they decide this.
--
-- Seeded true for Premium Room and Premium Room + AC, both genders. Everything
-- else stays false, so nothing widens by accident.
--
-- Turning a category OFF stops billing for it: fn_settle_window_due filters on
-- the flag, so an already-open window on a de-scoped category simply stops
-- coming due rather than firing one last time.
-- ============================================================================

ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS settle_billing_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hostel_categories.settle_billing_enabled IS
  'Opt this room category into empty-bed settlement. When false no settle window '
  'ever opens for its rooms and none of them can be billed for empty beds. '
  'Edited from /campus-living/settings/fee-config?tab=sharing. Independent of the '
  'hostel.settle_bill.enabled master switch, which gates the whole mechanism.';

-- Premium Plus Room holds no rooms today, so enabling it changes nothing now;
-- it is included so a room created under it later is in scope by default rather
-- than silently escaping the mechanism.
UPDATE public.hostel_categories
   SET settle_billing_enabled = true
 WHERE name IN ('Premium Room', 'Premium Room + AC', 'Premium Plus Room');

-- ── Window opener: refuse ineligible categories before anything else ────────
-- The eligibility test sits ABOVE the permission check on purpose. This runs
-- from an AFTER-INSERT trigger on every single allocation arrival; an
-- ineligible room must fall out cheaply and silently rather than evaluating a
-- permission it will never use and raising 42501 into the trigger's warning log.
CREATE OR REPLACE FUNCTION public.fn_settle_window_open(p_room_id uuid, p_hostel_year_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year_id  uuid;
  v_window   public.hostel_room_settle_windows%ROWTYPE;
  v_win_days int;
  v_outer    int;
  v_deadline timestamptz;
BEGIN
  -- Master switch. While off, no window is ever created, so switching it on
  -- later starts from a clean slate rather than a backlog of stale deadlines.
  IF NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RETURN jsonb_build_object('action', 'disabled', 'room_id', p_room_id);
  END IF;

  -- Category opt-in. A room with no category can never be priced by
  -- fn_settle_room_annual_cost either, so it is excluded here too.
  IF NOT EXISTS (
    SELECT 1
    FROM hostel_rooms r
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.id = p_room_id
      AND hc.settle_billing_enabled
  ) THEN
    RETURN jsonb_build_object('action', 'not_eligible', 'room_id', p_room_id);
  END IF;

  -- Opening/restarting a window delays billing, so it is gated too — but on the
  -- permission the people who actually allocate rooms hold, not the fees one.
  IF NOT (fn_settle_can_manage(p_room_id, 'campus_living.allocations.create')
          OR fn_settle_can_manage(p_room_id, 'campus_living.fees.config')) THEN
    RAISE EXCEPTION 'permission denied: campus_living.allocations.create or campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  v_year_id := COALESCE(p_hostel_year_id, fn_settle_current_hostel_year());

  -- A room already billed for this year must NOT get a second window — that
  -- would bill everyone twice. This is the late-join credit path instead.
  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND COALESCE(w.hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND w.status = 'billed'
  ORDER BY w.billed_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'action',    'already_billed_late_join',
      'room_id',   p_room_id,
      'window_id', v_window.id,
      'note',      'Room already billed — run fn_settle_late_join_credit.');
  END IF;

  v_win_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.window_days', 5));
  v_outer    := GREATEST(0, fn_get_policy_int('hostel.settle_bill.outer_limit_days', 20));

  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND COALESCE(w.hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND w.status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO hostel_room_settle_windows
      (room_id, hostel_year_id, opened_at, restart_count,
       current_deadline, hard_deadline, status)
    VALUES
      (p_room_id, v_year_id, now(), 0,
       now() + make_interval(days => v_win_days),
       now() + make_interval(days => v_outer),
       'open')
    RETURNING * INTO v_window;

    RETURN jsonb_build_object(
      'action',           'opened',
      'room_id',          p_room_id,
      'window_id',        v_window.id,
      'restart_count',    v_window.restart_count,
      'current_deadline', v_window.current_deadline,
      'hard_deadline',    v_window.hard_deadline);
  END IF;

  -- Restart: push the deadline out, but never past the hard limit.
  v_deadline := LEAST(now() + make_interval(days => v_win_days), v_window.hard_deadline);

  UPDATE hostel_room_settle_windows
     SET restart_count    = restart_count + 1,
         current_deadline = v_deadline
   WHERE id = v_window.id
  RETURNING * INTO v_window;

  RETURN jsonb_build_object(
    'action',           'restarted',
    'room_id',          p_room_id,
    'window_id',        v_window.id,
    'restart_count',    v_window.restart_count,
    'current_deadline', v_window.current_deadline,
    'hard_deadline',    v_window.hard_deadline,
    'capped_at_hard_deadline', v_deadline = v_window.hard_deadline);
END;
$function$;

-- ── Due list: honour a category switched off after its window opened ────────
CREATE OR REPLACE FUNCTION public.fn_settle_window_due()
 RETURNS TABLE(window_id uuid, room_id uuid, hostel_year_id uuid, reason text, active_occupants integer, capacity integer, opened_at timestamp with time zone, current_deadline timestamp with time zone, hard_deadline timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    w.id,
    w.room_id,
    w.hostel_year_id,
    -- 'room_full' is tested FIRST: rule 4 says a full room bills immediately
    -- because nothing more can change the price.
    CASE
      WHEN occ.capacity > 0 AND occ.active_residents >= occ.capacity THEN 'room_full'
      WHEN now() >= w.hard_deadline                                  THEN 'outer_limit'
      ELSE                                                                'window_elapsed'
    END,
    occ.active_residents,
    occ.capacity,
    w.opened_at,
    w.current_deadline,
    w.hard_deadline
  FROM hostel_room_settle_windows w
  JOIN v_hostel_room_occupancy occ ON occ.room_id = w.room_id
  WHERE w.status = 'open'
    AND (
      now() >= w.current_deadline
      OR now() >= w.hard_deadline
      OR (occ.capacity > 0 AND occ.active_residents >= occ.capacity)
    )
    -- Category opt-in, re-checked at close time. Switching a category off must
    -- STOP billing it, not let one last sweep through on windows already open.
    AND EXISTS (
      SELECT 1
      FROM hostel_rooms r
      JOIN hostel_categories hc ON hc.id = r.category_id
      WHERE r.id = w.room_id
        AND hc.settle_billing_enabled
    )
    -- Scoped: SECURITY DEFINER bypasses RLS, so without this the list would
    -- leak every institution's rooms to any authenticated caller.
    AND fn_settle_can_manage(w.room_id, 'campus_living.fees.view')
  ORDER BY w.current_deadline;
$function$;

-- ── Lockdown, restated ──────────────────────────────────────────────────────
-- CREATE OR REPLACE preserves grants, so these already hold. Restated so the
-- migration is self-contained and the CI gate can see it. anon AND PUBLIC:
-- revoking only anon is a no-op, since anon is a member of PUBLIC and Postgres
-- grants EXECUTE to PUBLIC on every function by default.
REVOKE EXECUTE ON FUNCTION public.fn_settle_window_open(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_settle_window_due()            FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_window_open(uuid, uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_settle_window_due()            TO authenticated, service_role;
