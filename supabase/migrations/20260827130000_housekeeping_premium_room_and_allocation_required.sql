-- ============================================================================
-- Housekeeping entitlement: premium ENROLLED category AND premium ALLOCATED
-- room AND an active allocation — all three, or no booking.
-- ----------------------------------------------------------------------------
-- Decision (2026-08-27, Option A): "only premium room learners can book" means
-- BOTH sides must qualify, not either:
--   1. an ACTIVE room allocation must exist (no room → no booking), and
--   2. the ENROLLED category (learners_profiles.hostel_category_id — what the
--      learner is billed for) is premium / premium_plus, and
--   3. the ALLOCATED room's category (hostel_rooms.category_id — where they
--      actually sleep) is premium / premium_plus.
--
-- Before this, entitlement resolved from the enrolled category and fell back
-- to the room only when enrolled was NULL. That let a learner billed for a
-- Premium Room but seated in a Deluxe Room book a slot (1 live case:
-- PARKAVI P / DB23A053, Girls Hostel C room 19). The reverse case was 0.
--
-- Implemented by making the resolver return BOTH tiers and take the LOWER of
-- the two (rank standard < premium < premium_plus). A minimum naturally
-- encodes the AND: if either side is standard the effective tier is standard,
-- which carries no 'book_housekeeping_slots' feature and a zero quota.
--
-- BLAST RADIUS: fn_housekeeping_entitlement_tier is called ONLY by
-- fn_housekeeping_my_entitlement and fn_housekeeping_book_slot (verified via
-- pg_proc scan + a frontend grep). The other premium features listed in
-- tier_features (pick_block_and_room, pick_specific_bed,
-- pick_roommate_with_consent) do NOT read this resolver, so they are
-- unaffected. The signature changes, so the function is dropped and both
-- callers are recreated here in the same migration.
--
-- Audit query for non-compliant live bookings (should return zero rows):
--   SELECT b.id, b.status FROM hostel_cleaning_bookings b
--   JOIN profiles p ON p.learner_id = b.learner_id
--   CROSS JOIN LATERAL fn_housekeeping_entitlement_tier(p.id) e
--   WHERE b.status IN ('booked','assigned')
--     AND (NOT e.has_allocation OR NOT (e.tier_features ? 'book_housekeeping_slots'));
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_housekeeping_entitlement_tier(uuid);

CREATE FUNCTION public.fn_housekeeping_entitlement_tier(p_profile_id uuid)
RETURNS TABLE(
  has_allocation           boolean,
  enrolled_category_name   text,
  enrolled_tier            text,
  room_category_name       text,
  room_tier                text,
  -- The LOWER of the two tiers: 'standard' unless BOTH sides are premium-band.
  tier_key                 text,
  -- Name of the LIMITING side, so the refusal message points at the reason.
  category_name            text,
  tier_features            jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH alloc AS (
    SELECT a.room_id
    FROM public.hostel_allocations a
    WHERE a.learner_id = p_profile_id
      AND a.status = 'active'
      AND a.check_out_date IS NULL
    ORDER BY a.allocation_date DESC, a.created_at DESC
    LIMIT 1
  ),
  enrolled AS (
    SELECT c.name, COALESCE(c.tier_key, 'standard') AS tier_key
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
    JOIN public.hostel_categories c ON c.id = lp.hostel_category_id
    WHERE p.id = p_profile_id
  ),
  room AS (
    SELECT c.name, COALESCE(c.tier_key, 'standard') AS tier_key
    FROM alloc
    JOIN public.hostel_rooms r ON r.id = alloc.room_id
    JOIN public.hostel_categories c ON c.id = r.category_id
  ),
  ranked AS (
    SELECT
      EXISTS (SELECT 1 FROM alloc)                                AS has_allocation,
      (SELECT name     FROM enrolled)                             AS e_name,
      COALESCE((SELECT tier_key FROM enrolled), 'standard')       AS e_tier,
      (SELECT name     FROM room)                                 AS r_name,
      COALESCE((SELECT tier_key FROM room),     'standard')       AS r_tier
  ),
  scored AS (
    SELECT ranked.*,
      CASE e_tier WHEN 'premium_plus' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END AS e_rank,
      CASE r_tier WHEN 'premium_plus' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END AS r_rank
    FROM ranked
  ),
  effective AS (
    SELECT scored.*,
      -- No allocation ⇒ standard outright; otherwise the weaker of the two.
      CASE
        WHEN NOT has_allocation THEN 'standard'
        WHEN r_rank <= e_rank   THEN r_tier
        ELSE e_tier
      END AS eff_tier,
      CASE
        WHEN NOT has_allocation THEN COALESCE(e_name, r_name)
        WHEN r_rank <= e_rank   THEN COALESCE(r_name, e_name)
        ELSE COALESCE(e_name, r_name)
      END AS eff_name
    FROM scored
  )
  SELECT
    effective.has_allocation,
    effective.e_name,
    effective.e_tier,
    effective.r_name,
    effective.r_tier,
    effective.eff_tier,
    effective.eff_name,
    COALESCE(htp.tier_features, '[]'::jsonb)
  FROM effective
  LEFT JOIN LATERAL (
    SELECT t.tier_features
    FROM public.hostel_tier_policy t
    WHERE t.tier_key = effective.eff_tier
      AND t.is_active
    ORDER BY (t.institution_id IS NULL)
    LIMIT 1
  ) htp ON TRUE;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_entitlement_tier(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_entitlement_tier(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- fn_housekeeping_my_entitlement — UI gate, same rule as the write gate
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_my_entitlement()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid;
  v_learner_id  uuid;
  v_tier        record;
  v_quota_json  jsonb;
  v_quota       int;
  v_used        int := 0;
  v_today       date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', NULL,
      'categoryName', NULL, 'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'no_active_allocation');
  END IF;

  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  -- No allocated room ⇒ nothing to clean. Same answer the write gate gives.
  IF NOT FOUND OR NOT v_tier.has_allocation THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', NULL,
      'categoryName', NULL, 'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'no_active_allocation');
  END IF;

  -- tier_key here is already the LOWER of enrolled vs allocated room, so a
  -- premium-billed learner sitting in a standard room lands on 'standard'.
  IF v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('entitled', false,
      'tierKey', COALESCE(v_tier.tier_key, 'standard'),
      'categoryName', v_tier.category_name,
      'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'tier_not_entitled');
  END IF;

  v_quota_json := COALESCE(
    fn_get_policy_json('housekeeping.weekly_quota_by_tier',
      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb, NULL),
    '{"standard":0,"premium":2,"premium_plus":5}'::jsonb);
  v_quota := COALESCE((v_quota_json ->> v_tier.tier_key)::int, 0);

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_learner_id IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.learner_id = v_learner_id
      AND b.status IN ('booked','assigned','completed')
      AND date_trunc('week', b.booking_date::timestamp)
          = date_trunc('week', v_today::timestamp);
  END IF;

  IF v_quota <= 0 THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', v_tier.tier_key,
      'categoryName', v_tier.category_name, 'weeklyQuota', 0,
      'usedThisWeek', v_used, 'reason', 'no_weekly_quota');
  END IF;

  RETURN jsonb_build_object('entitled', true, 'tierKey', v_tier.tier_key,
    'categoryName', v_tier.category_name, 'weeklyQuota', v_quota,
    'usedThisWeek', v_used);
END $function$;


-- ────────────────────────────────────────────────────────────────────────
-- fn_housekeeping_book_slot — write gate (unchanged except the tier read)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_book_slot(p_date date, p_slot_start time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid;
  v_learner_id   uuid;
  v_alloc        record;
  v_tier         record;
  v_enabled      boolean;
  v_slot_minutes int;
  v_window       jsonb;
  v_win_start    time;
  v_win_end      time;
  v_capacity     int;
  v_advance_days int;
  v_quota_json   jsonb;
  v_quota        int;
  v_now_ist        timestamp;
  v_offset_minutes numeric;
  v_window_minutes numeric;
  v_used_this_week int;
  v_booked_in_slot int;
  v_slot_end       time;
  v_booking_id     uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'Authentication required.');
  END IF;

  v_enabled := COALESCE((fn_get_policy_json('housekeeping.booking_enabled', 'true'::jsonb, NULL) #>> '{}')::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'disabled',
      'message', 'Housekeeping slot booking is currently turned off.');
  END IF;

  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'No learner profile is linked to this account.');
  END IF;

  SELECT a.id, a.room_id, a.block_id, a.institution_id
  INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status = 'active'
    AND a.check_out_date IS NULL
  ORDER BY a.allocation_date DESC, a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'You do not have an active hostel allocation.');
  END IF;

  -- Entitlement = premium ENROLLED category AND premium ALLOCATED room AND an
  -- active allocation. The resolver returns the lower of the two tiers, so a
  -- premium-billed learner housed in a standard room resolves to 'standard'.
  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  IF NOT FOUND OR NOT v_tier.has_allocation
     OR v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

  v_slot_minutes := COALESCE((fn_get_policy_json('housekeeping.slot_duration_minutes', '10'::jsonb, NULL) #>> '{}')::int, 10);
  IF v_slot_minutes <= 0 THEN v_slot_minutes := 10; END IF;
  v_window       := COALESCE(fn_get_policy_json('housekeeping.service_window',
                      '{"start":"09:00","end":"17:00"}'::jsonb, NULL),
                      '{"start":"09:00","end":"17:00"}'::jsonb);
  v_win_start    := COALESCE((v_window->>'start')::time, '09:00'::time);
  v_win_end      := COALESCE((v_window->>'end')::time,   '17:00'::time);
  v_capacity     := COALESCE((fn_get_policy_json('housekeeping.capacity_per_slot_per_block', '1'::jsonb, NULL) #>> '{}')::int, 1);
  v_advance_days := COALESCE((fn_get_policy_json('housekeeping.booking_advance_days', '7'::jsonb, NULL) #>> '{}')::int, 7);
  v_quota_json   := COALESCE(fn_get_policy_json('housekeeping.weekly_quota_by_tier',
                      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb, NULL),
                      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb);
  v_quota        := COALESCE((v_quota_json ->> v_tier.tier_key)::int, 0);

  IF v_quota <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';

  IF p_date > (v_now_ist::date + v_advance_days) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'too_far_ahead',
      'message', format('Bookings open up to %s days ahead.', v_advance_days));
  END IF;

  IF (p_date + p_slot_start) <= v_now_ist THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'past_slot',
      'message', 'That slot is already in the past.');
  END IF;

  v_offset_minutes := EXTRACT(EPOCH FROM (p_slot_start - v_win_start)) / 60;
  v_window_minutes := EXTRACT(EPOCH FROM (v_win_end - v_win_start)) / 60;
  IF v_offset_minutes < 0
     OR (v_offset_minutes::int % v_slot_minutes) <> 0
     OR (v_offset_minutes + v_slot_minutes) > v_window_minutes THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'outside_window',
      'message', 'That time is outside the housekeeping service window.');
  END IF;

  SELECT COUNT(*)::int INTO v_used_this_week
  FROM public.hostel_cleaning_bookings b
  WHERE b.learner_id = v_learner_id
    AND b.status IN ('booked','assigned','completed')
    AND date_trunc('week', b.booking_date::timestamp)
        = date_trunc('week', p_date::timestamp);

  IF v_used_this_week >= v_quota THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
      'message', format('Weekly limit reached (%s of %s used).', v_used_this_week, v_quota));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'housekeeping_slot:' || v_alloc.block_id::text || ':' || p_date::text
      || ':' || p_slot_start::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.booking_date = p_date
      AND b.slot_start = p_slot_start
      AND b.status IN ('booked','assigned')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
  END IF;

  SELECT COUNT(*)::int INTO v_booked_in_slot
  FROM public.hostel_cleaning_bookings b
  WHERE b.block_id = v_alloc.block_id
    AND b.booking_date = p_date
    AND b.slot_start = p_slot_start
    AND b.status IN ('booked','assigned');

  IF v_booked_in_slot >= v_capacity THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full',
      'message', 'This slot is fully booked for your block.');
  END IF;

  v_slot_end := p_slot_start + make_interval(mins => v_slot_minutes);

  INSERT INTO public.hostel_cleaning_bookings
    (institution_id, block_id, room_id, allocation_id, learner_id,
     booking_date, slot_start, slot_end, status, notes)
  VALUES
    (v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id,
     v_learner_id, p_date, p_slot_start, v_slot_end, 'booked', p_notes)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
END $function$;


-- ────────────────────────────────────────────────────────────────────────
-- Cleanup: cancel live bookings whose learner no longer satisfies the rule
-- ────────────────────────────────────────────────────────────────────────
-- Idempotent and currently a no-op (both existing bookings are Premium Room
-- + AC in Premium Room + AC rooms). Kept in the migration so the data can
-- never contradict the gate: a learner downgraded or moved to a standard room
-- after booking gets their open slot released rather than silently keeping it.

UPDATE public.hostel_cleaning_bookings b
SET status       = 'cancelled',
    cancelled_at = now(),
    notes        = concat_ws(' | ', NULLIF(b.notes, ''),
                     'Auto-cancelled: room/category no longer premium (2026-08-27 rule).'),
    assigned_profile_id = NULL,
    assigned_staff_name = NULL,
    assigned_at         = NULL,
    assigned_by         = NULL
FROM public.profiles p
WHERE p.learner_id = b.learner_id
  AND b.status IN ('booked','assigned')
  AND NOT EXISTS (
    SELECT 1
    FROM public.fn_housekeeping_entitlement_tier(p.id) e
    WHERE e.has_allocation
      AND (e.tier_features ? 'book_housekeeping_slots')
  );
