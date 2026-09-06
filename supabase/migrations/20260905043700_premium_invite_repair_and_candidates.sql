-- ============================================================================
-- Premium roommate invite — make it work, then make it findable
-- ============================================================================
-- 2026-08-14.
--
-- THE INVITE HAS NEVER WORKED. hostel_premium_invites holds zero rows, and the
-- code comment on the entry card blames discoverability. That diagnosis was
-- wrong: nobody COULD have used it.
--
-- fn_premium_create_invite takes p_inviter_learner_id / p_invited_learner_id and
-- mixes two id domains inside one function:
--   • Step 1 matches p_inviter_learner_id against hostel_allocations.learner_id,
--     which is a profiles.id — correct, and what the page passes.
--   • Step 2 then looks BOTH ids up in learners_profiles by primary key.
--
-- profiles.id and learners_profiles.id are disjoint — 0 shared ids out of 7,235
-- rows, and hostel_allocations.learner_id matches profiles 969 times and
-- learners_profiles 0 times. So the invited lookup always missed and the
-- function returned 'invited_not_found' every single time. Had it got past that,
-- the inviter's gender read would have returned NULL and failed the gender check
-- for the same reason.
--
-- The fix keeps the parameters as profiles.id — that is what the page holds,
-- what hostel_allocations stores, and what fn_premium_confirm_invite already
-- compares against — and resolves to learners_profiles through
-- profiles.learner_id, exactly as get_my_learner_id() does.
--
-- ACCEPTING NOW MOVES HER IN. fn_premium_confirm_invite only flipped a status;
-- the sole trigger on the table touches updated_at, so nothing allocated a bed
-- and the roommate never arrived. Per the Director's call it now allocates
-- immediately, with no warden step — so every check a warden would have made is
-- made here instead, inside one transaction: tier, gender, institution, a free
-- bed under an advisory lock, and the room-buyout lock. A failure rolls the
-- acceptance back with it rather than leaving an 'accepted' invite that moved
-- nobody.
--
-- Gender is free text and mixed case in this table ('FEMALE'), so every
-- comparison is upper(trim(...)). A plain = would silently refuse half the
-- candidates.
--
-- THE GATE MOVES FROM TIER TO ROOM CATEGORY. Two unrelated things are called
-- "premium" here and they have drifted apart:
--   • hostel_tier_policy.tier_key — the Premium STAY product (self-pick,
--     curfew quota, invites). All 684 active allocations are 'standard'.
--     Nobody has ever been put on the premium tier.
--   • hostel_categories 'Premium Room' — a room PRICE BAND at Rs 42,500/bed,
--     which 112 learners live in.
--
-- Gating invites on the tier refused every learner in the system, while the
-- entry card gated on `!!tier_id` — true for all 684, since everyone carries a
-- tier_id pointing at 'standard'. Button shown to everyone, invite refused for
-- everyone.
--
-- The gate is now hostel_categories.settle_billing_enabled on the ROOM's
-- category — the same tick-box that scopes empty-bed billing on fee-config's
-- Room Sharing tab. One admin control governs both, so a category can never be
-- billed for its empty beds while its residents are barred from filling them.
-- Deliberately NOT a name test: `name ILIKE 'Premium%'` would silently capture a
-- future "Premium Economy" and silently miss a rename.
--
-- The "already in a premium allocation" exclusion is replaced by "already in
-- MY room". Under the tier model it excluded nobody (no premium tiers exist);
-- carried over literally to categories it would have hidden the 67 same-category
-- learners who are exactly who this screen exists to surface.
--
-- CANDIDATES ARE SAME-CATEGORY ONLY. A Premium resident sees Premium residents;
-- Deluxe never appears. Accepting moves a learner into the inviter's room and
-- therefore into its price band, and a fee change of that size belongs in the
-- upgrade path she picks deliberately — not in an invite she taps accept on.
-- For one real 4-bed Premium resident this takes the list from 217 to 67.
--
-- The rule is enforced in BOTH functions, not just the list. A list narrower
-- than the RPC merely hides options; an RPC looser than the list is an API a
-- Deluxe learner can be pulled through. They move together.
--
-- THE ACTING IDENTITY IS BOUND TO auth.uid(). All three invite RPCs took the
-- acting learner as a CLIENT-SUPPLIED parameter and never checked it against the
-- session. They are SECURITY DEFINER and granted to `authenticated`, so any
-- signed-in learner could pass someone else's id. Demonstrated end to end
-- against live data before the fix: an attacker forged an invite FROM a victim,
-- accepted it as herself, and moved into the victim's room (occupants 2 -> 3,
-- ATTACKER MOVED IN = true).
--
-- That hole predates this change, but making accept ALLOCATE A BED is what
-- turned it from a spoofed status flip into a way to relocate yourself into any
-- room you can name — so it is fixed here, in the same change that raised the
-- stakes.
--
-- The parameters are kept rather than dropped: the signature is what the page
-- and hostel-premium-allocation-service already call, and DROP FUNCTION would
-- discard the EXECUTE grants. A mismatched parameter is simply refused.
-- IS DISTINCT FROM, not <>, so a NULL on either side fails closed — and the
-- catch-all EXCEPTION handler now re-raises insufficient_privilege instead of
-- swallowing it into a soft {success:false}, which would have hidden the gate.
-- ============================================================================

-- ── 1. Create invite: resolve both learners through profiles.learner_id ─────
CREATE OR REPLACE FUNCTION public.fn_premium_create_invite(p_allocation_id uuid, p_inviter_learner_id uuid, p_invited_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allocation record;
  v_inviter_lp uuid;
  v_invited_lp uuid;
  v_inviter_gender TEXT;
  v_invited_gender TEXT;
  v_invited_institution UUID;
  v_invited_already_allocated INTEGER;
  v_invited_cat UUID;
  v_invite_window_hours INTEGER;
  v_invite_max_retries INTEGER;
  v_existing_retry_count INTEGER;
  v_invite_id UUID;
  v_invite_token TEXT;
BEGIN
  -- You may only send invites as yourself. Without this, a signed-in learner
  -- can pass another learner's id and forge an invite in her name.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_inviter_learner_id THEN
    RAISE EXCEPTION 'permission denied: you may only send invites as yourself'
      USING ERRCODE = '42501';
  END IF;

  IF p_inviter_learner_id = p_invited_learner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'self_invite',
      'detail', 'You cannot invite yourself.');
  END IF;

  -- Step 1: the allocation belongs to the inviter, is active, and its ROOM sits
  -- in a category opted into room sharing.
  SELECT ha.institution_id, ha.tier_id, ha.status, ha.room_id,
         r.category_id AS room_category_id,
         COALESCE(hc.settle_billing_enabled, false) AS sharing_enabled
    INTO v_allocation
    FROM public.hostel_allocations ha
    LEFT JOIN public.hostel_rooms r      ON r.id = ha.room_id
    LEFT JOIN public.hostel_categories hc ON hc.id = r.category_id
   WHERE ha.id = p_allocation_id
     AND ha.learner_id = p_inviter_learner_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'allocation_not_found',
      'detail', 'Allocation not found or you are not the inviter.');
  END IF;

  IF v_allocation.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'allocation_inactive',
      'detail', 'Your allocation is not active. Cannot invite roommate.');
  END IF;

  IF NOT v_allocation.sharing_enabled THEN
    RETURN jsonb_build_object('success', false, 'reason', 'category_not_shareable',
      'detail', 'Roommate invites are not available for your room category.');
  END IF;

  -- Step 2: BOTH parameters are profiles.id. Resolve each to its learner
  -- record through profiles.learner_id. Reading learners_profiles by these ids
  -- directly is what made every invite fail — the two id spaces are disjoint.
  SELECT learner_id INTO v_inviter_lp FROM public.profiles WHERE id = p_inviter_learner_id;
  SELECT learner_id INTO v_invited_lp FROM public.profiles WHERE id = p_invited_learner_id;

  IF v_invited_lp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invited_not_a_learner',
      'detail', 'That person does not have a learner record.');
  END IF;

  SELECT upper(trim(lp.gender)), lp.institution_id
    INTO v_invited_gender, v_invited_institution
    FROM public.learners_profiles lp
   WHERE lp.id = v_invited_lp;

  IF v_invited_gender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invited_not_found',
      'detail', 'Invited learner not found.');
  END IF;

  SELECT upper(trim(gender)) INTO v_inviter_gender
    FROM public.learners_profiles WHERE id = v_inviter_lp;

  IF v_inviter_gender IS DISTINCT FROM v_invited_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'gender_mismatch',
      'detail', 'Roommate must be of the same gender.');
  END IF;

  IF v_invited_institution IS DISTINCT FROM v_allocation.institution_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'institution_mismatch',
      'detail', 'Roommate must be from the same institution.');
  END IF;

  -- Step 3a: SAME ROOM CATEGORY ONLY. A Premium resident invites Premium
  -- residents; a Deluxe resident is not a candidate. Accepting would move her
  -- into this category's room AND its price band, and a fee change of that size
  -- belongs in the upgrade path she chooses deliberately, not in an invite she
  -- taps accept on. Her CURRENT room decides it; an unallocated hostelite falls
  -- back to the category recorded on her profile.
  SELECT COALESCE(r2.category_id, lp2.hostel_category_id) INTO v_invited_cat
    FROM public.learners_profiles lp2
    LEFT JOIN public.hostel_allocations a2
           ON a2.learner_id = p_invited_learner_id AND a2.check_out_date IS NULL
    LEFT JOIN public.hostel_rooms r2 ON r2.id = a2.room_id
   WHERE lp2.id = v_invited_lp
   LIMIT 1;

  IF v_invited_cat IS DISTINCT FROM v_allocation.room_category_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'category_mismatch',
      'detail', 'You can only invite learners in the same room category as yours.');
  END IF;

  -- Step 3b: she is not already living in this very room. Anyone else in the
  -- category is fair game — accepting vacates her old bed properly, so no room
  -- is left double-counted.
  SELECT count(*) INTO v_invited_already_allocated
    FROM public.hostel_allocations ha
   WHERE ha.learner_id = p_invited_learner_id
     AND ha.check_out_date IS NULL
     AND ha.room_id = v_allocation.room_id;

  IF v_invited_already_allocated > 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_your_roommate',
      'detail', 'That learner already lives in your room.');
  END IF;

  -- Step 4: retry cap.
  v_invite_max_retries := COALESCE(
    public.fn_get_policy_int('hostel.premium.invite_max_retries', 2, NULL), 2);

  SELECT count(*) INTO v_existing_retry_count
    FROM public.hostel_premium_invites
   WHERE inviter_learner_id = p_inviter_learner_id
     AND invited_learner_id = p_invited_learner_id
     AND status IN ('declined', 'expired', 'cancelled');

  IF v_existing_retry_count >= v_invite_max_retries THEN
    RETURN jsonb_build_object('success', false, 'reason', 'retry_cap_reached',
      'detail', 'You have reached the maximum retries for inviting this learner.');
  END IF;

  -- Step 5: no pending invite already.
  IF EXISTS (
    SELECT 1 FROM public.hostel_premium_invites
     WHERE inviter_learner_id = p_inviter_learner_id
       AND invited_learner_id = p_invited_learner_id
       AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_already_pending',
      'detail', 'You already have a pending invite for this learner.');
  END IF;

  v_invite_window_hours := COALESCE(
    public.fn_get_policy_int('hostel.premium.invite_window_hours', 48, NULL), 48);

  INSERT INTO public.hostel_premium_invites (
    allocation_id, inviter_learner_id, invited_learner_id, institution_id,
    tier_id, status, expires_at, retry_count
  ) VALUES (
    p_allocation_id, p_inviter_learner_id, p_invited_learner_id,
    v_allocation.institution_id, v_allocation.tier_id, 'pending',
    now() + (v_invite_window_hours || ' hours')::interval, v_existing_retry_count
  )
  RETURNING id, invite_token INTO v_invite_id, v_invite_token;

  RETURN jsonb_build_object('success', true, 'invite_id', v_invite_id,
    'invite_token', v_invite_token, 'expires_in_hours', v_invite_window_hours,
    'reason', 'ok');

EXCEPTION
  -- Never swallow the identity gate into a soft {success:false}: a refusal that
  -- looks like a business outcome is a refusal nobody notices.
  WHEN insufficient_privilege THEN RAISE;
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unknown', 'detail', SQLERRM);
END;
$function$;

-- ── 2. Accept: mark accepted AND move her in, atomically ───────────────────
CREATE OR REPLACE FUNCTION public.fn_premium_confirm_invite(p_invite_token text, p_acting_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite    record;
  v_host      record;   -- the inviter's allocation: the room being joined
  v_room      record;
  v_bed_id    uuid;
  v_capacity  int;
  v_occupants int;
  v_old       record;
  v_new_alloc uuid;
  v_acting_lp uuid;
  v_host_lp   uuid;
  v_acting_g  text;
  v_host_g    text;
  v_acting_inst uuid;
  v_ec_name   text;
  v_ec_phone  text;
  v_ec_rel    text;
BEGIN
  -- Accepting now ALLOCATES A BED, so the acting identity cannot be a
  -- client-supplied claim. Without this, one learner could accept an invite
  -- addressed to another and move her between rooms.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_acting_learner_id THEN
    RAISE EXCEPTION 'permission denied: you may only answer your own invites'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, invited_learner_id, inviter_learner_id, allocation_id, status, expires_at
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
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_pending',
      'detail', 'Invite status is ' || v_invite.status);
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.hostel_premium_invites
       SET status = 'expired', updated_at = now()
     WHERE id = v_invite.id;
    RETURN jsonb_build_object('success', false, 'reason', 'invite_expired');
  END IF;

  -- The room she is joining. Re-read rather than trust the invite: it may have
  -- been sent days ago and the inviter may since have moved or left.
  SELECT ha.id, ha.room_id, ha.block_id, ha.institution_id, ha.tier_id,
         ha.academic_year_id, ha.semester_id, ha.batch_id, ha.status
    INTO v_host
    FROM public.hostel_allocations ha
   WHERE ha.id = v_invite.allocation_id;

  IF v_host.id IS NULL OR v_host.status <> 'active' OR v_host.room_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'host_allocation_inactive',
      'detail', 'The room you were invited to is no longer available.');
  END IF;

  -- Re-check gender and institution at acceptance. These were true when the
  -- invite was sent; an accept can land 48 hours later.
  SELECT learner_id INTO v_acting_lp FROM public.profiles WHERE id = p_acting_learner_id;
  SELECT learner_id INTO v_host_lp   FROM public.profiles WHERE id = v_invite.inviter_learner_id;

  SELECT upper(trim(gender)), institution_id INTO v_acting_g, v_acting_inst
    FROM public.learners_profiles WHERE id = v_acting_lp;
  SELECT upper(trim(gender)) INTO v_host_g
    FROM public.learners_profiles WHERE id = v_host_lp;

  IF v_acting_g IS NULL OR v_acting_g IS DISTINCT FROM v_host_g THEN
    RETURN jsonb_build_object('success', false, 'reason', 'gender_mismatch',
      'detail', 'Roommate must be of the same gender.');
  END IF;

  IF v_acting_inst IS DISTINCT FROM v_host.institution_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'institution_mismatch',
      'detail', 'Roommate must be from the same institution.');
  END IF;

  SELECT r.id, r.room_number, r.capacity, r.block_id INTO v_room
    FROM public.hostel_rooms r WHERE r.id = v_host.room_id;

  v_capacity := GREATEST(1, COALESCE(v_room.capacity, 1));
  SELECT count(*) INTO v_occupants
    FROM public.hostel_allocations ha
   WHERE ha.room_id = v_host.room_id AND ha.check_out_date IS NULL;

  IF v_occupants >= v_capacity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'room_full',
      'detail', 'That room filled up before you accepted.');
  END IF;

  -- Lowest-numbered free bed, claimed under the same advisory lock
  -- fn_self_change_room uses, so two accepts cannot take one bed.
  SELECT b.id INTO v_bed_id
    FROM public.hostel_beds b
   WHERE b.room_id = v_host.room_id
     AND b.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM public.hostel_allocations ha
                      WHERE ha.bed_id = b.id AND ha.check_out_date IS NULL)
   ORDER BY b.bed_number
   LIMIT 1;

  IF v_bed_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_free_bed',
      'detail', 'There is no free bed in that room any more.');
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(v_bed_id::text)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bed_contended',
      'detail', 'Someone is claiming that bed right now. Try again.');
  END IF;

  -- Her current place, if any. Moving in means leaving it — same vacate shape
  -- fn_self_change_room uses, so occupancy and the bed index stay consistent.
  SELECT ha.id, ha.bed_id, ha.room_id,
         ha.emergency_contact_name, ha.emergency_contact_phone, ha.emergency_contact_relation
    INTO v_old
    FROM public.hostel_allocations ha
   WHERE ha.learner_id = p_acting_learner_id AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;

  IF v_old.id IS NOT NULL AND v_old.room_id = v_host.room_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_in_room',
      'detail', 'You already live in that room.');
  END IF;

  -- Emergency contact is NOT NULL on hostel_allocations, and rightly so: it is a
  -- safety record. Carry hers forward from the room she is leaving; failing
  -- that, fall back to a parent on her learner profile. If neither exists,
  -- REFUSE — a placeholder like 'Not provided' in this column is worse than a
  -- blocked move, because it reads as a real contact in an emergency.
  IF v_old.id IS NOT NULL THEN
    v_ec_name  := NULLIF(TRIM(v_old.emergency_contact_name), '');
    v_ec_phone := NULLIF(TRIM(v_old.emergency_contact_phone), '');
    v_ec_rel   := NULLIF(TRIM(v_old.emergency_contact_relation), '');
  END IF;

  IF v_ec_name IS NULL OR v_ec_phone IS NULL THEN
    SELECT NULLIF(TRIM(lp.father_name),''), NULLIF(TRIM(lp.father_mobile),''), 'Father'
      INTO v_ec_name, v_ec_phone, v_ec_rel
      FROM public.learners_profiles lp
     WHERE lp.id = v_acting_lp
       AND NULLIF(TRIM(lp.father_name),'')   IS NOT NULL
       AND NULLIF(TRIM(lp.father_mobile),'') IS NOT NULL;
  END IF;

  IF v_ec_name IS NULL OR v_ec_phone IS NULL THEN
    SELECT NULLIF(TRIM(lp.mother_name),''), NULLIF(TRIM(lp.mother_mobile),''), 'Mother'
      INTO v_ec_name, v_ec_phone, v_ec_rel
      FROM public.learners_profiles lp
     WHERE lp.id = v_acting_lp
       AND NULLIF(TRIM(lp.mother_name),'')   IS NOT NULL
       AND NULLIF(TRIM(lp.mother_mobile),'') IS NOT NULL;
  END IF;

  IF v_ec_name IS NULL OR v_ec_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_emergency_contact',
      'detail', 'Your profile has no emergency contact. Add one before joining a room.');
  END IF;

  IF v_old.id IS NOT NULL THEN
    UPDATE public.hostel_allocations
       SET status='vacated', actual_vacate_date=CURRENT_DATE,
           check_out_date=CURRENT_DATE, updated_at=now()
     WHERE id = v_old.id;
    UPDATE public.hostel_beds
       SET status='available', current_occupant_id=NULL
     WHERE id = v_old.bed_id;
  END IF;

  -- The room-buyout lock is enforced by a BEFORE trigger on this INSERT. A room
  -- whose residents have paid for its empty beds refuses a new body, and that
  -- refusal surfaces through the handler below rather than being bypassed here.
  INSERT INTO public.hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id,
    academic_year_id, semester_id, allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id, metadata
  ) VALUES (
    v_host.institution_id, p_acting_learner_id, COALESCE(v_room.block_id, v_host.block_id),
    v_host.room_id, v_bed_id, v_host.academic_year_id, v_host.semester_id,
    'transfer', CURRENT_DATE, 'active',
    v_ec_name, v_ec_phone, COALESCE(v_ec_rel, 'Guardian'),
    v_host.tier_id, p_acting_learner_id, v_host.batch_id,
    jsonb_build_object('premium_invite', true,
                       'invite_id', v_invite.id,
                       'inviter_learner_id', v_invite.inviter_learner_id,
                       'from_room_id', v_old.room_id,
                       'joined_at', to_jsonb(now()))
  ) RETURNING id INTO v_new_alloc;

  UPDATE public.hostel_beds
     SET status='occupied', current_occupant_id=p_acting_learner_id
   WHERE id = v_bed_id;

  UPDATE public.hostel_premium_invites
     SET status = 'accepted', accepted_at = now(), updated_at = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'invite_id', v_invite.id,
    'reason', 'ok', 'allocation_id', v_new_alloc,
    'room_id', v_host.room_id, 'room_number', v_room.room_number,
    'bed_id', v_bed_id, 'vacated_allocation_id', v_old.id);

EXCEPTION
  -- Never swallow the identity gate into a soft {success:false}: a refusal that
  -- looks like a business outcome is a refusal nobody notices.
  WHEN insufficient_privilege THEN RAISE;
  WHEN OTHERS THEN
  -- Everything above rolls back with this, including the status flip — an
  -- 'accepted' invite that moved nobody is the one outcome worth avoiding.
  RETURN jsonb_build_object('success', false, 'reason', 'unknown', 'detail', SQLERRM);
END;
$function$;

-- ── 3. Who can she actually invite? ────────────────────────────────────────
-- Mirrors fn_premium_create_invite's rules exactly. A candidate this returns
-- must be one the invite accepts; anything looser is a list of dead ends, which
-- is how the tier-gated CTA used to behave.
CREATE OR REPLACE FUNCTION public.fn_premium_invite_candidates(p_allocation_id uuid)
 RETURNS TABLE(
   profile_id uuid,
   full_name text,
   register_number text,
   department_name text,
   semester_name text,
   program_name text,
   institution_name text,
   current_room_category text,
   current_block_name text,
   current_room_number text,
   current_room_id uuid,
   same_category boolean,
   already_invited boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me       uuid := auth.uid();
  v_host     record;
  v_my_cat   uuid;
  v_my_g     text;
  v_my_lp    uuid;
  v_retries  int;
BEGIN
  -- No caller, no list. Tested BEFORE the ownership comparison because
  -- `learner_id <> NULL` evaluates to NULL, not TRUE — an IF on it never fires,
  -- so a sessionless caller would slip past the ownership gate and safety would
  -- rest on a later IF happening to RETURN. Caught by a test that expected a
  -- refusal and got an empty list instead.
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'permission denied: no signed-in learner' USING ERRCODE = '42501';
  END IF;

  SELECT ha.id, ha.learner_id, ha.institution_id, ha.room_id, ha.status,
         r.category_id, COALESCE(hc.settle_billing_enabled, false) AS sharing_enabled
    INTO v_host
    FROM hostel_allocations ha
    LEFT JOIN hostel_rooms r       ON r.id = ha.room_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
   WHERE ha.id = p_allocation_id;

  -- Own-allocation scope. SECURITY DEFINER bypasses RLS, so without this any
  -- signed-in learner could enumerate another institution's roll.
  -- IS DISTINCT FROM, not <>: a NULL learner_id must FAIL the check, not skip it.
  IF v_host.id IS NULL OR v_host.learner_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'permission denied: that is not your allocation'
      USING ERRCODE = '42501';
  END IF;

  -- A room with no category cannot be matched against, so there is nobody to
  -- offer rather than everybody.
  IF v_host.status <> 'active' OR NOT v_host.sharing_enabled OR v_host.category_id IS NULL THEN
    RETURN;  -- no candidates: the invite would refuse every one of them
  END IF;

  v_my_cat := v_host.category_id;
  SELECT learner_id INTO v_my_lp FROM profiles WHERE id = v_me;
  SELECT upper(trim(gender)) INTO v_my_g FROM learners_profiles WHERE id = v_my_lp;

  IF v_my_g IS NULL THEN
    RETURN;  -- gender unknown: every invite would fail the gender check
  END IF;

  v_retries := COALESCE(fn_get_policy_int('hostel.premium.invite_max_retries', 2, NULL), 2);

  RETURN QUERY
  SELECT
    p2.id,
    COALESCE(p2.full_name, '(no name)')::text,
    lp.register_number::text,
    d.department_name::text,
    s.semester_name::text,
    pr.program_name::text,
    i.name::text,
    hc2.name::text,
    hb.name::text,
    r2.room_number::text,
    r2.id,
    (r2.category_id IS NOT DISTINCT FROM v_my_cat),
    EXISTS (SELECT 1 FROM hostel_premium_invites hpi
             WHERE hpi.inviter_learner_id = v_me
               AND hpi.invited_learner_id = p2.id
               AND hpi.status = 'pending')
  FROM learners_profiles lp
  JOIN profiles p2                   ON p2.learner_id = lp.id
  JOIN accommodation_types acc       ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
  LEFT JOIN departments d            ON d.id = lp.department_id
  LEFT JOIN semesters s              ON s.id = lp.semester_id
  LEFT JOIN programs pr              ON pr.id = lp.program_id
  LEFT JOIN institutions i           ON i.id = lp.institution_id
  LEFT JOIN hostel_allocations a2    ON a2.learner_id = p2.id AND a2.check_out_date IS NULL
  LEFT JOIN hostel_rooms r2          ON r2.id = a2.room_id
  LEFT JOIN hostel_categories hc2    ON hc2.id = r2.category_id
  LEFT JOIN hostel_blocks hb         ON hb.id = a2.block_id
  WHERE lp.institution_id = v_host.institution_id
    AND upper(trim(lp.gender)) = v_my_g
    AND p2.id <> v_me
    -- SAME ROOM CATEGORY ONLY — the identical rule fn_premium_create_invite
    -- enforces, so the list can never offer a learner the invite would refuse.
    -- A Premium resident sees Premium residents; Deluxe never appears.
    AND COALESCE(r2.category_id, lp.hostel_category_id) IS NOT DISTINCT FROM v_my_cat
    -- already in this very room: she is a roommate, not a candidate
    AND NOT EXISTS (
      SELECT 1 FROM hostel_allocations ha2
      WHERE ha2.learner_id = p2.id AND ha2.check_out_date IS NULL
        AND ha2.room_id = v_host.room_id)
    -- retry cap already spent on this pair
    AND (SELECT count(*) FROM hostel_premium_invites hpi2
          WHERE hpi2.inviter_learner_id = v_me
            AND hpi2.invited_learner_id = p2.id
            AND hpi2.status IN ('declined','expired','cancelled')) < v_retries
  ORDER BY (r2.category_id IS NOT DISTINCT FROM v_my_cat) DESC,
           d.department_name NULLS LAST,
           s.semester_name NULLS LAST,
           COALESCE(p2.full_name, '');
END;
$function$;

-- ── 4. Decline: same identity binding ──────────────────────────────────────
-- Declining writes less than accepting, but it still closes someone else's
-- invite on their behalf. Bound to the session for the same reason.
CREATE OR REPLACE FUNCTION public.fn_premium_decline_invite(p_invite_token text, p_acting_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite record;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_acting_learner_id THEN
    RAISE EXCEPTION 'permission denied: you may only answer your own invites'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, invited_learner_id, status INTO v_invite
    FROM public.hostel_premium_invites WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_found');
  END IF;
  IF v_invite.invited_learner_id IS DISTINCT FROM p_acting_learner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_the_invited_party');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invite_not_pending');
  END IF;

  UPDATE public.hostel_premium_invites
     SET status = 'declined', declined_at = now(), updated_at = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'invite_id', v_invite.id, 'reason', 'ok');
END;
$function$;

-- anon AND PUBLIC: revoking only anon is a no-op, since Postgres grants EXECUTE
-- to PUBLIC by default and anon is a member of it. The candidate list is a roll
-- of named learners with their rooms — not something a publishable key should read.
REVOKE EXECUTE ON FUNCTION public.fn_premium_invite_candidates(uuid)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_premium_create_invite(uuid, uuid, uuid)      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_premium_confirm_invite(text, uuid)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_premium_decline_invite(text, uuid)           FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_premium_invite_candidates(uuid)              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_premium_create_invite(uuid, uuid, uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_premium_confirm_invite(text, uuid)           TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_premium_decline_invite(text, uuid)           TO authenticated;
