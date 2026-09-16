-- ============================================================================
-- Correct Casual Leave (CL) balances for Jun-Aug 2026 at JKKN College of
-- Engineering & Technology, against payroll-verified Excel sheets:
--   "Paid Leave Summary Jun-Aug 2026 - Engineering Non Teaching.xlsx" (23 rows)
--   "Paid Leave Summary Jun-Aug 2026 - Engineering Teaching.xlsx" (57 rows)
-- Created: 2026-09-16. Sixth institution batch in this project (after
-- Education, Pharmacy, Nursing, Arts, Main Office).
--
-- Method: hr_leave_month_entries overrides only (never real application
-- inserts), same as every prior batch -- required because
-- hr_trig_block_leave_in_locked_period and hr_trig_leave_enforce_balance
-- would block many of these as real backdated applications. Evidence
-- preference: real LOP (Loss of Pay) attendance dates first, "Recorded by
-- admin" only when no LOP evidence exists for that person/month (June is
-- unevidenced for everyone -- zero hr_attendance_records exist for June 2026
-- at any institution, confirmed again here).
--
-- Read-only reconnaissance was run twice via a "read-only, no writes" fork
-- (first attempt produced a garbled/self-contradictory report and was
-- discarded without use; the retry's findings were independently verified
-- against the live DB before use here: Sakthivel M.R's dual-balance-row
-- explanation, the Rajeswari V single-person resolution, and Deepika R/
-- CET043's 23-day August LOP anomaly all confirmed directly).
--
-- Sheet A (Non-Teaching, 23 rows) overlap: 12 names are pre-existing Main
-- Office staff who were ALREADY corrected in the Main Office batch
-- (20260916110000) -- no distinct Engineering-institution person shares any
-- of those names, so no action needed here. Sakthivel M.R (NOTJMO085) holds
-- a stray Engineering-tagged CL balance row (used=2, untouched original
-- 2026-09-07 reset default) that he does not actually work under -- same
-- artifact class as Gobinath K's stray Arts-tagged row from the Arts batch.
-- Left alone, consistent with that precedent. 8 new Sheet A people are
-- corrected below. Nandhagopalan S (NOTCET017) is genuinely Engineering but
-- was already corrected as part of the Main Office batch's spillover.
--
-- Sheet B (Teaching, 57 rows): the sheet's own Employee-ID column proved
-- systematically unreliable (every ID resolves to the wrong person) --
-- resolved all 57 rows by name against the live Engineering roster instead.
--
-- 16 people held out with NO correction, pending HR source verification --
-- implausible June CL figures (6-13 days; CL caps at 12/year) that do not
-- reconcile against any other leave type, OD applications, or LOP evidence
-- for that month (Engineering has no day-denominated second leave type that
-- could absorb these): Ranjithkumar S, Ponnarasi N, Porkodi G, Vimala C,
-- Tamilselvi S, Lakshmi T, Balakumaran B, Sharmila B, Saranya G, Vaishnave M,
-- Vijayaprabhakaran S, Deepika R/CET043 (whose August target of 2 directly
-- contradicts her 23 real LOP days that same month), plus 4 more found by an
-- independent re-scan of the raw sheet against the >=6-day threshold that
-- the recon fork's own outlier list had missed: Arun V P (7), Akila M (6),
-- Praveen Kumar K (6), Rajesh K.P (6) -- verified directly against the DB to
-- have no LOP evidence and no other leave-type activity in June either.
--
-- Two duplicate-name rows on Sheet B resolve to ONE real person, not two
-- (RAJESWARI V, row 50 Jun=2/Jul=-/Aug=- and row 53 Jun=-/Jul=1/Aug=-, both
-- CET047) -- the two rows are complementary (no overlapping month), merged
-- into a single target of Jun=2/Jul=1/Aug=-.
--
-- Two people needed no correction at all despite being in-scope: Nandhini V
-- (CET066, joined 2026-08-24, has zero hr_leave_month_entries/balance rows
-- at all -- her Aug target of 0 already matches the de-facto zero state) and
-- everyone whose sheet target already matched their current baseline exactly
-- (mostly real August applications that already equalled the target).
--
-- Palanisamy K (CET030, is_active=false, joined 2024-07-19) shows "-" for
-- Jul/Aug on the sheet despite being employed well before June -- unlike
-- every other "-" row in this project, this can't mean "not yet employed".
-- Per user decision: treat Jul/Aug "-" as no correction needed, but still
-- correct June (1 -> 0.5, a plain reduction, no evidence needed).
--
-- "-" convention otherwise confirmed consistent with every prior batch: it
-- means the person had not yet joined that month (verified via
-- date_of_joining for every dash row on both sheets) -- left untouched.
--
-- hr_attendance_periods has ZERO rows for Engineering (no institution-level
-- lock records at all) -- no locked-period blocker here, unlike Main
-- Office's July or Education's August.
-- ============================================================================

DO $$
DECLARE
  v_year_id CONSTANT uuid := '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
  v_cl_type CONSTANT uuid := 'ca9242bd-2abf-48f8-8f8d-bae685ec4448';
  v_org_id  CONSTANT uuid := 'af210159-723c-4da2-9663-19f464d8c64e';
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
  ('743778c3-e80d-47ff-bda6-54cc46b62b9d'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, NULL::date[], 'NOTCET005 [admin-only]'),
  ('743778c3-e80d-47ff-bda6-54cc46b62b9d'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-08']::date[], 'NOTCET005 [apps:2026-08-08]'),
  ('c11d3a04-0286-4a66-b436-5ddc589fa996'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'NOTCET004 [apps: +lop:2026-08-04]'),
  ('1d39f92c-7b5d-4ee0-9505-bf763f2dac4f'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'NOTCET018 [admin-only]'),
  ('e57d5fb6-2cfc-4772-a599-0e40300d47aa'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTCET019 [reduction]'),
  ('e57d5fb6-2cfc-4772-a599-0e40300d47aa'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 1.5, 1.5, NULL::date[], 'NOTCET019 [admin-only]'),
  ('e57d5fb6-2cfc-4772-a599-0e40300d47aa'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 0.5, ARRAY[DATE '2026-08-08',DATE '2026-08-27']::date[], 'NOTCET019 [apps:2026-08-08,2026-08-27]'),
  ('53f8644f-b1ee-465b-9901-4f032d4313f9'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'NOTCET021 [reduction]'),
  ('69ea5bda-0036-4b2a-8624-48402fdcb47f'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'NOTCET016 [admin-only]'),
  ('69ea5bda-0036-4b2a-8624-48402fdcb47f'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-27']::date[], 'NOTCET016 [apps:2026-08-27]'),
  ('3b72621e-70c3-4753-9752-00960e85c543'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-01']::date[], 'NOTCET022 [apps:2026-08-01]'),
  ('b48dde2b-587e-4bea-b9f2-70419d50e694'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, NULL::date[], 'NOTCET024 [admin-only]'),
  ('b48dde2b-587e-4bea-b9f2-70419d50e694'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'NOTCET024 [apps: +lop:2026-08-01]'),
  ('ff098fc7-67c2-4ca0-b9f3-9ecafe4a3464'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'CET001 [reduction]'),
  ('5bf7d19e-a4ca-498e-af8d-faaae4d5a6b8'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4.5, 4.5, NULL::date[], 'CET002 [admin-only]'),
  ('5bf7d19e-a4ca-498e-af8d-faaae4d5a6b8'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3.5, 3.5, NULL::date[], 'CET002 [admin-only]'),
  ('5bf7d19e-a4ca-498e-af8d-faaae4d5a6b8'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-07']::date[], 'CET002 [apps:2026-08-07]'),
  ('a7a5b9d6-8ab4-47b8-b2b5-81bb67531b34'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'CET006 [reduction]'),
  ('a7a5b9d6-8ab4-47b8-b2b5-81bb67531b34'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'CET006 [reduction]'),
  ('a7a5b9d6-8ab4-47b8-b2b5-81bb67531b34'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1.5, 0.5, ARRAY[DATE '2026-08-25']::date[], 'CET006 [apps:2026-08-25]'),
  ('a833c87c-1dc8-4677-b247-c45473d48f46'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'CET013 [admin-only]'),
  ('a833c87c-1dc8-4677-b247-c45473d48f46'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-04']::date[], 'CET013 [apps:2026-08-04]'),
  ('527d598d-cd5d-4f69-9316-c5fca9380836'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 5, 5, NULL::date[], 'CET015 [admin-only]'),
  ('527d598d-cd5d-4f69-9316-c5fca9380836'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'CET015 [reduction]'),
  ('681e9c6d-2891-497b-91bb-dafddedaaca7'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'CET016 [admin-only]'),
  ('681e9c6d-2891-497b-91bb-dafddedaaca7'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0.5, ARRAY[DATE '2026-08-25']::date[], 'CET016 [apps:2026-08-25]'),
  ('033a1ee4-7327-40d4-ab5f-f4f93cd4407a'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'CET017 [admin-only]'),
  ('033a1ee4-7327-40d4-ab5f-f4f93cd4407a'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-07']::date[], 'CET017 [apps:2026-08-07]'),
  ('f85446a8-2348-4f27-a9ce-c0064da3bee3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'CET019 [admin-only]'),
  ('f85446a8-2348-4f27-a9ce-c0064da3bee3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 4, 4, NULL::date[], 'CET019 [admin-only]'),
  ('f85446a8-2348-4f27-a9ce-c0064da3bee3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-12']::date[], 'CET019 [apps:2026-08-12]'),
  ('e080e8ee-3bd0-4b33-a6e0-c085040c8e15'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 5, 5, NULL::date[], 'CET021 [admin-only]'),
  ('e080e8ee-3bd0-4b33-a6e0-c085040c8e15'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'CET021 [reduction]'),
  ('f733911d-12ea-43df-bafd-a4a05541ecc5'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 3, 3, NULL::date[], 'CET025 [admin-only]'),
  ('f733911d-12ea-43df-bafd-a4a05541ecc5'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-19']::date[], 'CET025 [apps:2026-08-19]'),
  ('4fea28be-b446-462f-adea-cf96da90f44a'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'CET026 [admin-only]'),
  ('4fea28be-b446-462f-adea-cf96da90f44a'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'CET026 [reduction]'),
  ('4fea28be-b446-462f-adea-cf96da90f44a'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-01']::date[], 'CET026 [apps:2026-08-01]'),
  ('1c050e1a-e3d8-45cb-a380-75be5a833ea8'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0.5, -0.5, NULL::date[], 'CET030 [reduction]'),
  ('f10bbe3c-daf9-481c-85b9-6766f5460094'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 5, 5, NULL::date[], 'CET036 [admin-only]'),
  ('c704d430-cd14-4a0b-998c-d417c53bf878'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'CET038 [admin-only]'),
  ('c704d430-cd14-4a0b-998c-d417c53bf878'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, NULL::date[], 'CET038 [admin-only]'),
  ('e3fade7a-7c84-415a-b168-adef3e10fbf0'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0.5, -0.5, NULL::date[], 'CET041 [reduction]'),
  ('20cf8c9c-d696-4ffa-b950-21ffcefcb43e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'CET044 [admin-only]'),
  ('20cf8c9c-d696-4ffa-b950-21ffcefcb43e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, NULL::date[], 'CET044 [admin-only]'),
  ('7b027170-6e79-4fe1-9068-6309f77c5b8e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 4, 4, NULL::date[], 'CET045 [admin-only]'),
  ('7b027170-6e79-4fe1-9068-6309f77c5b8e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-12']::date[], 'CET045 [apps: +lop:2026-08-12]'),
  ('9eee8cc9-e54e-4dca-8b20-580203922bc3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'CET046 [reduction]'),
  ('9eee8cc9-e54e-4dca-8b20-580203922bc3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 1.5, 1.5, NULL::date[], 'CET046 [admin-only]'),
  ('9eee8cc9-e54e-4dca-8b20-580203922bc3'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-28']::date[], 'CET046 [apps:2026-08-28]'),
  ('4657519b-7195-43be-a4e4-892116d714e5'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'CET047 [admin-only, merged from Sheet B rows 50+53]'),
  ('59408e92-0813-47f3-b013-94fd3a0f2ca4'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 3, 3, NULL::date[], 'CET048 [admin-only]'),
  ('59408e92-0813-47f3-b013-94fd3a0f2ca4'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-29']::date[], 'CET048 [apps:2026-08-29]'),
  ('8fff8949-c0ae-4f05-9bc8-d563a244aac1'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-01']::date[], 'CET049 [apps: +lop:2026-08-01]'),
  ('436ab61c-c26b-4dc8-a3d5-753d778461da'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'CET050 [admin-only]'),
  ('436ab61c-c26b-4dc8-a3d5-753d778461da'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-18']::date[], 'CET050 [apps:2026-08-18]'),
  ('6e6f9f9e-7d11-4e18-9d50-421ae7c55d2d'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 1.5, 1.5, NULL::date[], 'CET051 [admin-only]'),
  ('6e6f9f9e-7d11-4e18-9d50-421ae7c55d2d'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 0.5, -0.5, ARRAY[DATE '2026-08-12']::date[], 'CET051 [apps:2026-08-12]'),
  ('3c9622a2-9fc9-4586-8b57-5228d6d49c07'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 2, 2, NULL::date[], 'CET052 [admin-only]'),
  ('3c9622a2-9fc9-4586-8b57-5228d6d49c07'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'CET052 [reduction]'),
  ('3c9622a2-9fc9-4586-8b57-5228d6d49c07'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 2, 1, ARRAY[DATE '2026-08-18',DATE '2026-08-19']::date[], 'CET052 [apps:2026-08-18 +lop:2026-08-19]'),
  ('e7c9b33f-b5db-4337-9c92-7b6705a56720'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'CET053 [reduction]'),
  ('e7c9b33f-b5db-4337-9c92-7b6705a56720'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 2, 2, NULL::date[], 'CET053 [admin-only]'),
  ('e7c9b33f-b5db-4337-9c92-7b6705a56720'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-04']::date[], 'CET053 [apps:2026-08-04]'),
  ('3186d2fe-0f16-4d07-aa76-241f3e4530ff'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'CET054 [apps: +lop:2026-08-04]'),
  ('edb7e908-ebd6-443f-a5a6-88ab161f2c31'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-20']::date[], 'CET055 [apps:2026-08-20]'),
  ('23a460ba-374d-4d58-a34f-9b496378a7ed'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-11']::date[], 'CET057 [apps:2026-08-11]'),
  ('17739537-d02b-4a13-91ab-5df53a4ddc3e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0.5, -0.5, NULL::date[], 'CET058 [reduction]'),
  ('17739537-d02b-4a13-91ab-5df53a4ddc3e'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-19']::date[], 'CET058 [apps:2026-08-19]'),
  ('eb843d8e-a52d-48ce-8c4e-465e93936efe'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 0, ARRAY[DATE '2026-08-01']::date[], 'CET060 [apps:2026-08-01]'),
  ('3ee3e53b-f285-424c-986a-db268ae37941'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 0.5, 0, ARRAY[DATE '2026-08-10']::date[], 'CET061 [apps:2026-08-10]'),
  ('47eb1143-b6b7-4edb-8219-3fd60d198b8c'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-04']::date[], 'CET062 [apps: +lop:2026-08-04]'),
  ('7a35fa18-4bc4-4c03-a3f7-e393f823f5e4'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 0.5, -0.5, ARRAY[DATE '2026-08-01',DATE '2026-08-19']::date[], 'CET063 [apps:2026-08-01,2026-08-19]'),
  ('a40f9007-42c2-4228-973a-6339ef6a793f'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-07-01', 0, -1, NULL::date[], 'CET064 [reduction]'),
  ('a40f9007-42c2-4228-973a-6339ef6a793f'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-08-01', 1, 1, ARRAY[DATE '2026-08-10']::date[], 'CET064 [apps: +lop:2026-08-10]'),
  ('658d8932-6fc8-4a81-ab8b-f20b335fe508'::uuid, 'ca9242bd-2abf-48f8-8f8d-bae685ec4448'::uuid, 'af210159-723c-4da2-9663-19f464d8c64e'::uuid, '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid, DATE '2026-06-01', 0, -1, NULL::date[], 'CET005 [reduction]');

-- Upsert month_entries from staging
INSERT INTO public.hr_leave_month_entries (
  employee_id, leave_type_id, hr_organization_id, hr_academic_year_id,
  month_start, days, added_days, evidence_dates, reason, created_by)
SELECT t.employee_id, t.leave_type_id, t.hr_organization_id, t.hr_academic_year_id,
       t.month_start, t.days, t.added_days, t.evidence_dates,
       'Payroll-verified per Paid Leave Summary Jun-Aug 2026 (Engineering Teaching / Non Teaching sheets). ' || t.note,
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
-- stray-institution balance row for the same person (the bug class found in
-- the Arts batch and pre-empted in Main Office).
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
