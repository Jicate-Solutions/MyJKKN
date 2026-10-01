-- ============================================================================
-- Campus Living → Billing Audit (2026-09-22)
--
-- Hostel-learner bill coverage + fee-band audit, modelled on /billing/coverage
-- but scoped to v_learner_hostelites. Three parts, one reviewable unit:
--
--   1. Role grants for the two new catalog keys
--        campus_living.billing_audit.view / .export
--      (keys are declared in lib/constants/permissions.ts; a key declared but
--      never granted renders an empty page, so the grant ships here).
--   2. fn_cl_billing_audit_bill_class — the ONE place that decides whether a
--      bill is a room / mess / upgrade bill.
--   3. fn_cl_billing_audit_rows (the set-based engine) and the two RPCs the
--      pages call: get_cl_billing_audit_learners (paginated table) and
--      get_cl_billing_audit_summary (KPIs + breakdowns). All SECURITY DEFINER,
--      gated on user_has_permission first, scoped to
--      get_user_accessible_institutions(auth.uid()).
--
-- Modelling rules (each one measured before it was written down):
--   * Hostel bills are classified by billing_categories.kind IN ('hostel','mess'),
--     NEVER by billing_student_bills.fee_source — 79 hostel bills carry
--     fee_source = 'academic'. Upgrade bills are fee_source = 'hostel_category'
--     OR a category name containing "upgrade" (28 upgrade bills are tagged
--     academic).
--   * Paid = final_amount - COALESCE(balance_amount, 0); balance_amount is
--     maintained on every live status (unpaid = final, paid = 0, partial in
--     between). Same arithmetic as get_billing_coverage_learners.
--   * Bills are matched to the year by the INTEGER START YEAR of their
--     academic year (institutions carry duplicate academic_years rows on one
--     start date), falling back to the hostel year's start year for the rare
--     bill that carries only hostel_year_id.
--   * The fee band input is the learner's admission-year academic total,
--     computed set-based here rather than by calling
--     fn_learner_band_academic_fee per row — 692 per-row calls blew the
--     statement timeout in the 2026-08-11 conformance audit. The fallback
--     order is the same as that function: the admission year if it has bills,
--     else the earliest year that does.
--   * Entitlement comes from fn_hostel_effective_room_categories — the SAME
--     resolver the allocator uses — so "above band" here means what the
--     allocator means. No band grants a Premium category, so every Premium
--     resident reads above band by construction; that is correct.
--   * hostel_categories / mess_categories are gender-partitioned ("Classic
--     Room" exists for boys AND girls). Configured fees are looked up by NAME
--     remapped to the learner's gender type, preferring the exact id.
--   * The EXPECTED room / mess fee is the learner's resolved admission fee
--     structure (learners_profiles.fee_items — the snapshot
--     admission_resolve_fee_items_for_lead writes), NOT hostel_fees. Measured
--     2026-09-22: live room bills are Rs 15,000 / 25,000 / 120,000 per the
--     institution's structure; the hostel_fees per-bed rate (27,500 …) matched
--     none of the 232 room-billed learners, so judging bills against it flagged
--     every one of them. hostel_fees is still surfaced as the category RATE
--     (out_category_*_rate) and is what band status is priced on.
--   * The expected UPGRADE fee is hostel_category_upgrade_fees (entitled → tagged),
--     which is what _cl_apply_upgrade_fee_bill bills from — the two agree on
--     every configured pair. Mess upgrades sit in the same displayed lane but
--     are not judged, because mess has no band-derived expectation.
--   * amount_mismatch compares the SUM of a class (a room fee split across
--     instalments is one expectation), and only when an expectation exists —
--     699 of 882 hostellers are legacy_fee_mode with no snapshot, and a missing
--     row is a config gap, not a billing fault.
-- ============================================================================

-- ─── 1. Role grants ─────────────────────────────────────────────────────────
-- `permissions || jsonb_build_object(...)` MERGES. A bare jsonb_build_object
-- REPLACES the whole object and would strip every grant these roles hold.
DO $$
DECLARE
  v_role  text;
  v_roles text[] := ARRAY[
    'hostel_office', 'chief_warden', 'executive_admin_officer',
    'ceo', 'managing_director', 'accounts'
  ];
  v_hit   int;
BEGIN
  FOREACH v_role IN ARRAY v_roles LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb)
                         || jsonb_build_object(
                              'campus_living.billing_audit.view',   true,
                              'campus_living.billing_audit.export', true),
           updated_at  = now()
     WHERE role_key = v_role;

    GET DIAGNOSTICS v_hit = ROW_COUNT;
    -- A grant that did not land looks exactly like a grant that was never
    -- written: an empty page. Fail loudly instead of skipping.
    IF v_hit = 0 THEN
      RAISE EXCEPTION 'campus_living.billing_audit grant: role_key % not found', v_role;
    END IF;
  END LOOP;
END $$;

-- ─── 2. Bill classifier ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_billing_audit_bill_class(
  p_kind          text,
  p_category_name text,
  p_fee_source    text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN p_kind = 'hostel' THEN
      CASE WHEN p_fee_source = 'hostel_category' OR p_category_name ILIKE '%upgrade%'
           THEN 'room_upgrade' ELSE 'room' END
    WHEN p_kind = 'mess' THEN
      CASE WHEN p_fee_source = 'hostel_category' OR p_category_name ILIKE '%upgrade%'
           THEN 'mess_upgrade' ELSE 'mess' END
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.fn_cl_billing_audit_bill_class(text, text, text) IS
  'Billing Audit bill class: room | room_upgrade | mess | mess_upgrade | NULL. Keyed on billing_categories.kind, never fee_source (79 hostel bills are mis-tagged academic). Tighten here, not in the callers.';

-- ─── 3a. Core row set ───────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_cl_billing_audit_rows(uuid[], uuid, uuid, uuid, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.fn_cl_billing_audit_rows(
  p_institution_ids   uuid[]  DEFAULT NULL,
  p_academic_year_id  uuid    DEFAULT NULL,
  p_block_id          uuid    DEFAULT NULL,
  p_room_category_id  uuid    DEFAULT NULL,
  p_program_id        uuid    DEFAULT NULL,
  p_gender            text    DEFAULT NULL,
  p_allocated_only    boolean DEFAULT false
)
RETURNS TABLE (
  out_learner_id                uuid,
  out_roll_number               text,
  out_register_number           text,
  out_full_name                 text,
  out_gender                    text,
  out_institution_id            uuid,
  out_institution_name          text,
  out_program_name              text,
  out_year_of_study             integer,
  out_semester_name             text,
  out_lifecycle_status          text,
  out_is_allocated              boolean,
  out_block_id                  uuid,
  out_block_name                text,
  out_room_number               text,
  out_bed_number                text,
  out_seated_category_name      text,
  out_tagged_category_id        uuid,
  out_tagged_category_name      text,
  out_mess_category_name        text,
  out_band_fee                  numeric,
  out_entitled_category_name    text,
  out_band_status               text,
  out_expected_room_fee         numeric,
  out_expected_mess_fee         numeric,
  out_expected_upgrade_fee      numeric,
  out_category_room_rate        numeric,
  out_category_mess_rate        numeric,
  out_room_billed               numeric,
  out_room_paid                 numeric,
  out_room_status               text,
  out_room_due_date             date,
  out_mess_billed               numeric,
  out_mess_paid                 numeric,
  out_mess_status               text,
  out_mess_due_date             date,
  out_upgrade_billed            numeric,
  out_upgrade_paid              numeric,
  out_upgrade_status            text,
  out_upgrade_due_date          date,
  out_total_billed              numeric,
  out_total_paid                numeric,
  out_total_outstanding         numeric,
  out_overdue_amount            numeric,
  out_overdue_count             integer,
  out_findings                  text[],
  out_bills                     jsonb,
  out_target_academic_year_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inst            uuid[];
  v_picked_start_yr integer;
  v_picked_ay_name  text;
  v_hostel_year_id  uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.billing_audit.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.billing_audit.view'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  SELECT EXTRACT(YEAR FROM ay.start_date)::integer, ay.academic_year_name::text
    INTO v_picked_start_yr, v_picked_ay_name
  FROM public.academic_years ay
  WHERE ay.id = p_academic_year_id;

  -- Configured fees are priced per hostel year; the current one is the
  -- expectation regardless of which academic year the bills are measured for.
  SELECT hy.id INTO v_hostel_year_id
  FROM public.hostel_years hy
  WHERE hy.is_current
  ORDER BY hy.start_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH target AS MATERIALIZED (
    SELECT t.institution_id,
           ay.academic_year_name::text                 AS ay_name,
           EXTRACT(YEAR FROM ay.start_date)::integer   AS start_yr
    FROM public.fn_billing_coverage_target_years() t
    JOIN public.academic_years ay ON ay.id = t.target_ay_id
  ),
  scope AS MATERIALIZED (
    SELECT h.id,
           h.roll_number::text                          AS roll_number,
           lp.register_number::text                     AS register_number,
           TRIM(COALESCE(h.first_name, '') || ' ' || COALESCE(h.last_name, '')) AS full_name,
           h.gender::text                               AS gender,
           h.institution_id,
           i.name::text                                 AS institution_name,
           h.program_id,
           lp.quota_id,
           lp.admission_year_id,
           h.program_name::text                         AS program_name,
           h.year_of_study,
           h.semester_name::text                        AS semester_name,
           h.lifecycle_status::text                     AS lifecycle_status,
           h.current_allocation_id,
           h.current_block_id,
           h.current_room_id,
           h.current_block_name::text                   AS block_name,
           h.current_room_number::text                  AS room_number,
           h.current_bed_number::text                   AS bed_number,
           h.hostel_category_id,
           h.hostel_category_name::text                 AS tagged_category_name,
           h.mess_category_id,
           h.mess_category_name::text                   AS mess_category_name,
           CASE WHEN lower(h.gender) LIKE 'm%' THEN 'boys'
                WHEN lower(h.gender) LIKE 'f%' THEN 'girls'
                ELSE NULL END                           AS gtype,
           COALESCE(v_picked_start_yr, t.start_yr)      AS target_yr,
           COALESCE(v_picked_ay_name, t.ay_name)        AS target_ay_name
    FROM public.v_learner_hostelites h
    JOIN public.learners_profiles lp ON lp.id = h.id
    LEFT JOIN public.institutions i ON i.id = h.institution_id
    LEFT JOIN target t ON t.institution_id = h.institution_id
    WHERE h.institution_id = ANY(v_inst)
      AND (p_block_id         IS NULL OR h.current_block_id   = p_block_id)
      AND (p_room_category_id IS NULL OR h.hostel_category_id = p_room_category_id)
      AND (p_program_id       IS NULL OR h.program_id         = p_program_id)
      AND (p_gender IS NULL OR UPPER(TRIM(h.gender)) = UPPER(TRIM(p_gender)))
      AND (NOT COALESCE(p_allocated_only, false) OR h.current_allocation_id IS NOT NULL)
  ),
  -- Fee band input: same choice fn_learner_band_academic_fee makes, set-based.
  adm_ay AS (
    SELECT s.id AS learner_id, ay.id AS ay_id
    FROM scope s
    JOIN public.admission_years ady ON ady.id = s.admission_year_id
    JOIN LATERAL (
      SELECT ay.id
      FROM public.academic_years ay
      WHERE ay.institution_id = s.institution_id
        AND EXTRACT(YEAR FROM ay.start_date)::integer = ady.year
      ORDER BY ay.is_active DESC, ay.academic_year_name ASC
      LIMIT 1
    ) ay ON TRUE
  ),
  band_years AS (
    SELECT b.student_id, b.academic_year_id, ay.start_date, SUM(b.final_amount) AS total
    FROM public.billing_student_bills b
    JOIN public.academic_years ay ON ay.id = b.academic_year_id
    WHERE b.student_id IN (SELECT id FROM scope)
      AND b.fee_source = 'academic'
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id, b.academic_year_id, ay.start_date
  ),
  band_fee AS (
    SELECT DISTINCT ON (byr.student_id)
           byr.student_id AS learner_id, byr.total AS fee
    FROM band_years byr
    LEFT JOIN adm_ay a ON a.learner_id = byr.student_id
    ORDER BY byr.student_id, (byr.academic_year_id IS DISTINCT FROM a.ay_id), byr.start_date ASC
  ),
  entitled AS (
    SELECT s.id AS learner_id, e.category_id
    FROM scope s
    LEFT JOIN band_fee bf ON bf.learner_id = s.id
    LEFT JOIN LATERAL (
      SELECT r.category_id
      FROM public.fn_hostel_effective_room_categories(
             s.institution_id, s.program_id, s.quota_id, bf.fee, s.gtype) r
      WHERE bf.fee IS NOT NULL AND s.program_id IS NOT NULL
      LIMIT 1
    ) e ON TRUE
  ),
  seated AS (
    SELECT s.id AS learner_id, hr.category_id
    FROM scope s
    JOIN public.hostel_rooms hr ON hr.id = s.current_room_id
  ),
  cfg_room AS (
    SELECT s.id AS learner_id, hf.amount
    FROM scope s
    JOIN public.hostel_categories tc ON tc.id = s.hostel_category_id
    LEFT JOIN LATERAL (
      SELECT f.amount
      FROM public.hostel_fees f
      JOIN public.hostel_categories fc ON fc.id = f.hostel_category_id
      WHERE f.hostel_year_id = v_hostel_year_id
        AND f.is_active
        AND fc.name = tc.name
        AND (fc.id = tc.id OR s.gtype IS NULL OR fc.type = s.gtype)
      ORDER BY (fc.id = tc.id) DESC
      LIMIT 1
    ) hf ON TRUE
  ),
  -- The entitled category's configured fee, so band status can be judged by
  -- what the categories COST rather than hostel_categories.sort_order (Deluxe
  -- Plus carries sort_order 0, below Classic, while being priced above Deluxe).
  cfg_entitled AS (
    SELECT e.learner_id, hf.amount
    FROM entitled e
    JOIN scope s ON s.id = e.learner_id
    JOIN public.hostel_categories ec ON ec.id = e.category_id
    LEFT JOIN LATERAL (
      SELECT f.amount
      FROM public.hostel_fees f
      JOIN public.hostel_categories fc ON fc.id = f.hostel_category_id
      WHERE f.hostel_year_id = v_hostel_year_id
        AND f.is_active
        AND fc.name = ec.name
        AND (fc.id = ec.id OR s.gtype IS NULL OR fc.type = s.gtype)
      ORDER BY (fc.id = ec.id) DESC
      LIMIT 1
    ) hf ON TRUE
  ),
  cfg_mess AS (
    SELECT s.id AS learner_id, mf.amount
    FROM scope s
    JOIN public.mess_categories tm ON tm.id = s.mess_category_id
    LEFT JOIN LATERAL (
      SELECT f.amount
      FROM public.hostel_fees f
      JOIN public.mess_categories fm ON fm.id = f.mess_category_id
      WHERE f.hostel_year_id = v_hostel_year_id
        AND f.is_active
        AND fm.name = tm.name
        AND (fm.id = tm.id OR s.gtype IS NULL OR fm.type = s.gtype)
      ORDER BY (fm.id = tm.id) DESC
      LIMIT 1
    ) mf ON TRUE
  ),
  cfg_upgrade AS (
    SELECT s.id AS learner_id, u.net
    FROM scope s
    JOIN entitled e ON e.learner_id = s.id
    JOIN public.hostel_categories tc ON tc.id = s.hostel_category_id
    JOIN public.hostel_categories ec ON ec.id = e.category_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(u.net_amount, u.amount) AS net
      FROM public.hostel_category_upgrade_fees u
      JOIN public.hostel_categories fc  ON fc.id  = u.from_hostel_category_id
      JOIN public.hostel_categories tcc ON tcc.id = u.to_hostel_category_id
      WHERE u.hostel_year_id = v_hostel_year_id
        AND u.is_active
        AND fc.name  = ec.name
        AND tcc.name = tc.name
      ORDER BY ((fc.id = ec.id AND tcc.id = tc.id)) DESC,
               ((s.gtype IS NOT NULL AND fc.type = s.gtype AND tcc.type = s.gtype)) DESC
      LIMIT 1
    ) u ON TRUE
    WHERE tc.name <> ec.name
  ),
  -- What the learner's resolved admission fee structure says the room and
  -- mess lines are. NULL for legacy_fee_mode learners with no snapshot.
  structure_exp AS (
    SELECT s.id AS learner_id,
           SUM((fi->>'amount')::numeric) FILTER (
             WHERE public.fn_cl_billing_audit_bill_class(bc.kind::text, bc.category_name::text, NULL) = 'room') AS room_expected,
           SUM((fi->>'amount')::numeric) FILTER (
             WHERE public.fn_cl_billing_audit_bill_class(bc.kind::text, bc.category_name::text, NULL) = 'mess') AS mess_expected
    FROM scope s
    JOIN public.learners_profiles lp ON lp.id = s.id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(lp.fee_items) = 'array' THEN lp.fee_items ELSE '[]'::jsonb END) AS fi
    JOIN public.billing_categories bc ON bc.id = NULLIF(fi->>'category_id', '')::uuid
    GROUP BY s.id
  ),
  bill_rows AS (
    SELECT b.id,
           b.student_id,
           public.fn_cl_billing_audit_bill_class(bc.kind::text, bc.category_name::text, b.fee_source) AS cls,
           bc.category_name::text                              AS category_name,
           b.bill_description,
           COALESCE(ay.academic_year_name::text, hy.name::text) AS year_name,
           b.final_amount,
           (b.final_amount - COALESCE(b.balance_amount, 0))    AS paid,
           COALESCE(b.balance_amount, 0)                       AS pending,
           b.status::text                                      AS status,
           b.due_date,
           (COALESCE(b.balance_amount, 0) > 0 AND b.due_date < CURRENT_DATE) AS is_overdue
    FROM scope s
    JOIN public.billing_student_bills b
      ON b.student_id = s.id
     AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
    JOIN public.billing_categories bc
      ON bc.id = b.item_category_id
     AND bc.kind IN ('hostel', 'mess')
    LEFT JOIN public.academic_years ay ON ay.id = b.academic_year_id
    LEFT JOIN public.hostel_years   hy ON hy.id = b.hostel_year_id
    WHERE COALESCE(EXTRACT(YEAR FROM ay.start_date)::integer,
                   EXTRACT(YEAR FROM hy.start_date)::integer) = s.target_yr
  ),
  per_class AS (
    SELECT student_id, cls,
           SUM(final_amount) AS billed,
           SUM(paid)         AS paid,
           SUM(pending)      AS pending,
           MIN(due_date) FILTER (WHERE pending > 0) AS next_due,
           MIN(due_date)                            AS first_due,
           CASE WHEN SUM(pending) = 0 THEN 'paid'
                WHEN SUM(paid) > 0    THEN 'partially_paid'
                ELSE 'unpaid' END    AS status
    FROM bill_rows
    GROUP BY student_id, cls
  ),
  per_learner AS (
    SELECT student_id,
           SUM(final_amount)                                   AS total_billed,
           SUM(paid)                                           AS total_paid,
           SUM(pending)                                        AS total_outstanding,
           SUM(pending) FILTER (WHERE is_overdue)              AS overdue_amount,
           COUNT(*)     FILTER (WHERE is_overdue)::integer     AS overdue_count,
           jsonb_agg(jsonb_build_object(
             'bill_id',       id,
             'class',         cls,
             'category_name', category_name,
             'description',   bill_description,
             'year_name',     year_name,
             'amount',        final_amount,
             'paid',          paid,
             'pending',       pending,
             'status',        status,
             'due_date',      due_date,
             'is_overdue',    is_overdue
           ) ORDER BY due_date NULLS LAST, category_name)      AS bills
    FROM bill_rows
    GROUP BY student_id
  ),
  assembled AS (
    SELECT s.*,
           sc.category_id                      AS seated_category_id,
           scat.name::text                     AS seated_category_name,
           tcat.sort_order                     AS tagged_sort,
           tcat.room_source_category_id        AS tagged_room_source,
           bf.fee                              AS band_fee,
           e.category_id                       AS entitled_category_id,
           ecat.name::text                     AS entitled_category_name,
           ecat.sort_order                     AS entitled_sort,
           ce.amount                           AS entitled_room_rate,
           cr.amount                           AS category_room_rate,
           cm.amount                           AS category_mess_rate,
           se.room_expected                    AS expected_room_fee,
           se.mess_expected                    AS expected_mess_fee,
           cu.net                              AS expected_upgrade_fee,
           rup.billed                          AS room_upgrade_billed,
           room.billed  AS room_billed,  room.paid  AS room_paid,  room.status  AS room_status,
           COALESCE(room.next_due, room.first_due) AS room_due_date,
           mess.billed  AS mess_billed,  mess.paid  AS mess_paid,  mess.status  AS mess_status,
           COALESCE(mess.next_due, mess.first_due) AS mess_due_date,
           -- Room and mess upgrades are one "upgrade" lane for the audit.
           (COALESCE(rup.billed, 0) + COALESCE(mup.billed, 0))  AS upgrade_billed,
           (COALESCE(rup.paid, 0)   + COALESCE(mup.paid, 0))    AS upgrade_paid,
           CASE WHEN rup.student_id IS NULL AND mup.student_id IS NULL THEN NULL
                WHEN COALESCE(rup.pending, 0) + COALESCE(mup.pending, 0) = 0 THEN 'paid'
                WHEN COALESCE(rup.paid, 0) + COALESCE(mup.paid, 0) > 0 THEN 'partially_paid'
                ELSE 'unpaid' END                               AS upgrade_status,
           LEAST(COALESCE(rup.next_due, rup.first_due), COALESCE(mup.next_due, mup.first_due)) AS upgrade_due_date,
           rup.student_id IS NOT NULL                          AS has_room_upgrade_bill,
           COALESCE(pl.total_billed, 0)      AS total_billed,
           COALESCE(pl.total_paid, 0)        AS total_paid,
           COALESCE(pl.total_outstanding, 0) AS total_outstanding,
           COALESCE(pl.overdue_amount, 0)    AS overdue_amount,
           COALESCE(pl.overdue_count, 0)     AS overdue_count,
           COALESCE(pl.bills, '[]'::jsonb)   AS bills
    FROM scope s
    LEFT JOIN seated sc            ON sc.learner_id = s.id
    LEFT JOIN public.hostel_categories scat ON scat.id = sc.category_id
    LEFT JOIN public.hostel_categories tcat ON tcat.id = s.hostel_category_id
    LEFT JOIN band_fee bf          ON bf.learner_id = s.id
    LEFT JOIN entitled e           ON e.learner_id = s.id
    LEFT JOIN public.hostel_categories ecat ON ecat.id = e.category_id
    LEFT JOIN cfg_room cr          ON cr.learner_id = s.id
    LEFT JOIN cfg_entitled ce      ON ce.learner_id = s.id
    LEFT JOIN cfg_mess cm          ON cm.learner_id = s.id
    LEFT JOIN structure_exp se     ON se.learner_id = s.id
    LEFT JOIN cfg_upgrade cu       ON cu.learner_id = s.id
    LEFT JOIN per_class room       ON room.student_id = s.id AND room.cls = 'room'
    LEFT JOIN per_class mess       ON mess.student_id = s.id AND mess.cls = 'mess'
    LEFT JOIN per_class rup        ON rup.student_id  = s.id AND rup.cls  = 'room_upgrade'
    LEFT JOIN per_class mup        ON mup.student_id  = s.id AND mup.cls  = 'mess_upgrade'
    LEFT JOIN per_learner pl       ON pl.student_id = s.id
  ),
  judged AS (
    SELECT a.*,
           -- Judge by configured price when both sides are priced; fall back
           -- to sort_order only when a fee row is missing.
           CASE WHEN a.hostel_category_id IS NULL THEN 'no_category'
                WHEN a.entitled_category_id IS NULL THEN 'no_band'
                WHEN a.entitled_category_name = a.tagged_category_name THEN 'within'
                WHEN a.category_room_rate IS NOT NULL AND a.entitled_room_rate IS NOT NULL THEN
                  CASE WHEN a.category_room_rate > a.entitled_room_rate THEN 'above'
                       WHEN a.category_room_rate < a.entitled_room_rate THEN 'below'
                       ELSE 'within' END
                WHEN COALESCE(a.tagged_sort, 0) > COALESCE(a.entitled_sort, 0) THEN 'above'
                WHEN COALESCE(a.tagged_sort, 0) < COALESCE(a.entitled_sort, 0) THEN 'below'
                ELSE 'within' END AS band_status
    FROM assembled a
  )
  SELECT j.id,
         j.roll_number,
         j.register_number,
         j.full_name,
         j.gender,
         j.institution_id,
         j.institution_name,
         j.program_name,
         j.year_of_study,
         j.semester_name,
         j.lifecycle_status,
         (j.current_allocation_id IS NOT NULL),
         j.current_block_id,
         j.block_name,
         j.room_number,
         j.bed_number,
         j.seated_category_name,
         j.hostel_category_id,
         j.tagged_category_name,
         j.mess_category_name,
         j.band_fee,
         j.entitled_category_name,
         j.band_status,
         j.expected_room_fee,
         j.expected_mess_fee,
         j.expected_upgrade_fee,
         j.category_room_rate,
         j.category_mess_rate,
         j.room_billed, j.room_paid, j.room_status, j.room_due_date,
         j.mess_billed, j.mess_paid, j.mess_status, j.mess_due_date,
         CASE WHEN j.upgrade_status IS NULL THEN NULL ELSE j.upgrade_billed END,
         CASE WHEN j.upgrade_status IS NULL THEN NULL ELSE j.upgrade_paid END,
         j.upgrade_status, j.upgrade_due_date,
         j.total_billed,
         j.total_paid,
         j.total_outstanding,
         j.overdue_amount,
         j.overdue_count,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN j.room_billed IS NULL THEN 'no_room_bill' END,
           CASE WHEN j.mess_billed IS NULL THEN 'no_mess_bill' END,
           CASE WHEN j.band_status = 'above' AND NOT j.has_room_upgrade_bill THEN 'upgrade_unbilled' END,
           CASE WHEN j.total_outstanding > 0 THEN 'unpaid' END,
           CASE WHEN j.overdue_count > 0 THEN 'overdue' END,
           CASE WHEN (j.expected_room_fee IS NOT NULL AND j.room_billed IS NOT NULL
                      AND j.room_billed <> j.expected_room_fee)
                  OR (j.expected_mess_fee IS NOT NULL AND j.mess_billed IS NOT NULL
                      AND j.mess_billed <> j.expected_mess_fee)
                  OR (j.expected_upgrade_fee IS NOT NULL AND j.room_upgrade_billed IS NOT NULL
                      AND j.room_upgrade_billed <> j.expected_upgrade_fee)
                THEN 'amount_mismatch' END,
           CASE WHEN j.band_status = 'no_band' THEN 'no_band' END,
           -- Informational: the bed's category disagrees with the billed tag,
           -- except the by-design stock mapping (Deluxe Plus sells Deluxe beds).
           CASE WHEN j.seated_category_id IS NOT NULL AND j.hostel_category_id IS NOT NULL
                     AND j.seated_category_name <> j.tagged_category_name
                     AND j.seated_category_id IS DISTINCT FROM j.tagged_room_source
                THEN 'category_drift' END
         ], NULL)::text[],
         j.bills,
         j.target_ay_name
  FROM judged j;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_billing_audit_rows(uuid[], uuid, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_billing_audit_rows(uuid[], uuid, uuid, uuid, uuid, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_cl_billing_audit_rows(uuid[], uuid, uuid, uuid, uuid, text, boolean) IS
  'Billing Audit engine: one row per hostel learner (v_learner_hostelites) with fee band, entitled category, configured fees, live room/mess/upgrade bills for the target year, and findings[]. Gated campus_living.billing_audit.view; scoped to accessible institutions.';

-- ─── 3b. Paginated table RPC ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_cl_billing_audit_learners(uuid[], uuid, uuid, uuid, uuid, text, boolean, text, text, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.get_cl_billing_audit_learners(
  p_institution_ids   uuid[]  DEFAULT NULL,
  p_academic_year_id  uuid    DEFAULT NULL,
  p_block_id          uuid    DEFAULT NULL,
  p_room_category_id  uuid    DEFAULT NULL,
  p_program_id        uuid    DEFAULT NULL,
  p_gender            text    DEFAULT NULL,
  p_allocated_only    boolean DEFAULT false,
  p_finding           text    DEFAULT 'all',
  p_search            text    DEFAULT NULL,
  p_page              integer DEFAULT 1,
  p_page_size         integer DEFAULT 50,
  p_sort_by           text    DEFAULT NULL,
  p_sort_dir          text    DEFAULT 'asc'
)
RETURNS TABLE (
  out_learner_id                uuid,
  out_roll_number               text,
  out_register_number           text,
  out_full_name                 text,
  out_gender                    text,
  out_institution_id            uuid,
  out_institution_name          text,
  out_program_name              text,
  out_year_of_study             integer,
  out_semester_name             text,
  out_lifecycle_status          text,
  out_is_allocated              boolean,
  out_block_id                  uuid,
  out_block_name                text,
  out_room_number               text,
  out_bed_number                text,
  out_seated_category_name      text,
  out_tagged_category_id        uuid,
  out_tagged_category_name      text,
  out_mess_category_name        text,
  out_band_fee                  numeric,
  out_entitled_category_name    text,
  out_band_status               text,
  out_expected_room_fee         numeric,
  out_expected_mess_fee         numeric,
  out_expected_upgrade_fee      numeric,
  out_category_room_rate        numeric,
  out_category_mess_rate        numeric,
  out_room_billed               numeric,
  out_room_paid                 numeric,
  out_room_status               text,
  out_room_due_date             date,
  out_mess_billed               numeric,
  out_mess_paid                 numeric,
  out_mess_status               text,
  out_mess_due_date             date,
  out_upgrade_billed            numeric,
  out_upgrade_paid              numeric,
  out_upgrade_status            text,
  out_upgrade_due_date          date,
  out_total_billed              numeric,
  out_total_paid                numeric,
  out_total_outstanding         numeric,
  out_overdue_amount            numeric,
  out_overdue_count             integer,
  out_findings                  text[],
  out_bills                     jsonb,
  out_target_academic_year_name text,
  out_total_count               bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_dir    text    := CASE WHEN lower(COALESCE(p_sort_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort   text    := CASE
                        WHEN p_sort_by IN ('roll_number', 'full_name', 'institution_name', 'block_name',
                                           'band_fee', 'total_billed', 'total_paid', 'total_outstanding',
                                           'overdue_amount', 'program_name', 'tagged_category_name')
                        THEN p_sort_by ELSE 'roll_number' END;
  v_search text    := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  -- The engine re-checks permission and scope; this wrapper only filters,
  -- sorts and pages. The whitelist above is what keeps p_sort_by out of the
  -- ORDER BY as raw text.
  RETURN QUERY EXECUTE format($q$
    WITH audit_rows AS MATERIALIZED (
      SELECT * FROM public.fn_cl_billing_audit_rows($1, $2, $3, $4, $5, $6, $7)
    ),
    filtered AS (
      SELECT r.*
      FROM audit_rows r
      WHERE ($8 = 'all'
             OR ($8 = 'clean' AND NOT (r.out_findings && ARRAY['no_room_bill','no_mess_bill','upgrade_unbilled','unpaid','overdue','amount_mismatch']::text[]))
             OR ($8 <> 'all' AND $8 <> 'clean' AND $8 = ANY(r.out_findings)))
        AND ($9::text IS NULL
             OR r.out_roll_number     ILIKE '%%' || $9 || '%%'
             OR r.out_register_number ILIKE '%%' || $9 || '%%'
             OR r.out_full_name       ILIKE '%%' || $9 || '%%')
    )
    SELECT f.*, COUNT(*) OVER() AS out_total_count
    FROM filtered f
    ORDER BY f.out_%I %s NULLS LAST, f.out_roll_number ASC
    LIMIT $10 OFFSET $11
  $q$, v_sort, v_dir)
  USING p_institution_ids, p_academic_year_id, p_block_id, p_room_category_id,
        p_program_id, p_gender, COALESCE(p_allocated_only, false),
        COALESCE(p_finding, 'all'), v_search, v_limit, v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cl_billing_audit_learners(uuid[], uuid, uuid, uuid, uuid, text, boolean, text, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cl_billing_audit_learners(uuid[], uuid, uuid, uuid, uuid, text, boolean, text, text, integer, integer, text, text) TO authenticated, service_role;

-- ─── 3c. Summary RPC ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_cl_billing_audit_summary(uuid[], uuid, uuid, uuid, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.get_cl_billing_audit_summary(
  p_institution_ids   uuid[]  DEFAULT NULL,
  p_academic_year_id  uuid    DEFAULT NULL,
  p_block_id          uuid    DEFAULT NULL,
  p_room_category_id  uuid    DEFAULT NULL,
  p_program_id        uuid    DEFAULT NULL,
  p_gender            text    DEFAULT NULL,
  p_allocated_only    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Every aggregate below reads ONE materialised pass of the engine, so the
  -- KPI cards and every breakdown describe the same population. (Two separate
  -- RPC calls can still disagree by a row — the DB is live.)
  WITH audit_rows AS MATERIALIZED (
    SELECT * FROM public.fn_cl_billing_audit_rows(
      p_institution_ids, p_academic_year_id, p_block_id, p_room_category_id,
      p_program_id, p_gender, COALESCE(p_allocated_only, false))
  ),
  kpis AS (
    SELECT
      COUNT(*)::integer                                                        AS hostel_learners,
      COUNT(*) FILTER (WHERE out_is_allocated)::integer                        AS allocated,
      COUNT(*) FILTER (WHERE out_room_billed IS NOT NULL)::integer             AS room_billed_learners,
      COUNT(*) FILTER (WHERE out_mess_billed IS NOT NULL)::integer             AS mess_billed_learners,
      COUNT(*) FILTER (WHERE out_upgrade_status IS NOT NULL)::integer          AS upgrade_billed_learners,
      COUNT(*) FILTER (WHERE out_band_status = 'above')::integer               AS above_band,
      COUNT(*) FILTER (WHERE 'upgrade_unbilled' = ANY(out_findings))::integer  AS upgrade_unbilled,
      COUNT(*) FILTER (WHERE 'no_band' = ANY(out_findings))::integer           AS no_band,
      COUNT(*) FILTER (WHERE 'amount_mismatch' = ANY(out_findings))::integer   AS amount_mismatch,
      COUNT(*) FILTER (WHERE 'category_drift' = ANY(out_findings))::integer    AS category_drift,
      COUNT(*) FILTER (WHERE out_overdue_count > 0)::integer                   AS overdue_learners,
      COUNT(*) FILTER (WHERE out_total_outstanding > 0)::integer               AS unpaid_learners,
      COUNT(*) FILTER (WHERE NOT (out_findings && ARRAY['no_room_bill','no_mess_bill','upgrade_unbilled','unpaid','overdue','amount_mismatch']::text[]))::integer AS clean,
      COALESCE(SUM(out_total_billed), 0)                                       AS total_billed,
      COALESCE(SUM(out_total_paid), 0)                                         AS total_paid,
      COALESCE(SUM(out_total_outstanding), 0)                                  AS total_outstanding,
      COALESCE(SUM(out_overdue_amount), 0)                                     AS overdue_amount,
      COALESCE(SUM(out_expected_upgrade_fee) FILTER (WHERE 'upgrade_unbilled' = ANY(out_findings)), 0) AS upgrade_unbilled_amount
    FROM audit_rows
  ),
  by_finding AS (
    SELECT f.key AS finding,
           COUNT(*)::integer AS learners,
           COALESCE(SUM(r.out_total_outstanding), 0) AS outstanding
    FROM audit_rows r
    CROSS JOIN LATERAL unnest(r.out_findings) AS f(key)
    GROUP BY f.key
  ),
  by_institution AS (
    SELECT out_institution_id AS id, out_institution_name AS name,
           COUNT(*)::integer AS learners,
           COUNT(*) FILTER (WHERE out_is_allocated)::integer AS allocated,
           COUNT(*) FILTER (WHERE out_room_billed IS NOT NULL)::integer AS room_billed,
           COUNT(*) FILTER (WHERE out_mess_billed IS NOT NULL)::integer AS mess_billed,
           COALESCE(SUM(out_total_billed), 0)      AS billed,
           COALESCE(SUM(out_total_paid), 0)        AS paid,
           COALESCE(SUM(out_total_outstanding), 0) AS outstanding,
           COALESCE(SUM(out_overdue_amount), 0)    AS overdue,
           COUNT(*) FILTER (WHERE out_overdue_count > 0)::integer AS overdue_learners
    FROM audit_rows
    GROUP BY out_institution_id, out_institution_name
  ),
  by_block AS (
    SELECT out_block_id AS id, COALESCE(out_block_name, 'Not allocated') AS name,
           COUNT(*)::integer AS learners,
           COALESCE(SUM(out_total_billed), 0)      AS billed,
           COALESCE(SUM(out_total_paid), 0)        AS paid,
           COALESCE(SUM(out_total_outstanding), 0) AS outstanding,
           COALESCE(SUM(out_overdue_amount), 0)    AS overdue,
           COUNT(*) FILTER (WHERE 'upgrade_unbilled' = ANY(out_findings))::integer AS upgrade_unbilled
    FROM audit_rows
    GROUP BY out_block_id, out_block_name
  ),
  by_room_category AS (
    SELECT out_tagged_category_id AS id, COALESCE(out_tagged_category_name, 'No category') AS name,
           COUNT(*)::integer AS learners,
           COUNT(*) FILTER (WHERE out_band_status = 'above')::integer AS above_band,
           COUNT(*) FILTER (WHERE out_room_billed IS NOT NULL)::integer AS room_billed,
           MAX(out_category_room_rate) AS category_room_rate,
           COALESCE(SUM(out_room_billed), 0) AS room_billed_amount,
           COALESCE(SUM(out_upgrade_billed), 0) AS upgrade_billed_amount
    FROM audit_rows
    GROUP BY out_tagged_category_id, out_tagged_category_name
  ),
  bill_lines AS (
    SELECT (b->>'status') AS status,
           (b->>'class')  AS class,
           (b->>'amount')::numeric  AS amount,
           (b->>'pending')::numeric AS pending,
           (b->>'due_date')::date   AS due_date,
           (b->>'is_overdue')::boolean AS is_overdue
    FROM audit_rows r CROSS JOIN LATERAL jsonb_array_elements(r.out_bills) AS b
  ),
  by_bill_status AS (
    SELECT status, COUNT(*)::integer AS bills, COALESCE(SUM(amount), 0) AS amount
    FROM bill_lines GROUP BY status
  ),
  by_bill_class AS (
    SELECT class, COUNT(*)::integer AS bills,
           COALESCE(SUM(amount), 0) AS amount,
           COALESCE(SUM(amount - pending), 0) AS paid,
           COALESCE(SUM(pending), 0) AS pending
    FROM bill_lines GROUP BY class
  ),
  overdue_aging AS (
    SELECT CASE WHEN CURRENT_DATE - due_date <= 30 THEN '1-30'
                WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
                WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
                ELSE '90+' END AS bucket,
           COUNT(*)::integer AS bills,
           COALESCE(SUM(pending), 0) AS amount
    FROM bill_lines WHERE is_overdue
    GROUP BY 1
  ),
  due_soon AS (
    SELECT CASE WHEN due_date <= CURRENT_DATE + 7  THEN 'this_week'
                WHEN due_date <= CURRENT_DATE + 30 THEN 'this_month'
                ELSE 'later' END AS bucket,
           COUNT(*)::integer AS bills,
           COALESCE(SUM(pending), 0) AS amount
    FROM bill_lines WHERE pending > 0 AND due_date >= CURRENT_DATE
    GROUP BY 1
  ),
  target_years AS (
    SELECT DISTINCT out_institution_name AS institution, out_target_academic_year_name AS academic_year_name
    FROM audit_rows
  )
  SELECT jsonb_build_object(
    'kpis',              (SELECT to_jsonb(k) FROM kpis k),
    'by_finding',        COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.learners DESC) FROM by_finding x), '[]'::jsonb),
    'by_institution',    COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM by_institution x), '[]'::jsonb),
    'by_block',          COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM by_block x), '[]'::jsonb),
    'by_room_category',  COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM by_room_category x), '[]'::jsonb),
    'by_bill_status',    COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM by_bill_status x), '[]'::jsonb),
    'by_bill_class',     COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM by_bill_class x), '[]'::jsonb),
    'overdue_aging',     COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM overdue_aging x), '[]'::jsonb),
    'due_soon',          COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM due_soon x), '[]'::jsonb),
    'target_years',      COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.institution) FROM target_years x), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cl_billing_audit_summary(uuid[], uuid, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cl_billing_audit_summary(uuid[], uuid, uuid, uuid, uuid, text, boolean) TO authenticated, service_role;
