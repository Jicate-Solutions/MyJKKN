-- ===========================================================================
-- Extra beds for hostel rooms
-- ===========================================================================
--
-- A hostel sometimes has to place one more learner in an already-full room --
-- a late admission, a transfer, a sibling request. Until now the only lever
-- was to raise hostel_rooms.capacity, and that is the wrong lever:
--
--   1. capacity is a FEE driver, not just an availability driver.
--      hostel-fee-compute-service.ts, fn_settle_room_annual_cost and
--      fn_room_buyout_quote all price a room as (per_bed_rate * capacity),
--      split among the active occupants. Raising capacity 4 -> 5 and then
--      forgetting to lower it makes the 4 permanent residents each pay 25%
--      more, forever, for a bed that is not there.
--
--   2. fn_hostel_ensure_room_beds only ever INSERTed. Lowering capacity again
--      left the surplus hostel_beds rows behind, and those orphans stay
--      allocatable through every allocation RPC. Seven student rooms are in
--      that state today; the worst is room "54" -- capacity 5, 15 beds, 15
--      active residents, displaying as "Full" the whole time.
--
-- So temporary beds get their own column. extra_bed_count adds real,
-- allocatable hostel_beds rows and counts toward availability, block totals
-- and reports -- and is deliberately absent from every fee formula. Only a
-- super admin may set it.
--
-- Bed numbering: sanctioned beds stay '1'..'capacity'; temporary beds are
-- 'E1'..'E{extra_bed_count}'. The UNIQUE (room_id, bed_number) constraint
-- keeps the two ranges from colliding, and the 'E' prefix is what lets the
-- shrink path below tell a temporary bed apart from one of the pre-existing
-- orphans it must not touch.
-- ===========================================================================


-- ── 1. The column ─────────────────────────────────────────────────────────

ALTER TABLE public.hostel_rooms
  ADD COLUMN IF NOT EXISTS extra_bed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.hostel_rooms
  DROP CONSTRAINT IF EXISTS hostel_rooms_extra_bed_count_range;

ALTER TABLE public.hostel_rooms
  ADD CONSTRAINT hostel_rooms_extra_bed_count_range
  CHECK (extra_bed_count >= 0 AND extra_bed_count <= 10);

COMMENT ON COLUMN public.hostel_rooms.extra_bed_count IS
  'Temporary beds added beyond the sanctioned capacity. Counts toward '
  'availability and allocation; NEVER toward the fee formula -- '
  'hostel-fee-compute-service.ts, fn_settle_room_annual_cost and '
  'fn_room_buyout_quote all stay bound to capacity alone. Super-admin only '
  '(enforced by trg_hostel_rooms_guard_extra_beds).';


-- ── 2. Effective capacity ─────────────────────────────────────────────────
-- A stored generated column so the dozen rollup call sites (block totals,
-- dashboard, analytics, reports) swap one identifier instead of each
-- re-deriving the same arithmetic and drifting apart later.

ALTER TABLE public.hostel_rooms
  ADD COLUMN IF NOT EXISTS effective_capacity integer
  GENERATED ALWAYS AS (capacity + extra_bed_count) STORED;

COMMENT ON COLUMN public.hostel_rooms.effective_capacity IS
  'capacity + extra_bed_count. The number of beds that can actually be '
  'allocated. Use this for occupancy/rollup display; use capacity for money.';


-- ── 3. Bed generation ─────────────────────────────────────────────────────
-- Same signature, SECURITY DEFINER and search_path as before; now also
-- materialises the temporary beds and removes them again when the count drops.

CREATE OR REPLACE FUNCTION public.fn_hostel_ensure_room_beds(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity    int;
  v_extra       int;
  v_purpose     text;
  v_institution uuid;
  v_blocked     text;
BEGIN
  SELECT capacity, COALESCE(extra_bed_count, 0), room_purpose
    INTO v_capacity, v_extra, v_purpose
  FROM hostel_rooms WHERE id = p_room_id;

  IF v_capacity IS NULL OR v_purpose <> 'student' THEN
    RETURN;
  END IF;

  -- Shrink runs first, and only ever against 'E'-prefixed beds. The surplus
  -- beds left behind by historical capacity reductions are numbered plainly
  -- ('6'..'15' in room 54), so they fall outside this predicate and survive --
  -- removing them would strand the residents currently sleeping in them.
  --
  -- hostel_allocations.bed_id is NO ACTION, so a bed carrying ANY allocation
  -- row -- including a resident who checked out months ago -- cannot be
  -- deleted. Name those beds in a readable refusal rather than letting the
  -- delete surface as a bare 23503 nobody can act on.
  SELECT string_agg(b.bed_number, ', ' ORDER BY b.bed_number)
    INTO v_blocked
  FROM hostel_beds b
  WHERE b.room_id = p_room_id
    AND b.bed_number ~ '^E[0-9]+$'
    AND (substring(b.bed_number from 2))::int > v_extra
    AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot remove extra bed %: it still has an allocation on record. Vacate and reset that allocation first.',
      v_blocked
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM hostel_beds b
  WHERE b.room_id = p_room_id
    AND b.bed_number ~ '^E[0-9]+$'
    AND (substring(b.bed_number from 2))::int > v_extra;

  IF v_capacity < 1 THEN
    RETURN;
  END IF;

  SELECT hbi.institution_id INTO v_institution
  FROM hostel_rooms r
  JOIN hostel_block_institutions hbi ON hbi.block_id = r.block_id
  WHERE r.id = p_room_id
  ORDER BY hbi.is_primary DESC, hbi.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN;
  END IF;

  -- Sanctioned beds: '1' .. capacity
  INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
  SELECT p_room_id, v_institution, gs::text, 'single', 'available'
  FROM generate_series(1, v_capacity) gs
  WHERE NOT EXISTS (
    SELECT 1 FROM hostel_beds b
    WHERE b.room_id = p_room_id AND b.bed_number = gs::text
  );

  -- Temporary beds: 'E1' .. 'E{extra_bed_count}'
  IF v_extra > 0 THEN
    INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
    SELECT p_room_id, v_institution, 'E' || gs::text, 'single', 'available'
    FROM generate_series(1, v_extra) gs
    WHERE NOT EXISTS (
      SELECT 1 FROM hostel_beds b
      WHERE b.room_id = p_room_id AND b.bed_number = 'E' || gs::text
    );
  END IF;
END;
$function$;


-- ── 4. Fire the bed trigger on the new column too ─────────────────────────

DROP TRIGGER IF EXISTS trg_hostel_rooms_ensure_beds ON public.hostel_rooms;

CREATE TRIGGER trg_hostel_rooms_ensure_beds
  AFTER INSERT OR UPDATE OF capacity, room_purpose, extra_bed_count
  ON public.hostel_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_hostel_room_ensure_beds();


-- ── 5. Super-admin guard ──────────────────────────────────────────────────
-- This trigger IS the access control, not a convenience. Postgres has no
-- column-level RLS, and hostel_rooms_update_permission has with_check = NULL,
-- so anyone holding campus_living.rooms.edit can PATCH any column on a room
-- they can already see. A check that lived only in the React form would be
-- decorative.
--
-- The predicate is public.is_super_admin() exactly -- the same one the RLS
-- policies use. Note it reads profiles.is_super_admin only, and does NOT
-- accept role = 'super_admin'; the UI helper usePermissions().isSuperAdmin is
-- wider. There is no divergence today, and a mismatch fails loudly here rather
-- than silently.

CREATE OR REPLACE FUNCTION public._on_hostel_room_guard_extra_beds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
BEGIN
  -- Untouched column: nothing to authorize.
  IF TG_OP = 'INSERT' AND COALESCE(NEW.extra_bed_count, 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.extra_bed_count IS NOT DISTINCT FROM OLD.extra_bed_count THEN
    RETURN NEW;
  END IF;

  -- Migrations and service-role jobs are not a person and carry no JWT, so
  -- is_super_admin() would refuse them. auth.role() (never current_user, which
  -- inside a DEFINER function is the owner) is what distinguishes them.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change the extra-bed count for a room'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hostel_rooms_guard_extra_beds ON public.hostel_rooms;

-- Named to sort before trg_hostel_rooms_updated_at: row triggers fire in
-- alphabetical order by name, and the guard must refuse before anything else
-- rewrites the row. (It is BEFORE, so it already precedes the AFTER bed
-- trigger regardless.)
CREATE TRIGGER trg_hostel_rooms_guard_extra_beds
  BEFORE INSERT OR UPDATE ON public.hostel_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public._on_hostel_room_guard_extra_beds();


-- ── 6. Occupancy view ─────────────────────────────────────────────────────
-- capacity stays EXACTLY as it was. Three things depend on the sanctioned
-- figure and would be wrong if it moved: the fee formulas, fn_settle_windows_due's
-- "room_full" test, and empty-bed-notice-service's "N of M beds are empty,
-- here is what you would save" nudge.
--
-- beds_available and derived_status switch to the extras-inclusive figure --
-- that is what stops a room with an extra bed from displaying as Full.
-- beds_available_sanctioned is the old arithmetic, kept for the nudge.
--
-- New columns are APPENDED: CREATE OR REPLACE VIEW can add columns at the end
-- but cannot reorder or insert, and a DROP+CREATE would take the view's GRANTs
-- with it.

CREATE OR REPLACE VIEW public.v_hostel_room_occupancy AS
 SELECT r.id AS room_id,
    r.room_number,
    r.block_id,
    r.capacity,
    COALESCE(count(a.id) FILTER (WHERE a.check_out_date IS NULL), 0::bigint)::integer AS active_residents,
    GREATEST(
      r.capacity + r.extra_bed_count
        - COALESCE(count(a.id) FILTER (WHERE a.check_out_date IS NULL), 0::bigint),
      0::bigint
    )::integer AS beds_available,
        CASE
            WHEN r.capacity + r.extra_bed_count = 0 THEN 'unknown'::text
            WHEN count(a.id) FILTER (WHERE a.check_out_date IS NULL) = 0 THEN 'available'::text
            WHEN count(a.id) FILTER (WHERE a.check_out_date IS NULL) >= r.capacity + r.extra_bed_count THEN 'full'::text
            ELSE 'partially_occupied'::text
        END AS derived_status,
    r.extra_bed_count,
    r.effective_capacity,
    GREATEST(
      r.capacity - COALESCE(count(a.id) FILTER (WHERE a.check_out_date IS NULL), 0::bigint),
      0::bigint
    )::integer AS beds_available_sanctioned
   FROM hostel_rooms r
     LEFT JOIN hostel_allocations a ON a.room_id = r.id
  GROUP BY r.id, r.room_number, r.block_id, r.capacity, r.extra_bed_count, r.effective_capacity;


-- ── 7. Block x category occupancy ─────────────────────────────────────────
-- room_capacity exists purely so the UI can flag rooms whose bed inventory
-- disagrees with their capacity (dq-card.tsx). Left on plain capacity it would
-- light up on every room that legitimately carries an extra bed, which is the
-- fastest way to teach people to ignore the warning.

CREATE OR REPLACE VIEW public.v_hostel_block_category_occupancy
WITH (security_invoker = true) AS
 SELECT hb.id AS block_id,
    hb.name AS block_name,
    hb.code AS block_code,
    hb.hostel_type::text AS hostel_type,
    hc.id AS category_id,
    COALESCE(hc.name, 'Uncategorised'::text) AS category_name,
    COALESCE(hc.sort_order, 999) AS sort_order,
    count(*)::integer AS rooms,
    COALESCE(sum(b.beds), 0::bigint)::integer AS beds,
    COALESCE(sum(b.filled), 0::bigint)::integer AS filled,
    COALESCE(sum(b.beds - b.filled), 0::bigint)::integer AS vacant,
    COALESCE(sum(hr.effective_capacity), 0::bigint)::integer AS room_capacity
   FROM hostel_blocks hb
     JOIN hostel_rooms hr ON hr.block_id = hb.id AND hr.room_purpose = 'student'::text
     LEFT JOIN hostel_categories hc ON hc.id = hr.category_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS beds,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM hostel_allocations a
                  WHERE a.bed_id = bd.id AND a.check_out_date IS NULL)))::integer AS filled
           FROM hostel_beds bd
          WHERE bd.room_id = hr.id) b ON true
  WHERE hb.status = 'active'::block_status_enum
  GROUP BY hb.id, hb.name, hb.code, hb.hostel_type, hc.id, hc.name, hc.sort_order;


-- ── 8. Allocatable-rooms RPC ──────────────────────────────────────────────
-- This RPC already GATES on free hostel_beds rows (av.free), so extra beds are
-- allocatable through it the moment they exist -- no logic change needed. Only
-- the capacity it REPORTS needs the extras added, or the dialog shows
-- "4 free beds" beside a capacity of 3 and looks broken.
--
-- Rebuilt as CREATE OR REPLACE from pg_get_functiondef: a DROP would discard
-- the function's GRANTs and silently re-grant EXECUTE to PUBLIC on re-create.

CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_rooms(p_learner_profile_id uuid, p_block_id uuid)
 RETURNS TABLE(room_id uuid, room_number text, floor integer, category_id uuid, category_name text, capacity integer, available_beds integer, is_allocatable boolean, gender_ok boolean, institution_ok boolean, eligibility_ok boolean, category_ok boolean, has_free_beds boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable rooms' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT (EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst)
          OR EXISTS (SELECT 1 FROM hostel_block_institutions hbi
                      WHERE hbi.institution_id = v_inst
                        AND hbi.block_id = ANY (public.fn_cl_my_block_ids()))) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  -- A block-scoped caller can only enumerate rooms in a block they hold.
  IF cardinality(public.fn_cl_my_block_ids()) > 0
     AND NOT is_super_admin()
     AND NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst)
     AND NOT (p_block_id = ANY (public.fn_cl_my_block_ids())) THEN
    RAISE EXCEPTION 'No access to this block' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  -- Fail-open on category: only narrow to the learner's eligible categories when
  -- some are configured (matches the dialog's prior fail-open behavior).
  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, r.category_id, hc.name,
         (COALESCE(r.actual_capacity, r.capacity) + r.extra_bed_count)::int,
         av.free,
         (chk.c_gender AND chk.c_institution AND chk.c_eligibility AND chk.c_category AND av.free > 0),
         chk.c_gender, chk.c_institution, chk.c_eligibility, chk.c_category,
         av.free > 0
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  CROSS JOIN LATERAL (
    SELECT
      (bl.hostel_type::text = 'mixed'
        OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
        OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender,
      fn_room_serves_institution(r.id, v_inst)                              AS c_institution,
      fn_learner_eligible_for_room(p_learner_profile_id, r.id)             AS c_eligibility,
      (NOT v_has_elig
        OR r.category_id IN (SELECT elig.category_id
                             FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig)) AS c_category
  ) chk
  WHERE r.block_id = p_block_id
    AND r.room_purpose = 'student'
  ORDER BY 8 DESC, r.floor, r.room_number;
END;
$function$;
