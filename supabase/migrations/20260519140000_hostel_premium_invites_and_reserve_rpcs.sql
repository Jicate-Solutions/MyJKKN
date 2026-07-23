-- ============================================================================
-- Premium Stay Phase 2 — Roommate invites table + reserve/invite/confirm RPCs
-- ============================================================================
-- Created: 2026-05-19
-- Spec lineage: .claude/scratch/premium-stay-spec-2026-05-16.html (scratch-only,
--               key decisions #6a/#6b roommate invite + atomic reserve)
-- Companion: lib/services/campus-living/hostel-premium-allocation-service.ts
--            (Phase 1 stubs documented the recipes; this migration delivers them)
--
-- WHY: Phase 1 (PR #953) shipped the substrate (tier_policy table, evaluate
-- RPC, fee/SLA tier columns, platform_policies seeds) plus admin UI. Phase 2
-- ships the learner-facing opt-in + room-pick + roommate-invite flow. This
-- migration creates:
--   1. hostel_premium_invites table (state machine for roommate invites)
--   2. fn_premium_reserve_bed RPC (advisory-locked atomic reserve)
--   3. fn_premium_create_invite RPC (eligibility-gated invite create)
--   4. fn_premium_confirm_invite RPC (token-resolved accept)
--   5. fn_premium_decline_invite RPC (token-resolved decline)
--   6. RLS policies on hostel_premium_invites
--
-- Concurrency model: pg_try_advisory_xact_lock(hashtext(bed_id::text)) ensures
-- first-writer-wins atomically. Second concurrent reserveBed call gets
-- bed_locked_by_other and the UI re-fetches available rooms.
-- ============================================================================

-- ─── TABLE: hostel_premium_invites ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hostel_premium_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES public.hostel_allocations(id) ON DELETE CASCADE,
  inviter_learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  invited_learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  tier_id UUID NOT NULL REFERENCES public.hostel_tier_policy(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ
);

-- Partial unique index to prevent more than one pending invite for the same
-- (inviter, invited) pair. Allows multiple historical declined/expired rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hostel_premium_pending_invite_pair
  ON public.hostel_premium_invites (inviter_learner_id, invited_learner_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_hostel_premium_invites_invited
  ON public.hostel_premium_invites (invited_learner_id, status);
CREATE INDEX IF NOT EXISTS idx_hostel_premium_invites_allocation
  ON public.hostel_premium_invites (allocation_id);
CREATE INDEX IF NOT EXISTS idx_hostel_premium_invites_token
  ON public.hostel_premium_invites (invite_token);
CREATE INDEX IF NOT EXISTS idx_hostel_premium_invites_expires_pending
  ON public.hostel_premium_invites (expires_at) WHERE status = 'pending';

COMMENT ON TABLE public.hostel_premium_invites IS
  'Premium Stay Phase 2: roommate invite state machine. 48h default window, 2 retries max (configurable via hostel.premium.invite_window_hours / invite_max_retries platform_policies). Single-use token resolved via fn_premium_confirm_invite / fn_premium_decline_invite.';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_hostel_premium_invites_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostel_premium_invites_updated_at
  ON public.hostel_premium_invites;
CREATE TRIGGER trg_hostel_premium_invites_updated_at
  BEFORE UPDATE ON public.hostel_premium_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_premium_invites_touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.hostel_premium_invites ENABLE ROW LEVEL SECURITY;

-- Inviter / invited learner can read their own row. Wardens read by institution.
DROP POLICY IF EXISTS hostel_premium_invites_select_party_or_warden
  ON public.hostel_premium_invites;
CREATE POLICY hostel_premium_invites_select_party_or_warden
  ON public.hostel_premium_invites
  FOR SELECT
  TO authenticated
  USING (
    inviter_learner_id = auth.uid()
    OR invited_learner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.institution_id = hostel_premium_invites.institution_id)
    )
  );

-- Inserts go through the RPC (SECURITY DEFINER); deny direct INSERT from clients.
DROP POLICY IF EXISTS hostel_premium_invites_no_direct_insert
  ON public.hostel_premium_invites;
CREATE POLICY hostel_premium_invites_no_direct_insert
  ON public.hostel_premium_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Updates only via RPC.
DROP POLICY IF EXISTS hostel_premium_invites_no_direct_update
  ON public.hostel_premium_invites;
CREATE POLICY hostel_premium_invites_no_direct_update
  ON public.hostel_premium_invites
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- RPC: fn_premium_reserve_bed
-- ============================================================================
-- Atomically reserves a bed for a learner under a premium tier.
-- Uses pg_try_advisory_xact_lock(hashtext(bed_id::text)) for concurrency.
-- Steps:
--   1. Acquire xact-scoped advisory lock on bed_id
--   2. Re-evaluate eligibility via fn_hostel_premium_evaluate
--   3. Insert hostel_allocations row with tier_id
--   4. Mark bed as occupied (sets status='occupied', current_occupant_id)
--   5. Existing triggers (if any) handle room.current_occupancy increment
--
-- Returns jsonb { success, allocation_id?, reason?, detail? }
--   reason values:
--     - 'bed_locked_by_other'  (advisory lock contention)
--     - 'eligibility_failed'   (evaluate returned eligible=false)
--     - 'bed_unavailable'      (bed status != 'available' under lock)
--     - 'tier_inactive'        (tier became inactive between pick + reserve)
--     - 'unknown'              (other DB error; caller inspects detail)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_premium_reserve_bed(
  p_learner_id UUID,
  p_bed_id UUID,
  p_tier_id UUID,
  p_room_id UUID,
  p_block_id UUID,
  p_institution_id UUID,
  p_academic_year_id UUID,
  p_emergency_contact_name TEXT,
  p_emergency_contact_phone TEXT,
  p_emergency_contact_relation TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_eligibility jsonb;
  v_bed_status TEXT;
  v_tier_active BOOLEAN;
  v_allocation_id UUID;
BEGIN
  -- Step 1: advisory lock on bed (xact-scoped, auto-released on commit/rollback)
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'bed_locked_by_other',
      'detail', 'Another learner is currently reserving this bed. Try a different bed.'
    );
  END IF;

  -- Step 2: tier sanity check
  SELECT is_active INTO v_tier_active
    FROM public.hostel_tier_policy
   WHERE id = p_tier_id;

  IF v_tier_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'tier_inactive',
      'detail', 'Premium tier is no longer active. Refresh and try again.'
    );
  END IF;

  -- Step 3: re-evaluate eligibility (defense in depth — UI also checks)
  v_eligibility := public.fn_hostel_premium_evaluate(p_learner_id, p_tier_id);
  IF (v_eligibility ->> 'eligible')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'eligibility_failed',
      'detail', 'You are no longer eligible for this tier. Reason: ' || COALESCE(v_eligibility ->> 'reason', 'unknown')
    );
  END IF;

  -- Step 4: bed availability (under lock)
  SELECT status INTO v_bed_status
    FROM public.hostel_beds
   WHERE id = p_bed_id
     AND room_id = p_room_id;

  IF v_bed_status IS NULL OR v_bed_status <> 'available' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'bed_unavailable',
      'detail', 'This bed is no longer available. Pick a different bed.'
    );
  END IF;

  -- Step 5: insert allocation row
  INSERT INTO public.hostel_allocations (
    institution_id,
    learner_id,
    block_id,
    room_id,
    bed_id,
    academic_year_id,
    allocation_type,
    allocation_date,
    status,
    fee_status,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    tier_id,
    allocated_by
  ) VALUES (
    p_institution_id,
    p_learner_id,
    p_block_id,
    p_room_id,
    p_bed_id,
    p_academic_year_id,
    'regular',
    CURRENT_DATE,
    'active',
    'pending',
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_emergency_contact_relation,
    p_tier_id,
    p_learner_id  -- learner self-allocates under premium flow
  )
  RETURNING id INTO v_allocation_id;

  -- Step 6: mark bed as occupied
  UPDATE public.hostel_beds
     SET status = 'occupied',
         current_occupant_id = p_learner_id,
         updated_at = now()
   WHERE id = p_bed_id;

  -- Step 7: bump room.current_occupancy (no existing trigger does this)
  UPDATE public.hostel_rooms
     SET current_occupancy = current_occupancy + 1,
         updated_at = now()
   WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', v_allocation_id,
    'reason', 'ok'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'reason', 'unknown',
    'detail', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_premium_reserve_bed(
  UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_premium_reserve_bed(
  UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.fn_premium_reserve_bed IS
  'Premium Stay Phase 2: atomically reserves a bed under a premium tier. Uses pg_try_advisory_xact_lock for concurrency. Returns jsonb verdict; caller (UI) handles bed_locked_by_other by re-fetching availability.';

-- ============================================================================
-- RPC: fn_premium_create_invite
-- ============================================================================
-- Creates a pending roommate invite. Validates:
--   - inviter has an active premium allocation
--   - invited learner is in same institution
--   - invited learner has same gender as inviter (from learners_profiles)
--   - invited learner is not already in an active premium allocation
--   - retry_count for this (inviter, invited) pair is below max
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_premium_create_invite(
  p_allocation_id UUID,
  p_inviter_learner_id UUID,
  p_invited_learner_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allocation record;
  v_inviter_gender TEXT;
  v_invited_gender TEXT;
  v_invited_institution UUID;
  v_invited_already_allocated INTEGER;
  v_invite_window_hours INTEGER;
  v_invite_max_retries INTEGER;
  v_existing_retry_count INTEGER;
  v_invite_id UUID;
  v_invite_token TEXT;
BEGIN
  IF p_inviter_learner_id = p_invited_learner_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'self_invite',
      'detail', 'You cannot invite yourself.'
    );
  END IF;

  -- Step 1: verify the allocation belongs to the inviter and is active premium
  SELECT ha.institution_id, ha.tier_id, ha.status, htp.tier_key
    INTO v_allocation
    FROM public.hostel_allocations ha
    JOIN public.hostel_tier_policy htp ON htp.id = ha.tier_id
   WHERE ha.id = p_allocation_id
     AND ha.learner_id = p_inviter_learner_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'allocation_not_found',
      'detail', 'Allocation not found or you are not the inviter.'
    );
  END IF;

  IF v_allocation.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'allocation_inactive',
      'detail', 'Your allocation is not active. Cannot invite roommate.'
    );
  END IF;

  IF v_allocation.tier_key NOT IN ('premium', 'premium_plus') THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'tier_not_premium',
      'detail', 'Roommate invites are a Premium-tier feature.'
    );
  END IF;

  -- Step 2: invited learner gender + institution match
  SELECT lp.gender, lp.institution_id
    INTO v_invited_gender, v_invited_institution
    FROM public.learners_profiles lp
   WHERE lp.id = p_invited_learner_id;

  IF v_invited_gender IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invited_not_found',
      'detail', 'Invited learner not found.'
    );
  END IF;

  SELECT gender INTO v_inviter_gender
    FROM public.learners_profiles
   WHERE id = p_inviter_learner_id;

  IF v_inviter_gender IS DISTINCT FROM v_invited_gender THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'gender_mismatch',
      'detail', 'Roommate must be of the same gender.'
    );
  END IF;

  IF v_invited_institution IS DISTINCT FROM v_allocation.institution_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'institution_mismatch',
      'detail', 'Roommate must be from the same institution.'
    );
  END IF;

  -- Step 3: invited learner not already in an active premium allocation
  SELECT count(*) INTO v_invited_already_allocated
    FROM public.hostel_allocations ha
    JOIN public.hostel_tier_policy htp ON htp.id = ha.tier_id
   WHERE ha.learner_id = p_invited_learner_id
     AND ha.status = 'active'
     AND htp.tier_key IN ('premium', 'premium_plus');

  IF v_invited_already_allocated > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invited_already_premium',
      'detail', 'This learner is already in a premium allocation.'
    );
  END IF;

  -- Step 4: retry cap (count prior non-pending invites between this pair)
  v_invite_max_retries := COALESCE(
    public.fn_get_policy_int('hostel.premium.invite_max_retries', 2, NULL),
    2
  );

  SELECT count(*) INTO v_existing_retry_count
    FROM public.hostel_premium_invites
   WHERE inviter_learner_id = p_inviter_learner_id
     AND invited_learner_id = p_invited_learner_id
     AND status IN ('declined', 'expired', 'cancelled');

  IF v_existing_retry_count >= v_invite_max_retries THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'retry_cap_reached',
      'detail', 'You have reached the maximum retries for inviting this learner.'
    );
  END IF;

  -- Step 5: no pending invite already
  IF EXISTS (
    SELECT 1 FROM public.hostel_premium_invites
     WHERE inviter_learner_id = p_inviter_learner_id
       AND invited_learner_id = p_invited_learner_id
       AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invite_already_pending',
      'detail', 'You already have a pending invite for this learner.'
    );
  END IF;

  -- Step 6: read invite window
  v_invite_window_hours := COALESCE(
    public.fn_get_policy_int('hostel.premium.invite_window_hours', 48, NULL),
    48
  );

  -- Step 7: create invite
  INSERT INTO public.hostel_premium_invites (
    allocation_id,
    inviter_learner_id,
    invited_learner_id,
    institution_id,
    tier_id,
    status,
    expires_at,
    retry_count
  ) VALUES (
    p_allocation_id,
    p_inviter_learner_id,
    p_invited_learner_id,
    v_allocation.institution_id,
    v_allocation.tier_id,
    'pending',
    now() + (v_invite_window_hours || ' hours')::interval,
    v_existing_retry_count
  )
  RETURNING id, invite_token INTO v_invite_id, v_invite_token;

  RETURN jsonb_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'invite_token', v_invite_token,
    'expires_in_hours', v_invite_window_hours,
    'reason', 'ok'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'reason', 'unknown',
    'detail', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_premium_create_invite(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_premium_create_invite(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_premium_create_invite IS
  'Premium Stay Phase 2: creates a roommate invite with eligibility (gender/institution/retry-cap) gates. Returns single-use token consumed by fn_premium_confirm_invite.';

-- ============================================================================
-- RPC: fn_premium_confirm_invite
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_premium_confirm_invite(
  p_invite_token TEXT,
  p_acting_learner_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite record;
BEGIN
  SELECT id, invited_learner_id, status, expires_at
    INTO v_invite
    FROM public.hostel_premium_invites
   WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_found');
  END IF;

  IF v_invite.invited_learner_id <> p_acting_learner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_the_invited_party');
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invite_not_pending',
      'detail', 'Invite status is ' || v_invite.status
    );
  END IF;

  IF v_invite.expires_at < now() THEN
    -- Auto-flip to expired
    UPDATE public.hostel_premium_invites
       SET status = 'expired', updated_at = now()
     WHERE id = v_invite.id;
    RETURN jsonb_build_object('success', false, 'reason', 'invite_expired');
  END IF;

  UPDATE public.hostel_premium_invites
     SET status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'invite_id', v_invite.id, 'reason', 'ok');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason', 'unknown', 'detail', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_premium_confirm_invite(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_premium_confirm_invite(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_premium_confirm_invite IS
  'Premium Stay Phase 2: accept a pending roommate invite by single-use token. Validates token, acting party identity, status=pending, not expired.';

-- ============================================================================
-- RPC: fn_premium_decline_invite
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_premium_decline_invite(
  p_invite_token TEXT,
  p_acting_learner_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite record;
BEGIN
  SELECT id, invited_learner_id, status
    INTO v_invite
    FROM public.hostel_premium_invites
   WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_found');
  END IF;

  IF v_invite.invited_learner_id <> p_acting_learner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_the_invited_party');
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_pending');
  END IF;

  UPDATE public.hostel_premium_invites
     SET status = 'declined',
         declined_at = now(),
         updated_at = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'invite_id', v_invite.id, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_premium_decline_invite(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_premium_decline_invite(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_premium_decline_invite IS
  'Premium Stay Phase 2: decline a pending roommate invite by single-use token.';

-- ─── Verification (non-destructive SELECT-only) ─────────────────────────────
DO $$
BEGIN
  -- Verify table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='hostel_premium_invites'
  ) THEN
    RAISE EXCEPTION 'hostel_premium_invites table missing after migration';
  END IF;

  -- Verify 3 new RPCs exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name='fn_premium_reserve_bed'
  ) THEN
    RAISE EXCEPTION 'fn_premium_reserve_bed missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name='fn_premium_create_invite'
  ) THEN
    RAISE EXCEPTION 'fn_premium_create_invite missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name='fn_premium_confirm_invite'
  ) THEN
    RAISE EXCEPTION 'fn_premium_confirm_invite missing after migration';
  END IF;
END$$;
