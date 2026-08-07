-- A bed reserved for one learner's confirmed upgrade must never reach another learner.
-- ----------------------------------------------------------------------------
-- DIRECTOR'S RULE (edge-case interview, 2026-08-07), verbatim intent:
--   "That situation should not occur. Prevent it."
-- The situation: a learner's HELD bed (hostel_beds.status='reserved', pointed
-- at by her ACTIVE waiting hold in hostel_waitlist) being allocated to a
-- DIFFERENT learner before her window lapses — which would strand her hold
-- (the hourly expiry cron can then never move her in;
-- see 20260815020000_reservation_is_move_in.sql for that lifecycle).
--
-- FILE ONLY. NOT applied. Apply is Director-gated.
--
-- SURVEY (live prod, 2026-08-07 ~09:40 IST — pg_get_functiondef dumps of every
-- function that inserts hostel_allocations or occupies a bed; the repo's setup
-- files and migration ledger are unreliable for live bodies, so every body
-- below starts from those dumps VERBATIM):
--
--   ONE CONTRACT, enforced at the table, not ten separate patches:
--
--   1. A BEFORE INSERT OR UPDATE OF bed_id, room_id trigger on
--      hostel_allocations refuses the write when the target bed is
--      'reserved' and the live waiting hold on that bed belongs to a
--      DIFFERENT learner than the one being written. The bed's own HOLDER
--      allocating onto her own reserved bed PASSES — that is exactly what
--      _cl_execute_first_booking / _cl_execute_room_upgrade do when a hold is
--      executed (p_from_hold=true), and what the expiry cron's executors do
--      when a lapsed hold is confirmed. A 'reserved' bed with NO live hold
--      row at all (stale status) is refused for EVERYONE — "reserved" with
--      nobody to confirm ownership against is not confirmably anyone's bed.
--
--   2. SECURITY DEFINER is load-bearing, not incidental: a plain
--      (SECURITY INVOKER) trigger runs under the INSERTing learner's own
--      RLS, and her RLS may hide every OTHER learner's hostel_waitlist row —
--      the guard would then read zero holds and silently pass (RLS denial is
--      always silent: 0 rows, error = null). SET search_path=public closes
--      the search_path-hijack class of SECDEF bug. REVOKE EXECUTE FROM anon,
--      PUBLIC is asserted per the CLAUDE.md rule and the CI gate
--      (check-secdef-anon-revoke.mjs), even though that gate exempts
--      RETURNS-trigger functions (Postgres never checks EXECUTE privilege
--      when a trigger fires — there is no direct caller to lock out).
--
--   3. Per-function audit against the new contract (13 live writers):
--
--      GUARDS-reserved already, unchanged here:
--        * _cl_execute_first_booking, _cl_execute_room_upgrade — only accept
--          a 'reserved' bed when p_from_hold=true, i.e. the holder executing
--          her own hold. They do not separately verify the hold's learner_id
--          against p_profile — the new trigger is what makes that
--          verification structural rather than assumed.
--        * fn_auto_allocate_classic — the candidate-bed query hard-filters
--          `b.status = 'available'`; a reserved bed is never a candidate.
--
--      NO-reserved-guard tag was a keyword-heuristic false positive — the body
--      already restricts to 'available', so no change:
--        * fn_premium_reserve_bed — `v_bed_status <> 'available'` returns a
--          clean jsonb failure before any INSERT.
--        * fn_premium_upgrade_accept — same `<> 'available'` check on the
--          vacancy's target bed.
--        * fn_self_request_room — `status='available'` required by an
--          EXISTS check before any INSERT.
--
--      NO-reserved-guard and correctly so — these never pick or occupy a
--      bed at all (dedup-only / release-only / delete-only), so the new
--      contract does not apply and they are untouched:
--        * fn_approve_allocation, fn_approve_allocation_batch — flip an
--          ALREADY-bed-carrying pending_approval row to active; the
--          conditional `... AND status='available'` UPDATE is a safe no-op
--          against a reserved bed, and bed_id/room_id are never written by
--          either function (the new trigger does not even fire on them).
--        * fn_cl_admin_reset_allocation, fn_remove_batch_allocations,
--          fn_reset_allocation_batch — DELETE / free-bed-to-available only.
--
--      GENUINE gap #1 — fixed here (rebuilt VERBATIM from the dump, guard
--      lines only):
--        * fn_cl_admin_allocate_bed — the admin "allocate a fresh bed" RPC
--          had NO bed-status check of any kind before INSERT. This path is
--          fresh-only (it already refuses a learner with any existing
--          active/pending allocation), so a learner reachable through it can
--          never legitimately be the holder of a reserved bed's upgrade
--          hold — requiring 'available' here costs no real path, and gives
--          the admin UI a clean refusal instead of a raw trigger exception.
--
--      GENUINE gap #2 — left to the trigger alone, DELIBERATELY, and not
--      patched here:
--        * fn_cl_admin_transfer_allocation — moves an ALREADY-active
--          allocation onto a new bed_id/room_id with no bed-status check.
--          Unlike fn_cl_admin_allocate_bed, the learner here already holds
--          an active allocation and so COULD legitimately be the very
--          holder of a reserved bed's own upgrade hold (an admin manually
--          completing her move). A blanket "must be available" WHERE clause
--          would block that legitimate case the trigger correctly allows
--          (same-learner match). Adding it would not be "trivially safe" —
--          it would change real behaviour for a real, if rare, admin path.
--          The trigger is the sole guard for this function; an admin who
--          hits it sees the trigger's plain-English exception, not a
--          friendlier pre-check.
--
-- HARD LIMITS OBSERVED: zero behaviour change for available-bed allocation
-- (the trigger is a no-op whenever the target bed is not 'reserved'); the 22
-- live waiting holds are unaffected (their execution path is the
-- same-learner PASS case); terminology is "learner", never "student".
-- ----------------------------------------------------------------------------

-- ============ 1. The guard trigger function ============

CREATE OR REPLACE FUNCTION public._on_allocation_guard_reserved_bed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bed_status   bed_status_enum;
  v_hold_learner uuid;
BEGIN
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = NEW.bed_id;

  IF v_bed_status = 'reserved' THEN
    -- The learner whose ACTIVE waiting hold points at this exact bed
    -- (entry_kind='upgrade' AND status='waiting' — the same pair
    -- uq_hostel_waitlist_active_upgrade scopes on, and the pair every
    -- "SET status='reserved'" writer pairs 1:1 with a held_bed_id row).
    -- _cl_execute_first_booking / _cl_execute_room_upgrade flip this row to
    -- 'allocated' AFTER the INSERT into hostel_allocations, so at this
    -- BEFORE-trigger's evaluation time the holder's own row still reads
    -- 'waiting' — her own execution passes.
    SELECT learner_id INTO v_hold_learner
      FROM hostel_waitlist
      WHERE held_bed_id = NEW.bed_id
        AND entry_kind = 'upgrade'
        AND status = 'waiting'
      ORDER BY updated_at DESC
      LIMIT 1;

    -- No live hold at all (stale 'reserved') refuses too, for anyone —
    -- v_hold_learner is NULL, and NULL IS DISTINCT FROM any learner_id.
    IF v_hold_learner IS DISTINCT FROM NEW.learner_id THEN
      RAISE EXCEPTION 'This bed is reserved for another learner''s confirmed upgrade'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- No GRANT TO authenticated on purpose: this function has no legitimate
-- direct caller, only the trigger below. Asserted anyway per the CLAUDE.md
-- "every CREATE OR REPLACE of a SECDEF fn re-asserts REVOKE" rule.
REVOKE EXECUTE ON FUNCTION public._on_allocation_guard_reserved_bed() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_allocation_guard_reserved_bed ON public.hostel_allocations;
CREATE TRIGGER trg_allocation_guard_reserved_bed
  BEFORE INSERT OR UPDATE OF bed_id, room_id ON public.hostel_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public._on_allocation_guard_reserved_bed();

-- ============ 2. fn_cl_admin_allocate_bed — close the one genuine gap ======
-- Rebuilt VERBATIM from the live pg_get_functiondef dump (2026-08-07 ~09:40
-- IST, 96 lines). Only the bed-status check block is new (+9 lines); every
-- other line, including the authorization check, the fresh-only guard, the
-- institution-access mirror and the tier-policy fallback, is unchanged.

CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocate_bed(p_learner_profile_id uuid, p_room_id uuid, p_bed_id uuid, p_mess_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_room       hostel_rooms%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_profile    uuid;
  v_inst       uuid;
  v_sem        uuid;
  v_ay         uuid;
  v_tier       uuid;
  v_block      uuid;
  v_mapped     boolean;
  v_accessible boolean;
  v_alloc_id   uuid;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to allocate hostel rooms' USING ERRCODE = '42501';
  END IF;

  -- learners_profiles → institution / semester / academic year (mirror auto-allocate fallback)
  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years
             WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
  FROM learners_profiles lp WHERE lp.id = p_learner_profile_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner % not found', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for this learner' USING ERRCODE = 'P0001'; END IF;

  -- bridge to the profiles.id key hostel_allocations uses
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_learner_profile_id LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'No profile bridges learner %', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;

  -- fresh-only
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.learner_id = v_profile AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'Learner already has an active allocation — use Change room/bed instead' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002'; END IF;
  IF v_bed.room_id <> p_room_id THEN RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001'; END IF;

  -- 2026-08-15: a bed reserved for another learner's confirmed upgrade hold
  -- must never be handed to a fresh allocation here. This path is
  -- fresh-only (checked above), and a learner with zero prior allocations
  -- cannot legitimately be the holder of a reserved bed's upgrade hold — so
  -- requiring 'available' costs no real path. trg_allocation_guard_reserved_bed
  -- on hostel_allocations is the backstop for every writer; this explicit
  -- check exists only so the admin UI gets a clean refusal here instead of a
  -- raw trigger exception.
  IF v_bed.status = 'reserved' THEN
    RAISE EXCEPTION 'This bed is reserved for another learner''s confirmed upgrade' USING ERRCODE = 'P0001';
  END IF;

  v_block := v_room.block_id;

  -- institution access (mirror fn_cl_admin_transfer_allocation)
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block) INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block
        AND hbi.institution_id IN (SELECT institution_id FROM get_user_accessible_institutions(auth.uid()))
    ) INTO v_accessible;
    IF NOT v_accessible THEN RAISE EXCEPTION 'No access to the target block''s institution' USING ERRCODE = '42501'; END IF;
  END IF;

  -- bed must be free (dedup on allocation existence, matching auto-allocate)
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.bed_id = p_bed_id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- standard tier policy (mirror auto-allocate)
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  ) VALUES (
    v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, auth.uid()
  ) RETURNING id INTO v_alloc_id;

  -- occupy the bed (immediate-active per design decision)
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile, updated_at=now() WHERE id = p_bed_id;

  -- room category is synced by trg_allocation_sync_learner_categories; honor an explicit mess pick
  IF p_mess_category_id IS NOT NULL THEN
    UPDATE learners_profiles SET mess_category_id = p_mess_category_id, updated_at = now() WHERE id = p_learner_profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id,
                            'room_id', p_room_id, 'bed_id', p_bed_id, 'block_id', v_block);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) TO authenticated;
