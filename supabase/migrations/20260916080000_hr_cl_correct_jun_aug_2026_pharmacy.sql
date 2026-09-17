-- ============================================================================
-- ONE-OFF REPAIR -- Casual Leave, Jun-Aug 2026, JKKN College of Pharmacy
-- (+ spillover to JKKN Main Office / Jicate Solutions staff named on the same
-- payroll sheets). Created: 2026-09-16. Batch 2, following the Education
-- pattern (20260916070100 and friends).
--
-- SOURCE: "Paid Leave Summary Jun-Aug 2026 - Pharmacy Teaching staff.xlsx" and
-- "...Pharmacy Non Teaching.xlsx". 6 Teaching-sheet outliers held out pending
-- HR source verification (Lashika L.K, Prithiviraj A, Venkateshwaramoorthy N,
-- Sekar V, Venkateswaran V, Kranti Kumar P -- June figures don't reconcile
-- against any leave type on record). ~15 Non-Teaching rows resolved to their
-- REAL institution (Main Office / Jicate Solutions), not Pharmacy, per
-- Employee Id prefix + name match. 3 rows are moot (all-zero target,
-- ambiguous identity doesn't matter): Saravanan Jayaraman, Muthuvel,
-- R. Shanthi. "Arun M.S" on the Non-Teaching sheet applied to COP031... no,
-- to Dr. Arun M S (COP008, Teaching) per explicit user confirmation -- not a
-- second person.
--
-- MECHANISM: identical to the Education batch. hr_leave_month_entries
-- overrides only, never real hr_leave_applications inserts -- JKKN Main
-- Office's July 2026 is LOCKED (checked fresh for this batch), so any
-- Main-Office-July write to hr_leave_applications would hit
-- hr_trig_block_leave_in_locked_period with no bypass; Pharmacy/Jicate months
-- routinely exceed simple month-by-month accrual too, which
-- hr_trig_leave_enforce_balance would refuse as real applications. Evidence
-- dates use 20260916073000's evidence_dates date[] mechanism. June carries
-- NO evidence anywhere -- zero hr_attendance_records exist for June 2026 at
-- any of these institutions, same gap as Education.
--
-- NEW THIS BATCH: 3 real, currently-APPROVED applications get REJECTED
-- outright rather than just overridden away, because their month's target is
-- 0 and the current figure comes entirely from that one application (not an
-- admin override) -- Kamalesh Kumar A (COP038, Pharmacy) 24 Aug, Tamil Selvi V
-- (NOTCOP037, Pharmacy) 28 Aug, Janani G (NOTJIC009, Jicate) 10 Aug. Rejecting
-- an approved leave does NOT un-stamp attendance
-- (fn_recompute_attendance_on_leave_approval only fires on the transition TO
-- approved) -- these 3 dates stay LEAVE-stamped and Salary-Register-paid
-- until a separate attendance recompute runs; flagged to the user as a
-- required follow-up, not done here.
--
-- 2 fresh CL balance rows are created (Revanth R, Babykala M -- both
-- inactive, no staff_id, same shape as Education's Rajendiran).
--
-- `used` is set absolutely per employee as SUM(their CL month entries) for
-- this year -- valid here because every one of these employees' relevant
-- non-overridden applications is either being rejected above or already
-- excluded from the sum by virtue of the override existing for that month.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_correct_2026_jun_aug_pharmacy(p_dry_run boolean DEFAULT true)
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
    'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Pharmacy Teaching/Non-Teaching sheets).';
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
  ('334da7d4-af07-4578-af2d-df627a448686', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP001'),
  ('334da7d4-af07-4578-af2d-df627a448686', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-10',DATE '2026-08-24']::date[], 1, 'COP001'),
  ('0faee871-f051-4093-a920-9b608f1860e1', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 1.5, NULL::date[], 0, 'COP004'),
  ('0faee871-f051-4093-a920-9b608f1860e1', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0.5, ARRAY[DATE '2026-07-04']::date[], 0, 'COP004'),
  ('0faee871-f051-4093-a920-9b608f1860e1', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-08',DATE '2026-08-22']::date[], 0.5, 'COP004'),
  ('d7db496a-d2ce-4e3b-be33-268791998cb3', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP006'),
  ('d7db496a-d2ce-4e3b-be33-268791998cb3', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP006'),
  ('5a4e3be9-f84b-488b-a654-2a3c2aee3e40', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP007'),
  ('f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP008'),
  ('f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP008'),
  ('69ccbf92-d8ed-4960-a40b-d14e70bfb3ec', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP009'),
  ('69ccbf92-d8ed-4960-a40b-d14e70bfb3ec', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-07']::date[], 0, 'COP009'),
  ('b34ae518-61b1-4239-a61d-6173c61d3309', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0.5, NULL::date[], 0, 'COP010'),
  ('cb30e0e6-9ddc-4c55-8e22-500f1cfaf802', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'COP011'),
  ('a7fd91fb-38e2-4134-8a6b-f12f992810e3', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP012'),
  ('3518cd28-5735-4f66-8938-7e483be01141', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'COP013'),
  ('3518cd28-5735-4f66-8938-7e483be01141', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-02',DATE '2026-07-03']::date[], 0, 'COP013'),
  ('3518cd28-5735-4f66-8938-7e483be01141', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-18',DATE '2026-08-28']::date[], 1, 'COP013'),
  ('cb9d1b01-114d-482b-b8ae-131f89559dfc', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP014'),
  ('cb9d1b01-114d-482b-b8ae-131f89559dfc', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-22',DATE '2026-08-28']::date[], 1, 'COP014'),
  ('a12ffe83-5f64-41bb-a2da-d5087c438119', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2.5, NULL::date[], 0, 'COP015'),
  ('a12ffe83-5f64-41bb-a2da-d5087c438119', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP015'),
  ('a12ffe83-5f64-41bb-a2da-d5087c438119', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-11']::date[], 1, 'COP015'),
  ('e3fc73a2-891b-421a-81da-fd17a3870730', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP016'),
  ('e3fc73a2-891b-421a-81da-fd17a3870730', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-10']::date[], 0, 'COP016'),
  ('e3fc73a2-891b-421a-81da-fd17a3870730', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-05',DATE '2026-08-01']::date[], 1, 'COP016'),
  ('08f54b8c-534e-46b2-a463-5c32138db688', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-30']::date[], 0, 'COP017'),
  ('cfdc9074-287d-47c6-8f3f-a3b06fed1b9f', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 3, NULL::date[], 0, 'COP018'),
  ('cfdc9074-287d-47c6-8f3f-a3b06fed1b9f', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP018'),
  ('88f15fa8-4e37-403b-b2e7-17498b9eb0d5', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'COP019'),
  ('88f15fa8-4e37-403b-b2e7-17498b9eb0d5', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2.5, ARRAY[DATE '2026-07-03',DATE '2026-07-04',DATE '2026-07-10']::date[], 0, 'COP019'),
  ('88f15fa8-4e37-403b-b2e7-17498b9eb0d5', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-08']::date[], 1, 'COP019'),
  ('923a335c-1d15-4760-b5ff-f3e4bc1c35bf', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-10']::date[], 0, 'COP020'),
  ('923a335c-1d15-4760-b5ff-f3e4bc1c35bf', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-05',DATE '2026-08-31']::date[], 1, 'COP020'),
  ('59f36ba3-58e9-4c7b-9582-15723afc6954', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-24',DATE '2026-08-25']::date[], 1, 'COP021'),
  ('af8b9832-22ad-4daa-8965-a449675aee6c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2.5, NULL::date[], 0, 'COP022'),
  ('af8b9832-22ad-4daa-8965-a449675aee6c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0.5, ARRAY[DATE '2026-07-03']::date[], 0, 'COP022'),
  ('af8b9832-22ad-4daa-8965-a449675aee6c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-08',DATE '2026-08-13']::date[], 1, 'COP022'),
  ('a9fd49c3-a3cd-4297-a002-8f7babfed688', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 1.5, NULL::date[], 0, 'COP023'),
  ('a9fd49c3-a3cd-4297-a002-8f7babfed688', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2.5, ARRAY[DATE '2026-07-04',DATE '2026-07-13',DATE '2026-07-14']::date[], 0, 'COP023'),
  ('26248722-d063-44bf-915f-41d94f3ed8bc', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP025'),
  ('a6c1b108-76ea-4e27-9201-0822f32a4082', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'COP026'),
  ('b36e6f3a-9430-43f3-a972-6a3de6ae6eba', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP027'),
  ('b36e6f3a-9430-43f3-a972-6a3de6ae6eba', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP027'),
  ('b36e6f3a-9430-43f3-a972-6a3de6ae6eba', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-17',DATE '2026-08-14']::date[], 1, 'COP027'),
  ('5beb6849-d15c-40de-86a0-78ab312883d9', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2.5, NULL::date[], 0, 'COP030'),
  ('5beb6849-d15c-40de-86a0-78ab312883d9', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-08']::date[], 0, 'COP030'),
  ('5beb6849-d15c-40de-86a0-78ab312883d9', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 1, ARRAY[DATE '2026-08-31']::date[], 0, 'COP030'),
  ('c0963262-f68d-4a59-b187-7aa9fd7ab219', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'COP032'),
  ('c0963262-f68d-4a59-b187-7aa9fd7ab219', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP032'),
  ('c0963262-f68d-4a59-b187-7aa9fd7ab219', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-22']::date[], 1, 'COP032'),
  ('3996c767-0337-4fe7-aa87-b282338f4a8d', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0.5, NULL::date[], 0, 'COP033'),
  ('3996c767-0337-4fe7-aa87-b282338f4a8d', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-17']::date[], 1, 'COP033'),
  ('678f5d19-2030-4e35-b38c-4af8b545772e', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP034'),
  ('8d600692-d074-4267-9ae2-3342570fe6bf', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-01',DATE '2026-07-02']::date[], 0, 'COP036'),
  ('e31dcfa1-5507-44f4-bce4-5913e9cd9c42', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'COP037'),
  ('4403995d-8250-49b6-ac15-18c54709d8c7', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'REVANTH'),
  ('36d76fc7-1b77-43f6-a85e-6850a0b02d80', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2.5, NULL::date[], 0, 'BABYKALA'),
  ('7a39dd08-59f6-499a-ba63-b8a8be194f3d', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCOP001'),
  ('7a39dd08-59f6-499a-ba63-b8a8be194f3d', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-08']::date[], 0, 'NOTCOP001'),
  ('675f588e-842d-4523-b4ac-97d16302e68c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCOP002'),
  ('675f588e-842d-4523-b4ac-97d16302e68c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-12',DATE '2026-08-22']::date[], 1, 'NOTCOP002'),
  ('c39bb564-7980-490e-82d9-3f6359aab0d0', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCOP008'),
  ('7b0293f2-b303-4d54-a969-0ccd5548336a', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 1.5, NULL::date[], 0, 'NOTCOP010'),
  ('f887c854-5a45-43fb-9dec-ed02b5ef31f4', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 3, NULL::date[], 0, 'NOTCOP011'),
  ('81fbc781-8761-4982-8f95-1223030e40ea', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 1.5, NULL::date[], 0, 'NOTCOP012'),
  ('ea198f0c-f4eb-4d12-9159-0aa3e6397032', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2.5, NULL::date[], 0, 'NOTCOP017'),
  ('ea198f0c-f4eb-4d12-9159-0aa3e6397032', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP017'),
  ('2a31306f-1e6c-48a1-bb8b-435672f07d88', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0.5, NULL::date[], 0, 'NOTCOP020'),
  ('2a31306f-1e6c-48a1-bb8b-435672f07d88', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0.5, NULL::date[], 0, 'NOTCOP020'),
  ('64a17876-c771-4be1-bd71-06db03969b7b', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-06',DATE '2026-08-19']::date[], 1, 'NOTCOP021'),
  ('2553ac3d-6ebe-47fb-8682-17db113167e7', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP022'),
  ('a89c22f7-3b0f-4c58-a66b-9dfead79f94b', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTCOP023'),
  ('d91faf28-7005-4614-a7d1-4700bdf1017a', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'NOTCOP024'),
  ('d91faf28-7005-4614-a7d1-4700bdf1017a', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 2, ARRAY[DATE '2026-07-04',DATE '2026-07-11']::date[], 0, 'NOTCOP024'),
  ('d91faf28-7005-4614-a7d1-4700bdf1017a', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-25',DATE '2026-08-01']::date[], 1, 'NOTCOP024'),
  ('b63a526c-bf64-4452-8bf4-7b96506abb18', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP025'),
  ('b63a526c-bf64-4452-8bf4-7b96506abb18', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-08-01', 2, ARRAY[DATE '2026-08-22',DATE '2026-08-24']::date[], 0, 'NOTCOP025'),
  ('546e6e92-3fe3-4b23-a486-bf2a5cf9e598', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'NOTCOP027'),
  ('546e6e92-3fe3-4b23-a486-bf2a5cf9e598', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 3, ARRAY[DATE '2026-07-08',DATE '2026-07-22',DATE '2026-07-27']::date[], 0, 'NOTCOP027'),
  ('d1736327-0ea0-4132-9c61-a12b312d2158', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-06-01', 2, NULL::date[], 0, 'NOTCOP028'),
  ('d1736327-0ea0-4132-9c61-a12b312d2158', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP028'),
  ('06d13389-5af0-450b-ae7c-0522b15e50d2', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP029'),
  ('3f8058b6-1440-4d55-a865-f02d7d3833d4', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP032'),
  ('4649b736-eb14-4a7f-b41b-ab01784aa60c', '412b64fd-75ec-4d5a-abef-20a7bcda1331', '3f73dbf5-9977-4582-b0c0-53e31b3a4afd', DATE '2026-07-01', 0, NULL::date[], 0, 'NOTCOP033'),
  ('e3cc2f91-f436-4d5a-b0c5-c751b7a7d007', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', 'e1b742e8-4acb-4956-a320-4d2a1ae4f95b', DATE '2026-08-01', 0.5, ARRAY[DATE '2026-08-28']::date[], 0, 'NOTJIC002'),
  ('b6da03fa-1846-4618-a9c3-bb09588d4d58', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0.5, NULL::date[], 0, 'NOTJMO080'),
  ('9ddc6f73-2597-4c54-a734-746b67625c73', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 0.5, ARRAY[DATE '2026-07-02']::date[], 0, 'NOTJMO087'),
  ('9ddc6f73-2597-4c54-a734-746b67625c73', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1.5, ARRAY[DATE '2026-08-04',DATE '2026-08-29']::date[], 0, 'NOTJMO087'),
  ('7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-06-01', 0, NULL::date[], 0, 'NOTJMO106'),
  ('7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-07-01', 3, NULL::date[], 0, 'NOTJMO106'),
  ('7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, NULL::date[], 0, 'NOTJMO106'),
  ('940a9f0a-16b3-4c11-a831-1970cc86c2f8', '1a5778c3-c974-455e-94e7-e7d40ecc0c68', 'feb0b6ae-b040-4c21-94e0-d2243155ff5d', DATE '2026-08-01', 1, NULL::date[], 0, 'NOTJIC011');

  CREATE TEMP TABLE _reject (
    employee_id   uuid,
    leave_type_id uuid,
    start_date    date
  ) ON COMMIT DROP;

  INSERT INTO _reject (employee_id, leave_type_id, start_date) VALUES
  ('092770a9-69f5-4285-a358-021dd92cf4aa', '412b64fd-75ec-4d5a-abef-20a7bcda1331', DATE '2026-08-24'),
  ('5885238b-c7ec-49ac-9093-78765446ebad', '412b64fd-75ec-4d5a-abef-20a7bcda1331', DATE '2026-08-28'),
  ('6b931fae-5cc9-48da-82a3-5d5c71a27169', '17e62724-e2f0-41bd-8dda-43a3a8d0c299', DATE '2026-08-10');

  -- Fresh CL balance rows (Pharmacy org/leave type) for the 2 staff with none.
  INSERT INTO public.hr_leave_balances (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    entitled, used, carried_forward)
  SELECT DISTINCT tg.employee_id, tg.leave_type_id, v_year_id, tg.hr_organization_id, NULL::numeric, 0::numeric, 0::numeric
  FROM _target tg
  WHERE tg.staff_code IN ('REVANTH','BABYKALA')
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'leave_type_id', leave_type_id, 'used', used) ORDER BY employee_id)
    INTO v_before
  FROM public.hr_leave_balances
  WHERE hr_academic_year_id = v_year_id
    AND (employee_id, leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target
                                          UNION SELECT DISTINCT employee_id, leave_type_id FROM _reject);

  SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.staff_code, tg.month_start) INTO v_targets FROM _target tg;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'batch', 'Pharmacy + Main Office + Jicate spillover',
      'target_rows', (SELECT COUNT(*) FROM _target), 'reject_rows', (SELECT COUNT(*) FROM _reject),
      'targets', v_targets, 'balances_before', v_before);
  END IF;

  -- ---- 1. Reject FIRST (trigger moves `used` down on approved -> rejected; the
  --         absolute set in the last step makes the ordering safe either way,
  --         but this mirrors the precedent). ---------------------------------
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

  -- ---- 2. Audit rows, before the writes ------------------------------------
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

  -- ---- 3. The overrides themselves -----------------------------------------
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

  -- ---- 4. `used`, absolutely: SUM of that employee's CL month entries ------
  UPDATE public.hr_leave_balances b
     SET used = sub.total, updated_at = now()
    FROM (
      SELECT e.employee_id, e.leave_type_id, SUM(e.days) AS total
      FROM public.hr_leave_month_entries e
      WHERE e.hr_academic_year_id = v_year_id
        AND (e.employee_id, e.leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target)
      GROUP BY e.employee_id, e.leave_type_id
    ) sub
   WHERE b.employee_id = sub.employee_id AND b.leave_type_id = sub.leave_type_id
     AND b.hr_academic_year_id = v_year_id;

  -- Rejected-only employees (no _target row) also need `used` recomputed --
  -- their approved app's days must come OUT even though nothing above touches
  -- their balance otherwise.
  UPDATE public.hr_leave_balances b
     SET used = COALESCE((
           SELECT SUM(e.days) FROM public.hr_leave_month_entries e
            WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
              AND e.hr_academic_year_id = v_year_id), 0)
           + COALESCE((
           SELECT SUM(public.hr_calc_leave_days(a.start_date, a.end_date, a.duration_type, true, true, a.hr_organization_id, a.employee_id))
             FROM public.hr_leave_applications a
            WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
              AND a.hr_academic_year_id = v_year_id AND a.status = 'approved'
              AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                                WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                  AND e2.hr_academic_year_id = v_year_id
                                  AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
         updated_at = now()
    FROM _reject r
   WHERE b.employee_id = r.employee_id AND b.leave_type_id = r.leave_type_id
     AND b.hr_academic_year_id = v_year_id
     AND NOT EXISTS (SELECT 1 FROM _target tg WHERE tg.employee_id = r.employee_id AND tg.leave_type_id = r.leave_type_id);

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
    AND (employee_id, leave_type_id) IN (SELECT DISTINCT employee_id, leave_type_id FROM _target
                                          UNION SELECT DISTINCT employee_id, leave_type_id FROM _reject);

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027', 'batch', 'Pharmacy + Main Office + Jicate spillover',
    'rejected', v_rejected, 'balances_before', v_before, 'balances_after', v_after);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_pharmacy(boolean) IS
  'One-off 2026-09-16 CL correction for Pharmacy Teaching/Non-Teaching plus Main Office/Jicate spillover, Jun-Aug 2026. '
  'Batch 2 of a multi-institution correction. Not exposed to the API -- applied directly via migration tooling only.';

REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_pharmacy(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_pharmacy(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_hr_cl_correct_2026_jun_aug_pharmacy(boolean) FROM authenticated;
