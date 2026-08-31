-- ============================================================================
-- Housekeeping slot booking — entitlement follows the ROOM CATEGORY
-- ============================================================================
-- Date: 2026-08-25
--
-- WHY
-- ---
-- fn_housekeeping_book_slot (20260610190000) gates booking on
-- hostel_allocations.tier_id -> hostel_tier_policy.tier_features. That ladder
-- is DEAD in production: all 1,094 hostel_allocations rows point at the
-- 'standard' tier, whose tier_features is []. Result: every resident is
-- refused with error_code 'tier_not_entitled', the resident page shows the
-- "Upgrade to Premium" card to 100% of residents, and hostel_cleaning_bookings
-- has had zero rows since the feature shipped (verified 2026-08-25).
--
-- The ladder residents actually live on is hostel_categories, reached two ways:
--   * learners_profiles.hostel_category_id  — the category they are enrolled
--     in / billed for (the one My Hostel shows under "My Category & Fees")
--   * hostel_rooms.category_id              — the category of the room the
--     office actually seated them in
-- Live spread of the 697 active residents: Classic 452, Deluxe 134,
-- Premium Room 91, Premium Room + AC 20.
--
-- WHAT THIS DOES
-- --------------
-- 1. hostel_categories.tier_key — maps each room category onto the entitlement
--    vocabulary that hostel_tier_policy already defines (standard | premium |
--    premium_plus). One column bridges the two ladders, so every knob already
--    built for housekeeping keeps working unchanged: tier_features stays the
--    feature flag, housekeeping.weekly_quota_by_tier stays the quota, the
--    Director's settings form stays a 3-tier grid.
-- 2. fn_housekeeping_entitlement_tier — the single resolver: profile ->
--    category -> tier. Enrolled category wins; the allocated room's category
--    is the fallback (they diverge for 61 residents today, only 1 of them in
--    the Premium band).
-- 3. fn_housekeeping_my_entitlement — one SECURITY DEFINER read that returns
--    the whole entitlement envelope the resident UI needs. Replaces a 5-query
--    client-side composition whose rules could drift from the write gate's.
-- 4. fn_housekeeping_book_slot — repointed at the same resolver, so the write
--    gate and the UI gate can no longer disagree.
--
-- NET EFFECT: the 111 residents in a Premium room category can book (2/week
-- for premium, 5/week for premium_plus per the existing policy row); Classic
-- and Deluxe residents keep the block cleaning rounds and keep seeing the
-- upgrade card.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. hostel_categories.tier_key — the category -> entitlement-tier bridge
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS tier_key text NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN public.hostel_categories.tier_key IS
  'Entitlement tier this room category grants, matching hostel_tier_policy.tier_key '
  '(standard | premium | premium_plus). Deliberately a plain text key rather than an '
  'FK so adding a tier never blocks a category write; an unmatched key resolves to '
  'no entitlement (fail closed). Housekeeping slot booking is currently the only '
  'reader — see fn_housekeeping_entitlement_tier.';

CREATE INDEX IF NOT EXISTS idx_hostel_categories_tier_key
  ON public.hostel_categories (tier_key);

-- Backfill by name. "Premium Plus Room" -> premium_plus; "Premium Room" and
-- "Premium Room + AC" -> premium; Classic / Deluxe / Deluxe Plus stay standard.
-- Name matching runs ONCE here; from now on the column is the source of truth
-- and the Director retunes it from Settings -> Categories, so renaming a
-- category never silently changes who can book.
UPDATE public.hostel_categories
SET tier_key = 'premium_plus'
WHERE name ILIKE '%premium%plus%'
  AND tier_key = 'standard';

UPDATE public.hostel_categories
SET tier_key = 'premium'
WHERE name ILIKE '%premium%'
  AND name NOT ILIKE '%premium%plus%'
  AND tier_key = 'standard';


-- ────────────────────────────────────────────────────────────────────────
-- 2. fn_housekeeping_entitlement_tier — profile -> category -> tier
-- ────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: residents hold no direct SELECT on hostel_categories or
-- hostel_tier_policy, and both the UI gate and the write gate need this exact
-- answer. Returns zero rows when the learner has no resolvable category.

CREATE OR REPLACE FUNCTION public.fn_housekeeping_entitlement_tier(
  p_profile_id uuid
)
RETURNS TABLE (
  category_id   uuid,
  category_name text,
  tier_key      text,
  tier_features jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH resolved AS (
    SELECT COALESCE(
      -- Enrolled / billed category (profiles.learner_id bridges to
      -- learners_profiles, whose id is disjoint from profiles.id).
      (SELECT lp.hostel_category_id
         FROM public.profiles p
         JOIN public.learners_profiles lp ON lp.id = p.learner_id
        WHERE p.id = p_profile_id),
      -- Fallback: the category of the room they are actually seated in.
      (SELECT r.category_id
         FROM public.hostel_allocations a
         JOIN public.hostel_rooms r ON r.id = a.room_id
        WHERE a.learner_id = p_profile_id
          AND a.status = 'active'
          AND a.check_out_date IS NULL
        ORDER BY a.allocation_date DESC, a.created_at DESC
        LIMIT 1)
    ) AS category_id
  )
  SELECT
    c.id,
    c.name,
    c.tier_key,
    COALESCE(htp.tier_features, '[]'::jsonb)
  FROM resolved
  JOIN public.hostel_categories c ON c.id = resolved.category_id
  -- Global tier rows (institution_id IS NULL) are the seeded ladder; an
  -- institution-specific row of the same key wins when one exists.
  LEFT JOIN LATERAL (
    SELECT t.tier_features
    FROM public.hostel_tier_policy t
    WHERE t.tier_key = c.tier_key
      AND t.is_active
    ORDER BY (t.institution_id IS NULL)
    LIMIT 1
  ) htp ON TRUE;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_entitlement_tier(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_entitlement_tier(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_housekeeping_entitlement_tier(uuid) IS
  'Resolves a resident''s housekeeping entitlement tier from their room category. '
  'Enrolled category (learners_profiles.hostel_category_id) wins; the allocated '
  'room''s category is the fallback. Single source of truth shared by '
  'fn_housekeeping_my_entitlement (UI gate) and fn_housekeeping_book_slot (write gate).';


-- ────────────────────────────────────────────────────────────────────────
-- 3. fn_housekeeping_my_entitlement — the resident UI's whole gate, one call
-- ────────────────────────────────────────────────────────────────────────
-- Envelope keys are camelCase on purpose: they land straight in the TS
-- EntitlementResult interface with no mapping layer.
--   { entitled, tierKey, categoryName, weeklyQuota, usedThisWeek, reason? }
-- reason ∈ no_active_allocation | tier_not_entitled | no_weekly_quota

CREATE OR REPLACE FUNCTION public.fn_housekeeping_my_entitlement()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid;
  v_learner_id  uuid;
  v_has_alloc   boolean;
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

  -- An active, not-checked-out allocation is what makes someone a resident.
  -- Staff, day scholars and pending_approval applicants land here — a calm
  -- state, not an error.
  SELECT EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.learner_id = v_uid
      AND a.status = 'active'
      AND a.check_out_date IS NULL
  ) INTO v_has_alloc;

  IF NOT v_has_alloc THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', NULL,
      'categoryName', NULL, 'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'no_active_allocation');
  END IF;

  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  -- No resolvable category, or a category whose tier does not carry the
  -- feature flag → not entitled (fail closed).
  IF NOT FOUND
     OR v_tier.tier_features IS NULL
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

  -- Own bookings in the ISO week containing today (IST). date_trunc('week')
  -- is Monday-based — the same expression fn_housekeeping_book_slot uses, so
  -- the meter the resident reads can never disagree with the quota that
  -- rejects them.
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_learner_id IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.learner_id = v_learner_id
      AND b.status IN ('booked','completed')
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
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_my_entitlement() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_my_entitlement() TO authenticated;

COMMENT ON FUNCTION public.fn_housekeeping_my_entitlement() IS
  'Whole housekeeping-booking entitlement envelope for the calling resident '
  '(entitled, tierKey, categoryName, weeklyQuota, usedThisWeek, reason). '
  'Identity is derived from auth.uid() only.';


-- ────────────────────────────────────────────────────────────────────────
-- 4. fn_housekeeping_book_slot — repoint the entitlement block
-- ────────────────────────────────────────────────────────────────────────
-- Identical to 20260610190000 except the tier lookup: room category instead of
-- hostel_allocations.tier_id. Every other gate (window, advance, quota,
-- capacity, duplicate, advisory lock) is unchanged.

CREATE OR REPLACE FUNCTION public.fn_housekeeping_book_slot(
  p_date       date,
  p_slot_start time,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Master kill-switch.
  v_enabled := COALESCE((fn_get_policy_json('housekeeping.booking_enabled', 'true'::jsonb, NULL) #>> '{}')::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'disabled',
      'message', 'Housekeeping slot booking is currently turned off.');
  END IF;

  -- Identity chain: auth.uid() = profiles.id → profiles.learner_id.
  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'No learner profile is linked to this account.');
  END IF;

  -- ACTIVE allocation only (status = 'active' AND not checked out).
  -- ⚠️ hostel_allocations.learner_id FKs profiles(id), NOT learners_profiles —
  -- so the match key here is v_uid. v_learner_id (a learners_profiles.id) is
  -- still required for the bookings INSERT + quota, whose FK targets
  -- learners_profiles.
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

  -- Tier entitlement now comes from the resident's ROOM CATEGORY
  -- (hostel_categories.tier_key), not the never-populated
  -- hostel_allocations.tier_id. Same resolver the UI gate reads.
  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  IF NOT FOUND OR v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

  -- Remaining policy knobs.
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

  -- A tier configured to 0 cannot book at all — say so as an entitlement
  -- refusal rather than a spent-quota one, which would read as "come back
  -- next week".
  IF v_quota <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';

  -- Date / slot validation (all server-side).
  IF p_date > (v_now_ist::date + v_advance_days) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'too_far_ahead',
      'message', format('Bookings open up to %s days ahead.', v_advance_days));
  END IF;

  IF (p_date + p_slot_start) <= v_now_ist THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'past_slot',
      'message', 'That slot is already in the past.');
  END IF;

  -- Slot must align to the computed grid and fit inside the service window.
  v_offset_minutes := EXTRACT(EPOCH FROM (p_slot_start - v_win_start)) / 60;
  v_window_minutes := EXTRACT(EPOCH FROM (v_win_end - v_win_start)) / 60;
  IF v_offset_minutes < 0
     OR (v_offset_minutes::int % v_slot_minutes) <> 0
     OR (v_offset_minutes + v_slot_minutes) > v_window_minutes THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'outside_window',
      'message', 'That time is outside the housekeeping service window.');
  END IF;

  -- Weekly quota: booked + completed in the ISO week containing p_date.
  SELECT COUNT(*)::int INTO v_used_this_week
  FROM public.hostel_cleaning_bookings b
  WHERE b.learner_id = v_learner_id
    AND b.status IN ('booked','completed')
    AND date_trunc('week', b.booking_date::timestamp)
        = date_trunc('week', p_date::timestamp);

  IF v_used_this_week >= v_quota THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
      'message', format('Weekly limit reached (%s of %s used).', v_used_this_week, v_quota));
  END IF;

  -- Serialize concurrent bookings for the same block/date/slot so the
  -- capacity count below cannot race past the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'housekeeping_slot:' || v_alloc.block_id::text || ':' || p_date::text
      || ':' || p_slot_start::text, 0));

  -- Room already has a live booking for this slot?
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.booking_date = p_date
      AND b.slot_start = p_slot_start
      AND b.status = 'booked'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
  END IF;

  -- Block capacity for this slot.
  SELECT COUNT(*)::int INTO v_booked_in_slot
  FROM public.hostel_cleaning_bookings b
  WHERE b.block_id = v_alloc.block_id
    AND b.booking_date = p_date
    AND b.slot_start = p_slot_start
    AND b.status = 'booked';

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
    -- Partial unique index (room_id, booking_date, slot_start) WHERE booked.
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_book_slot(date, time, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_book_slot(date, time, text) TO authenticated;
