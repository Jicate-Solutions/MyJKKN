-- ============================================================================
-- ONE-OFF REPAIR -- Casual Leave, Jun-Aug 2026, JKKN College of Arts and
-- Science (Self) + 2 Main Office spillover staff. Created: 2026-09-16.
-- Batch 4, following the Education/Pharmacy/Nursing pattern.
--
-- SOURCE: "Arts Paid Leave Summary Jun-Aug 2026.xlsx" (66 rows, NO Employee Id
-- column at all -- matched purely by name). Sheet title "J.K.K.NATARAJA
-- COLLEGE OF ARTS &SCIENCE" resolves to institution "JKKN College of Arts and
-- Science (Self)" (NOT the separate "...(Aided)" institution -- confirmed by
-- matching all 66 names against staff at both and finding the overwhelming
-- majority, including every unambiguous case, at Self).
--
-- 2 names (Gobinath K, Ketharnath B) belong to JKKN Main Office, not this
-- institution -- same cross-institution spillover pattern as Pharmacy.
-- 8 people needed ZERO correction (already matched exactly): Priyanka P,
-- Punithamalar M.S, Lingameena N, Sridhar K, Kayathri S, Sathya V, Kowshika K,
-- Krishnapriya K.
-- "Nandhini G" (row 47, 0/1.5/1) and "Nandhini Guna" (row 59, 0/1/1) are
-- resolved as two DIFFERENT people: the DB has two staff both literally named
-- "Nandhini" "G" (CAS053 active joined 3 Jun, CAS066 inactive joined 15 Jun)
-- -- "Guna" on the sheet is read as payroll's own disambiguator for the
-- second one. CAS066 needed zero correction; CAS053 needed changes (below).
-- "Gomathi M" resolved to NOTCAS013 (active, already has reset-era Jun/Jul
-- entries) over a same-named inactive, staff_id-less decoy with no HR data.
--
-- MECHANISM: identical to prior batches -- hr_leave_month_entries overrides
-- only, June carries no evidence (zero hr_attendance_records for June 2026 at
-- this institution, same gap every batch has had), July/August evidence from
-- real LOP days where they exist. NO application rejections were needed this
-- batch -- every target of 0 already had a current value of 0 or came from an
-- admin override (never a real approved application), so nothing had to be
-- rejected outright.
--
-- `used` uses the full formula from the start (entries + approved apps not
-- covered by an entry) -- the fix Pharmacy needed applied from day one, same
-- as Nursing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_correct_2026_jun_aug_arts(p_dry_run boolean DEFAULT true)
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
    'Payroll-verified per Arts Paid Leave Summary Jun-Aug 2026 (JKKN College of Arts and Science - Self).';
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
  ('b20646ac-d425-4f1a-a33a-4ba15c096f79', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS061'),
  ('b20646ac-d425-4f1a-a33a-4ba15c096f79', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-18']::date[], 0, 'CAS061'),
  ('b9857b92-727b-4568-bdb8-f622b9844c4e', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0.5, NULL::date[], 0, 'CAS004'),
  ('b9857b92-727b-4568-bdb8-f622b9844c4e', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 1, ARRAY[DATE '2026-07-04']::date[], 0, 'CAS004'),
  ('92edd819-5420-4042-9376-601cc1aa05e3', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 1, NULL::date[], 0, 'CAS007'),
  ('6bcec7e8-b438-4df8-9623-339ead4ffceb', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS015'),
  ('6bcec7e8-b438-4df8-9623-339ead4ffceb', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-11',DATE '2026-08-17']::date[], 1, 'CAS015'),
  ('f05d2ffe-bbd4-4dfc-bbe2-23463dbd7f2c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS017'),
  ('f05d2ffe-bbd4-4dfc-bbe2-23463dbd7f2c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS017'),
  ('f05d2ffe-bbd4-4dfc-bbe2-23463dbd7f2c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-28',DATE '2026-08-01']::date[], 1, 'CAS017'),
  ('cb31d013-9332-44ca-8c14-2f905b1d134c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-08']::date[], 0, 'CAS019'),
  ('cb31d013-9332-44ca-8c14-2f905b1d134c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-19']::date[], 1, 'CAS019'),
  ('9f9b9b51-da83-4592-b16c-1e6396c0ea07', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-01',DATE '2026-07-04']::date[], 0, 'CAS003'),
  ('894172fc-2e4e-4c5a-a5ac-4515e876839e', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS022'),
  ('5e3f649e-ef69-47a9-aad4-f38d739269b5', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-06',DATE '2026-08-07']::date[], 1, 'CAS026'),
  ('2426cfd5-ebf8-4e54-963e-5d1449b395a0', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS014'),
  ('2426cfd5-ebf8-4e54-963e-5d1449b395a0', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-03',DATE '2026-07-04']::date[], 0, 'CAS014'),
  ('2426cfd5-ebf8-4e54-963e-5d1449b395a0', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-22']::date[], 0, 'CAS014'),
  ('c6e6a9c4-95fb-4239-9e14-f403101abe75', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 2, NULL::date[], 0, 'CAS027'),
  ('7a602aef-6d7e-4808-957f-84852f28d924', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-01']::date[], 0, 'CAS009'),
  ('5ca0ec8b-4b90-4944-af10-d0a7f12b42f3', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0.5, NULL::date[], 0, 'CAS010'),
  ('5ca0ec8b-4b90-4944-af10-d0a7f12b42f3', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-25']::date[], 0, 'CAS010'),
  ('d39d8988-2b45-41e7-8470-bc21c16cf4bf', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0.5, NULL::date[], 0, 'CAS013'),
  ('d39d8988-2b45-41e7-8470-bc21c16cf4bf', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-16']::date[], 0, 'CAS013'),
  ('fb6e0ecc-a2b7-4ba8-ae63-bcec4d5208d8', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 1.5, NULL::date[], 0, 'CAS024'),
  ('fb6e0ecc-a2b7-4ba8-ae63-bcec4d5208d8', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-18']::date[], 1, 'CAS024'),
  ('7c0b53e5-c8f6-497f-aafb-7d32b046ac64', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-24',DATE '2026-08-10']::date[], 1, 'CAS008'),
  ('7ade0ee7-bd2b-478d-bd7c-95a61f335198', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS011'),
  ('7ade0ee7-bd2b-478d-bd7c-95a61f335198', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS011'),
  ('89201971-1bce-456c-82fa-64e6343e27f3', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-24',DATE '2026-08-19']::date[], 1, 'CAS023'),
  ('9c66055f-6059-48c2-b358-d4eca42d067f', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS029'),
  ('9c66055f-6059-48c2-b358-d4eca42d067f', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS029'),
  ('22096535-770a-4820-9e2a-7b9add514f30', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-08',DATE '2026-08-10']::date[], 1, 'CAS030'),
  ('d1ec09eb-e10a-4d25-bfe0-07c88c7f4a04', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 1.5, NULL::date[], 0, 'CAS034'),
  ('d1ec09eb-e10a-4d25-bfe0-07c88c7f4a04', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-14']::date[], 0, 'CAS034'),
  ('864dbd24-6bc9-4f74-8be7-77b10041829a', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 1.5, ARRAY[DATE '2026-07-03',DATE '2026-07-04']::date[], 0, 'CAS035'),
  ('864dbd24-6bc9-4f74-8be7-77b10041829a', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-08']::date[], 0, 'CAS035'),
  ('1f7f6080-fe6a-4340-92e2-879488fc24d1', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0.5, NULL::date[], 0, 'CAS037'),
  ('1f7f6080-fe6a-4340-92e2-879488fc24d1', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS037'),
  ('1f7f6080-fe6a-4340-92e2-879488fc24d1', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-22']::date[], 0.5, 'CAS037'),
  ('533ed5b8-c9b6-4c7d-ae3a-065c293ce66b', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-10']::date[], 1, 'CAS038'),
  ('798aedf0-3a63-4397-9960-7ddbd478b49f', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-01',DATE '2026-07-02']::date[], 0, 'CAS043'),
  ('798aedf0-3a63-4397-9960-7ddbd478b49f', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-27']::date[], 1, 'CAS043'),
  ('b92eeed6-7409-446f-8d08-c5e55c012b06', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS044'),
  ('b92eeed6-7409-446f-8d08-c5e55c012b06', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-01',DATE '2026-08-29']::date[], 1, 'CAS044'),
  ('28a731dc-c313-4b0b-a5cc-a651be9dd881', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-22',DATE '2026-08-01']::date[], 1, 'CAS002'),
  ('bcabd570-55cf-4b38-b5ab-31277fa2d008', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, NULL::date[], 0, 'CAS039'),
  ('47d96f21-f593-40f3-bf2d-15a870cefc24', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS050'),
  ('cb28b6b8-358a-4940-a4a1-793ea2632037', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 0.5, ARRAY[DATE '2026-08-24']::date[], 0, 'CAS005'),
  ('77c4896c-879d-48f1-aff9-28bf9145ed3b', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS056'),
  ('77c4896c-879d-48f1-aff9-28bf9145ed3b', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS056'),
  ('77c4896c-879d-48f1-aff9-28bf9145ed3b', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-10']::date[], 0, 'CAS056'),
  ('29a55a6e-f564-4723-a353-00190ab4b4d2', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS053'),
  ('29a55a6e-f564-4723-a353-00190ab4b4d2', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 1.5, ARRAY[DATE '2026-07-04',DATE '2026-07-23']::date[], 0, 'CAS053'),
  ('29a55a6e-f564-4723-a353-00190ab4b4d2', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-01']::date[], 0, 'CAS053'),
  ('fc2c711d-b195-4b84-8b0c-3ba9004363a9', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-04']::date[], 0, 'CAS052'),
  ('67763edb-f6c9-4f69-ab99-cb09a78a192d', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-06-01', 0, NULL::date[], 0, 'CAS058'),
  ('67763edb-f6c9-4f69-ab99-cb09a78a192d', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-11']::date[], 0, 'CAS058'),
  ('67763edb-f6c9-4f69-ab99-cb09a78a192d', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-05']::date[], 0, 'CAS058'),
  ('bcd66200-7bde-4a63-9575-0752e15aef77', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-01',DATE '2026-07-04']::date[], 0, 'CAS057'),
  ('bcd66200-7bde-4a63-9575-0752e15aef77', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-13']::date[], 0, 'CAS057'),
  ('74e9f4cf-d9a1-4a17-a542-f3e26ddfffb0', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-12']::date[], 0, 'CAS059'),
  ('76fe78a6-8804-4580-99be-ede47d4a2a88', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-04']::date[], 0, 'CAS063'),
  ('a1cb01f0-cbbb-4cd6-9980-e743109f0b26', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0.5, ARRAY[DATE '2026-07-04']::date[], 0, 'CAS064'),
  ('a1cb01f0-cbbb-4cd6-9980-e743109f0b26', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-14']::date[], 0, 'CAS064'),
  ('0bf6055c-bda2-4d07-86f8-0c34d3700a82', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-24']::date[], 0, 'CAS065'),
  ('aa7c8ed5-e0de-48d0-beee-6fc000d776fd', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 3, ARRAY[DATE '2026-07-04',DATE '2026-07-13',DATE '2026-07-17']::date[], 0, 'NOTCAS013'),
  ('aa7c8ed5-e0de-48d0-beee-6fc000d776fd', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-04',DATE '2026-08-05']::date[], 0, 'NOTCAS013'),
  ('9adf25d1-2ae4-4755-9aae-875f685982e0', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, NULL::date[], 0, 'GOBINATH'),
  ('29140c61-b261-4e44-83f9-6b5e37bae830', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0, NULL::date[], 0, 'KETHARNATH'),
  ('29140c61-b261-4e44-83f9-6b5e37bae830', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, NULL::date[], 0, 'KETHARNATH'),
  ('9e0e42b9-0115-4bea-b963-600842f2857c', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS068'),
  ('1de71316-7666-4273-81e5-ab485a2eb346', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'CAS067'),
  ('c143596f-1eee-4929-bae2-b1cf5bb9a7a6', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCAS015'),
  ('c143596f-1eee-4929-bae2-b1cf5bb9a7a6', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-10',DATE '2026-08-05']::date[], 1, 'NOTCAS015');

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'leave_type_id', leave_type_id, 'used', used) ORDER BY employee_id)
    INTO v_before
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id
    AND (employee_id, leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target);

  SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.staff_code, tg.month_start) INTO v_targets FROM _target tg;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'batch', 'JKKN College of Arts and Science (Self) + Main Office spillover',
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
     AND b.employee_id IN (SELECT DISTINCT employee_id FROM _target)
     AND b.leave_type_id IN (SELECT DISTINCT leave_type_id FROM _target);

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
    'dry_run', false, 'academic_year', '2026-2027', 'batch', 'JKKN College of Arts and Science (Self) + Main Office spillover',
    'balances_before', v_before, 'balances_after', v_after);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_arts(boolean) IS
  'One-off 2026-09-16 CL correction for JKKN College of Arts and Science (Self) plus 2 Main Office spillover staff, Jun-Aug 2026. '
  'Batch 4 of a multi-institution correction. Not exposed to the API -- applied directly via migration tooling only.';

REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_arts(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_arts(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_arts(boolean) FROM authenticated;
