-- ============================================================================
-- Fix: 23 omissions/errors found by a proper code-driven re-verification of
-- the Arts batch (20260916100100) against the source Excel, after a manual
-- transcription of 66 people's deltas turned out to have missed several June
-- reductions and two cells entirely (Gomathi M's June was fixed separately in
-- 20260916100200; this covers the rest). Created: 2026-09-16, same session.
--
-- 20 simple reductions to 0 (an existing override left at its 2026-09-07
-- reset value of 1 when the real target was 0 -- no evidence needed either
-- way). 3 real increases, evidenced the same way as the rest of this batch:
--   Murugan K (CAS022) July 1->2, LOP 4/11 Jul
--   Govindharaj S (CAS031) August 0->2, NO LOP evidence at all for him in
--     Jun-Aug -- "Recorded by admin" is unavoidable here, not a shortcut
--   Pugalendhi R (CAS047) July 1->2, LOP 4/13 Jul (June also corrected to 0)
-- ============================================================================

-- ---- Simple reductions to 0 (no evidence involved) --------------------------
UPDATE public.hr_leave_month_entries e
   SET days = 0,
       added_days = added_days + (0 - e.days),
       reason = e.reason || ' [Corrected to 0 in reconciliation fix -- omitted from the original batch.]',
       updated_at = now()
  FROM (VALUES
    ('cb31d013-9332-44ca-8c14-2f905b1d134c'::uuid, DATE '2026-06-01'), -- CAS019 Indhumathi M
    ('9f9b9b51-da83-4592-b16c-1e6396c0ea07'::uuid, DATE '2026-06-01'), -- CAS003 Poongodi R
    ('c6e6a9c4-95fb-4239-9e14-f403101abe75'::uuid, DATE '2026-07-01'), -- CAS027 Kamalaveni A
    ('78363405-83bc-4bf6-84b0-2052fd334b62'::uuid, DATE '2026-06-01'), -- CAS016 Palanisamy M
    ('78363405-83bc-4bf6-84b0-2052fd334b62'::uuid, DATE '2026-07-01'), -- CAS016 Palanisamy M
    ('03f08bd0-5ba6-4d2b-836d-30c88566ceea'::uuid, DATE '2026-06-01'), -- CAS018 Prithiviraja AK
    ('27f09837-244e-4bb7-909f-81a279baf090'::uuid, DATE '2026-07-01'), -- CAS012 Yasodharan V
    ('2dc4c547-899c-42c2-95c0-1c7a92a6c6ea'::uuid, DATE '2026-07-01'), -- CAS036 Satheskumar T
    ('1fed8918-46d2-4ad4-9ce5-91eaa2fbeafd'::uuid, DATE '2026-06-01'), -- CAS041 Chandrakala N
    ('1fed8918-46d2-4ad4-9ce5-91eaa2fbeafd'::uuid, DATE '2026-07-01'), -- CAS041 Chandrakala N
    ('5062ad27-3d92-45ed-aea1-f9c4f2b5054d'::uuid, DATE '2026-06-01'), -- CAS045 Subhashini P
    ('f53bf513-19e9-4e9f-831d-dbd8e987902e'::uuid, DATE '2026-06-01'), -- CAS047 Pugalendhi R
    ('d043ad0a-7944-40ac-8e5e-d044b6ac626b'::uuid, DATE '2026-06-01'), -- CAS049 Tamilselvi D.K
    ('cb28b6b8-358a-4940-a4a1-793ea2632037'::uuid, DATE '2026-06-01'), -- CAS005 Manimegalai R
    ('fdb0c6f3-3d6f-48ae-88dd-d80517fea9e0'::uuid, DATE '2026-06-01'), -- CAS066 Nandhini Guna
    ('8cea95bd-2f33-4eaf-914b-4e9d6a396b13'::uuid, DATE '2026-06-01'), -- CAS062 Jaleel Farhan M
    ('15b8568a-62db-4c13-be47-ae671fe72952'::uuid, DATE '2026-06-01'), -- CAS060 Indhu V
    ('a1cb01f0-cbbb-4cd6-9980-e743109f0b26'::uuid, DATE '2026-06-01'), -- CAS064 Uma K
    ('0bf6055c-bda2-4d07-86f8-0c34d3700a82'::uuid, DATE '2026-06-01'), -- CAS065 Pushpa R
    ('9adf25d1-2ae4-4755-9aae-875f685982e0'::uuid, DATE '2026-06-01')  -- NOTJMO097 Gobinath K
  ) AS fix(employee_id, month_start)
 WHERE e.employee_id = fix.employee_id
   AND e.month_start = fix.month_start
   AND e.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
   AND e.leave_type_id IN ('f0143572-bb82-4fec-9367-9408d2b39911', '1a5778c3-c974-455e-94e7-e7d40ecc0c68');

-- ---- 3 real increases --------------------------------------------------------
INSERT INTO public.hr_leave_month_entries (
  employee_id, leave_type_id, hr_organization_id, hr_academic_year_id,
  month_start, days, added_days, evidence_dates, reason, created_by)
VALUES
  ('894172fc-2e4e-4c5a-a5ac-4515e876839e', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531',
   '2c5d0bb6-d279-4be0-ac2a-cca500e6a484', DATE '2026-07-01', 2, 1, ARRAY[DATE '2026-07-04', DATE '2026-07-11']::date[],
   'Payroll-verified per Arts Paid Leave Summary Jun-Aug 2026 (JKKN College of Arts and Science - Self). (CAS022) [reconciliation fix]',
   (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in')),
  ('c7e45c96-3754-44cf-8890-7a1cf3e50c90', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531',
   '2c5d0bb6-d279-4be0-ac2a-cca500e6a484', DATE '2026-08-01', 2, 2, NULL::date[],
   'Payroll-verified per Arts Paid Leave Summary Jun-Aug 2026 (JKKN College of Arts and Science - Self). No biometric LOP evidence for August. (CAS031) [reconciliation fix]',
   (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in')),
  ('f53bf513-19e9-4e9f-831d-dbd8e987902e', 'f0143572-bb82-4fec-9367-9408d2b39911', '6c0d7684-7f75-42ba-8e7f-223a23936531',
   '2c5d0bb6-d279-4be0-ac2a-cca500e6a484', DATE '2026-07-01', 2, 1, ARRAY[DATE '2026-07-04', DATE '2026-07-13']::date[],
   'Payroll-verified per Arts Paid Leave Summary Jun-Aug 2026 (JKKN College of Arts and Science - Self). (CAS047) [reconciliation fix]',
   (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in'))
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
DO UPDATE SET
  days = EXCLUDED.days,
  added_days = public.hr_leave_month_entries.added_days + (EXCLUDED.days - public.hr_leave_month_entries.days),
  evidence_dates = EXCLUDED.evidence_dates,
  reason = EXCLUDED.reason,
  updated_at = now();

-- ---- `used`, absolutely, for every affected employee -------------------------
UPDATE public.hr_leave_balances b
   SET used = COALESCE((
         SELECT SUM(e.days) FROM public.hr_leave_month_entries e
          WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
            AND e.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'), 0)
       + COALESCE((
         SELECT SUM(a.total_days) FROM public.hr_leave_applications a
          WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
            AND a.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
            AND a.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                              WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                AND e2.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
                                AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
       updated_at = now()
 WHERE b.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
   AND b.leave_type_id IN ('f0143572-bb82-4fec-9367-9408d2b39911', '1a5778c3-c974-455e-94e7-e7d40ecc0c68')
   AND b.employee_id IN (
     'cb31d013-9332-44ca-8c14-2f905b1d134c','9f9b9b51-da83-4592-b16c-1e6396c0ea07','894172fc-2e4e-4c5a-a5ac-4515e876839e',
     'c6e6a9c4-95fb-4239-9e14-f403101abe75','78363405-83bc-4bf6-84b0-2052fd334b62','03f08bd0-5ba6-4d2b-836d-30c88566ceea',
     '27f09837-244e-4bb7-909f-81a279baf090','c7e45c96-3754-44cf-8890-7a1cf3e50c90','2dc4c547-899c-42c2-95c0-1c7a92a6c6ea',
     '1fed8918-46d2-4ad4-9ce5-91eaa2fbeafd','5062ad27-3d92-45ed-aea1-f9c4f2b5054d','f53bf513-19e9-4e9f-831d-dbd8e987902e',
     'd043ad0a-7944-40ac-8e5e-d044b6ac626b','cb28b6b8-358a-4940-a4a1-793ea2632037','fdb0c6f3-3d6f-48ae-88dd-d80517fea9e0',
     '8cea95bd-2f33-4eaf-914b-4e9d6a396b13','15b8568a-62db-4c13-be47-ae671fe72952','a1cb01f0-cbbb-4cd6-9980-e743109f0b26',
     '0bf6055c-bda2-4d07-86f8-0c34d3700a82','9adf25d1-2ae4-4755-9aae-875f685982e0'
   );
