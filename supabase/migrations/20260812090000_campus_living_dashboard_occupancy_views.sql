-- Campus Living dashboard: block x category occupancy + institution-wise residents
-- (2026-08-12)
--
-- WHY THESE COUNT BEDS, NOT hostel_rooms.capacity
-- -----------------------------------------------
-- hostel_rooms.capacity is INTENT (how many beds a room is meant to hold). hostel_beds rows
-- are INVENTORY (beds that exist and can carry an allocation). Every operational surface in
-- this module works on inventory: fn_auto_allocate_plan, the
--   UNIQUE (room_id, bed_id) WHERE check_out_date IS NULL
-- index, and the allocations screen. Reporting intent on a dashboard beside allocation
-- numbers is how "9 free beds" and "11 free beds" both end up being true on the same day.
-- room_capacity is carried through purely so the UI can FLAG the disagreement; it is never
-- the denominator.
--
-- Measured drift at authoring time (student rooms only): boys blocks 0, Girls A 0,
-- Girls C 0, Girls B capacity 98 vs 107 real beds (-9). Girls Hostel A's apparent +27 was
-- entirely non-student rooms, which is why room_purpose = 'student' is filtered below --
-- 13 rooms across the girls blocks are accounts / mess_staff / warden / tv_hall /
-- office_room and do not belong in an occupancy report.
--
-- FREE-BED TEST IS check_out_date IS NULL, NOT status
-- --------------------------------------------------
-- That is the predicate the uniqueness index uses, so it is the only test that agrees with
-- what the allocator can actually place. A 'vacated' row whose check_out_date was never set
-- still holds its bed. See feedback-hostel-bed-uniqueness-is-check-out-date-not-status.
--
-- security_invoker = true: this page is visible to wardens, not only admins, and
-- hostel_allocations / learners_profiles are RLS-gated. The views must see what the CALLER
-- may see, not what the owner may see.

-- ---------------------------------------------------------------------------
-- Block x category occupancy
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_hostel_block_category_occupancy;

CREATE VIEW public.v_hostel_block_category_occupancy
WITH (security_invoker = true) AS
SELECT
  hb.id                                   AS block_id,
  hb.name                                 AS block_name,
  hb.code                                 AS block_code,
  hb.hostel_type::text                    AS hostel_type,
  hc.id                                   AS category_id,
  COALESCE(hc.name, 'Uncategorised')      AS category_name,
  COALESCE(hc.sort_order, 999)            AS sort_order,
  count(*)::int                           AS rooms,
  COALESCE(sum(b.beds), 0)::int           AS beds,
  COALESCE(sum(b.filled), 0)::int         AS filled,
  COALESCE(sum(b.beds - b.filled), 0)::int AS vacant,
  COALESCE(sum(hr.capacity), 0)::int      AS room_capacity
FROM public.hostel_blocks hb
JOIN public.hostel_rooms hr
  ON hr.block_id = hb.id
 AND hr.room_purpose = 'student'
LEFT JOIN public.hostel_categories hc ON hc.id = hr.category_id
-- Aggregate beds PER ROOM before grouping. Joining hostel_beds directly would repeat each
-- room once per bed and multiply sum(hr.capacity) by that room's bed count.
LEFT JOIN LATERAL (
  SELECT count(*)::int AS beds,
         count(*) FILTER (
           WHERE EXISTS (SELECT 1 FROM public.hostel_allocations a
                          WHERE a.bed_id = bd.id AND a.check_out_date IS NULL)
         )::int AS filled
  FROM public.hostel_beds bd
  WHERE bd.room_id = hr.id
) b ON true
WHERE hb.status = 'active'
GROUP BY hb.id, hb.name, hb.code, hb.hostel_type, hc.id, hc.name, hc.sort_order;

COMMENT ON VIEW public.v_hostel_block_category_occupancy IS
  'Dashboard: per block x room category, the number of student rooms, real bed records, '
  'filled beds (allocation with check_out_date IS NULL) and vacant beds. Counts bed '
  'inventory, not hostel_rooms.capacity; room_capacity is exposed only so the UI can flag '
  'blocks where the two disagree. Excludes non-student rooms.';

GRANT SELECT ON public.v_hostel_block_category_occupancy TO authenticated;

-- ---------------------------------------------------------------------------
-- Institution-wise residents
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_hostel_institution_residents;

CREATE VIEW public.v_hostel_institution_residents
WITH (security_invoker = true) AS
SELECT
  i.id                                    AS institution_id,
  i.name                                  AS institution_name,
  count(*) FILTER (WHERE hb.hostel_type::text = 'boys')::int  AS boys,
  count(*) FILTER (WHERE hb.hostel_type::text = 'girls')::int AS girls,
  count(*)::int                                               AS total
FROM public.hostel_allocations a
JOIN public.hostel_blocks hb      ON hb.id = a.block_id
-- hostel_allocations.learner_id FKs to profiles(id), NOT learners_profiles(id) --
-- the two id spaces are disjoint in this schema.
JOIN public.profiles p            ON p.id = a.learner_id
JOIN public.learners_profiles lp  ON lp.id = p.learner_id
JOIN public.institutions i        ON i.id = lp.institution_id
-- check_out_date IS NULL ONLY -- deliberately NOT "AND status = 'active'". A
-- pending_approval allocation still holds its bed (the uniqueness index forbids reusing it),
-- so the block table counts that bed as filled. Adding a status filter here would report
-- 684 residents against 686 filled beds and the two sections would not reconcile.
WHERE a.check_out_date IS NULL
GROUP BY i.id, i.name;

COMMENT ON VIEW public.v_hostel_institution_residents IS
  'Dashboard: residents holding an active bed right now, per institution, split by hostel '
  'gender. Counts allocations only (check_out_date IS NULL AND status = active) so the '
  'totals reconcile exactly with the block-wise occupancy table.';

GRANT SELECT ON public.v_hostel_institution_residents TO authenticated;
