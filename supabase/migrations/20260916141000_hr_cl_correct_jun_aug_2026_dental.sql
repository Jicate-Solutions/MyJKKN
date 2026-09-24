-- ============================================================================
-- Correct Casual Leave (CL) balances for Jun-Aug 2026 at JKKN Dental College
-- and Hospital, against the payroll-verified "Paid Leave Summary Jun-Aug
-- 2026 - Dental.xlsx" (131 rows, one sheet spanning Dental teaching + Dental
-- non-teaching staff). Created: 2026-09-16. Seventh institution batch.
--
-- Method: hr_leave_month_entries overrides only, same as every prior batch.
-- Evidence preference: real LOP dates first, "Recorded by admin" only when
-- no LOP evidence exists (June is unevidenced for everyone -- zero
-- hr_attendance_records exist for June 2026 at any institution, confirmed
-- again here).
--
-- This sheet's own Employee-ID column proved SYSTEMATICALLY SCRAMBLED, not
-- just occasionally wrong -- e.g. Block B's "NOT016"-style IDs don't exist
-- in the DB at all (the real Dental non-teaching prefix is NOTDCH###).
-- Resolved all 131 rows by name against the live Dental roster instead, via
-- a read-only fork, independently spot-verified against 8 people directly.
--
-- CRITICAL FINDING, already fixed separately (migration 20260916140000):
-- the Main Office batch's source sheet had a Dental spillover row for
-- "Muthuswamy R" tagged with the scrambled ID "DCH060" -- DCH060 is actually
-- Dr. Karthika S, a different real person who was incorrectly zeroed for
-- June/July as a result. Reverted her, and applied the real correction
-- (June=0 only, per user decision on the July disagreement between sheets)
-- to the real Muthuswamy R (DCH008). Not touched again here.
--
-- Held out with NO correction, pending HR source verification:
--   - Santhoshkumar K (DCH023): June target 8.5, concentrated in a single
--     month, no LOP evidence, no other leave type -- user decision.
--   - Sivakami T, Johnsirani J, Yogadevi: no plausible match anywhere in the
--     staff database at all -- user decision, same treatment as the 5
--     skipped Jicate people in the Main Office batch.
--   - Pranavadhyani G: has NO staff_id in the database at all (inactive,
--     joined 1990) -- moot anyway, her sheet target (0/-/-) already matches
--     her de-facto zero state, so no correction was needed regardless.
--
-- 9 other people had June figures >=4 that also lack evidence for June
-- (expected -- June is unevidenced for everyone) but, unlike Santhoshkumar K,
-- have solid July/August LOP evidence backing most of their totals -- same
-- shape as every other unevidenced-June correction in this project, so
-- processed normally: Thankamani Ammal K, Thenmozhi S/DCH041, Nandhini R,
-- Nirmala R, Gopi Krishna S, Balasubramaniam G, Sumithra K, Sudeep S.
--
-- 16 people had zero hr_leave_month_entries at all (missed by the original
-- 2026-09-05/07 reset). 12 needed no action (sheet target already matches
-- their de-facto zero baseline). 4 needed a FRESH hr_leave_balances row
-- created from scratch (never swept by the reset, all late joiners in
-- 2026): DCH078 (Bala Subramani, joined 2026-08-17), NOTDCH075 (Tamilselvi
-- V, joined 2026-06-01), NOTDCH076 (Kowshika S, joined 2026-06-10),
-- NOTDCH077 (T.Nagarathinam, joined 2026-07-14) -- created below before the
-- month_entries upsert.
--
-- Several "-" cells belong to people who were already employed well before
-- the dashed month (NOTDCH073/Sowndarya S, DCH053/Mullai T, NOTDCH065/
-- Menaka A, NOTDCH061/B.Saranya) -- unlike every other "-" in this project,
-- these can't mean "not yet employed". Per the Palanisamy K precedent from
-- the Engineering batch, treated as "no correction for that month" and left
-- untouched.
--
-- hr_attendance_periods has ZERO rows for Dental -- no locked-period
-- blocker, same as Engineering.
-- ============================================================================

DO $$
DECLARE
  v_year_id CONSTANT uuid := '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
  v_cl_type CONSTANT uuid := '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad';
  v_org_id  CONSTANT uuid := '96fb95a4-ef15-46c4-95e1-1078f94a39bd';
  v_admin   CONSTANT uuid := (SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in');
BEGIN

-- ---- Create balance rows for the 4 late joiners the reset never swept ----
INSERT INTO public.hr_leave_balances (employee_id, leave_type_id, hr_organization_id, hr_academic_year_id, entitled, used, carried_forward)
VALUES
  ('45d334ea-8232-439c-a030-2809ad10de74', v_cl_type, v_org_id, v_year_id, NULL, 0, 0), -- DCH078
  ('bcf6a467-cb99-4079-aa4b-b04d83a76e97', v_cl_type, v_org_id, v_year_id, NULL, 0, 0), -- NOTDCH075
  ('9d39bf1f-88fb-4761-918b-bf6883f789e4', v_cl_type, v_org_id, v_year_id, NULL, 0, 0), -- NOTDCH076
  ('7eff29b3-d977-4301-a7f2-8e51aa9094a2', v_cl_type, v_org_id, v_year_id, NULL, 0, 0)  -- NOTDCH077
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

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
  ('b22cb7f5-834c-4000-8fbe-9ea5f73d79fc'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'DCH011 [admin-only]'),
  ('b22cb7f5-834c-4000-8fbe-9ea5f73d79fc'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-18',DATE '2026-07-27']::date[], 'DCH011 [apps: +lop:2026-07-18,2026-07-27]'),
  ('b22cb7f5-834c-4000-8fbe-9ea5f73d79fc'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-12',DATE '2026-08-17']::date[], 'DCH011 [apps: +lop:2026-08-12,2026-08-17]'),
  ('bf0895c6-5af7-44de-b024-4ea2d80a7a83'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'DCH013 [admin-only]'),
  ('bf0895c6-5af7-44de-b024-4ea2d80a7a83'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH013 [reduction]'),
  ('bf0895c6-5af7-44de-b024-4ea2d80a7a83'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'DCH013 [apps: +lop:2026-08-01]'),
  ('c24f9a13-45e4-4d81-b8f8-f55bda2484b2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH015 [admin-only]'),
  ('c24f9a13-45e4-4d81-b8f8-f55bda2484b2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-10',DATE '2026-07-23']::date[], 'DCH015 [apps: +lop:2026-07-10,2026-07-23]'),
  ('c24f9a13-45e4-4d81-b8f8-f55bda2484b2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1.5, ARRAY[DATE '2026-08-08']::date[], 'DCH015 [apps: +lop:2026-08-08]'),
  ('9c420888-2b69-4c3c-b053-80e0c8f27615'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH026 [reduction]'),
  ('9c420888-2b69-4c3c-b053-80e0c8f27615'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, NULL::date[], 'DCH026 [admin-only]'),
  ('0e4f9d51-37ed-49dd-87b1-d123fd2e9f70'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH025 [admin-only]'),
  ('0e4f9d51-37ed-49dd-87b1-d123fd2e9f70'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-13',DATE '2026-07-14',DATE '2026-07-17']::date[], 'DCH025 [apps: +lop:2026-07-13,2026-07-14,2026-07-17]'),
  ('0e4f9d51-37ed-49dd-87b1-d123fd2e9f70'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-07',DATE '2026-08-12']::date[], 'DCH025 [apps: +lop:2026-08-07,2026-08-12]'),
  ('154d4fe2-0a2d-4da3-b73f-ee265673781c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH001 [reduction]'),
  ('aeb31e03-81b4-4024-a43e-7647e2b07d57'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH021 [admin-only]'),
  ('aeb31e03-81b4-4024-a43e-7647e2b07d57'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH021 [reduction]'),
  ('aeb31e03-81b4-4024-a43e-7647e2b07d57'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-18']::date[], 'DCH021 [apps:2026-08-18]'),
  ('ddf54b14-7c46-451c-903c-8eb8e0491d67'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-04',DATE '2026-07-09']::date[], 'DCH032 [apps: +lop:2026-07-04,2026-07-09]'),
  ('ddf54b14-7c46-451c-903c-8eb8e0491d67'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-01']::date[], 'DCH032 [apps:2026-08-01]'),
  ('4d052647-9d39-484a-8da3-1e80372146ec'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH035 [admin-only]'),
  ('4d052647-9d39-484a-8da3-1e80372146ec'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-04',DATE '2026-08-05']::date[], 'DCH035 [apps: +lop:2026-08-04,2026-08-05]'),
  ('27da8ddf-4dd7-4bf9-8a59-005e95928a2d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH033 [admin-only]'),
  ('27da8ddf-4dd7-4bf9-8a59-005e95928a2d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 0.5, ARRAY[DATE '2026-08-24',DATE '2026-08-06']::date[], 'DCH033 [apps:2026-08-24 +lop:2026-08-06]'),
  ('9dd48e61-f7cc-499a-a885-5151ca4ddc78'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH022 [admin-only]'),
  ('9dd48e61-f7cc-499a-a885-5151ca4ddc78'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-19',DATE '2026-08-04']::date[], 'DCH022 [apps:2026-08-19 +lop:2026-08-04]'),
  ('fb824ea9-61dd-4def-8a9e-9be1cac81b68'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH016 [admin-only]'),
  ('fb824ea9-61dd-4def-8a9e-9be1cac81b68'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-04',DATE '2026-08-08']::date[], 'DCH016 [apps: +lop:2026-08-04,2026-08-08]'),
  ('df1f0f47-6f3e-408f-bb2a-15859a07e6d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH024 [admin-only]'),
  ('df1f0f47-6f3e-408f-bb2a-15859a07e6d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-04',DATE '2026-07-24']::date[], 'DCH024 [apps: +lop:2026-07-04,2026-07-24]'),
  ('df1f0f47-6f3e-408f-bb2a-15859a07e6d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-04',DATE '2026-08-05']::date[], 'DCH024 [apps:2026-08-04 +lop:2026-08-05]'),
  ('61d37c95-6958-4954-8a3b-d89f64973084'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH027 [reduction]'),
  ('61d37c95-6958-4954-8a3b-d89f64973084'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH027 [reduction]'),
  ('61d37c95-6958-4954-8a3b-d89f64973084'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-18']::date[], 'DCH027 [apps:2026-08-18]'),
  ('ea5c26a2-b5bc-441a-8bb1-7239b418a45b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH020 [reduction]'),
  ('ea5c26a2-b5bc-441a-8bb1-7239b418a45b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-13']::date[], 'DCH020 [apps:2026-08-13]'),
  ('8729b2d0-8038-4dc7-b213-71dad1371282'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4.5, 4.5, NULL::date[], 'DCH034 [admin-only]'),
  ('8729b2d0-8038-4dc7-b213-71dad1371282'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-10',DATE '2026-07-11',DATE '2026-07-20']::date[], 'DCH034 [apps: +lop:2026-07-10,2026-07-11,2026-07-20]'),
  ('8729b2d0-8038-4dc7-b213-71dad1371282'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-10']::date[], 'DCH034 [apps: +lop:2026-08-06,2026-08-10]'),
  ('4d90049f-8a19-4eb3-959c-20e0660ce5f6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH037 [admin-only]'),
  ('4d90049f-8a19-4eb3-959c-20e0660ce5f6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-09',DATE '2026-07-17',DATE '2026-07-29']::date[], 'DCH037 [apps: +lop:2026-07-09,2026-07-17,2026-07-29]'),
  ('4d90049f-8a19-4eb3-959c-20e0660ce5f6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1.5, ARRAY[DATE '2026-08-08',DATE '2026-08-10']::date[], 'DCH037 [apps: +lop:2026-08-08,2026-08-10]'),
  ('b0cb7043-e646-4c3e-bac8-4e8914420644'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH028 [admin-only]'),
  ('b0cb7043-e646-4c3e-bac8-4e8914420644'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-18',DATE '2026-07-27']::date[], 'DCH028 [apps: +lop:2026-07-18,2026-07-27]'),
  ('b0cb7043-e646-4c3e-bac8-4e8914420644'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 3, 3, ARRAY[DATE '2026-08-12',DATE '2026-08-17',DATE '2026-08-21']::date[], 'DCH028 [apps: +lop:2026-08-12,2026-08-17,2026-08-21]'),
  ('84e004da-0634-4433-a45a-253b36cc26d6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-12']::date[], 'DCH031 [apps:2026-08-12]'),
  ('594cec8d-d1f0-4722-8794-0ca58f1423da'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH010 [reduction]'),
  ('d63f1234-52bc-43e3-a517-c91ec86047f4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'DCH019 [admin-only]'),
  ('d63f1234-52bc-43e3-a517-c91ec86047f4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 1.5, 1.5, ARRAY[DATE '2026-07-01',DATE '2026-07-08']::date[], 'DCH019 [apps: +lop:2026-07-01,2026-07-08]'),
  ('d63f1234-52bc-43e3-a517-c91ec86047f4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-07',DATE '2026-08-08']::date[], 'DCH019 [apps: +lop:2026-08-07,2026-08-08]'),
  ('a4326b22-64fb-48d6-ae7c-19a6b032b12f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH006 [reduction]'),
  ('2e8e3c1f-5f96-4a0f-a7ab-6e128d33af04'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH007 [reduction]'),
  ('288f9b09-8717-49ea-b681-a5ec0efa1c60'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH014 [reduction]'),
  ('e703d5fd-a6b3-4e88-bc53-24bc1bf2a46d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH004 [reduction]'),
  ('7d821b39-d346-4403-992b-94010dfc4e50'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH005 [reduction]'),
  ('ff73e5bf-8298-4825-9399-34428197f21a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH029 [admin-only]'),
  ('ff73e5bf-8298-4825-9399-34428197f21a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-09',DATE '2026-07-17']::date[], 'DCH029 [apps: +lop:2026-07-09,2026-07-17]'),
  ('ff73e5bf-8298-4825-9399-34428197f21a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-12']::date[], 'DCH029 [apps: +lop:2026-08-06,2026-08-12]'),
  ('9e861539-76d2-4e87-8d1b-eac6770dea53'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH038 [admin-only]'),
  ('9e861539-76d2-4e87-8d1b-eac6770dea53'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-04',DATE '2026-07-24']::date[], 'DCH038 [apps: +lop:2026-07-04,2026-07-24]'),
  ('9e861539-76d2-4e87-8d1b-eac6770dea53'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-29']::date[], 'DCH038 [apps:2026-08-29]'),
  ('9deb9203-cf44-4fb7-ba49-cc9df3dd5acb'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH030 [reduction]'),
  ('09169b66-b31e-4442-84f5-3a4da6a58fbe'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH042 [reduction]'),
  ('09169b66-b31e-4442-84f5-3a4da6a58fbe'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH042 [reduction]'),
  ('42902892-a00a-40c9-8d15-f998616eb8f9'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH043 [reduction]'),
  ('42902892-a00a-40c9-8d15-f998616eb8f9'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'DCH043 [reduction]'),
  ('42902892-a00a-40c9-8d15-f998616eb8f9'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-31',DATE '2026-08-12']::date[], 'DCH043 [apps:2026-08-31 +lop:2026-08-12]'),
  ('0461050e-0368-47d5-be35-e90362f552aa'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH039 [admin-only]'),
  ('0461050e-0368-47d5-be35-e90362f552aa'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, NULL::date[], 'DCH039 [admin-only]'),
  ('0461050e-0368-47d5-be35-e90362f552aa'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 0.5, ARRAY[DATE '2026-08-08']::date[], 'DCH039 [apps:2026-08-08]'),
  ('e7ca967c-9576-4dfe-916e-7d68f67a6670'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH040 [reduction]'),
  ('e7ca967c-9576-4dfe-916e-7d68f67a6670'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH040 [reduction]'),
  ('36664ea2-aa69-4717-8069-189bcef604d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'DCH041 [admin-only]'),
  ('36664ea2-aa69-4717-8069-189bcef604d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH041 [reduction]'),
  ('36664ea2-aa69-4717-8069-189bcef604d1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-29']::date[], 'DCH041 [apps:2026-08-29]'),
  ('497fe5c6-2215-4905-a8b5-583cb2069f2b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH046 [admin-only]'),
  ('497fe5c6-2215-4905-a8b5-583cb2069f2b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH046 [reduction]'),
  ('ab60592a-b1d5-481d-8b7b-c5c5337f0593'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH051 [reduction]'),
  ('ab60592a-b1d5-481d-8b7b-c5c5337f0593'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH051 [reduction]'),
  ('ab60592a-b1d5-481d-8b7b-c5c5337f0593'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 3, 3, ARRAY[DATE '2026-08-12',DATE '2026-08-20']::date[], 'DCH051 [apps: +lop:2026-08-12,2026-08-20]'),
  ('6a32c052-62ad-49ad-a979-86207b6f077b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH050 [reduction]'),
  ('6a32c052-62ad-49ad-a979-86207b6f077b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH050 [reduction]'),
  ('57cb785e-6770-4222-8119-7d41dbc70da8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH049 [admin-only]'),
  ('57cb785e-6770-4222-8119-7d41dbc70da8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH049 [reduction]'),
  ('57cb785e-6770-4222-8119-7d41dbc70da8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1.5, ARRAY[DATE '2026-08-01',DATE '2026-08-08']::date[], 'DCH049 [apps: +lop:2026-08-01,2026-08-08]'),
  ('0308b46f-9128-4f61-99ce-fe8976f1dedf'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH055 [reduction]'),
  ('f66b5112-9477-4c9a-a414-7b049ea768a8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH054 [reduction]'),
  ('f66b5112-9477-4c9a-a414-7b049ea768a8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-01',DATE '2026-07-02',DATE '2026-07-03']::date[], 'DCH054 [apps: +lop:2026-07-01,2026-07-02,2026-07-03]'),
  ('f66b5112-9477-4c9a-a414-7b049ea768a8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-04']::date[], 'DCH054 [apps: +lop:2026-08-01,2026-08-04]'),
  ('5f91d49c-85e0-41aa-b225-93c33efef9f0'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH057 [admin-only]'),
  ('09de5bd4-6762-43a5-9784-e0653951f395'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH058 [reduction]'),
  ('09de5bd4-6762-43a5-9784-e0653951f395'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH058 [reduction]'),
  ('f345e7ea-7d8d-4508-b24a-56745d9d9407'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH059 [reduction]'),
  ('f345e7ea-7d8d-4508-b24a-56745d9d9407'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH059 [reduction]'),
  ('1127d682-e432-41f5-ae99-4d5a35e1a562'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH061 [admin-only]'),
  ('1127d682-e432-41f5-ae99-4d5a35e1a562'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH061 [reduction]'),
  ('8ddd7ec0-262f-457e-8e2a-87a64de7f232'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH062 [reduction]'),
  ('8ddd7ec0-262f-457e-8e2a-87a64de7f232'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH062 [reduction]'),
  ('2cdfeeef-76e6-4cdf-b735-ef4ba8294290'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH064 [admin-only]'),
  ('2cdfeeef-76e6-4cdf-b735-ef4ba8294290'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-03',DATE '2026-07-06']::date[], 'DCH064 [apps: +lop:2026-07-03,2026-07-06]'),
  ('2cdfeeef-76e6-4cdf-b735-ef4ba8294290'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-05',DATE '2026-08-10']::date[], 'DCH064 [apps:2026-08-05 +lop:2026-08-10]'),
  ('299f673a-86c0-41cc-93aa-de655a5ccf0d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH065 [reduction]'),
  ('7f9b31ee-f0ae-4a22-a42c-27a3c59fe5be'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH067 [admin-only]'),
  ('7f9b31ee-f0ae-4a22-a42c-27a3c59fe5be'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-05',DATE '2026-08-06']::date[], 'DCH067 [apps: +lop:2026-08-05,2026-08-06]'),
  ('7733014b-73a7-4e59-945c-811e7448538c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3.5, 3.5, NULL::date[], 'DCH068 [admin-only]'),
  ('7733014b-73a7-4e59-945c-811e7448538c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 4, 4, ARRAY[DATE '2026-07-02',DATE '2026-07-03',DATE '2026-07-04',DATE '2026-07-07']::date[], 'DCH068 [apps: +lop:2026-07-02,2026-07-03,2026-07-04,2026-07-07]'),
  ('7733014b-73a7-4e59-945c-811e7448538c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-14']::date[], 'DCH068 [apps: +lop:2026-08-01,2026-08-14]'),
  ('295b2d65-439f-48b1-924d-fd57e4e86f5f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH069 [reduction]'),
  ('295b2d65-439f-48b1-924d-fd57e4e86f5f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH069 [reduction]'),
  ('fc8d2258-2393-483e-a748-d7571f48976f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH071 [admin-only]'),
  ('fc8d2258-2393-483e-a748-d7571f48976f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-04',DATE '2026-07-06',DATE '2026-07-18']::date[], 'DCH071 [apps: +lop:2026-07-04,2026-07-06,2026-07-18]'),
  ('fc8d2258-2393-483e-a748-d7571f48976f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'DCH071 [apps: +lop:2026-08-01]'),
  ('04483fe2-1248-4fc3-92f1-f8031109e655'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'DCH072 [reduction]'),
  ('04483fe2-1248-4fc3-92f1-f8031109e655'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH072 [reduction]'),
  ('04483fe2-1248-4fc3-92f1-f8031109e655'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-05',DATE '2026-08-07']::date[], 'DCH072 [apps:2026-08-05 +lop:2026-08-07]'),
  ('8bb147f8-1bd1-4dd9-8036-a60acf81ba8b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'DCH074 [admin-only]'),
  ('8bb147f8-1bd1-4dd9-8036-a60acf81ba8b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-05',DATE '2026-08-13']::date[], 'DCH074 [apps:2026-08-05 +lop:2026-08-13]'),
  ('f1ff0087-130f-4a18-8cc1-73716b446dee'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'DCH075 [admin-only]'),
  ('918392f7-59b7-4ccd-907d-afac26d7b1cd'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'DCH076 [admin-only]'),
  ('918392f7-59b7-4ccd-907d-afac26d7b1cd'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 3, 2, ARRAY[DATE '2026-08-04',DATE '2026-08-14',DATE '2026-08-22']::date[], 'DCH076 [apps:2026-08-04 +lop:2026-08-14,2026-08-22]'),
  ('c0f3ea7b-84cc-432c-ae37-0b27970946cb'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0.5, -0.5, NULL::date[], 'DCH077 [reduction]'),
  ('c0f3ea7b-84cc-432c-ae37-0b27970946cb'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-17',DATE '2026-07-20',DATE '2026-07-25']::date[], 'DCH077 [apps: +lop:2026-07-17,2026-07-20,2026-07-25]'),
  ('c0f3ea7b-84cc-432c-ae37-0b27970946cb'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0.5, ARRAY[DATE '2026-08-28']::date[], 'DCH077 [apps:2026-08-28]'),
  ('5b064b9d-f3bb-43ca-aca6-eca3b591176e'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'DCH053 [reduction]'),
  ('5b064b9d-f3bb-43ca-aca6-eca3b591176e'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-01']::date[], 'DCH053 [apps:2026-08-01]'),
  ('45d334ea-8232-439c-a030-2809ad10de74'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, NULL::date[], 'DCH078 [admin-only]'),
  ('a0badb25-5f49-4cc7-b5a5-90aeb167c4a5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH007 [reduction]'),
  ('a0badb25-5f49-4cc7-b5a5-90aeb167c4a5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH007 [reduction]'),
  ('a0badb25-5f49-4cc7-b5a5-90aeb167c4a5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 0.5, 0.5, NULL::date[], 'NOTDCH007 [admin-only]'),
  ('255f66eb-3ab6-4c66-a9c1-e224f810c5f1'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-10']::date[], 'NOTDCH016 [apps:2026-08-10]'),
  ('886fa72f-502f-4837-a3d5-c1afdc1c9167'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'NOTDCH010 [reduction]'),
  ('e2a2b6d0-a642-400b-9643-e30176468c08'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 6.5, 6.5, NULL::date[], 'NOTDCH003 [admin-only]'),
  ('e2a2b6d0-a642-400b-9643-e30176468c08'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-08',DATE '2026-07-23']::date[], 'NOTDCH003 [apps: +lop:2026-07-08,2026-07-23]'),
  ('e2a2b6d0-a642-400b-9643-e30176468c08'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-07']::date[], 'NOTDCH003 [apps: +lop:2026-08-07]'),
  ('d85d7dce-7fbc-4401-bbb6-8ed962eeb436'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH079 [admin-only]'),
  ('d85d7dce-7fbc-4401-bbb6-8ed962eeb436'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-01',DATE '2026-07-06']::date[], 'NOTDCH079 [apps: +lop:2026-07-01,2026-07-06]'),
  ('d85d7dce-7fbc-4401-bbb6-8ed962eeb436'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-05']::date[], 'NOTDCH079 [apps: +lop:2026-08-05]'),
  ('f2452bf2-c6cd-42df-8aa6-04897c7aac9d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH020 [reduction]'),
  ('f2452bf2-c6cd-42df-8aa6-04897c7aac9d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH020 [reduction]'),
  ('f2452bf2-c6cd-42df-8aa6-04897c7aac9d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'NOTDCH020 [apps: +lop:2026-08-04]'),
  ('255aecc0-4db7-4bc1-845c-4041e27172f8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'NOTDCH006 [admin-only]'),
  ('255aecc0-4db7-4bc1-845c-4041e27172f8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2.5, 2.5, ARRAY[DATE '2026-07-17',DATE '2026-07-22']::date[], 'NOTDCH006 [apps: +lop:2026-07-17,2026-07-22]'),
  ('255aecc0-4db7-4bc1-845c-4041e27172f8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-21',DATE '2026-08-29']::date[], 'NOTDCH006 [apps:2026-08-21 +lop:2026-08-29]'),
  ('20c3f248-09f3-4a3c-916e-4fe7b1b1f5aa'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH008 [admin-only]'),
  ('20c3f248-09f3-4a3c-916e-4fe7b1b1f5aa'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-10']::date[], 'NOTDCH008 [apps: +lop:2026-08-01,2026-08-10]'),
  ('624d7ef6-1fa6-4ee8-a30d-6cd42b9cdc86'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2.5, 2.5, ARRAY[DATE '2026-07-03',DATE '2026-07-15',DATE '2026-07-20']::date[], 'NOTDCH012 [apps: +lop:2026-07-03,2026-07-15,2026-07-20]'),
  ('9c6cc217-05bb-4b48-9759-2e1196948d4f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH011 [admin-only]'),
  ('9c6cc217-05bb-4b48-9759-2e1196948d4f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH011 [reduction]'),
  ('efcca7d7-098d-484a-b556-bbcaad6a8153'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH017 [reduction]'),
  ('efcca7d7-098d-484a-b556-bbcaad6a8153'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-07',DATE '2026-08-12']::date[], 'NOTDCH017 [apps: +lop:2026-08-07,2026-08-12]'),
  ('0b86ed35-8f8c-4685-bc9a-e792012259ad'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH019 [admin-only]'),
  ('0b86ed35-8f8c-4685-bc9a-e792012259ad'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH019 [reduction]'),
  ('0b86ed35-8f8c-4685-bc9a-e792012259ad'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, NULL::date[], 'NOTDCH019 [admin-only]'),
  ('f7c8f8fb-9b63-4865-abcc-2bbae6688bd5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1.5, ARRAY[DATE '2026-08-05',DATE '2026-08-06']::date[], 'NOTDCH025 [apps: +lop:2026-08-05,2026-08-06]'),
  ('a4a1bc80-1d10-4300-a7e9-c84050959745'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH028 [admin-only]'),
  ('a4a1bc80-1d10-4300-a7e9-c84050959745'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'NOTDCH028 [reduction]'),
  ('a4a1bc80-1d10-4300-a7e9-c84050959745'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, NULL::date[], 'NOTDCH028 [admin-only]'),
  ('437b8891-1ca6-479e-acaf-fb207947b305'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-05']::date[], 'NOTDCH029 [apps:2026-08-05]'),
  ('5970778c-0e79-4850-b347-6922a8125a0d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH030 [reduction]'),
  ('5970778c-0e79-4850-b347-6922a8125a0d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-14']::date[], 'NOTDCH030 [apps: +lop:2026-08-14]'),
  ('d9f30fdf-e1d3-4ec4-8931-44cc64adf8c8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH031 [reduction]'),
  ('1eb5e1af-d9cb-4f09-b4c8-5a4c9ebfc542'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-01',DATE '2026-07-20']::date[], 'NOTDCH033 [apps: +lop:2026-07-01,2026-07-20]'),
  ('1eb5e1af-d9cb-4f09-b4c8-5a4c9ebfc542'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-07']::date[], 'NOTDCH033 [apps: +lop:2026-08-06,2026-08-07]'),
  ('53e3bbdd-e7ea-46bb-8569-79eb54f0d29c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH039 [reduction]'),
  ('53e3bbdd-e7ea-46bb-8569-79eb54f0d29c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 3, 3, ARRAY[DATE '2026-08-01',DATE '2026-08-12',DATE '2026-08-14']::date[], 'NOTDCH039 [apps: +lop:2026-08-01,2026-08-12,2026-08-14]'),
  ('4b196a1e-e04d-4c57-b3a7-fef3467cf242'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH037 [admin-only]'),
  ('4b196a1e-e04d-4c57-b3a7-fef3467cf242'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-06',DATE '2026-07-07',DATE '2026-07-10']::date[], 'NOTDCH037 [apps: +lop:2026-07-06,2026-07-07,2026-07-10]'),
  ('4b196a1e-e04d-4c57-b3a7-fef3467cf242'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-14']::date[], 'NOTDCH037 [apps: +lop:2026-08-01,2026-08-14]'),
  ('d2d79f8c-8280-4b3f-9a8e-0fee49c9b24d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH038 [reduction]'),
  ('d2d79f8c-8280-4b3f-9a8e-0fee49c9b24d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-08',DATE '2026-07-17',DATE '2026-07-18']::date[], 'NOTDCH038 [apps: +lop:2026-07-08,2026-07-17,2026-07-18]'),
  ('88530d59-1752-46be-9cc9-32aeddc2114b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH040 [reduction]'),
  ('88530d59-1752-46be-9cc9-32aeddc2114b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-11',DATE '2026-07-14',DATE '2026-07-27']::date[], 'NOTDCH040 [apps: +lop:2026-07-11,2026-07-14,2026-07-27]'),
  ('88530d59-1752-46be-9cc9-32aeddc2114b'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-08']::date[], 'NOTDCH040 [apps: +lop:2026-08-08]'),
  ('50e0fec7-c8b4-40cb-b4ab-3b13a77340f6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-10',DATE '2026-07-22']::date[], 'NOTDCH041 [apps: +lop:2026-07-10,2026-07-22]'),
  ('50e0fec7-c8b4-40cb-b4ab-3b13a77340f6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'NOTDCH041 [apps: +lop:2026-08-01]'),
  ('077a42cf-464c-4698-8ba5-f244f4c9cfe6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH042 [reduction]'),
  ('077a42cf-464c-4698-8ba5-f244f4c9cfe6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-08',DATE '2026-07-11']::date[], 'NOTDCH042 [apps: +lop:2026-07-08,2026-07-11]'),
  ('077a42cf-464c-4698-8ba5-f244f4c9cfe6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-08']::date[], 'NOTDCH042 [apps: +lop:2026-08-01,2026-08-08]'),
  ('c636d8b4-d811-487b-9b97-a830ce2a3275'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'NOTDCH043 [admin-only]'),
  ('c636d8b4-d811-487b-9b97-a830ce2a3275'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, NULL::date[], 'NOTDCH043 [admin-only]'),
  ('c636d8b4-d811-487b-9b97-a830ce2a3275'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 0.5, 0.5, NULL::date[], 'NOTDCH043 [admin-only]'),
  ('0a3f488a-b4dd-4842-b050-4782f31fff5d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH044 [admin-only]'),
  ('0a3f488a-b4dd-4842-b050-4782f31fff5d'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-10',DATE '2026-08-21']::date[], 'NOTDCH044 [apps: +lop:2026-08-10,2026-08-21]'),
  ('63eaacfc-d043-4cb5-9179-8b6e0f91bda6'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH065 [reduction]'),
  ('638b3907-0c6f-4304-9ce1-b3c63bb8cdc8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2.5, 2.5, NULL::date[], 'NOTDCH046 [admin-only]'),
  ('638b3907-0c6f-4304-9ce1-b3c63bb8cdc8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-04',DATE '2026-07-07',DATE '2026-07-08']::date[], 'NOTDCH046 [apps: +lop:2026-07-04,2026-07-07,2026-07-08]'),
  ('638b3907-0c6f-4304-9ce1-b3c63bb8cdc8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-12']::date[], 'NOTDCH046 [apps: +lop:2026-08-06,2026-08-12]'),
  ('5e1d7600-a690-4767-a956-691dc2486907'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH048 [admin-only]'),
  ('5e1d7600-a690-4767-a956-691dc2486907'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH048 [reduction]'),
  ('5e1d7600-a690-4767-a956-691dc2486907'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-05']::date[], 'NOTDCH048 [apps: +lop:2026-08-05]'),
  ('190d7bb4-bb15-4962-a149-d863945def05'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'NOTDCH049 [admin-only]'),
  ('190d7bb4-bb15-4962-a149-d863945def05'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2.5, 2.5, ARRAY[DATE '2026-07-09',DATE '2026-07-11',DATE '2026-07-20']::date[], 'NOTDCH049 [apps: +lop:2026-07-09,2026-07-11,2026-07-20]'),
  ('190d7bb4-bb15-4962-a149-d863945def05'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-01',DATE '2026-08-07']::date[], 'NOTDCH049 [apps: +lop:2026-08-01,2026-08-07]'),
  ('c8cb37b9-dbf5-4e77-9edc-901518e5c11e'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-07',DATE '2026-08-27']::date[], 'NOTDCH050 [apps: +lop:2026-08-07,2026-08-27]'),
  ('a8292af2-9c12-42fb-bdc0-e27fc1ba9426'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'NOTDCH009 [apps: +lop:2026-08-04]'),
  ('fda56386-e32f-43b9-8bd8-a91cd1061d48'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 5.5, 5.5, NULL::date[], 'NOTDCH051 [admin-only]'),
  ('fda56386-e32f-43b9-8bd8-a91cd1061d48'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-11']::date[], 'NOTDCH051 [apps: +lop:2026-08-11]'),
  ('9cfa23f2-0185-4bd4-b87b-da71cefe6f2a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'NOTDCH052 [admin-only]'),
  ('9cfa23f2-0185-4bd4-b87b-da71cefe6f2a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-09',DATE '2026-07-17',DATE '2026-07-20']::date[], 'NOTDCH052 [apps: +lop:2026-07-09,2026-07-17,2026-07-20]'),
  ('9cfa23f2-0185-4bd4-b87b-da71cefe6f2a'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-14',DATE '2026-08-21']::date[], 'NOTDCH052 [apps: +lop:2026-08-14,2026-08-21]'),
  ('cc4d72cf-886f-4616-b999-959f0756d8c2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'NOTDCH053 [admin-only]'),
  ('cc4d72cf-886f-4616-b999-959f0756d8c2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH053 [reduction]'),
  ('b17a1bed-8ee4-48cf-bd90-4c9c7f48d1d8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH054 [reduction]'),
  ('b17a1bed-8ee4-48cf-bd90-4c9c7f48d1d8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, NULL::date[], 'NOTDCH054 [admin-only]'),
  ('d8b3c72b-c634-4e10-aeba-3784e076f4e4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH055 [reduction]'),
  ('d8b3c72b-c634-4e10-aeba-3784e076f4e4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-21',DATE '2026-08-22']::date[], 'NOTDCH055 [apps: +lop:2026-08-21,2026-08-22]'),
  ('b7045d9b-a8fb-41d4-89bb-5879bd86610c'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, NULL::date[], 'NOTDCH056 [admin-only]'),
  ('97180c8a-9991-48d9-91f1-1d1f6b6d559e'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'NOTDCH058 [apps: +lop:2026-08-04]'),
  ('e0657783-620e-43cc-90f2-cc6c9d8238d2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTDCH059 [admin-only]'),
  ('e0657783-620e-43cc-90f2-cc6c9d8238d2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH059 [reduction]'),
  ('e0657783-620e-43cc-90f2-cc6c9d8238d2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'NOTDCH059 [apps: +lop:2026-08-01]'),
  ('f5ca7b8b-2120-4fc8-bbc0-5cfa4e257efd'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-01',DATE '2026-07-02']::date[], 'NOTDCH060 [apps: +lop:2026-07-01,2026-07-02]'),
  ('f5ca7b8b-2120-4fc8-bbc0-5cfa4e257efd'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-17']::date[], 'NOTDCH060 [apps: +lop:2026-08-17]'),
  ('8de78a87-d341-4241-a5fa-76c1e21f114f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 6, 6, NULL::date[], 'NOTDCH063 [admin-only]'),
  ('8de78a87-d341-4241-a5fa-76c1e21f114f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-01',DATE '2026-07-03',DATE '2026-07-08']::date[], 'NOTDCH063 [apps: +lop:2026-07-01,2026-07-03,2026-07-08]'),
  ('8de78a87-d341-4241-a5fa-76c1e21f114f'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-07']::date[], 'NOTDCH063 [apps: +lop:2026-08-06,2026-08-07]'),
  ('6907fec6-207a-4073-835d-be8a6152d236'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH064 [reduction]'),
  ('6907fec6-207a-4073-835d-be8a6152d236'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH064 [reduction]'),
  ('d89b4573-0e69-419a-8fb0-4094fb9d49e5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'DCH070 [admin-only]'),
  ('d89b4573-0e69-419a-8fb0-4094fb9d49e5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-01',DATE '2026-07-02']::date[], 'DCH070 [apps: +lop:2026-07-01,2026-07-02]'),
  ('d89b4573-0e69-419a-8fb0-4094fb9d49e5'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-22',DATE '2026-08-24']::date[], 'DCH070 [apps: +lop:2026-08-22,2026-08-24]'),
  ('20cedfe0-7045-431b-a5d7-2fede21099c8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3.5, 3.5, NULL::date[], 'NOTDCH069 [admin-only]'),
  ('20cedfe0-7045-431b-a5d7-2fede21099c8'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH069 [reduction]'),
  ('15530de1-3f58-4b54-b827-bbb0fec777c7'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-14',DATE '2026-07-21']::date[], 'NOTDCH070 [apps: +lop:2026-07-14,2026-07-21]'),
  ('15530de1-3f58-4b54-b827-bbb0fec777c7'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 1.5, ARRAY[DATE '2026-08-12']::date[], 'NOTDCH070 [apps: +lop:2026-08-12]'),
  ('a2068674-8417-4984-a573-a475fcb8978e'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-03',DATE '2026-07-18']::date[], 'NOTDCH068 [apps: +lop:2026-07-03,2026-07-18]'),
  ('cef8cadd-b73f-43fd-bd25-38029c6ec9a9'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTDCH071 [reduction]'),
  ('cef8cadd-b73f-43fd-bd25-38029c6ec9a9'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-17']::date[], 'NOTDCH071 [apps: +lop:2026-08-17]'),
  ('c8868521-b7a0-4789-a92d-230962947491'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4.5, 4.5, NULL::date[], 'NOTDCH074 [admin-only]'),
  ('c8868521-b7a0-4789-a92d-230962947491'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, ARRAY[DATE '2026-07-10',DATE '2026-07-13']::date[], 'NOTDCH074 [apps: +lop:2026-07-10,2026-07-13]'),
  ('c8868521-b7a0-4789-a92d-230962947491'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-07',DATE '2026-08-08']::date[], 'NOTDCH074 [apps: +lop:2026-08-07,2026-08-08]'),
  ('bcf6a467-cb99-4079-aa4b-b04d83a76e97'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'NOTDCH075 [admin-only]'),
  ('bcf6a467-cb99-4079-aa4b-b04d83a76e97'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-17',DATE '2026-07-18',DATE '2026-07-27']::date[], 'NOTDCH075 [apps: +lop:2026-07-17,2026-07-18,2026-07-27]'),
  ('bcf6a467-cb99-4079-aa4b-b04d83a76e97'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-12']::date[], 'NOTDCH075 [apps: +lop:2026-08-12]'),
  ('9d39bf1f-88fb-4761-918b-bf6883f789e4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, ARRAY[DATE '2026-07-09',DATE '2026-07-10',DATE '2026-07-25']::date[], 'NOTDCH076 [apps: +lop:2026-07-09,2026-07-10,2026-07-25]'),
  ('9d39bf1f-88fb-4761-918b-bf6883f789e4'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 2, ARRAY[DATE '2026-08-06',DATE '2026-08-12']::date[], 'NOTDCH076 [apps: +lop:2026-08-06,2026-08-12]'),
  ('7eff29b3-d977-4301-a7f2-8e51aa9094a2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 1, 1, ARRAY[DATE '2026-07-01']::date[], 'NOTDCH077 [apps: +lop:2026-07-01]'),
  ('7eff29b3-d977-4301-a7f2-8e51aa9094a2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'NOTDCH077 [apps: +lop:2026-08-04]'),
  ('443ef77a-31cf-4782-87d5-46a63dce8ea2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'NOTDCH061 [reduction]'),
  ('443ef77a-31cf-4782-87d5-46a63dce8ea2'::uuid, '7a7c3d5a-9d45-446b-8e39-d0c91d9d77ad'::uuid, '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01',DATE '2026-08-04']::date[], 'NOTDCH061 [apps: +lop:2026-08-01,2026-08-04]');

-- Upsert month_entries from staging
INSERT INTO public.hr_leave_month_entries (
  employee_id, leave_type_id, hr_organization_id, hr_academic_year_id,
  month_start, days, added_days, evidence_dates, reason, created_by)
SELECT t.employee_id, t.leave_type_id, t.hr_organization_id, t.hr_academic_year_id,
       t.month_start, t.days, t.added_days, t.evidence_dates,
       'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Dental sheet). ' || t.note,
       v_admin
  FROM _target t
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
DO UPDATE SET
  days = EXCLUDED.days,
  added_days = public.hr_leave_month_entries.added_days + (EXCLUDED.days - public.hr_leave_month_entries.days),
  evidence_dates = EXCLUDED.evidence_dates,
  reason = EXCLUDED.reason,
  updated_at = now();

-- Recompute `used` absolutely for every affected employee, using the general
-- formula (entries + approved apps not covered by an entry). Paired EXISTS
-- join, not two independent IN filters, to avoid touching an unrelated
-- stray-institution balance row for the same person.
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
