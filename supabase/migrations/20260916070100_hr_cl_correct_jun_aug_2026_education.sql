-- ============================================================================
-- ONE-OFF REPAIR — Casual Leave, Jun-Aug 2026, JKKN College of Education.
-- Created: 2026-09-16. Batch 1 of a multi-institution correction.
--
-- WHY
-- ---
-- HR supplied "Paid Leave Summary Jun-Aug 2026 - Education.xlsx", the actual
-- CL days salary was already run against, for the 3 staff at this institution.
-- It does not match what the app has on record:
--
--   staff (real staff_id)      | June | July | Aug | current DB (Jun/Jul/Aug)
--   Rajendiran K M (NOTJMO048) |  0   |  2   |  1  | no balance row at all
--   Sambooranam M  (COE001)    |  1   |  1   |  1  | 1 (override) / 1 (override) / 0
--   Monisha A      (NOTCOE001) | 2.5  |  2   |  2  | 1 (override) / 1 (override) / 1 (real app)
--
-- The Excel's own "Employee Id" column does NOT match these staff_id codes
-- (verified by name + institution instead -- do not join future institutions'
-- sheets on that column).
--
-- MECHANISM
-- ---------
-- Every corrected month is written as an hr_leave_month_entries OVERRIDE, the
-- same lever 20260907140000 used, for the same reasons:
--   - August 2026 is a LOCKED attendance period for this institution
--     (hr_attendance_periods). hr_trig_block_leave_in_locked_period refuses
--     any write to hr_leave_applications touching it, unconditionally, with no
--     super-admin bypass -- real dated applications are not an option there.
--   - hr_trig_leave_enforce_balance would refuse several of these corrections
--     as real applications anyway, since the true Jun-Aug totals exceed what
--     plain month-by-month accrual allows -- that mismatch is the defect being
--     fixed, not a new leave request to validate.
-- 20260916070000 added hr_leave_month_entries.evidence_date so the ledger can
-- still show a real day instead of "Recorded by admin" wherever one exists.
-- Biometric attendance was checked for each staff/month (hr_attendance_records
-- joined to the single LOP status type, code='ABSENT'):
--   - June 2026: ZERO attendance rows exist for this institution at all -- no
--     evidence is possible for any June figure.
--   - July 2026: LOP days exist but routinely outnumber the correct CL count
--     (e.g. Monisha has 11 LOP days in July, only 2 should be CL) -- per HR's
--     own instruction, the EARLIEST unconverted LOP date(s) needed are used;
--     there is no way to recover which exact day(s) payroll meant.
--   - August 2026: no LOP evidence at all for Rajendiran or Sambooranam
--     (their August absence left no biometric trace); Monisha's real 4 Aug
--     application plus one LOP day (5 Aug, earliest of 3 unconverted) cover
--     hers.
-- Where no evidence exists, evidence_date is left NULL and the entry reads
-- honestly as "Recorded by admin" -- that label was never the problem by
-- itself, only its use in place of real evidence that did exist.
--
-- "Reduce other months" was NOT needed: neither Rajendiran nor Sambooranam has
-- any CL recorded after August, and Monisha's only later item is a still-
-- PENDING 0.5-day request (7 Sep) that has not consumed any balance. Once
-- Jun-Aug is corrected, fn_hr_leave_monthly_ledger's own FIFO walk attributes
-- any excess to later months' closing balance automatically (going negative if
-- needed) -- no separate write against a later month is required, confirmed
-- against the ledger function's own logic (20260905120000/20260906130100).
--
-- `used` IS SET ABSOLUTELY at the end, as SUM(that employee's CL month
-- entries) -- safe here specifically because none of these 3 staff carry any
-- OTHER approved CL application outside an overridden month (verified: neither
-- Rajendiran nor Sambooranam has ever filed a CL application; Monisha's only
-- approved one, 4 Aug, sits inside the new August override and is absorbed by
-- it). A future institution with approved CL outside its corrected months
-- would need the fuller "entries + non-overridden approved applications"
-- formula from hr_leave_month_entry_set instead of this simple SUM.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_correct_2026_jun_aug_education(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_year_id    uuid;
  v_frozen     timestamptz;
  v_org        uuid;
  v_leave_type uuid;
  v_actor      uuid;
  v_reason_pfx constant text :=
    'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (JKKN College of Education).';
  v_before     jsonb;
  v_after      jsonb;
  v_targets    jsonb;
BEGIN
  SELECT id, frozen_at INTO v_year_id, v_frozen
  FROM public.hr_academic_years WHERE year_name = '2026-2027';
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'HR academic year 2026-2027 does not exist' USING ERRCODE = 'P0001';
  END IF;
  IF v_frozen IS NOT NULL THEN
    RAISE EXCEPTION 'HR academic year 2026-2027 was frozen on %; it can no longer be rewritten.',
      to_char(v_frozen, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  SELECT o.id INTO v_org
  FROM public.hr_organizations o
  WHERE o.institution_id = '9380358f-7020-4c23-89c3-e9538b47cf33'; -- JKKN College of Education

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'JKKN College of Education has no hr_organizations row' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.id INTO v_leave_type
  FROM public.hr_leave_types t
  WHERE t.hr_organization_id = v_org AND t.leave_type_code = 'CL';

  IF v_leave_type IS NULL THEN
    RAISE EXCEPTION 'This organization has no CL leave type' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in'))
    INTO v_actor;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No actor to attribute this correction to' USING ERRCODE = 'P0001';
  END IF;

  CREATE TEMP TABLE _target (
    employee_id             uuid,
    month_start              date,
    days                      numeric,
    evidence_date             date,
    existing_approved_days    numeric,
    evidence_note             text
  ) ON COMMIT DROP;

  INSERT INTO _target
    (employee_id, month_start, days, evidence_date, existing_approved_days, evidence_note)
  VALUES
    -- Rajendiran K M (staff_id NOTJMO048) -- no balance row / entries / applications today.
    ('30e752c9-f0a2-4813-a74a-be4f70d93609', DATE '2026-07-01', 2,   DATE '2026-07-17', 0,
     'LOP recorded 17 Jul 2026 (biometric); earliest of 3 unconverted July LOP days.'),
    ('30e752c9-f0a2-4813-a74a-be4f70d93609', DATE '2026-08-01', 1,   NULL,              0,
     'No biometric LOP evidence for August; August attendance period is locked for this institution.'),

    -- Sambooranam M (staff_id COE001) -- June/July already correct, untouched.
    ('e4608c1d-4387-476c-b61b-689efa7ec464', DATE '2026-08-01', 1,   NULL,              0,
     'No biometric LOP evidence for August; August attendance period is locked for this institution.'),

    -- Monisha A (staff_id NOTCOE001).
    ('d1160fe2-e7ab-4312-80d0-1d29cf688acf', DATE '2026-06-01', 2.5, NULL,              0,
     'No biometric attendance recorded for June 2026 at this institution.'),
    ('d1160fe2-e7ab-4312-80d0-1d29cf688acf', DATE '2026-07-01', 2,   DATE '2026-07-03', 0,
     'LOP recorded 3 Jul 2026 (biometric); earliest of 11 unconverted July LOP days -- exact CL date unconfirmed.'),
    ('d1160fe2-e7ab-4312-80d0-1d29cf688acf', DATE '2026-08-01', 2,   DATE '2026-08-05', 1,
     'Absorbs the existing approved application of 4 Aug 2026 (1 day) plus LOP recorded 5 Aug 2026 (earliest of 3 unconverted); August attendance period is locked.');

  -- Every touched staff must have a CL balance row before it can be updated.
  INSERT INTO public.hr_leave_balances (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    entitled, used, carried_forward)
  SELECT DISTINCT tg.employee_id, v_leave_type, v_year_id, v_org, NULL::numeric, 0::numeric, 0::numeric
  FROM _target tg
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'used', used) ORDER BY employee_id)
    INTO v_before
  FROM public.hr_leave_balances
  WHERE leave_type_id = v_leave_type AND hr_academic_year_id = v_year_id
    AND employee_id IN (SELECT DISTINCT employee_id FROM _target);

  SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.employee_id, tg.month_start) INTO v_targets FROM _target tg;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'institution', 'JKKN College of Education',
      'targets', v_targets, 'balances_before', v_before);
  END IF;

  -- ---- Audit row per target, BEFORE writing it -----------------------------
  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT tg.employee_id, v_leave_type, v_year_id, v_org,
         'set_month_entry',
         jsonb_build_object('month', tg.month_start,
           'total', COALESCE((SELECT e.days FROM public.hr_leave_month_entries e
                                WHERE e.employee_id = tg.employee_id AND e.leave_type_id = v_leave_type
                                  AND e.hr_academic_year_id = v_year_id
                                  AND e.month_start = tg.month_start), tg.existing_approved_days)),
         jsonb_build_object('month', tg.month_start, 'total', tg.days, 'evidence_date', tg.evidence_date),
         v_reason_pfx || ' ' || tg.evidence_note, v_actor
  FROM _target tg;

  -- ---- The overrides themselves ---------------------------------------------
  -- added_days on a FRESH row (no prior entry) is the days beyond what was
  -- already counted via a real approved application in that month -- so
  -- clearing it later refunds only what this entry itself contributed, never
  -- the application's own day(s). On an EXISTING row it is the prior added_days
  -- plus this write's own delta, exactly hr_leave_month_entry_set's own 'add'
  -- formula.
  INSERT INTO public.hr_leave_month_entries (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    month_start, days, added_days, evidence_date, reason, created_by)
  SELECT tg.employee_id, v_leave_type, v_year_id, v_org,
         tg.month_start, tg.days, tg.days - tg.existing_approved_days,
         tg.evidence_date, v_reason_pfx || ' ' || tg.evidence_note, v_actor
  FROM _target tg
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
  DO UPDATE SET
    days           = EXCLUDED.days,
    added_days     = public.hr_leave_month_entries.added_days
                        + (EXCLUDED.days - public.hr_leave_month_entries.days),
    evidence_date  = EXCLUDED.evidence_date,
    reason         = EXCLUDED.reason,
    updated_at     = now();

  -- ---- `used`, absolutely: SUM of this employee's CL month entries --------
  -- Safe here only because none of these 3 staff carry an approved CL
  -- application outside a now-overridden month (see header). A general-purpose
  -- version would add non-overridden approved applications too.
  UPDATE public.hr_leave_balances b
     SET used = sub.total, updated_at = now()
    FROM (
      SELECT e.employee_id, SUM(e.days) AS total
      FROM public.hr_leave_month_entries e
      WHERE e.leave_type_id = v_leave_type AND e.hr_academic_year_id = v_year_id
        AND e.employee_id IN (SELECT DISTINCT employee_id FROM _target)
      GROUP BY e.employee_id
    ) sub
   WHERE b.employee_id = sub.employee_id AND b.leave_type_id = v_leave_type
     AND b.hr_academic_year_id = v_year_id;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT bef.employee_id, v_leave_type, v_year_id, v_org, 'set_used',
         jsonb_build_object('used', bef.used),
         jsonb_build_object('used', b.used),
         v_reason_pfx, v_actor
  FROM jsonb_to_recordset(v_before) AS bef(employee_id uuid, used numeric)
  JOIN public.hr_leave_balances b
    ON b.employee_id = bef.employee_id AND b.leave_type_id = v_leave_type
   AND b.hr_academic_year_id = v_year_id
  WHERE bef.used IS DISTINCT FROM b.used;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'used', used) ORDER BY employee_id)
    INTO v_after
  FROM public.hr_leave_balances
  WHERE leave_type_id = v_leave_type AND hr_academic_year_id = v_year_id
    AND employee_id IN (SELECT DISTINCT employee_id FROM _target);

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027', 'institution', 'JKKN College of Education',
    'targets', v_targets, 'balances_before', v_before, 'balances_after', v_after);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_education(boolean) IS
  'One-off 2026-09-16 CL correction for JKKN College of Education, Jun-Aug 2026, '
  'against HR-supplied payroll figures. Batch 1 of a multi-institution correction. '
  'Not exposed to the API -- applied directly via migration tooling only.';

-- This lever is not meant to be called from the app at all -- it is a
-- documented, re-runnable fixture, applied once via migration tooling with a
-- dry run first. Unlike fn_hr_cl_reset_2026_27 it is not wired to any UI card,
-- so it stays fully revoked rather than gated on is_super_admin().
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_education(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_education(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_education(boolean) FROM authenticated;
