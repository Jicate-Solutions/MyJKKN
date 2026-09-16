-- ============================================================================
-- ONE-OFF REPAIR -- Casual Leave, Jun-Aug 2026, JKKN Main Office + Jicate
-- Solutions + Engineering (CET) + Dental (DCH) spillover. Created: 2026-09-16.
-- Batch 5, following the Education/Pharmacy/Nursing/Arts pattern.
--
-- SOURCE: "Paid Leave Summary Jun-Aug 2026 - Main Office All Staff.xlsx" (51
-- rows). Sheet title claims Main Office, but the Employee Id prefixes span
-- 4 real institutions -- CET (Engineering), DCH (Dental), and one bogus
-- prefix "DTO" that resolves to a real Engineering staff member (Ranjith K,
-- NOTCET008) rather than a separate institution.
--
-- OVERLAP WITH PRIOR BATCHES: many names here were already corrected as
-- Main-Office/Jicate spillover in the Pharmacy batch (Ranganathan K, Saveetha
-- K, Balamurugan B, Hari N, Hariraj N, Suwetha B, Selvamani N, Gokul V,
-- Dhanalakshmi M, and the 5 Jicate people below) and the Arts batch (Gobinath
-- K, Ketharnath B). Verified each of these against this sheet:
--   - Ranganathan K, Saveetha K, Hari N, Hariraj N, Suwetha B, Selvamani N,
--     Gokul V, Gobinath K, Ketharnath B, Dhanalakshmi M, Balamurugan B:
--     MATCH exactly (Balamurugan's apparent mismatch was a manual-arithmetic
--     error in verification, not a real discrepancy -- his real total already
--     reconciles once you account for which months are override-covered).
--   - Santhiya G: this sheet says June=0, but June=1 is already applied from
--     Pharmacy (unchanged there because it matched at the time). Per explicit
--     user decision, LEFT AS 1 -- not touched by this migration.
--   - Deepak Kumar A, Kalaiyarasan M, Kayalvizhi S, Janani G, Dhineshkumar B
--     (all Jicate): this sheet's July figure is LOWER than what Pharmacy
--     already applied (July=1) for all 5. Per explicit user decision, these 5
--     are SKIPPED ENTIRELY by this migration -- not touched, pending
--     clarification with whoever compiled the source sheets.
--   - Abarna P and Nandhini R on this sheet are the SAME people as Pharmacy's
--     NOTCOP012/NOTCOP029 (Pharmacy institution), not separate Main Office
--     staff -- already corrected, no new action.
--
-- Also found (not part of this migration, just noted): several staff hold a
-- second, stray CL balance row under an institution they don't work at --
-- e.g. Selvamani N has balance rows tagged Jicate AND Main Office AND
-- Pharmacy; only the Main Office one is real for him. Pre-existing artifact
-- from the original broad balance-generation run, untouched here.
--
-- Radhakrishnan T did not match on a plain name search (the fork that did
-- recon reported him unresolved) -- resolved directly: "MR. RADHA KRISHNAN T"
-- (space between "Radha" and "Krishnan"), staff_id NOTJMO025.
--
-- MECHANISM: identical to prior batches. hr_leave_month_entries overrides
-- only -- JKKN Main Office's July 2026 is locked (same as it was for the
-- Pharmacy batch), so real applications are not an option there regardless.
-- June carries no evidence (zero hr_attendance_records for June 2026, same
-- gap every batch has had, confirmed again for these institutions). `used`
-- uses the full formula from the start (entries + approved apps not covered
-- by an entry).
--
-- 9 people needed ZERO correction after verification (already matched
-- exactly): Kokila B, Mahasri V, Roja Sundaram, Thirumurugan C, Boobalan A,
-- Sathyanand S.S, Mohanraj V, Rajakrishnan V, Sripriya.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_correct_2026_jun_aug_mainoffice(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_year_id    uuid;
  v_frozen     timestamptz;
  v_actor      uuid;
  v_reason_pfx constant text :=
    'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Main Office All Staff sheet).';
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
  ('b631d1a7-9b6a-4488-bbe8-301f04c12122', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCET001'),
  ('b631d1a7-9b6a-4488-bbe8-301f04c12122', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCET001'),
  ('b631d1a7-9b6a-4488-bbe8-301f04c12122', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-13']::date[], 1, 'NOTCET001'),
  ('0bc5f5bd-0643-4279-9622-fdebff081ff5', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCET013'),
  ('a7227bd0-d548-49a4-b7d3-fb76ce90f798', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 1.5, NULL::date[], 0, 'NOTJMO069'),
  ('df1ef62b-f171-43da-9aaa-8981ef5a3712', '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad', '96fb95a4-ef15-46c4-95e1-1078f94a39bd', DATE '2026-06-01', 0, NULL::date[], 0, 'DCH060'),
  ('df1ef62b-f171-43da-9aaa-8981ef5a3712', '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad', '96fb95a4-ef15-46c4-95e1-1078f94a39bd', DATE '2026-07-01', 0, NULL::date[], 0, 'DCH060'),
  ('dfa24479-4685-4ee6-b631-026e898c84ae', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-06-01', 2, NULL::date[], 0, 'NOTCET008'),
  ('dfa24479-4685-4ee6-b631-026e898c84ae', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCET008'),
  ('16c0ba17-c55a-4aaf-af7e-69c75f7302f6', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', 'e1b742e8-4acb-4956-a320-4d2a1ae4f95b', DATE '2026-06-01', 1.5, NULL::date[], 0, 'NOTJIC001'),
  ('16c0ba17-c55a-4aaf-af7e-69c75f7302f6', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', 'e1b742e8-4acb-4956-a320-4d2a1ae4f95b', DATE '2026-07-01', 3, ARRAY[DATE '2026-07-07',DATE '2026-07-17']::date[], 0, 'NOTJIC001'),
  ('4fb867ef-fec5-489d-8335-3795c4ceb43a', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', 'e1b742e8-4acb-4956-a320-4d2a1ae4f95b', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-01']::date[], 0, 'NOTJIC003'),
  ('0604ad89-94c5-4fd4-b377-d9ce4f715d2d', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', 'e1b742e8-4acb-4956-a320-4d2a1ae4f95b', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-22',DATE '2026-08-08']::date[], 1, 'NOTJIC006'),
  ('b8d4a304-3f48-4d03-894c-7fbe8aedd994', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTJMO007'),
  ('3cff833f-8eb8-42df-9087-d507017be238', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTJMO053'),
  ('3cff833f-8eb8-42df-9087-d507017be238', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-05']::date[], 0.5, 'NOTJMO053'),
  ('cf790591-943c-4ff0-b172-cd9aed8bd4de', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-10']::date[], 0, 'NOTJMO051'),
  ('3407ccf7-938c-4e80-8828-4ce49df0c276', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0.5, NULL::date[], 0, 'NOTJMO036'),
  ('3407ccf7-938c-4e80-8828-4ce49df0c276', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 3, NULL::date[], 0, 'NOTJMO036'),
  ('3407ccf7-938c-4e80-8828-4ce49df0c276', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-01',DATE '2026-08-22']::date[], 1, 'NOTJMO036'),
  ('55e08380-1d1a-42b2-a22c-98405c3faab3', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-18',DATE '2026-07-20']::date[], 2, 'NOTJMO042'),
  ('5321e18b-7659-43a9-b058-f8111792a67b', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 1.5, ARRAY[DATE '2026-07-28']::date[], 1, 'NOTJMO055'),
  ('4b50cfc0-54ff-4f25-a0f6-0ec8d6fd8e86', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTJMO062'),
  ('4b50cfc0-54ff-4f25-a0f6-0ec8d6fd8e86', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0.5, NULL::date[], 0, 'NOTJMO062'),
  ('4b50cfc0-54ff-4f25-a0f6-0ec8d6fd8e86', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-19',DATE '2026-08-10']::date[], 1, 'NOTJMO062'),
  ('23581b57-7f24-44b5-8bcd-48f240ec6cf5', 'ca9242bd-2abf-48f8-8f8d-bae685ec4448', 'af210159-723c-4da2-9663-19f464d8c64e', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCET017'),
  ('b19047ff-a6c8-45e2-be38-a2edf23f976f', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-27']::date[], 0, 'NOTJMO084'),
  ('e900e110-2f5c-4515-9c7e-fe204d06d712', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTJMO085'),
  ('e900e110-2f5c-4515-9c7e-fe204d06d712', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTJMO085'),
  ('806dc21d-8908-474b-bb3a-e5764cb20b4e', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 2, NULL::date[], 0, 'NOTJMO088'),
  ('806dc21d-8908-474b-bb3a-e5764cb20b4e', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTJMO088'),
  ('4d56aac6-d143-479d-8396-65930439c983', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 4, NULL::date[], 0, 'NOTJMO025'),
  ('4d56aac6-d143-479d-8396-65930439c983', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0.5, NULL::date[], 0, 'NOTJMO025'),
  ('91370998-7d43-4806-b63e-6c8e39dbc1f2', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-10']::date[], 0, 'NOTJMO072');

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'leave_type_id', leave_type_id, 'used', used) ORDER BY employee_id)
    INTO v_before
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id
    AND (employee_id, leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target);

  SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.staff_code, tg.month_start) INTO v_targets FROM _target tg;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'batch', 'Main Office + Jicate + Engineering + Dental spillover',
      'target_rows', (SELECT COUNT(*) FROM _target),
      'targets', v_targets, 'balances_before', v_before);
  END IF;

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
   WHERE b.hr_academic_year_id = v_year_id
     AND EXISTS (SELECT 1 FROM _target tg
                  WHERE tg.employee_id = b.employee_id AND tg.leave_type_id = b.leave_type_id);
     -- Paired EXISTS, not two independent INs: this batch spans 4 different
     -- leave_type_ids (Main Office/Jicate/CET/DCH), and several staff hold a
     -- stray CL balance row under an institution they don't work at (see
     -- header). Two independent INs would cross-match employee A's stray row
     -- under employee B's leave_type -- exactly the mistake found in the Arts
     -- batch's reconciliation-fix migration (Gobinath K's stray Arts row).

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT bef.employee_id, bef.leave_type_id, v_year_id,
         (SELECT hr_organization_id FROM public.hr_leave_balances b2
           WHERE b2.employee_id = bef.employee_id AND b2.leave_type_id = bef.leave_type_id
             AND b2.hr_academic_year_id = v_year_id),
         'set_used',
         jsonb_build_object('used', bef.used),
         jsonb_build_object('used', b.used),
         v_reason_pfx, v_actor
  FROM jsonb_to_recordset(v_before) AS bef(employee_id uuid, leave_type_id uuid, used numeric)
  JOIN public.hr_leave_balances b
    ON b.employee_id = bef.employee_id AND b.leave_type_id = bef.leave_type_id
   AND b.hr_academic_year_id = v_year_id
  WHERE bef.used IS DISTINCT FROM b.used;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'leave_type_id', leave_type_id, 'used', used) ORDER BY employee_id)
    INTO v_after
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id
    AND (employee_id, leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target);

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027', 'batch', 'Main Office + Jicate + Engineering + Dental spillover',
    'balances_before', v_before, 'balances_after', v_after);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_mainoffice(boolean) IS
  'One-off 2026-09-16 CL correction for Main Office + Jicate/Engineering/Dental spillover, Jun-Aug 2026. '
  'Batch 5 of a multi-institution correction. Not exposed to the API -- applied directly via migration tooling only.';

REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_mainoffice(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_mainoffice(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_mainoffice(boolean) FROM authenticated;
