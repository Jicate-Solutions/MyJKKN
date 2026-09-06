-- ============================================================================
-- Campus Living — Category Eligibility fee bands anchor on the ADMISSION year
-- ============================================================================
--
-- BEFORE: fn_learner_current_year_academic_fee summed academic bills tagged to
--   learners_profiles.academic_year_id ("the learner's current academic year").
--   Two problems with that anchor, both observed live on 2026-08-04:
--
--   1. learners_profiles.academic_year_id DRIFTS. Dental's 2023 admissions are
--      split across profile years 2025-2026 (74 learners) and 2026-2027 (38) —
--      same cohort, same fee, different band lookup. Whether a learner's fee
--      resolves at all depends on a mutable field nobody maintains for billing.
--
--   2. It reads PLACEHOLDER bills. 106 learners carry a Rs.0 academic bill on
--      their current year (e.g. NB24005: 2024-25 Rs.2,10,000 / 2025-26
--      Rs.2,10,000 / 2026-27 Rs.0.00). Rs.0 silently matched every band whose
--      fee_min is 0, so those learners were banded on a number that is not
--      their fee — Nursing boys at Rs.2.10L were landing in the
--      Rs.0-2,00,000 -> Classic Room band.
--
-- AFTER: the band fee is anchored to the year the learner was ADMITTED — the
--   fee tier their batch entered at, immutable for the whole course. Bills are
--   generated per academic year for the entire course at the same amount, so
--   the admission-year bill IS the batch fee.
--
-- Fallback chain (fn_learner_band_academic_fee), operator-confirmed:
--     1. academic bills tagged to the admission-year academic year, total > 0
--     2. else the EARLIEST academic year that has a total > 0
--     3. else NULL  -> resolver returns nothing -> learner is skipped (unchanged)
--
--   A Rs.0 year total is treated as "no fee known", not as a real fee of zero,
--   so a placeholder bill can no longer win a band.
--
--   The fallback is load-bearing, NOT belt-and-braces: anchoring STRICTLY to
--   the admission year would drop a further ~200 hostellers — 76 have no
--   academic_years row for their admission year at all, and 130 were first
--   billed AFTER they were admitted (the billing module went live mid-course).
--
-- MEASURED against the deployed functions, 695 active hostel learners, 2026-08-04:
--       resolve a room category BEFORE ........... 525
--       resolve a room category AFTER ............ 426   (-104, +5)
--       category CHANGED for anyone .............. 0
--
--   All 104 dropped had a BEFORE fee of EXACTLY Rs.0.00 — every one was banded
--   on a placeholder bill, none on a real amount (verified: min = max = 0.00).
--   Of those 104: 97 have no non-zero academic bill anywhere (and none has a
--   non-zero bill that is merely untagged — they have genuinely never been
--   billed a real amount), and 7 have a real fee that falls outside every
--   configured band (Nursing at Rs.2.10-2.25L vs a Rs.0-2,00,000 ceiling).
--
--   OPERATIONAL CONSEQUENCE: those 104 are now correctly skipped by
--   auto-allocation instead of being silently placed on a Rs.0 read. They need
--   either real academic bills (Campus Living -> Residents -> Generate) or a
--   widened band before the next allocation run.
--
-- Blast radius: everything reaches the fee through fn_hostel_learner_{room,mess}
--   _categories, so this migration changes ONE line in each of those two and
--   every consumer follows — fn_auto_allocate_classic/preview/candidates,
--   fn_hostel_unallocated_candidates (manual picker), fn_my_manual_categories
--   (self-service), fn_cl_admin_allocatable_blocks/_rooms,
--   fn_apply_hostel_fee_categories (+ _bulk + the billing trigger),
--   fn_preview_hostel_fee_categories, fn_explain_allocation.
--   NO RLS policy reads the fee. fn_learner_academic_payment_progress stays on
--   the CURRENT year on purpose — payment progress is about this year's dues.
--
-- fn_learner_current_year_academic_fee is KEPT (reporting / diagnostics only).
-- ============================================================================


-- ── 1. Which academic year does this learner's admission year map to? ───────
--
-- Anchored on admission_years.year (integer) vs EXTRACT(YEAR FROM start_date)
-- rather than name-matching, because academic_years carries "2025-2026
-- Additional 1/3/4" variants that a name match would have to special-case.
-- Verified 2026-08-04: 42 academic_years rows, academic_year_name always agrees
-- with start_date, no duplicate ACTIVE (institution_id, start-year) pair, and
-- 0 hostellers whose admission_years.institution_id differs from their own.
-- is_active DESC puts the canonical row ahead of any inactive "Additional" one.
CREATE OR REPLACE FUNCTION public.fn_learner_admission_academic_year(p_learner_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ay.id
  FROM learners_profiles lp
  JOIN admission_years ady ON ady.id = lp.admission_year_id
  JOIN academic_years  ay  ON ay.institution_id = lp.institution_id
                          AND EXTRACT(YEAR FROM ay.start_date)::int = ady.year
  WHERE lp.id = p_learner_id
  ORDER BY ay.is_active DESC, ay.academic_year_name ASC
  LIMIT 1;
$function$;


-- ── 2. The band fee, WITH the year it was read from ────────────────────────
--
-- Returns at most one row. The ORDER BY is the whole fallback chain: rows for
-- the admission-year anchor sort first (IS DISTINCT FROM -> false -> 0), then
-- earliest start_date. HAVING SUM > 0 drops Rs.0 placeholder years entirely, so
-- they can neither win the anchor slot nor be picked as the fallback.
--
-- Bills with a NULL academic_year_id are excluded by the join (unchanged
-- behaviour — an untagged bill has never counted).
CREATE OR REPLACE FUNCTION public.fn_learner_band_academic_fee(p_learner_id uuid)
RETURNS TABLE(academic_year_id uuid, academic_year_name text, fee numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH anchor AS (
    SELECT public.fn_learner_admission_academic_year(p_learner_id) AS ay_id
  ),
  years AS (
    SELECT b.academic_year_id AS ay_id,
           ay.academic_year_name::text AS ay_name,
           ay.start_date,
           SUM(b.final_amount) AS total
    FROM billing_student_bills b
    JOIN academic_years ay ON ay.id = b.academic_year_id
    WHERE b.student_id = p_learner_id
      AND b.fee_source = 'academic'
      AND b.status NOT IN ('cancelled','superseded')
    GROUP BY b.academic_year_id, ay.academic_year_name, ay.start_date
    HAVING SUM(b.final_amount) > 0
  )
  SELECT y.ay_id, y.ay_name, y.total
  FROM years y CROSS JOIN anchor a
  ORDER BY (y.ay_id IS DISTINCT FROM a.ay_id), y.start_date ASC
  LIMIT 1;
$function$;


-- ── 3. Scalar wrapper — what the two resolvers call ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_learner_admission_year_academic_fee(p_learner_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT fee FROM public.fn_learner_band_academic_fee(p_learner_id);
$function$;

COMMENT ON FUNCTION public.fn_learner_current_year_academic_fee(uuid) IS
  'DEPRECATED for eligibility. Sums academic bills on learners_profiles.academic_year_id. '
  'Category-Eligibility fee bands now use fn_learner_admission_year_academic_fee. '
  'Kept for reporting/diagnostics only.';

REVOKE EXECUTE ON FUNCTION public.fn_learner_admission_academic_year(uuid)     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_learner_band_academic_fee(uuid)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_learner_admission_year_academic_fee(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_admission_academic_year(uuid)     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_learner_band_academic_fee(uuid)           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_learner_admission_year_academic_fee(uuid) TO authenticated, service_role;


-- ── 4. The two resolvers — one line each ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_room_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;
  IF v_program IS NULL THEN RETURN; END IF;
  -- Admission-year anchored (was fn_learner_current_year_academic_fee).
  v_fee := fn_learner_admission_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT r.category_id
    FROM fn_hostel_effective_room_categories(v_institution, v_program, v_quota, v_fee, v_gt) r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_hostel_learner_mess_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;
  IF v_program IS NULL THEN RETURN; END IF;
  -- Admission-year anchored (was fn_learner_current_year_academic_fee).
  v_fee := fn_learner_admission_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT m.category_id
    FROM fn_hostel_effective_mess_categories(v_institution, v_program, v_quota, v_fee, v_gt) m;
END $function$;


-- ── 5. Auto-allocate candidates preview ────────────────────────────────────
--
-- DROP + CREATE because RETURNS TABLE gains columns (a return-type change that
-- CREATE OR REPLACE rejects). DROP discards grants, so they are re-issued below
-- — otherwise EXECUTE silently reverts to the PUBLIC default.
--
-- Three behavioural changes beyond the new columns:
--   a) The "profile academic year not set" PREREQUISITE is gone. The fee no
--      longer comes from that field, and fn_auto_allocate_classic already
--      COALESCEs a missing profile year to the institution's latest active one
--      when stamping the allocation — so the old gate made preview say "out"
--      for learners generate would happily place. Removing it restores
--      preview == generate. academic_year_id/_name are still RETURNED, for display.
--   b) bill_state now describes the ANCHOR, not the profile year:
--      matched = fee read from the admission year; different_year = fee read
--      from the fallback year; untagged = bills exist but none usable; none = no bills.
--   c) exclusion_reason quotes the actual band fee so an operator can go
--      straight to Settings -> Category Eligibility and add the missing band.
DROP FUNCTION IF EXISTS public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid);

CREATE FUNCTION public.fn_auto_allocate_candidates(
  p_block_id uuid,
  p_strict boolean DEFAULT false,
  p_floor integer DEFAULT NULL::integer,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, institution_name text,
  program_name text, semester_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, bed_available boolean,
  academic_year_id uuid, academic_year_name text,
  admission_academic_year_id uuid, admission_academic_year_name text,
  band_academic_year_id uuid, band_academic_year_name text, band_fee numeric,
  academic_bill_count integer, current_year_bill_count integer,
  bill_other_year_name text, current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blk AS (
    SELECT hostel_type::text AS t FROM hostel_blocks WHERE id = p_block_id
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id,
           lp.program_id, lp.semester_id, lp.academic_year_id,
           lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    CROSS JOIN blk
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      -- Only ACTIVE learners may be allocated a bed. Mirrors
      -- fn_hostel_unallocated_candidates (manual picker) and v_learner_hostelites.
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      AND (blk.t IS NULL OR blk.t NOT IN ('boys','girls')
           OR gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (blk.t = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (blk.t = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
      -- Skip students who already have an active or pending-approval bed.
      -- Applied here (before the LATERAL eligibility joins) so we don't burn
      -- fn_hostel_learner_room/mess_categories on students who can't be placed.
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name, c.room_cats, c.mess_cats,
      adm.ay_id AS admission_academic_year_id,
      aay.academic_year_name::text AS admission_academic_year_name,
      bf.academic_year_id AS band_academic_year_id,
      bf.academic_year_name AS band_academic_year_name,
      bf.fee AS band_fee,
      c.room_cats[1] AS resolved_room_category_id,
      rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name
         FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id = b.academic_year_id
        WHERE b.student_id = c.id AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
          AND b.academic_year_id IS NOT NULL
          AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      -- Retained purely as a diagnostic column (what the OLD rule would have
      -- read) so an operator can see a Rs.0 / missing current-year bill.
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      -- not_allocated is always true here (cohort CTE already filtered allocated
      -- students out), but kept for the verdict/exclusion_reason expressions below.
      true AS not_allocated,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id = p_block_id AND rm.room_purpose = 'student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        WHERE rm.block_id = p_block_id AND rm.room_purpose = 'student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND NOT (rm.category_id = ANY(c.room_cats))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_ok_other_category,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id = bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id = p_block_id AND r.room_purpose = 'student'
          AND bd.status = 'available'
          AND (p_floor IS NULL OR r.floor = p_floor)
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                          WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id, p_strict)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p       ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN LATERAL (SELECT fn_learner_admission_academic_year(c.id) AS ay_id) adm ON true
    LEFT JOIN academic_years aay ON aay.id = adm.ay_id
    LEFT JOIN LATERAL fn_learner_band_academic_fee(c.id) bf ON true
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = c.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type = 'boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type = 'girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name,
    s.gender, s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok, s.bed_available,
    s.academic_year_id, s.academic_year_name,
    s.admission_academic_year_id, s.admission_academic_year_name,
    s.band_academic_year_id, s.band_academic_year_name, s.band_fee,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.band_fee IS NOT NULL
       AND s.band_academic_year_id IS NOT DISTINCT FROM s.admission_academic_year_id THEN 'matched'
      WHEN s.band_fee IS NOT NULL          THEN 'different_year'
      WHEN s.academic_bill_count > 0       THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.band_fee  IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                               THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.band_fee  IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                               THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.band_fee IS NULL THEN
        CASE
          WHEN s.academic_bill_count = 0 THEN
            'No academic bill for this student — nothing to read a fee band from'
          ELSE
            'Academic bills exist but none is usable: either untagged to an academic year, or the tagged year totals ₹0'
        END
      WHEN s.room_cats IS NULL THEN
        'No Category-Eligibility band covers ₹'
        || to_char(s.band_fee, 'FM999,999,999')
        || ' (read from ' || COALESCE(s.band_academic_year_name, 'their admission year') || ')'
        || ' for this program / quota — add or widen a band'
      WHEN NOT s.has_profile   THEN 'No login profile'
      WHEN NOT s.gender_ok     THEN 'Gender does not match the resolved room category'
      WHEN NOT s.physical_rule_ok AND s.physical_ok_other_category THEN
        'Rooms they may occupy in this block are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT s.physical_rule_ok THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule in this block reserves a room for this cohort (strict mode)'
          ELSE 'No room they can occupy in their category — rooms here are reserved for other cohorts, or this cohort''s reserved rooms are in another block'
        END
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) TO authenticated, service_role;


-- ── 6. Settings -> Category Eligibility "Sync categories" dry-run ──────────
--
-- DROP + CREATE: current_year_fee is replaced by band_fee + band_academic_year_name.
DROP FUNCTION IF EXISTS public.fn_preview_hostel_fee_categories(uuid);

CREATE FUNCTION public.fn_preview_hostel_fee_categories(p_institution uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  learner_id uuid, learner_name text, roll_number text, institution_name text,
  program_name text, semester_name text, quota_name text, gender text,
  band_fee numeric, band_academic_year_name text,
  has_academic_bill boolean, is_allocated boolean, reason text,
  current_room text, new_room text, current_mess text, new_mess text, will_change boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_gender_type text; v_fee numeric; v_fee_year text; v_has_bill boolean; v_allocated boolean;
  v_room uuid; v_mess uuid; v_new_room uuid; v_new_mess uuid; v_reason text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to preview learner category sync'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT lp.id AS lid,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS lname,
           lp.roll_number AS lroll, lp.gender AS lgender,
           lp.hostel_category_id AS cur_room_id, lp.mess_category_id AS cur_mess_id,
           i.name AS inst_name, p.program_name AS prog_name,
           s.semester_name AS sem_name, q.name AS q_name
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN semesters s ON s.id = lp.semester_id
    LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
    ORDER BY i.name, p.program_name, lname
  LOOP
    v_gender_type := CASE WHEN lower(r.lgender) LIKE 'm%' THEN 'boys'
                          WHEN lower(r.lgender) LIKE 'f%' THEN 'girls' ELSE NULL END;
    v_has_bill := EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id = r.lid AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded'));

    -- Admission-year anchored fee + the year it was read from.
    v_fee := NULL; v_fee_year := NULL;
    SELECT bf.fee, bf.academic_year_name INTO v_fee, v_fee_year
    FROM fn_learner_band_academic_fee(r.lid) bf;

    v_allocated := EXISTS (
      SELECT 1 FROM hostel_allocations ha
      JOIN profiles pr ON pr.id = ha.learner_id
      WHERE pr.learner_id = r.lid AND ha.status = 'active');

    v_room := NULL; v_mess := NULL;

    IF v_has_bill THEN
      SELECT gv.id INTO v_room
      FROM fn_hostel_learner_room_categories(r.lid) rr
      JOIN hostel_categories bc ON bc.id = rr.category_id
      JOIN hostel_categories gv ON gv.name = bc.name
                               AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      SELECT gv.id INTO v_mess
      FROM fn_hostel_learner_mess_categories(r.lid) mm
      JOIN mess_categories bc ON bc.id = mm.category_id
      JOIN mess_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      IF v_room IS NOT NULL OR v_mess IS NOT NULL THEN
        v_reason := 'band_match';
      ELSIF v_fee IS NULL THEN
        v_reason := 'classic_default_fee_unknown';
      ELSE
        v_reason := 'classic_default_no_band';
      END IF;

      IF v_room IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT hc.id INTO v_room FROM hostel_categories hc
        WHERE hc.name = 'Classic Room' AND hc.type = v_gender_type AND hc.is_active
        ORDER BY hc.sort_order LIMIT 1;
      END IF;
      IF v_mess IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT mc.id INTO v_mess FROM mess_categories mc
        WHERE mc.name = 'Classic' AND mc.type = v_gender_type AND mc.is_active
        ORDER BY mc.sort_order LIMIT 1;
      END IF;
    ELSE
      v_reason := 'no_academic_bill';
    END IF;

    v_new_room := CASE WHEN v_allocated THEN r.cur_room_id
                       ELSE COALESCE(v_room, r.cur_room_id) END;
    v_new_mess := COALESCE(v_mess, r.cur_mess_id);

    learner_id              := r.lid;
    learner_name            := r.lname;
    roll_number             := r.lroll;
    institution_name        := r.inst_name;
    program_name            := r.prog_name;
    semester_name           := r.sem_name;
    quota_name              := r.q_name;
    gender                  := r.lgender;
    band_fee                := v_fee;
    band_academic_year_name := v_fee_year;
    has_academic_bill       := v_has_bill;
    is_allocated            := v_allocated;
    reason                  := v_reason;
    current_room            := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = r.cur_room_id);
    new_room                := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = v_new_room);
    current_mess            := (SELECT mc.name FROM mess_categories mc WHERE mc.id = r.cur_mess_id);
    new_mess                := (SELECT mc.name FROM mess_categories mc WHERE mc.id = v_new_mess);
    will_change             := (v_new_room IS DISTINCT FROM r.cur_room_id)
                            OR (v_new_mess IS DISTINCT FROM r.cur_mess_id);
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) TO authenticated, service_role;


-- ── 7. "Why was this learner placed here?" explain dialog ──────────────────
--
-- Returns jsonb, so a plain CREATE OR REPLACE (no grant loss). Changes:
--   a) academic_fee is now the admission-year anchored fee; the anchor year and
--      the year actually read are both surfaced.
--   b) FIXED a pre-existing drift: this function tested `v_fee < e.fee_max`
--      (exclusive) while fn_hostel_effective_room_categories has used
--      `p_fee <= e.fee_max` (inclusive) since 20260724130000. A learner sitting
--      exactly on a band's upper bound was shown fee_ok=false here while the
--      resolver had matched them — the dialog contradicted the allocation.
--   c) bills[].counted now flags the bill(s) the band fee was actually read
--      from, instead of the profile-academic-year ones.
CREATE OR REPLACE FUNCTION public.fn_explain_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_room uuid; v_block uuid; v_floor int; v_room_cat uuid;
  v_room_number text; v_status text; v_room_cat_name text; v_room_cat_type text;
  v_lp uuid; v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid; v_ay uuid;
  v_quota uuid; v_gender text;
  v_inst_name text; v_degree_name text; v_dept_name text; v_program_name text;
  v_semester_name text; v_quota_name text;
  v_room_cats uuid[]; v_mess_cats uuid[];
  v_resolved_room_name text; v_resolved_mess_name text;
  v_fee numeric; v_ay_name text;
  v_adm_ay uuid; v_adm_ay_name text; v_band_ay uuid; v_band_ay_name text;
  v_has_covering boolean; v_matched boolean; v_rules jsonb;
  v_pinned boolean; v_pinned_blocks text; v_pinned_rules jsonb;
  v_serves boolean; v_cur_bill int; v_acad_bill int;
  v_elig_rules jsonb; v_bills jsonb;
BEGIN
  SELECT a.learner_id, a.room_id, a.status, r.room_number, r.block_id, r.floor, r.category_id
    INTO v_profile, v_room, v_status, v_room_number, v_block, v_floor, v_room_cat
    FROM hostel_allocations a LEFT JOIN hostel_rooms r ON r.id = a.room_id
    WHERE a.id = p_allocation_id;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','allocation_not_found'); END IF;

  SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
         lp.academic_year_id, lp.quota_id
    INTO v_lp, v_inst, v_degree, v_dept, v_program, v_semester, v_ay, v_quota
    FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
    WHERE p.id = v_profile;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = v_profile;
  SELECT name, type INTO v_room_cat_name, v_room_cat_type FROM hostel_categories WHERE id = v_room_cat;

  SELECT name INTO v_inst_name FROM institutions WHERE id = v_inst;
  SELECT degree_name INTO v_degree_name FROM degrees WHERE id = v_degree;
  SELECT department_name INTO v_dept_name FROM departments WHERE id = v_dept;
  SELECT program_name INTO v_program_name FROM programs WHERE id = v_program;
  SELECT semester_name INTO v_semester_name FROM semesters WHERE id = v_semester;
  SELECT name INTO v_quota_name FROM quotas WHERE id = v_quota;

  SELECT array_agg(category_id) INTO v_room_cats FROM fn_hostel_learner_room_categories(v_lp);
  SELECT array_agg(category_id) INTO v_mess_cats FROM fn_hostel_learner_mess_categories(v_lp);
  SELECT name INTO v_resolved_room_name FROM hostel_categories WHERE id = v_room_cats[1];
  SELECT name INTO v_resolved_mess_name FROM mess_categories WHERE id = v_mess_cats[1];

  -- Admission-year anchored fee + provenance.
  v_adm_ay := fn_learner_admission_academic_year(v_lp);
  SELECT academic_year_name INTO v_adm_ay_name FROM academic_years WHERE id = v_adm_ay;
  SELECT bf.academic_year_id, bf.academic_year_name, bf.fee
    INTO v_band_ay, v_band_ay_name, v_fee
    FROM fn_learner_band_academic_fee(v_lp) bf;

  SELECT academic_year_name INTO v_ay_name FROM academic_years WHERE id = v_ay;
  v_serves := fn_room_serves_institution(v_room, v_inst);

  WITH rules AS (
    SELECT e.*,
           COALESCE(e.program_id IS NULL OR e.program_id = v_program, false) AS program_ok,
           COALESCE(e.quota_ids IS NULL OR v_quota = ANY(e.quota_ids), false) AS quota_ok,
           (v_fee IS NOT NULL
              AND (e.fee_min IS NULL OR v_fee >= e.fee_min)
              -- Inclusive upper bound — mirrors fn_hostel_effective_room_categories
              -- since 20260724130000. Was `<`, which contradicted the resolver.
              AND (e.fee_max IS NULL OR v_fee <= e.fee_max)) AS fee_ok,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = v_inst AND e.is_active
  ),
  room_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE room_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  ),
  mess_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE mess_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT jsonb_agg(jsonb_build_object(
      'program', (SELECT program_name FROM programs WHERE id = r.program_id),
      'quota',   (SELECT string_agg(name, ', ' ORDER BY name) FROM quotas WHERE id = ANY(r.quota_ids)),
      'fee_min', r.fee_min,
      'fee_max', r.fee_max,
      'room_category', (SELECT name FROM hostel_categories WHERE id = r.room_category_id),
      'mess_category', (SELECT name FROM mess_categories  WHERE id = r.mess_category_id),
      'program_ok', r.program_ok,
      'quota_ok',   r.quota_ok,
      'fee_ok',     r.fee_ok,
      'matched',    (r.program_ok AND r.quota_ok AND r.fee_ok),
      'selected_room', (r.room_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM room_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max)),
      'selected_mess', (r.mess_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM mess_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max))
    ) ORDER BY (r.program_ok AND r.quota_ok AND r.fee_ok) DESC, r.specificity DESC,
               r.fee_min ASC NULLS FIRST)
  INTO v_elig_rules
  FROM rules r;

  SELECT jsonb_agg(jsonb_build_object(
      'description', b.bill_description,
      'amount', b.final_amount,
      'status', b.status,
      'due_date', b.due_date,
      'academic_year', (SELECT academic_year_name FROM academic_years WHERE id = b.academic_year_id),
      -- 'counted' = this bill fed the band fee (i.e. it sits in the anchor year).
      'counted', (COALESCE(b.status NOT IN ('cancelled','superseded'), false)
                  AND b.academic_year_id IS NOT NULL
                  AND b.academic_year_id IS NOT DISTINCT FROM v_band_ay)
    ) ORDER BY b.due_date DESC)
  INTO v_bills
  FROM billing_student_bills b
  WHERE b.student_id = v_lp AND b.fee_source = 'academic';

  WITH covering AS (
    SELECT r.* FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=v_room)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT
    EXISTS (SELECT 1 FROM covering),
    EXISTS (SELECT 1 FROM covering c WHERE c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids))),
    (SELECT jsonb_agg(jsonb_build_object(
       'rule_name', COALESCE(NULLIF(btrim(c.rule_name),''),'(unnamed rule)'),
       'floor', c.floor,
       'matched', COALESCE((c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids))), false),
       'cohort', NULLIF(concat_ws(' · ',
         (SELECT degree_name     FROM degrees     WHERE id=c.degree_id),
         (SELECT department_name FROM departments WHERE id=c.department_id),
         (SELECT program_name    FROM programs    WHERE id=c.program_id),
         (SELECT string_agg(s.semester_name, ', ' ORDER BY array_position(c.semester_ids, s.id))
            FROM semesters s WHERE s.id = ANY(c.semester_ids))),''),
       'institution',    (SELECT name FROM institutions WHERE id=c.institution_id),
       'institution_ok', COALESCE(c.institution_id = v_inst, false),
       'degree',         (SELECT degree_name FROM degrees WHERE id=c.degree_id),
       'degree_ok',      COALESCE((c.degree_id IS NULL OR c.degree_id = v_degree), false),
       'department',     (SELECT department_name FROM departments WHERE id=c.department_id),
       'department_ok',  COALESCE((c.department_id IS NULL OR c.department_id = v_dept), false),
       'program',        (SELECT program_name FROM programs WHERE id=c.program_id),
       'program_ok',     COALESCE((c.program_id IS NULL OR c.program_id = v_program), false),
       'semester',       (SELECT string_agg(s.semester_name, ', ' ORDER BY array_position(c.semester_ids, s.id))
                            FROM semesters s WHERE s.id = ANY(c.semester_ids)),
       'semester_ok',    COALESCE((cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids)), false)
     ) ORDER BY c.rule_name) FROM covering c)
  INTO v_has_covering, v_matched, v_rules;

  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (cardinality(r.semester_ids) = 0 OR v_semester = ANY(r.semester_ids))
  ),
  (SELECT string_agg(DISTINCT hb.name, ', ')
     FROM hostel_room_eligibility_rules r
     JOIN hostel_blocks hb ON hb.id = r.block_id
     WHERE r.is_active
       AND r.institution_id = v_inst
       AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
       AND (r.department_id IS NULL OR r.department_id = v_dept)
       AND (r.program_id    IS NULL OR r.program_id    = v_program)
       AND (cardinality(r.semester_ids) = 0 OR v_semester = ANY(r.semester_ids)))
  INTO v_pinned, v_pinned_blocks;

  SELECT jsonb_agg(jsonb_build_object(
      'block', hb.name,
      'rule_name', COALESCE(NULLIF(btrim(r.rule_name),''),'(unnamed rule)'),
      'floor', r.floor,
      'rooms', (SELECT count(*)::int FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id),
      'institution', (SELECT name FROM institutions WHERE id=r.institution_id),
      'degree',      (SELECT degree_name FROM degrees WHERE id=r.degree_id),
      'department',  (SELECT department_name FROM departments WHERE id=r.department_id),
      'program',     (SELECT program_name FROM programs WHERE id=r.program_id),
      'semester',    (SELECT string_agg(s.semester_name, ', ' ORDER BY array_position(r.semester_ids, s.id))
                        FROM semesters s WHERE s.id = ANY(r.semester_ids)),
      'covers_allocated_room', (r.block_id = v_block)
    ) ORDER BY hb.name)
  INTO v_pinned_rules
  FROM hostel_room_eligibility_rules r
  JOIN hostel_blocks hb ON hb.id = r.block_id
  WHERE r.is_active
    AND r.institution_id = v_inst
    AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
    AND (r.department_id IS NULL OR r.department_id = v_dept)
    AND (r.program_id    IS NULL OR r.program_id    = v_program)
    AND (cardinality(r.semester_ids) = 0 OR v_semester = ANY(r.semester_ids));

  SELECT count(*)::int INTO v_acad_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded');
  SELECT count(*)::int INTO v_cur_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
      AND b.academic_year_id=v_band_ay;

  RETURN jsonb_build_object(
    'allocation_id', p_allocation_id, 'room_number', v_room_number, 'status', v_status,
    'learner', jsonb_build_object(
      'institution', v_inst_name,
      'degree', v_degree_name,
      'department', v_dept_name,
      'program', v_program_name,
      'semester', v_semester_name,
      'quota', v_quota_name,
      'academic_year', v_ay_name,
      'admission_academic_year', v_adm_ay_name,
      'fee_academic_year', v_band_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender
    ),
    'eligibility_rules', COALESCE(v_elig_rules, '[]'::jsonb),
    'category', jsonb_build_object(
      'allocated_room_category', v_room_cat_name,
      'resolved_room_category', v_resolved_room_name,
      'room_category_matched', (v_room_cat = ANY(COALESCE(v_room_cats,'{}'::uuid[]))),
      'resolved_mess_category', v_resolved_mess_name,
      'academic_year', v_ay_name,
      'admission_academic_year', v_adm_ay_name,
      'fee_academic_year', v_band_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender,
      'gender_ok', (v_room_cat_type IS NULL
                    OR (v_room_cat_type='boys'  AND v_gender IN ('male','m'))
                    OR (v_room_cat_type='girls' AND v_gender IN ('female','f')))
    ),
    'physical', jsonb_build_object(
      'institution_served', v_serves,
      'is_rule_covered', v_has_covering,
      'rule_matched', v_matched,
      'open_room', NOT v_has_covering,
      'pinned_elsewhere', (v_pinned AND NOT v_matched),
      'pinned_blocks', v_pinned_blocks,
      'pinned_rules', COALESCE(v_pinned_rules, '[]'::jsonb),
      'access_ok', (v_matched OR (NOT v_has_covering AND NOT v_pinned)),
      'covering_rules', COALESCE(v_rules, '[]'::jsonb)
    ),
    'bill', jsonb_build_object('current_year_bills', v_cur_bill, 'academic_bills', v_acad_bill),
    'bills', COALESCE(v_bills, '[]'::jsonb)
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_explain_allocation(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_explain_allocation(uuid) TO authenticated, service_role;
