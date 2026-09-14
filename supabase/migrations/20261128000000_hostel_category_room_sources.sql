-- ============================================================================
-- Campus Living — a room category may draw rooms from MORE than one category
-- ============================================================================
-- 2026-11-28
--
-- WHY
-- ---
-- Girls Premium has 9 free beds out of 111 while 109 learners are already
-- billed Premium; girls Deluxe has 70 free beds. A learner who pays the Premium
-- upgrade fee frequently has nowhere to sit. The hostel office has been solving
-- this by hand — four girls are Premium-billed and seated in Deluxe rooms today
-- (Girls Hostel C, rooms 19 and 27), placed as manual 'transfer' allocations.
--
-- hostel_categories.room_source_category_id already lets a category bill as
-- itself while seating everyone in ANOTHER category's rooms (that is how
-- "Deluxe Plus" works for 64 girls). But it is a SINGLE redirect. What this
-- migration adds is a UNION: Premium draws from Premium rooms PLUS Deluxe rooms.
--
-- The learner's deal is unchanged when they pick a Deluxe room: category stays
-- Premium, the Premium upgrade fee and the Premium annual hostel fee are billed,
-- and Premium benefits still apply. Only the physical room differs.
--
-- WHAT THIS TOUCHES
-- -----------------
--   1. hostel_category_room_sources  — new mapping table (+ RLS, + seed)
--   2. fn_cl_category_room_sources   — THE resolver; every pool query calls it
--   3. fn_my_upgrade_room_options    — the learner's room picker  (DROP+CREATE)
--   4. fn_my_room_change_options     — the one-time room change   (DROP+CREATE)
--   5. fn_my_room_options            — bed list + the free-bed count per row
--   6. _cl_room_options              — the VALIDATOR every upgrade RPC calls
--   7. fn_self_change_room           — "same category" guard becomes the pool
--   8. _on_allocation_sync_learner_categories — stops demoting cross-placed
--   9. fn_cl_housekeeping_book       — entitlement follows the BILLED category
--
-- Admin upgrades (fn_cl_admin_room_upgrade_options, fn_cl_admin_upgrade_room)
-- funnel through _cl_room_options and _cl_upgrade_room_category, so they inherit
-- the widened pool with no change of their own.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The mapping table
-- ----------------------------------------------------------------------------
-- No institution_id: hostel_categories itself has none. Categories are global
-- and scoped by gender ('type'), and every pool query still filters rooms by
-- fn_room_serves_institution(), so tenancy is enforced on the ROOM, not here.

CREATE TABLE IF NOT EXISTS public.hostel_category_room_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid NOT NULL REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  source_category_id  uuid NOT NULL REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcrs_not_self CHECK (category_id <> source_category_id),
  CONSTRAINT hcrs_unique_pair UNIQUE (category_id, source_category_id)
);

CREATE INDEX IF NOT EXISTS idx_hcrs_category_active
  ON public.hostel_category_room_sources (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_hcrs_source
  ON public.hostel_category_room_sources (source_category_id);

ALTER TABLE public.hostel_category_room_sources ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_hcrs_updated_at ON public.hostel_category_room_sources;
CREATE TRIGGER trg_hcrs_updated_at
  BEFORE UPDATE ON public.hostel_category_room_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read is open to every signed-in user: this is configuration that each
-- resident's own room picker has to resolve, exactly like hostel_categories
-- (whose SELECT policy is likewise `true`). Writes are gated on a PERMISSION
-- KEY, never on a hardcoded role name — hostel_categories' own write policies
-- still test profiles.role and should be migrated the same way one day.
DROP POLICY IF EXISTS hcrs_select ON public.hostel_category_room_sources;
CREATE POLICY hcrs_select ON public.hostel_category_room_sources
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS hcrs_insert ON public.hostel_category_room_sources;
CREATE POLICY hcrs_insert ON public.hostel_category_room_sources
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('campus_living.settings.edit'));

DROP POLICY IF EXISTS hcrs_update ON public.hostel_category_room_sources;
CREATE POLICY hcrs_update ON public.hostel_category_room_sources
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('campus_living.settings.edit'))
  WITH CHECK (public.user_has_permission('campus_living.settings.edit'));

DROP POLICY IF EXISTS hcrs_delete ON public.hostel_category_room_sources;
CREATE POLICY hcrs_delete ON public.hostel_category_room_sources
  FOR DELETE TO authenticated
  USING (public.user_has_permission('campus_living.settings.edit'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostel_category_room_sources TO authenticated;
GRANT ALL ON public.hostel_category_room_sources TO service_role;

COMMENT ON TABLE public.hostel_category_room_sources IS
  'Extra room categories a category may seat its learners in. The learner keeps the '
  'billing category and its benefits; only the physical room comes from elsewhere. '
  'Read it through fn_cl_category_room_sources(), never directly — that function '
  'also yields the native source (COALESCE(room_source_category_id, id)).';


-- ----------------------------------------------------------------------------
-- 2. The resolver — the single definition of "which rooms may this category use"
-- ----------------------------------------------------------------------------
-- Yields the NATIVE source first (rank 0), then the mapped extras. The native
-- row keeps the old COALESCE(room_source_category_id, id) semantics untouched,
-- so "Deluxe Plus -> Deluxe" keeps working exactly as before.

CREATE OR REPLACE FUNCTION public.fn_cl_category_room_sources(p_category_id uuid)
 RETURNS TABLE(source_category_id uuid, is_native boolean, pool_rank integer)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(c.room_source_category_id, c.id), true, 0
    FROM public.hostel_categories c
   WHERE c.id = p_category_id
  UNION ALL
  SELECT s.source_category_id, false, GREATEST(s.sort_order, 1)
    FROM public.hostel_category_room_sources s
    JOIN public.hostel_categories c  ON c.id  = s.category_id
    JOIN public.hostel_categories sc ON sc.id = s.source_category_id AND sc.is_active
   WHERE s.category_id = p_category_id
     AND s.is_active
     AND s.source_category_id IS DISTINCT FROM COALESCE(c.room_source_category_id, c.id);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_category_room_sources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cl_category_room_sources(uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Seed — Premium categories may also seat learners in Deluxe rooms
-- ----------------------------------------------------------------------------
-- Matched on `type` so a boys category never draws a girls room. (The gender
-- filter in every pool query would reject it anyway; this keeps the config
-- itself honest.)

INSERT INTO public.hostel_category_room_sources (category_id, source_category_id, sort_order)
SELECT tgt.id, src.id, 1
  FROM public.hostel_categories tgt
  JOIN public.hostel_categories src
    ON src.type = tgt.type AND src.name = 'Deluxe Room' AND src.is_active
 WHERE tgt.name IN ('Premium Room', 'Premium Room + AC')
   AND tgt.is_active
ON CONFLICT (category_id, source_category_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4. fn_my_upgrade_room_options — the learner's room picker
-- ----------------------------------------------------------------------------
-- DROP + CREATE, not CREATE OR REPLACE: the RETURNS TABLE gains three columns
-- and Postgres cannot replace a function's result type in place. Dropping
-- re-grants EXECUTE to PUBLIC (= anon), so the grants below restore the exact
-- ACL the function had: authenticated + service_role only.
--
-- Two behaviour changes beyond the widened pool:
--   * ORDER BY puts native (Premium) rooms first so the UI can group them.
--   * The learner's OWN seated room is excluded. Without that, a Deluxe learner
--     upgrading to Premium could pay Rs.7,500 and be re-seated in another bed of
--     the room they are already in.

DROP FUNCTION IF EXISTS public.fn_my_upgrade_room_options(uuid);

CREATE FUNCTION public.fn_my_upgrade_room_options(p_category_id uuid)
 RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text,
               capacity integer, occupied_beds integer, available_beds integer,
               source_category_id uuid, source_category_name text, is_native boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
  v_cur_room uuid;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_categories c WHERE c.id = p_category_id) THEN RETURN; END IF;
  SELECT lp.institution_id, lp.hostel_category_id INTO v_inst, v_cur_cat
    FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
  SELECT y.id INTO v_year FROM hostel_years y WHERE y.is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
  SELECT a.room_id INTO v_cur_room
    FROM hostel_allocations a
   WHERE a.learner_id = auth.uid() AND a.status = 'active'
   ORDER BY a.allocation_date DESC LIMIT 1;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free,
         rc.id, rc.name, src.is_native
  FROM fn_cl_category_room_sources(p_category_id) src
  JOIN hostel_rooms r      ON r.category_id = src.source_category_id
  JOIN hostel_categories rc ON rc.id = r.category_id
  JOIN hostel_blocks bl    ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free
    FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
        WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval')
      )
  ) av
  WHERE r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
    AND av.free > 0
    AND (v_cur_room IS NULL OR r.id <> v_cur_room)
  ORDER BY src.is_native DESC, src.pool_rank, bl.name, r.floor, r.room_number;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_options(uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. fn_my_room_change_options — the one-time same-category room change
-- ----------------------------------------------------------------------------
-- Delegates to the picker above, so it inherits the widened pool; it only needs
-- the three new columns passed through. DROP + CREATE for the same reason, and
-- the same grant restoration.

DROP FUNCTION IF EXISTS public.fn_my_room_change_options();

CREATE FUNCTION public.fn_my_room_change_options()
 RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text,
               capacity integer, occupied_beds integer, available_beds integer,
               source_category_id uuid, source_category_name text, is_native boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_cat uuid; v_cur_room uuid; v_allow boolean := false; v_ay uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT lp.hostel_category_id INTO v_cat FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT c.allow_self_room_change INTO v_allow FROM hostel_categories c WHERE c.id = v_cat;
  IF NOT COALESCE(v_allow, false) THEN RETURN; END IF;

  SELECT ha.room_id, ha.academic_year_id INTO v_cur_room, v_ay
    FROM hostel_allocations ha
   WHERE ha.learner_id = v_profile AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;
  IF v_cur_room IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM hostel_allocations ha
              WHERE ha.learner_id = v_profile AND ha.academic_year_id = v_ay
                AND ha.metadata->>'self_room_change' = 'true') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.room_id, o.room_number, o.floor, o.block_name,
         o.capacity, o.occupied_beds, o.available_beds,
         o.source_category_id, o.source_category_name, o.is_native
  FROM fn_my_upgrade_room_options(v_cat) o
  WHERE o.room_id <> v_cur_room;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_room_change_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_room_change_options() TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6. fn_my_room_options — bed-level list; also the free-bed count on each
--    upgrade row (fn_my_upgrade_room_categories counts this function's rows).
-- ----------------------------------------------------------------------------
-- Signature unchanged, so CREATE OR REPLACE keeps the existing ACL.

CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
 RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_categories c WHERE c.id = p_category_id) THEN RETURN; END IF;
  SELECT lp.institution_id, lp.hostel_category_id INTO v_inst, v_cur_cat
    FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM profiles pr LEFT JOIN learners_profiles lp ON lp.id = pr.learner_id
   WHERE pr.id = auth.uid();
  SELECT y.id INTO v_year FROM hostel_years y WHERE y.is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;

  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM fn_cl_category_room_sources(p_category_id) src
  JOIN hostel_rooms r   ON r.category_id = src.source_category_id
  JOIN hostel_beds b    ON b.room_id = r.id
  JOIN hostel_blocks bl ON bl.id = r.block_id
  WHERE r.room_purpose = 'student' AND b.status = 'available'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
  ORDER BY src.is_native DESC, src.pool_rank, bl.name, r.floor, r.room_number, b.bed_number;
END $function$;


-- ----------------------------------------------------------------------------
-- 7. _cl_room_options — THE validator
-- ----------------------------------------------------------------------------
-- _cl_upgrade_room_category and fn_self_change_room both re-check the learner's
-- pick against this function and pick the bed from it. If it is not widened, the
-- picker offers a Deluxe room and the upgrade RPC then refuses it.
-- Ordering matters here too: with no bed given, _cl_upgrade_room_category takes
-- the first row for the chosen room, and native rooms must sort first.

CREATE OR REPLACE FUNCTION public._cl_room_options(p_profile uuid, p_lp uuid, p_category_id uuid)
 RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_gender text; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF p_lp IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_categories c WHERE c.id = p_category_id) THEN RETURN; END IF;
  SELECT lp.institution_id, lp.hostel_category_id INTO v_inst, v_cur_cat
    FROM learners_profiles lp WHERE lp.id = p_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.id = p_profile WHERE lp.id = p_lp;
  SELECT y.id INTO v_year FROM hostel_years y WHERE y.is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;

  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM fn_cl_category_room_sources(p_category_id) src
  JOIN hostel_rooms r   ON r.category_id = src.source_category_id
  JOIN hostel_beds b    ON b.room_id = r.id
  JOIN hostel_blocks bl ON bl.id = r.block_id
  WHERE r.room_purpose = 'student' AND b.status = 'available'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    AND (v_skip OR fn_learner_eligible_for_room(p_lp, r.id))
  ORDER BY src.is_native DESC, src.pool_rank, bl.name, r.floor, r.room_number, b.bed_number;
END $function$;


-- ----------------------------------------------------------------------------
-- 8. fn_self_change_room — "your own category" becomes "your category's pool"
-- ----------------------------------------------------------------------------
-- Only the room-category guard changes. Everything else — the one-per-year
-- allowance, the advisory lock, the check_out_date on the vacated row (without
-- which hostel_allocations_room_bed_active_uidx never frees the old bed) — is
-- reproduced verbatim.

CREATE OR REPLACE FUNCTION public.fn_self_change_room(p_room_id uuid, p_bed_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_cat uuid; v_allow boolean := false; v_old RECORD; v_new_alloc uuid;
  v_bed_status text; v_new_room RECORD;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can change their room';
  END IF;

  SELECT hostel_category_id INTO v_cat FROM learners_profiles WHERE id = v_lp;
  SELECT allow_self_room_change INTO v_allow FROM hostel_categories WHERE id = v_cat;
  IF NOT COALESCE(v_allow, false) THEN
    RAISE EXCEPTION 'Room change is not available for your category';
  END IF;

  SELECT ha.id, ha.room_id, ha.bed_id, ha.tier_id, ha.academic_year_id, ha.semester_id,
         ha.institution_id, ha.batch_id, ha.emergency_contact_name,
         ha.emergency_contact_phone, ha.emergency_contact_relation
    INTO v_old
    FROM hostel_allocations ha
   WHERE ha.learner_id = v_profile AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'You have no active allocation to change'; END IF;

  IF EXISTS (SELECT 1 FROM hostel_allocations ha
              WHERE ha.learner_id = v_profile AND ha.academic_year_id = v_old.academic_year_id
                AND ha.metadata->>'self_room_change' = 'true') THEN
    RAISE EXCEPTION 'You have already used your one room change for this academic year';
  END IF;

  IF p_room_id = v_old.room_id THEN
    RAISE EXCEPTION 'That is already your room. Pick a different one.';
  END IF;

  SELECT r.id, r.room_number, r.block_id, r.category_id INTO v_new_room
    FROM hostel_rooms r WHERE r.id = p_room_id;
  -- 2026-11-28: was `category_id <> COALESCE(room_source_category_id, id)`. A
  -- category may now seat learners in several room categories, so membership in
  -- the pool is the test.
  IF v_new_room.id IS NULL
     OR NOT EXISTS (SELECT 1 FROM fn_cl_category_room_sources(v_cat) s
                     WHERE s.source_category_id = v_new_room.category_id) THEN
    RAISE EXCEPTION 'You can only move to a room available to your category';
  END IF;

  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
      FROM _cl_room_options(v_profile, v_lp, v_cat) o
     WHERE o.room_id = p_room_id ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN RAISE EXCEPTION 'No available bed left in that room. Pick another room.'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _cl_room_options(v_profile, v_lp, v_cat) o
                  WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'That bed is no longer available';
  END IF;

  UPDATE hostel_allocations
     SET status='vacated', actual_vacate_date=CURRENT_DATE,
         check_out_date=CURRENT_DATE, updated_at=now()
   WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id, metadata
  ) VALUES (
    v_old.institution_id, v_profile, v_new_room.block_id, p_room_id, p_bed_id,
    v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
    v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
    v_old.tier_id, v_profile, v_old.batch_id,
    jsonb_build_object('self_room_change', true,
                       'from_room_id', v_old.room_id,
                       'from_bed_id',  v_old.bed_id,
                       'changed_at',   to_jsonb(now()))
  ) RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;

  RETURN jsonb_build_object('success', true,
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc,
    'old_room_id', v_old.room_id, 'new_room_id', p_room_id,
    'new_bed_id', p_bed_id, 'new_room_number', v_new_room.room_number);
END $function$;


-- ----------------------------------------------------------------------------
-- 9. _on_allocation_sync_learner_categories — stop demoting cross-placed learners
-- ----------------------------------------------------------------------------
-- THE trap this feature had to defuse. The trigger rewrote
-- learners_profiles.hostel_category_id to the SEATED room's category whenever
-- the two differed, so a Premium learner in a Deluxe room silently became a
-- Deluxe learner on the next allocation touch — losing the fee level they paid
-- for. The keep-condition now asks whether the room's category is anywhere in
-- the learner's category pool, which makes cross-placement durable across every
-- path (self upgrade, self room change, admin move, auto-allocation) with no new
-- column and no backfill. The four girls already sitting this way are adopted
-- the moment the seed rows above land.

CREATE OR REPLACE FUNCTION public._on_allocation_sync_learner_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid; v_mess uuid; v_room_cat uuid; v_cur_cat uuid; v_keep boolean := false;
BEGIN
  BEGIN
    SELECT learner_id INTO v_lp FROM profiles WHERE id = NEW.learner_id;
    IF v_lp IS NULL THEN RETURN NEW; END IF;
    SELECT mc.category_id INTO v_mess
    FROM fn_hostel_learner_mess_categories(v_lp) mc
    LIMIT 1;

    SELECT category_id INTO v_room_cat FROM hostel_rooms WHERE id = NEW.room_id;
    SELECT lp.hostel_category_id INTO v_cur_cat FROM learners_profiles lp WHERE lp.id = v_lp;

    v_keep := v_cur_cat IS NOT NULL AND EXISTS (
      SELECT 1 FROM fn_cl_category_room_sources(v_cur_cat) s
       WHERE s.source_category_id IS NOT DISTINCT FROM v_room_cat
    );

    UPDATE learners_profiles
       SET hostel_category_id = CASE WHEN v_keep THEN hostel_category_id ELSE v_room_cat END,
           mess_category_id   = COALESCE(mess_category_id, v_mess),
           updated_at = now()
     WHERE id = v_lp;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_allocation_sync_learner_categories: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;


-- ----------------------------------------------------------------------------
-- 10. fn_cl_housekeeping_book — entitlement follows the BILLED category
-- ----------------------------------------------------------------------------
-- Step 4 previously read the SEATED room's category, with a comment saying
-- "never the billed category". That rule is what this feature reverses: a
-- learner who pays Premium keeps Premium benefits wherever they sleep.
--
-- Verified safe before changing: hostel_cleaning_type_categories maps BOTH
-- cleaning types only to premium / premium_plus categories, so no current
-- resident gains or loses a thing — except the four cross-placed girls, who
-- start getting the cleaning they have been paying for since August.
-- Everything else in this function is reproduced verbatim.

CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_book(p_type_id uuid, p_date date, p_slot_start time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_alloc        public.hostel_allocations%ROWTYPE;
  v_type         public.hostel_cleaning_types%ROWTYPE;
  v_category_id  uuid;
  v_slot_end     time;
  v_window_days  integer;
  v_window_start date;
  v_window_end   date;
  v_used         integer;
  v_advance_days integer;
  v_slots        jsonb;
  v_slot         jsonb;
  v_ok           boolean := false;
  v_cost         numeric(12,2);
  v_booking_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  -- 1. Master kill switch.
  IF NOT public.fn_get_policy_bool('housekeeping.booking_enabled', true, NULL) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'feature_disabled');
  END IF;

  -- 2. Live allocation. This is the learner's authorisation -- no permission
  --    key is involved; living in the room IS the right to book for it.
  SELECT * INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ORDER BY a.allocation_date DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_allocation');
  END IF;

  -- 3. Active type. The catalogue is global, so there is no institution to
  --    match -- step 4 is what decides whether THIS learner may book it.
  SELECT * INTO v_type
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id
    AND t.is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'type_unavailable');
  END IF;

  -- 4. Eligibility by the learner's BILLED category (2026-11-28; was the seated
  --    room's category). A category may now seat its learners in another
  --    category's rooms, and the benefit must follow what they paid for, not
  --    where the bed happens to be. Falls back to the seated room's category
  --    when the learner has no billed category, and never reads
  --    hostel_allocations.tier_id, which is dead in production.
  --    An empty junction means nobody can book: it fails closed.
  SELECT lp.hostel_category_id INTO v_category_id
  FROM public.profiles p
  JOIN public.learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = v_uid;
  IF v_category_id IS NULL THEN
    SELECT r.category_id INTO v_category_id
    FROM public.hostel_rooms r WHERE r.id = v_alloc.room_id;
  END IF;
  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaning_type_categories tc
    WHERE tc.type_id = p_type_id AND tc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'category_not_eligible');
  END IF;

  -- Serialise same-room bookers before the read-then-write below.
  PERFORM pg_advisory_xact_lock(hashtext(v_alloc.room_id::text));

  -- 5. Room lock: one live booking per room, any type.
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.status IN ('booked','assigned','in_progress','awaiting_feedback')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
  END IF;

  -- 6. Quota: per room, per type, over a window SYMMETRIC about the booking
  --    date. Counting only backwards let a room book the later date first and
  --    then squeeze a second cleaning in before it -- see this file's header.
  v_window_days := CASE v_type.usage_period
                     WHEN 'day'   THEN 0
                     WHEN 'week'  THEN 6
                     WHEN 'month' THEN 29
                   END;
  v_window_start := p_date - v_window_days;
  v_window_end   := p_date + v_window_days;
  SELECT count(*)::integer INTO v_used
  FROM public.hostel_cleaning_bookings b
  WHERE b.room_id = v_alloc.room_id
    AND b.type_id = p_type_id
    AND b.status <> 'cancelled'
    AND b.booking_date BETWEEN v_window_start AND v_window_end;
  IF v_used >= v_type.usage_limit_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
                              'used', v_used, 'allowed', v_type.usage_limit_count);
  END IF;

  -- 7. Date range.
  v_advance_days := public.fn_get_policy_int('housekeeping.booking_advance_days', 7, NULL);
  IF p_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + v_advance_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'date_out_of_range');
  END IF;

  -- 8. The slot must exist in today's grid and still be bookable.
  v_slots := public.fn_cl_housekeeping_slots(v_alloc.room_id, p_type_id, p_date);
  IF NOT (v_slots->>'open')::boolean THEN
    RETURN jsonb_build_object('success', false,
                              'error_code', COALESCE(v_slots->>'reason', 'day_closed'));
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots->'slots') LOOP
    IF (v_slot->>'slot_start') = to_char(p_slot_start, 'HH24:MI') THEN
      v_ok := (v_slot->>'is_bookable')::boolean;
      v_slot_end := (v_slot->>'slot_end')::time;
    END IF;
  END LOOP;
  IF v_slot_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_not_found');
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full');
  END IF;

  -- 9. Snapshot the cost and insert.
  SELECT COALESCE(sum(e.line_total_inr), 0) INTO v_cost
  FROM public.hostel_cleaning_type_expenses e WHERE e.type_id = p_type_id;

  INSERT INTO public.hostel_cleaning_bookings (
    institution_id, block_id, room_id, allocation_id, learner_id, type_id,
    booking_date, slot_start, slot_end, status,
    feedback_due_at, type_name, duration_minutes, expected_cost_inr, notes
  ) VALUES (
    v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id, v_uid, p_type_id,
    p_date, p_slot_start, v_slot_end, 'booked',
    (p_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata',
    v_type.name, v_type.duration_minutes, v_cost, nullif(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id,
                            'slot_end', to_char(v_slot_end, 'HH24:MI'));
EXCEPTION
  WHEN unique_violation THEN
    -- ux_hk_one_live_booking_per_room fired: a roommate won the race.
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
END $function$;
