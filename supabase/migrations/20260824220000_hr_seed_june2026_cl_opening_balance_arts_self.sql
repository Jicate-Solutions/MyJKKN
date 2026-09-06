-- Seed the June-2026 opening Casual Leave consumption for the Arts & Science batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Batch 7 of the
-- series (1 Main Office, 2 AHS, 3 Dental, 4 Engineering, 5 Nursing, 6 Pharmacy).
--
-- SCOPE: JKKN College of Arts and Science (SELF) ONLY
--   (hr_organization 6c0d7684-7f75-42ba-8e7f-223a23936531).
--   MyJKKN splits Arts into TWO institutions -- (Aided) with 56 active staff and
--   (Self) with 84 -- while the legacy app has a single company. Every one of
--   this export's 37 leave-carrying employees resolves to (Self); not one lands
--   in (Aided), which is therefore untouched and still needs its own source.
--
-- SOURCE: "Leave History (7).xlsx", the legacy app's "J.K.K.NATARAJA COLLEGE OF
-- ARTS &SCIENCE" export -- 844 rows, 151 employees, 19 leave names, 166 closure
-- windows. Filtered to 01/06/2026 - 31/05/2027 (375 rows, 82 employees).
--
-- WHICH LEAVE NAME: one clean 'Casual Leave' bucket -- 82 rows, Total
-- Eligibility 10.5 to 12.5, 40.50 days across 37 people. The only name whose
-- eligibility matches hr_leave_types.default_entitled_days (12) for this org;
-- 'On Duty' and both LOP variants are 365 days, the vacation slots 1 or 6.
--
-- RECONCILIATION of the 37 employees carrying June Casual Leave / 40.50 days:
--   33 matched verbatim, active, Arts (Self)                     35.50 days
--    4 pinned by staff UUID (see below)                           5.00 days
--    0 quarantined, 0 inactive -- 100% of the sheet is written.
--
-- NOT imported: the legacy pro-rated eligibility (10.5 / 11.5 / 12.5 alongside
-- 12 -- this is the first export to run ABOVE 12). Only `used` is ours to set.

WITH by_code(code, june_days) AS (VALUES
  ('CAS001', 0.50),            -- KUMAR A
  ('CAS002', 1.00),            -- ARIVAZHAGAN S
  ('CAS015', 1.00),            -- KALAIVANI K
  ('CAS020', 2.00),            -- SATHYA N
  ('CAS031', 1.00),            -- EPSHIBA K
  ('CAS032', 1.00),            -- PRIYANKA P
  ('CAS036', 2.00),            -- KAMALAVENI A
  ('CAS037', 1.00),            -- PUNITHAMALAR M.S
  ('CAS040', 1.00),            -- UMARANI M
  ('CAS042', 0.50),            -- BUVANESWARI G
  ('CAS044', 0.50),            -- MATHIANANTHI P
  ('CAS052', 1.00),            -- LINGAMEENA N
  ('CAS053', 1.50),            -- AGALYA C
  ('CAS058', 2.00),            -- LATHA N
  ('CAS060', 1.00),            -- YASODHARAN V
  ('CAS066', 1.00),            -- JEGADISHKUMAR A
  ('CAS078', 1.00),            -- VENNILA A
  ('CAS081', 1.00),            -- GOVINDHARAJ S
  ('CAS082', 1.50),            -- ZENITH E
  ('CAS083', 1.00),            -- KARUPPUSAMY O P
  ('CAS084', 1.00),            -- SATHESKUMAR T
  ('CAS085', 0.50),            -- ARULKUMAR G
  ('CAS088', 1.00),            -- HEMALATHA D
  ('CAS100', 2.00),            -- KEERTHIKA J
  ('CAS105', 1.00),            -- SRIDHAR K
  ('CAS108', 1.00),            -- SASIKALA A.D
  ('CAS113', 1.00),            -- KAYATHRI S
  ('CAS116', 1.00),            -- RITHIKA S
  ('CAS117', 0.50),            -- NANDHINI G
  ('CAS118', 1.00),            -- SETHU PRIYA S
  ('CAS122', 1.00),            -- KOWSHIKA K
  ('CAS123', 1.00),            -- MAHESHWARI V
  ('CAS127', 1.00)             -- SATHYA S
),
-- Four people pinned by staff UUID.
--
-- CAS120 / CAS121 are a TRANSPOSED PAIR -- the first in this series where the
-- code had to be overridden rather than trusted. The sheet and MyJKKN agree
-- completely on WHO each person is and disagree only on which code they hold:
--
--     sheet CAS120 = SATHYA V, dept MICROBIOLOGY  | MyJKKN CAS120 = VIJAYALAKSHMI K, Commerce
--     sheet CAS121 = VIJAYALAKSHMI K, Commerce(CA)| MyJKKN CAS121 = SATHYA V, Microbiology
--
-- Name AND department match across systems for both people, and MyJKKN's two
-- records are internally coherent (viji2896@gmail.com on VIJAYALAKSHMI K,
-- sathyav@jkkn.ac.in on SATHYA V). The sheet's code assignment is the corrupted
-- field, so the days follow the PERSON. A verbatim join would have given each
-- of them the other's figure -- 2.00 and 1.00 exactly reversed. Note this is
-- also the one place where the sheet's "Department Name" column, a decoy in
-- every other batch, is the decisive evidence: it is the third independent
-- field, and it breaks the tie.
--
-- CAS110 MANIMEGALAI G -> 'ASTSCM40' MANIMEGALAI G. The INITIAL is doing the
-- work here: Arts (Self) Commerce holds three MANIMEGALAIs -- G (ASTSCM40,
-- active), P (CAS056, inactive) and R (CAS115, active). Only G matches, and the
-- sheet's department (Commerce (CA)) agrees.
--
-- NOT106 KRISHNAPRIYA K -> 'NOT01' MISS. KRISHNAPRIYA K. Only KRISHNAPRIYA in
-- the whole staff table; active; Arts (Self); LABORATORY INSTRUCTOR, consistent
-- with the sheet's MICROBIOLOGY department. The codes differ wholesale
-- ('NOT106' vs 'NOT01') and 'NOT106' as written belongs to nobody.
pinned(employee_id, june_days) AS (VALUES
  ('bcd66200-7bde-4a63-9575-0752e15aef77'::uuid, 2.00),  -- sheet CAS121 VIJAYALAKSHMI K -> MyJKKN CAS120
  ('f614658c-1228-40c1-985e-d882c8f049c9'::uuid, 1.00),  -- sheet CAS120 SATHYA V        -> MyJKKN CAS121
  ('bcabd570-55cf-4b38-b5ab-31277fa2d008'::uuid, 1.00),  -- sheet CAS110 MANIMEGALAI G   -> MyJKKN ASTSCM40
  ('f14afd74-b834-4a96-a8df-09c00ef5e44a'::uuid, 1.00)   -- sheet NOT106 KRISHNAPRIYA K  -> MyJKKN NOT01
),
matched AS (
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded.
  SELECT s.id AS employee_id, c.june_days
  FROM by_code c
  JOIN staff s ON s.staff_id = c.code AND s.is_active
  UNION ALL
  SELECT p.employee_id, p.june_days
  FROM pinned p
  JOIN staff s ON s.id = p.employee_id AND s.is_active
),
resolved AS (
  SELECT m.employee_id, lt.id AS leave_type_id,
         o.id AS hr_organization_id, m.june_days
  FROM matched m
  JOIN staff s            ON s.id = m.employee_id
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id = '6c0d7684-7f75-42ba-8e7f-223a23936531'::uuid
  JOIN hr_leave_types lt  ON lt.hr_organization_id = o.id
                         AND lt.leave_type_code = 'CL'
)
INSERT INTO hr_leave_balances (
  employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
  entitled, used, carried_forward
)
SELECT
  r.employee_id,
  r.leave_type_id,
  '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid,  -- AY 2026-2027 (1 Jun -> 31 May)
  r.hr_organization_id,
  -- NULL, not 12. v_hr_leave_balance_src resolves entitlement as
  --   COALESCE(overrides.entitled_days, balances.entitled, types.default_entitled_days)
  -- and reports which one won as entitlement_source. NULL means "follow policy";
  -- a literal would flip the row to 'frozen' and detach it from
  -- hr_leave_types.default_entitled_days permanently.
  NULL,
  -- Idempotent by construction: the legacy opening plus everything MyJKKN has
  -- approved, so re-running converges instead of double-counting.
  r.june_days + COALESCE((
    SELECT SUM(a.total_days)
    FROM hr_leave_applications a
    WHERE a.employee_id         = r.employee_id
      AND a.leave_type_id       = r.leave_type_id
      AND a.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
      AND a.status              = 'approved'
  ), 0),
  0
FROM resolved r
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
DO UPDATE SET used = EXCLUDED.used, updated_at = now();
