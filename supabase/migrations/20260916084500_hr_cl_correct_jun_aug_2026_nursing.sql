-- ============================================================================
-- ONE-OFF REPAIR -- Casual Leave, Jun-Aug 2026, JKKN College of Nursing and
-- Research. Created: 2026-09-16. Batch 3, following the Education/Pharmacy
-- pattern (20260916070100, 20260916080000).
--
-- SOURCE: "Paid Leave Summary Jun-Aug 2026 - Nursing.xlsx" (25 rows). Matched
-- by name, not the sheet's Employee Id column (unreliable, confirmed again).
-- 3 rows needed zero correction (Vimala V already matched exactly; Vaisali and
-- Nithyashree S are recent joiners whose only definite Excel cell, August,
-- already reads 0). 1 row (Saranya R) belongs to a different institution
-- (JKKN Matric Higher Secondary School) but her entire row is "-"/"-"/0, so no
-- write is needed for her regardless of institution.
--
-- MECHANISM: identical to prior batches. hr_leave_month_entries overrides
-- only; no institution here has a locked Jun-Aug 2026 period (checked fresh),
-- but overrides remain the safe path regardless since Pharmacy/Education both
-- showed corrected totals routinely exceed what hr_trig_leave_enforce_balance
-- would allow a real application to claim. June carries NO evidence -- zero
-- hr_attendance_records exist for June 2026 at this institution, same gap as
-- both prior batches.
--
-- 1 real, currently-approved application gets REJECTED (not just overridden
-- away): Saranya M (CNR007), 4 Aug, 1 day -- her August target is 0 and that
-- day is the entire reason her current August reads 1.
--
-- 2 fresh CL balance rows are created (Bhavadharani S, Mythili B -- both
-- inactive, no staff_id, same shape as every prior batch's fresh-row cases).
--
-- `used` IS SET WITH THE FULL FORMULA FROM THE START THIS TIME: SUM(month
-- entries) + SUM(approved applications in months NOT covered by an entry).
-- The Pharmacy batch (20260916080500) found that summing entries alone
-- silently drops anyone whose current-month figure comes from a real,
-- un-overridden approved application that already matched its target (e.g.
-- Radha S's 1 Aug, Chitra P's 5 Aug, Vimala V's 14 Aug here all fall in that
-- category) -- this migration does not repeat that mistake.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_correct_2026_jun_aug_nursing(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_year_id    uuid;
  v_frozen     timestamptz;
  v_actor      uuid;
  v_org        constant uuid := '179a922c-1a9e-4e60-a674-3a7216cc5928';
  v_cl         constant uuid := '64e6a1b1-dfe5-4392-8abb-d780e31dfa70';
  v_reason_pfx constant text :=
    'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (JKKN College of Nursing and Research).';
  v_before     jsonb;
  v_after      jsonb;
  v_targets    jsonb;
  v_rejected   jsonb;
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

  SELECT COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in'))
    INTO v_actor;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No actor to attribute this correction to' USING ERRCODE = 'P0001';
  END IF;

  CREATE TEMP TABLE _target (
    employee_id             uuid,
    leave_type_id           uuid,
    hr_organization_id      uuid,
    month_start             date,
    days                    numeric,
    evidence_dates          date[],
    existing_approved_days  numeric,
    staff_code              text
  ) ON COMMIT DROP;

  INSERT INTO _target
    (employee_id, leave_type_id, hr_organization_id, month_start, days, evidence_dates, existing_approved_days, staff_code)
  VALUES
  ('2e66c464-f728-4b94-b251-1e08fd4b87fe', v_cl, v_org, DATE '2026-07-01', 3.5, ARRAY[DATE '2026-07-02',DATE '2026-07-03',DATE '2026-07-04',DATE '2026-07-06']::date[], 0, 'CNR001'),
  ('2e66c464-f728-4b94-b251-1e08fd4b87fe', v_cl, v_org, DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-06']::date[], 1, 'CNR001'),
  ('053c60e5-f366-4ac2-8668-724c131eacf8', v_cl, v_org, DATE '2026-07-01', 1.5, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'CNR002'),
  ('053c60e5-f366-4ac2-8668-724c131eacf8', v_cl, v_org, DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-14']::date[], 0, 'CNR002'),
  ('2e8499d9-802d-45bd-a857-d3d85b2516de', v_cl, v_org, DATE '2026-06-01', 2.5, NULL::date[], 0, 'CNR005'),
  ('2e8499d9-802d-45bd-a857-d3d85b2516de', v_cl, v_org, DATE '2026-07-01', 0, NULL::date[], 0, 'CNR005'),
  ('173770ab-d9ee-42e0-ba32-7fa48f0f8c93', v_cl, v_org, DATE '2026-06-01', 0, NULL::date[], 0, 'CNR003'),
  ('173770ab-d9ee-42e0-ba32-7fa48f0f8c93', v_cl, v_org, DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'CNR003'),
  ('e9864fa6-192a-4e81-ac6c-540f5a75e926', v_cl, v_org, DATE '2026-06-01', 2, NULL::date[], 0, 'CNR004'),
  ('e9864fa6-192a-4e81-ac6c-540f5a75e926', v_cl, v_org, DATE '2026-07-01', 0, NULL::date[], 0, 'CNR004'),
  ('7e7e6a24-5f4d-43e9-9c50-4660d0d1ac21', v_cl, v_org, DATE '2026-06-01', 2.5, NULL::date[], 0, 'CNR009'),
  ('d5694522-0f19-4639-b24c-17c31b0ce819', v_cl, v_org, DATE '2026-06-01', 2.5, NULL::date[], 0, 'CNR006'),
  ('d5694522-0f19-4639-b24c-17c31b0ce819', v_cl, v_org, DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05']::date[], 1, 'CNR006'),
  ('68d19968-52ec-4851-90ed-a4c692a2f6f2', v_cl, v_org, DATE '2026-06-01', 0.5, NULL::date[], 0, 'CNR007'),
  ('68d19968-52ec-4851-90ed-a4c692a2f6f2', v_cl, v_org, DATE '2026-07-01', 3, ARRAY[DATE '2026-07-02',DATE '2026-07-03',DATE '2026-07-04']::date[], 0, 'CNR007'),
  ('19817276-68e1-4589-9986-803576451d43', v_cl, v_org, DATE '2026-06-01', 3, NULL::date[], 0, 'CNR008'),
  ('19817276-68e1-4589-9986-803576451d43', v_cl, v_org, DATE '2026-07-01', 0, NULL::date[], 0, 'CNR008'),
  ('10d8e57d-cde8-43c8-a26d-a73b3d70d525', v_cl, v_org, DATE '2026-06-01', 2, NULL::date[], 0, 'CNR010'),
  ('10d8e57d-cde8-43c8-a26d-a73b3d70d525', v_cl, v_org, DATE '2026-07-01', 3, ARRAY[DATE '2026-07-01',DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'CNR010'),
  ('dcf974da-23b9-4b7c-bb6f-d957e06dfb20', v_cl, v_org, DATE '2026-06-01', 1.5, NULL::date[], 0, 'CNR011'),
  ('dcf974da-23b9-4b7c-bb6f-d957e06dfb20', v_cl, v_org, DATE '2026-07-01', 2.5, ARRAY[DATE '2026-07-02',DATE '2026-07-03',DATE '2026-07-04']::date[], 0, 'CNR011'),
  ('199c0bea-1b03-4467-8bc5-9100a40fb5b9', v_cl, v_org, DATE '2026-07-01', 3, NULL::date[], 0, 'CNR012'),
  ('199c0bea-1b03-4467-8bc5-9100a40fb5b9', v_cl, v_org, DATE '2026-08-01', 1, ARRAY[DATE '2026-08-19']::date[], 0.5, 'CNR012'),
  ('94c9be4b-8ef0-40cd-835a-5ae7a0a41904', v_cl, v_org, DATE '2026-06-01', 1, NULL::date[], 0, 'BHAVADHARANI'),
  ('168431d2-ca87-4197-8042-2f1c3dab555f', v_cl, v_org, DATE '2026-06-01', 0.5, NULL::date[], 0, 'MYTHILI'),
  ('168431d2-ca87-4197-8042-2f1c3dab555f', v_cl, v_org, DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'MYTHILI'),
  ('643dbac9-c07b-43f6-9eeb-844e0ad7df49', v_cl, v_org, DATE '2026-08-01', 2, ARRAY[DATE '2026-08-06']::date[], 1, 'CNR013'),
  ('9d0c4b4a-2028-4e2c-bb01-d41daab6d30b', v_cl, v_org, DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'CNR014'),
  ('d876b57c-f7c1-4358-8557-03450e313e4a', v_cl, v_org, DATE '2026-06-01', 2.5, NULL::date[], 0, 'CNR015'),
  ('d876b57c-f7c1-4358-8557-03450e313e4a', v_cl, v_org, DATE '2026-07-01', 0, NULL::date[], 0, 'CNR015'),
  ('c543cc36-5caa-472f-b28d-6886269bca95', v_cl, v_org, DATE '2026-06-01', 1.5, NULL::date[], 0, 'CNR016'),
  ('c543cc36-5caa-472f-b28d-6886269bca95', v_cl, v_org, DATE '2026-08-01', 1, ARRAY[DATE '2026-08-22']::date[], 0.5, 'CNR016'),
  ('2eb8c40a-261d-4c10-a485-e42dda55d573', v_cl, v_org, DATE '2026-08-01', 2, ARRAY[DATE '2026-08-27',DATE '2026-08-07']::date[], 1, 'CNR018'),
  ('838116c5-2524-4818-ac72-18661f8588dd', v_cl, v_org, DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'CNR019'),
  ('838116c5-2524-4818-ac72-18661f8588dd', v_cl, v_org, DATE '2026-08-01', 2, ARRAY[DATE '2026-08-01',DATE '2026-08-31']::date[], 0.5, 'CNR019'),
  ('703e94c9-0df7-4430-9c06-a519d15bc253', v_cl, v_org, DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCNR002'),
  ('703e94c9-0df7-4430-9c06-a519d15bc253', v_cl, v_org, DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCNR002'),
  ('703e94c9-0df7-4430-9c06-a519d15bc253', v_cl, v_org, DATE '2026-08-01', 1, NULL::date[], 0, 'NOTCNR002');

  CREATE TEMP TABLE _reject (
    employee_id   uuid,
    leave_type_id uuid,
    start_date    date
  ) ON COMMIT DROP;

  INSERT INTO _reject (employee_id, leave_type_id, start_date) VALUES
  ('68d19968-52ec-4851-90ed-a4c692a2f6f2', v_cl, DATE '2026-08-04');

  INSERT INTO public.hr_leave_balances (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    entitled, used, carried_forward)
  SELECT DISTINCT tg.employee_id, tg.leave_type_id, v_year_id, tg.hr_organization_id, NULL::numeric, 0::numeric, 0::numeric
  FROM _target tg
  WHERE tg.staff_code IN ('BHAVADHARANI','MYTHILI')
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'used', used) ORDER BY employee_id)
    INTO v_before
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id AND leave_type_id = v_cl
    AND employee_id IN (SELECT DISTINCT employee_id FROM _target UNION SELECT DISTINCT employee_id FROM _reject);

  SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.staff_code, tg.month_start) INTO v_targets FROM _target tg;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'batch', 'JKKN College of Nursing and Research',
      'target_rows', (SELECT COUNT(*) FROM _target), 'reject_rows', (SELECT COUNT(*) FROM _reject),
      'targets', v_targets, 'balances_before', v_before);
  END IF;

  UPDATE public.hr_leave_applications a
     SET status = 'rejected',
         rejection_reason = v_reason_pfx || ' Corrected to 0 days for this month; superseded by the payroll-verified figure.',
         updated_at = now()
    FROM _reject r
   WHERE a.employee_id = r.employee_id
     AND a.leave_type_id = r.leave_type_id
     AND a.start_date = r.start_date
     AND a.status = 'approved';

  SELECT jsonb_agg(jsonb_build_object('employee_id', r.employee_id, 'date', r.start_date)) INTO v_rejected FROM _reject r;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT tg.employee_id, tg.leave_type_id, v_year_id, tg.hr_organization_id,
         'set_month_entry',
         jsonb_build_object('month', tg.month_start,
           'total', COALESCE((SELECT e.days FROM public.hr_leave_month_entries e
                                WHERE e.employee_id = tg.employee_id AND e.leave_type_id = tg.leave_type_id
                                  AND e.hr_academic_year_id = v_year_id
                                  AND e.month_start = tg.month_start), tg.existing_approved_days)),
         jsonb_build_object('month', tg.month_start, 'total', tg.days, 'evidence_dates', to_jsonb(tg.evidence_dates)),
         v_reason_pfx || ' (' || tg.staff_code || ')', v_actor
  FROM _target tg;

  INSERT INTO public.hr_leave_month_entries (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    month_start, days, added_days, evidence_dates, reason, created_by)
  SELECT tg.employee_id, tg.leave_type_id, v_year_id, tg.hr_organization_id,
         tg.month_start, tg.days, tg.days - tg.existing_approved_days,
         tg.evidence_dates, v_reason_pfx || ' (' || tg.staff_code || ')', v_actor
  FROM _target tg
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
  DO UPDATE SET
    days           = EXCLUDED.days,
    added_days     = EXCLUDED.added_days,
    evidence_dates = EXCLUDED.evidence_dates,
    reason         = EXCLUDED.reason,
    updated_at     = now();

  -- `used`, absolutely -- FULL formula (entries + approved apps not covered by
  -- an entry), for every touched employee including reject-only ones. See
  -- header: this is what 20260916080500 had to patch on for Pharmacy.
  UPDATE public.hr_leave_balances b
     SET used = COALESCE((
           SELECT SUM(e.days) FROM public.hr_leave_month_entries e
            WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
              AND e.hr_academic_year_id = v_year_id), 0)
         + COALESCE((
           SELECT SUM(a.total_days) FROM public.hr_leave_applications a
            WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
              AND a.hr_academic_year_id = v_year_id AND a.status = 'approved'
              AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                                WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                  AND e2.hr_academic_year_id = v_year_id
                                  AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
         updated_at = now()
   WHERE b.hr_academic_year_id = v_year_id AND b.leave_type_id = v_cl
     AND b.employee_id IN (SELECT DISTINCT employee_id FROM _target UNION SELECT DISTINCT employee_id FROM _reject);

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT bef.employee_id, v_cl, v_year_id, v_org,
         'set_used',
         jsonb_build_object('used', bef.used),
         jsonb_build_object('used', b.used),
         v_reason_pfx, v_actor
  FROM jsonb_to_recordset(v_before) AS bef(employee_id uuid, used numeric)
  JOIN public.hr_leave_balances b
    ON b.employee_id = bef.employee_id AND b.leave_type_id = v_cl
   AND b.hr_academic_year_id = v_year_id
  WHERE bef.used IS DISTINCT FROM b.used;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'used', used) ORDER BY employee_id)
    INTO v_after
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id AND leave_type_id = v_cl
    AND employee_id IN (SELECT DISTINCT employee_id FROM _target UNION SELECT DISTINCT employee_id FROM _reject);

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027', 'batch', 'JKKN College of Nursing and Research',
    'rejected', v_rejected, 'balances_before', v_before, 'balances_after', v_after);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_nursing(boolean) IS
  'One-off 2026-09-16 CL correction for JKKN College of Nursing and Research, Jun-Aug 2026. '
  'Batch 3 of a multi-institution correction. Not exposed to the API -- applied directly via migration tooling only.';

REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_nursing(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_nursing(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_nursing(boolean) FROM authenticated;
