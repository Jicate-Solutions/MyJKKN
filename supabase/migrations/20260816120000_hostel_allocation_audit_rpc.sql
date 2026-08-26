-- ============================================================================
-- Allocation Audit — /campus-living/allocations/audit
--
-- One row per hostel allocation, answering "was this learner placed correctly?"
-- against the TWO gates the auto-allocator actually applies:
--
--   GATE 1  fee band   hostel_program_eligibility, resolved from the academic
--                      bill total of the learner's ANCHOR academic year.
--                      fn_learner_band_academic_fee() picks the ADMISSION
--                      academic year if a bill exists for it, otherwise the
--                      EARLIEST billed year — that fallback is invisible in
--                      every other screen and it silently changes which band
--                      applies, so band_year_source is returned explicitly.
--
--   GATE 2  physical   hostel_room_eligibility_rules covering the room the
--                      learner ACTUALLY occupies (block + floor, or the
--                      explicit room list when the rule has one).
--
-- A category ABOVE the band is not automatically a defect: the upgrade path
-- legitimises it. Upgrade legitimacy comes from billing_student_bills with
-- fee_source = 'hostel_category' -- NOT from hostel_waitlist, whose upgrade
-- trail is 305/334 expired|cancelled|declined and disagrees with the bills.
-- So "above band" is split by whether a bill exists and whether it was
-- collected: paid / partial / unpaid / cancelled-only / never billed.
--
-- Read-only: no writes, no repair, no side effects.
--
-- Access: gated on the catalog key campus_living.allocations.audit, which is
-- deliberately granted to NO role. user_has_permission() super-admin-bypasses,
-- so this is super-admin-only today and grantable from Role Management later
-- without a code change. Never gate on a role name.
-- ============================================================================

-- Both signatures dropped: the 5-arg form shipped first, and leaving it behind
-- would give PostgREST two overloads to choose between (PGRST203) rather than
-- replacing it.
DROP FUNCTION IF EXISTS public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text, uuid);

CREATE FUNCTION public.fn_hostel_allocation_audit(
  p_hostel_type    text DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL,
  p_program_id     uuid DEFAULT NULL,
  p_semester_id    uuid DEFAULT NULL,
  p_status         text DEFAULT 'active',
  -- Single-allocation lookup for the allocation detail page. Callers passing
  -- this should also pass p_status => 'all': a superseded ('vacated') row is
  -- still a row someone can open, and the 'active' default would return
  -- nothing for it.
  p_allocation_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  -- identity
  allocation_id                 uuid,
  learner_profile_id            uuid,
  learner_id                    uuid,
  full_name                     text,
  roll_number                   text,
  email                         text,
  gender                        text,
  institution_id                uuid,
  institution_name              text,
  degree_name                   text,
  department_name               text,
  program_id                    uuid,
  program_name                  text,
  semester_id                   uuid,
  semester_name                 text,
  quota_name                    text,
  -- years: admitted vs the year the fee band was read from
  admission_year                integer,
  admission_academic_year_name  text,
  band_academic_year_name       text,
  band_year_source              text,   -- admission_year | earliest_billed | no_admission_anchor | none
  -- the bills of that academic year (what the band was computed from)
  band_fee                      numeric,
  band_year_bill_count          integer,
  band_year_bill_paid           numeric,
  band_year_bill_balance        numeric,
  academic_bill_count           integer,
  -- fee band resolution
  matched_fee_min               numeric,
  matched_fee_max               numeric,
  entitled_room_category_name   text,
  entitled_mess_category_name   text,
  band_verdict                  text,   -- in_band | above_band | below_band | no_band | unranked
  -- the placement
  hostel_type                   text,
  block_name                    text,
  room_number                   text,
  floor                         integer,
  bed_number                    text,
  allocation_type               text,
  allocation_status             text,
  allocation_date               date,
  -- room_id is returned purely so the audit page can reuse the Allocations
  -- module's Advanced Filters verbatim -- its Room dropdown keys on it.
  room_id                       uuid,
  occupied_room_category_id     uuid,
  occupied_room_category_name   text,
  current_mess_category_name    text,
  mess_in_band                  boolean,
  -- first placement vs now (the upgrade story)
  first_room_category_name      text,
  first_allocation_date         date,
  is_upgraded                   boolean,
  upgrade_bill_state            text,   -- paid | partial | unpaid | cancelled_only | none
  upgrade_bill_count            integer,
  upgrade_bill_total            numeric,
  upgrade_bill_paid             numeric,
  upgrade_bill_balance          numeric,
  upgrade_bill_descriptions     text,
  -- physical room rules
  room_rule_verdict             text,   -- rule_matched | open_room | violation
  matched_rule_name             text,
  pinned_blocks                 text,
  serves_institution            boolean,
  -- overall
  verdict                       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_permission('campus_living.allocations.audit') THEN
    RAISE EXCEPTION 'Not authorised to read the allocation audit'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cur_year AS MATERIALIZED (
    SELECT id FROM hostel_years WHERE is_current LIMIT 1
  ),
  -- Per-bed annual rate for the current hostel year. This is what ranks
  -- categories -- NOT hostel_categories.sort_order, which has Deluxe Plus at 0
  -- (below Classic) while it is priced above Deluxe. Ranking on sort_order
  -- inverts above/below band for that tier.
  price AS MATERIALIZED (
    SELECT hf.hostel_category_id AS cid, hf.amount
    FROM hostel_fees hf, cur_year y
    WHERE hf.hostel_year_id = y.id
      AND hf.mess_category_id IS NULL
      AND hf.is_active
  ),
  alloc AS MATERIALIZED (
    SELECT
      a.id                AS alloc_id,
      a.learner_id        AS profile_id,
      a.room_id, a.block_id, a.bed_id,
      a.allocation_type::text  AS alloc_type,
      a.status::text           AS alloc_status,
      a.allocation_date        AS alloc_date,
      r.room_number::text      AS room_number,
      r.floor                  AS floor,
      r.category_id            AS room_cat_id,
      hb.name::text            AS block_name,
      hb.hostel_type::text     AS hostel_type,
      bd.bed_number::text      AS bed_number,
      lp.id                    AS lp_id,
      lp.institution_id, lp.degree_id, lp.department_id,
      lp.program_id, lp.semester_id, lp.quota_id,
      lp.mess_category_id,
      NULLIF(btrim(lp.roll_number), '')::text AS roll_number,
      -- Category resolution keys on learners_profiles.gender, matching both
      -- fn_hostel_learner_room_categories and the allocator's own cats CTE.
      -- profiles.gender is shown to the operator but never used to resolve.
      CASE WHEN lower(lp.gender) LIKE 'm%' THEN 'boys'
           WHEN lower(lp.gender) LIKE 'f%' THEN 'girls' END AS gt,
      lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender)))::text AS eff_gender,
      COALESCE(p.full_name,
               NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
               p.email, '—')::text AS full_name,
      p.email::text AS email
    FROM hostel_allocations a
    JOIN profiles p           ON p.id = a.learner_id
    JOIN learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN hostel_rooms r  ON r.id = a.room_id
    LEFT JOIN hostel_blocks hb ON hb.id = a.block_id
    LEFT JOIN hostel_beds bd  ON bd.id = a.bed_id
    WHERE (p_allocation_id IS NULL OR a.id = p_allocation_id)
      AND (p_status IS NULL OR p_status = 'all' OR a.status::text = p_status)
      AND (p_hostel_type    IS NULL OR hb.hostel_type::text = p_hostel_type)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
  ),
  fee AS MATERIALIZED (
    SELECT al.*,
           fn_learner_admission_academic_year(al.lp_id) AS adm_ay,
           bf.academic_year_id AS band_ay,
           bf.academic_year_name::text AS band_ay_name,
           bf.fee
    FROM alloc al
    LEFT JOIN LATERAL fn_learner_band_academic_fee(al.lp_id) bf ON true
  ),
  cats AS MATERIALIZED (
    SELECT f.*,
      (SELECT array_agg(category_id)
         FROM fn_hostel_effective_room_categories(
                f.institution_id, f.program_id, f.quota_id, f.fee, f.gt)) AS room_cats,
      (SELECT array_agg(category_id)
         FROM fn_hostel_effective_mess_categories(
                f.institution_id, f.program_id, f.quota_id, f.fee, f.gt)) AS mess_cats
    FROM fee f
  ),
  enriched AS (
    SELECT c.*,
      w.fee_min AS w_fee_min, w.fee_max AS w_fee_max,
      fa.first_cat_name, fa.first_date,
      ub.cnt AS ub_cnt, ub.active_cnt AS ub_active, ub.total AS ub_total,
      ub.paid AS ub_paid, ub.balance AS ub_balance, ub.descriptions AS ub_desc,
      bb.cnt AS bb_cnt, bb.paid AS bb_paid, bb.balance AS bb_balance,
      ab.cnt AS ab_cnt,
      mr.nm AS matched_rule, pb.bl AS pinned_bl,
      fn_learner_strictly_eligible_for_room(c.lp_id, c.room_id, true)  AS rule_matched,
      fn_learner_strictly_eligible_for_room(c.lp_id, c.room_id, false) AS access_ok,
      fn_room_serves_institution(c.room_id, c.institution_id)          AS serves_inst,
      (SELECT amount FROM price WHERE cid = c.room_cat_id)             AS occupied_price,
      (SELECT max(amount) FROM price WHERE cid = ANY(c.room_cats))     AS band_price_max,
      (SELECT min(amount) FROM price WHERE cid = ANY(c.room_cats))     AS band_price_min
    FROM cats c
    -- The winning eligibility row, for display. Replicates the specificity
    -- ordering inside fn_hostel_effective_room_categories exactly: program x4 +
    -- quota x2 + fee x1, tie-broken by the NARROWEST fee window.
    LEFT JOIN LATERAL (
      SELECT e.fee_min, e.fee_max
      FROM hostel_program_eligibility e
      WHERE e.institution_id = c.institution_id
        AND e.is_active
        AND e.room_category_id IS NOT NULL
        AND (c.gt IS NULL OR e.hostel_type = 'both' OR e.hostel_type = c.gt)
        AND (e.program_id = c.program_id OR e.program_id IS NULL)
        AND (e.quota_ids IS NULL OR c.quota_id = ANY(e.quota_ids))
        AND (e.fee_min IS NULL OR c.fee >= e.fee_min)
        AND (e.fee_max IS NULL OR c.fee <= e.fee_max)
      ORDER BY ( (e.program_id IS NOT NULL)::int * 4
               + (e.quota_ids  IS NOT NULL)::int * 2
               + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) DESC,
               (COALESCE(e.fee_max, 9.9e14::numeric) - COALESCE(e.fee_min, 0)) ASC
      LIMIT 1
    ) w ON true
    -- hostel_allocations is append-only: a room change vacates the old row and
    -- writes a new one, so the EARLIEST row is the category the learner was
    -- originally placed in.
    LEFT JOIN LATERAL (
      SELECT hc0.name::text AS first_cat_name, a0.allocation_date AS first_date
      FROM hostel_allocations a0
      JOIN hostel_rooms r0      ON r0.id = a0.room_id
      JOIN hostel_categories hc0 ON hc0.id = r0.category_id
      WHERE a0.learner_id = c.profile_id
      ORDER BY a0.created_at ASC
      LIMIT 1
    ) fa ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt,
             count(*) FILTER (WHERE b.status <> 'cancelled')::int AS active_cnt,
             COALESCE(sum(b.final_amount)    FILTER (WHERE b.status <> 'cancelled'), 0) AS total,
             COALESCE(sum(COALESCE(b.final_amount,0) - COALESCE(b.balance_amount,0))
                                             FILTER (WHERE b.status <> 'cancelled'), 0) AS paid,
             COALESCE(sum(b.balance_amount)  FILTER (WHERE b.status <> 'cancelled'), 0) AS balance,
             string_agg(b.bill_description || ' (' || b.status || ')', ' · '
                        ORDER BY b.created_at)::text AS descriptions
      FROM billing_student_bills b
      WHERE b.student_id = c.lp_id AND b.fee_source = 'hostel_category'
    ) ub ON true
    -- The bills of the band year specifically -- what band_fee was summed from.
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt,
             COALESCE(sum(COALESCE(b.final_amount,0) - COALESCE(b.balance_amount,0)), 0) AS paid,
             COALESCE(sum(b.balance_amount), 0) AS balance
      FROM billing_student_bills b
      WHERE b.student_id = c.lp_id AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded')
        AND b.academic_year_id IS NOT DISTINCT FROM c.band_ay
    ) bb ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM billing_student_bills b
      WHERE b.student_id = c.lp_id AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded')
    ) ab ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(btrim(r.rule_name), ''), '(unnamed rule)')::text AS nm
      FROM hostel_room_eligibility_rules r
      WHERE r.is_active AND r.block_id = c.block_id
        AND CASE
              WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id = r.id)
                THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                             WHERE rr.rule_id = r.id AND rr.room_id = c.room_id)
              ELSE (r.floor IS NULL OR r.floor = c.floor)
            END
        AND r.institution_id = c.institution_id
        AND (r.degree_id     IS NULL OR r.degree_id     = c.degree_id)
        AND (r.department_id IS NULL OR r.department_id = c.department_id)
        AND (r.program_id    IS NULL OR r.program_id    = c.program_id)
        AND (cardinality(r.semester_ids) = 0 OR c.semester_id = ANY(r.semester_ids))
      ORDER BY r.rule_name
      LIMIT 1
    ) mr ON true
    -- Where this cohort's OWN rules do reserve rooms. On a violation this names
    -- the blocks the learner should have been placed in.
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT hb2.name, ', ')::text AS bl
      FROM hostel_room_eligibility_rules r
      JOIN hostel_blocks hb2 ON hb2.id = r.block_id
      WHERE r.is_active AND r.institution_id = c.institution_id
        AND (r.degree_id     IS NULL OR r.degree_id     = c.degree_id)
        AND (r.department_id IS NULL OR r.department_id = c.department_id)
        AND (r.program_id    IS NULL OR r.program_id    = c.program_id)
        AND (cardinality(r.semester_ids) = 0 OR c.semester_id = ANY(r.semester_ids))
    ) pb ON true
  ),
  scored AS (
    SELECT e.*,
      -- array_agg over a zero-row SRF yields NULL, not '{}'. cardinality(NULL)
      -- is NULL, so a bare cardinality(x)=0 test silently matches nothing --
      -- that hid every no-band row on the first pass of the 2026-08-11 audit.
      (COALESCE(cardinality(e.room_cats), 0) = 0) AS no_band,
      -- Deluxe Plus owns no rooms and sells from Deluxe stock via
      -- room_source_category_id. Occupying the source category IS conformance,
      -- not drift -- 58 of 67 apparent mismatches were exactly this.
      (e.room_cat_id = ANY(COALESCE(e.room_cats, '{}'::uuid[]))
       OR EXISTS (SELECT 1 FROM hostel_categories x
                  WHERE x.id = ANY(COALESCE(e.room_cats, '{}'::uuid[]))
                    AND x.room_source_category_id = e.room_cat_id)) AS in_band,
      CASE
        WHEN e.ub_cnt = 0        THEN 'none'
        WHEN e.ub_active = 0     THEN 'cancelled_only'
        WHEN e.ub_balance <= 0   THEN 'paid'
        WHEN e.ub_paid > 0       THEN 'partial'
        ELSE 'unpaid'
      END AS bill_state
    FROM enriched e
  ),
  final AS (
    SELECT s.*,
      CASE
        WHEN s.no_band  THEN 'no_band'
        WHEN s.in_band  THEN 'in_band'
        WHEN s.occupied_price IS NULL OR s.band_price_max IS NULL THEN 'unranked'
        WHEN s.occupied_price > s.band_price_max THEN 'above_band'
        WHEN s.occupied_price < s.band_price_min THEN 'below_band'
        ELSE 'unranked'
      END AS band_v,
      CASE
        WHEN NOT s.access_ok  THEN 'violation'
        WHEN s.rule_matched   THEN 'rule_matched'
        ELSE 'open_room'
      END AS rule_v
    FROM scored s
  )
  SELECT
    f.alloc_id, f.lp_id, f.profile_id, f.full_name, f.roll_number, f.email,
    f.eff_gender,
    f.institution_id, i.name::text, dg.degree_name::text, dp.department_name::text,
    f.program_id, pr.program_name::text, f.semester_id, sm.semester_name::text,
    q.name::text,
    ady.year,
    aay.academic_year_name::text,
    f.band_ay_name,
    CASE
      WHEN f.band_ay IS NULL                    THEN 'none'
      WHEN f.adm_ay  IS NULL                    THEN 'no_admission_anchor'
      WHEN f.band_ay IS NOT DISTINCT FROM f.adm_ay THEN 'admission_year'
      ELSE 'earliest_billed'
    END,
    f.fee, f.bb_cnt, f.bb_paid, f.bb_balance, f.ab_cnt,
    f.w_fee_min, f.w_fee_max,
    erc.name::text, emc.name::text,
    f.band_v,
    f.hostel_type, f.block_name, f.room_number, f.floor, f.bed_number,
    f.alloc_type, f.alloc_status, f.alloc_date,
    f.room_id,
    f.room_cat_id, orc.name::text, cmc.name::text,
    (f.mess_category_id IS NOT NULL
     AND f.mess_category_id = ANY(COALESCE(f.mess_cats, '{}'::uuid[]))),
    f.first_cat_name, f.first_date,
    (f.first_cat_name IS DISTINCT FROM orc.name::text),
    f.bill_state, f.ub_cnt, f.ub_total, f.ub_paid, f.ub_balance, f.ub_desc,
    f.rule_v, f.matched_rule, f.pinned_bl, f.serves_inst,
    CASE
      WHEN f.band_v = 'no_band'                              THEN 'no_band'
      WHEN f.band_v <> 'in_band' AND f.rule_v = 'violation'  THEN 'band_and_rule_violation'
      WHEN f.rule_v = 'violation'                            THEN 'room_rule_violation'
      WHEN f.band_v = 'below_band'                           THEN 'below_band'
      WHEN f.band_v = 'unranked'                             THEN 'unranked'
      WHEN f.band_v = 'above_band' THEN
        CASE f.bill_state
          WHEN 'paid'           THEN 'upgrade_paid'
          WHEN 'partial'        THEN 'upgrade_partial'
          WHEN 'unpaid'         THEN 'upgrade_unpaid'
          WHEN 'cancelled_only' THEN 'upgrade_bill_cancelled'
          ELSE 'upgrade_unbilled'
        END
      ELSE 'clean'
    END
  FROM final f
  LEFT JOIN institutions i    ON i.id  = f.institution_id
  LEFT JOIN degrees dg        ON dg.id = f.degree_id
  LEFT JOIN departments dp    ON dp.id = f.department_id
  LEFT JOIN programs pr       ON pr.id = f.program_id
  LEFT JOIN semesters sm      ON sm.id = f.semester_id
  LEFT JOIN quotas q          ON q.id  = f.quota_id
  LEFT JOIN admission_years ady  ON ady.id = (SELECT lp2.admission_year_id
                                              FROM learners_profiles lp2 WHERE lp2.id = f.lp_id)
  LEFT JOIN academic_years aay   ON aay.id = f.adm_ay
  LEFT JOIN hostel_categories orc ON orc.id = f.room_cat_id
  LEFT JOIN hostel_categories erc ON erc.id = f.room_cats[1]
  LEFT JOIN mess_categories   emc ON emc.id = f.mess_cats[1]
  LEFT JOIN mess_categories   cmc ON cmc.id = f.mess_category_id
  ORDER BY f.full_name;
END;
$$;

COMMENT ON FUNCTION public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text, uuid) IS
  'Read-only allocation audit: per-allocation fee-band conformance (anchored on '
  'the admission academic year, falling back to the earliest billed year), '
  'physical room-rule conformance, and the upgrade bill trail that legitimises '
  'an above-band category. Gated on campus_living.allocations.audit.';

-- SECURITY DEFINER over billing + PII. Supabase grants EXECUTE directly to the
-- anon role, so REVOKE ... FROM PUBLIC alone is a no-op -- anon=X survives it.
REVOKE ALL ON FUNCTION public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hostel_allocation_audit(text, uuid, uuid, uuid, text, uuid) TO authenticated;
