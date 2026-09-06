-- fn_auto_allocate_preview: gender-scope the cohort to the block, matching
-- fn_auto_allocate_candidates.
--
-- BUG: the headline counters on /campus-living/allocations/auto disagreed with
-- the candidate table directly beneath them. The counters' cohort filtered only
-- on accommodation_type + lifecycle_status + institution_id — it never looked at
-- hostel_blocks.hostel_type. fn_auto_allocate_candidates HAS gender-scoped since
-- migration 20260622130000 (the `blk` CTE), so the two drifted apart.
--
-- SYMPTOM: Boys Hostel A, Boys Hostel B, Boys Hostel C and Girls Hostel A all
-- returned an IDENTICAL cohort_eligible / already_allocated, because those four
-- blocks serve the same six institutions and the cohort ignored the block beyond
-- that list. A boys block was counting girls as eligible and vice versa —
-- measured on Boys Hostel C: of the counted cohort only 8 were male, 32 female.
--
-- FIX: lift the exact `blk` CTE + gender predicate from
-- fn_auto_allocate_candidates. NULL/blank gender rows are deliberately KEPT (as
-- there) so data-incomplete learners still surface rather than silently vanish —
-- which also preserves the no_profile counter, since a learner with no profiles
-- row has a NULL gender.
--
-- Signature unchanged (uuid, integer).

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(
  p_block_id uuid,
  p_floor integer DEFAULT NULL::integer
)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH blk AS (
    SELECT hostel_type::text AS t FROM hostel_blocks WHERE id = p_block_id
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    CROSS JOIN blk
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      -- Only ACTIVE learners may be allocated a bed. Keep in lockstep with
      -- fn_auto_allocate_candidates / fn_auto_allocate_classic.
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      -- Gender-scope to the block, mirroring fn_auto_allocate_candidates. NULL /
      -- blank gender is kept so data-incomplete learners still surface (and so
      -- the no_profile counter below still sees them).
      AND (blk.t IS NULL OR blk.t NOT IN ('boys','girls')
           OR gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (blk.t = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (blk.t = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
         AND (p_floor IS NULL OR r.floor = p_floor)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;
