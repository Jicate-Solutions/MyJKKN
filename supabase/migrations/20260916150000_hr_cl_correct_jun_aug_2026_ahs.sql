-- ============================================================================
-- Correct Casual Leave (CL) balances for Jun-Aug 2026 at JKKN College of
-- Allied Health Sciences, against the payroll-verified "Paid Leave Summary
-- Jun-Aug 2026 - Allied Health Sciences.xlsx" (20 rows, one sheet).
-- Created: 2026-09-16. Eighth institution batch.
--
-- Method: hr_leave_month_entries overrides only, same as every prior batch.
-- Evidence preference: real LOP dates first, "Recorded by admin" only when
-- no LOP evidence exists (June is unevidenced for everyone -- zero
-- hr_attendance_records exist for June 2026 at any institution, confirmed
-- again here).
--
-- Sheet's own Employee-ID column (AHS107, AHS110, ...) does NOT match this
-- institution's real staff_id numbering (AHS001-AHS017, NOTAHS001-006) --
-- same scrambled-ID pattern as Engineering/Dental. Resolved all 20 rows by
-- name against the live roster directly (small sheet, no fork needed).
--
-- Most Aug 2026 targets already matched a real APPROVED application exactly
-- (no override needed): Giridharan P, Harini E, Sanjai V/"Sanjay", Sreekaran
-- K, Pavithra Thangaraj/"Pavithra T", Jayammal R.
--
-- Saravanan G (sheet row 8, target 0/-/-) has NO plausible match anywhere in
-- the staff database -- moot anyway since his target is already 0 across
-- the board, matching a de-facto zero/no-record state.
--
-- Two inactive, staff_id-less people needed no action despite resolving
-- cleanly by name: Gesavardhini M (target -/1/0, already exactly matches
-- her existing June=1/July=1 baseline + zero August) and Jagadeeswaran J
-- (target 0/0/-, already at zero baseline with no entries at all).
--
-- Pranesh Kumar P and Sneka S (joined 2026-08-17 and 2026-08-24) needed no
-- action either -- their August target of 0 already matches their de-facto
-- zero baseline (never swept by the 2026-09-07 reset, no override needed
-- since 0 = 0).
--
-- "-" convention confirmed consistent with every prior batch for the
-- genuine late-joiners (Sreekaran K, Pavithra Thangaraj, Jayammal R,
-- Pranesh Kumar P, Sneka S all joined mid-month after the dashed period).
-- Sanjai V ("Sanjay" on the sheet) is the one exception -- he joined exactly
-- 2026-06-01, so the June dash can't mean "not yet employed"; per the
-- Palanisamy K / Muralidharan R.T precedent from Engineering, treated as
-- "no correction for that month" and left at his existing baseline of 1.
-- ============================================================================

DO $$
DECLARE
  v_year_id CONSTANT uuid := '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
  v_cl_type CONSTANT uuid := 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5';
  v_org_id  CONSTANT uuid := '542db659-e4b7-4c6e-93eb-bcc829091ebb';
  v_admin   CONSTANT uuid := (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in');
BEGIN

CREATE TEMP TABLE _target (
  employee_id uuid,
  leave_type_id uuid,
  hr_organization_id uuid,
  hr_academic_year_id uuid,
  month_start date,
  days numeric,
  added_days numeric,
  evidence_dates date[],
  note text
) ON COMMIT DROP;

INSERT INTO _target (employee_id, leave_type_id, hr_organization_id, hr_academic_year_id, month_start, days, added_days, evidence_dates, note) VALUES
  ('81a57374-9f94-4c1b-8420-af464f6b32ac'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-04']::date[], 'AHS001 [apps: +lop:2026-07-04]'),
  ('8ca0d8b6-3d0a-47aa-bdd4-51e8fbb4b3b8'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS003 [reduction]'),
  ('04b812ff-5b22-427c-a278-567e5f7d53bc'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'AHS004 [reduction]'),
  ('04b812ff-5b22-427c-a278-567e5f7d53bc'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-04',DATE '2026-07-09']::date[], 'AHS004 [apps: +lop:2026-07-04,2026-07-09]'),
  ('04b812ff-5b22-427c-a278-567e5f7d53bc'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1, ARRAY[DATE '2026-08-08',DATE '2026-08-06']::date[], 'AHS004 [apps:2026-08-08 +lop:2026-08-06]'),
  ('7eb732d7-bd2d-4ee2-a09e-70354c6c31ec'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS005 [reduction]'),
  ('7eb732d7-bd2d-4ee2-a09e-70354c6c31ec'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-22']::date[], 'AHS005 [apps: +lop:2026-08-22]'),
  ('ba31bb65-cccc-46a7-a9cb-cca18bb5fd07'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'AHS006 [apps: +lop:2026-08-01]'),
  ('efc9adde-ddae-4708-acc5-346846db3cc8'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS007 [reduction]'),
  ('efc9adde-ddae-4708-acc5-346846db3cc8'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-29']::date[], 'AHS007 [apps: +lop:2026-08-29]'),
  ('394c9777-4bb6-4913-bf80-095945570e20'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'AHS008 [admin-only]'),
  ('394c9777-4bb6-4913-bf80-095945570e20'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'AHS008 [reduction]'),
  ('ade11098-5679-4df6-8cfa-008ccb228c4d'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS010 [reduction]'),
  ('ade11098-5679-4df6-8cfa-008ccb228c4d'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-07']::date[], 'AHS010 [apps: +lop:2026-08-07]'),
  ('0fa583d3-b630-4d40-b74b-827cfef1268e'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS011 [reduction]'),
  ('6fd65955-1fdb-47ba-84d6-c2092540e8b8'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS012 [reduction]'),
  ('83691fa0-128d-4f5e-b305-231ce6c0de7c'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'AHS013 [reduction]'),
  ('70e1c25e-282f-4022-ac4b-680b1cb44cc6'::uuid, 'b4d2d54b-394c-44a8-ac5b-9a5c002f9ff5'::uuid, '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTAHS006 [reduction]');

-- Upsert month_entries from staging
INSERT INTO public.hr_leave_month_entries (
  employee_id, leave_type_id, hr_organization_id, hr_academic_year_id,
  month_start, days, added_days, evidence_dates, reason, created_by)
SELECT t.employee_id, t.leave_type_id, t.hr_organization_id, t.hr_academic_year_id,
       t.month_start, t.days, t.added_days, t.evidence_dates,
       'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Allied Health Sciences sheet). ' || t.note,
       v_admin
  FROM _target t
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
DO UPDATE SET
  days = EXCLUDED.days,
  added_days = public.hr_leave_month_entries.added_days + (EXCLUDED.days - public.hr_leave_month_entries.days),
  evidence_dates = EXCLUDED.evidence_dates,
  reason = EXCLUDED.reason,
  updated_at = now();

-- Recompute `used` absolutely for every affected employee.
UPDATE public.hr_leave_balances b
   SET used = COALESCE((
         SELECT SUM(e.days) FROM public.hr_leave_month_entries e
          WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
            AND e.hr_academic_year_id = v_year_id), 0)
       + COALESCE((
         SELECT SUM(a.total_days) FROM public.hr_leave_applications a
          WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
            AND a.hr_academic_year_id = v_year_id
            AND a.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                              WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                AND e2.hr_academic_year_id = v_year_id
                                AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
       updated_at = now()
 WHERE b.hr_academic_year_id = v_year_id
   AND EXISTS (SELECT 1 FROM _target tg
                WHERE tg.employee_id = b.employee_id AND tg.leave_type_id = b.leave_type_id);

END $$;
