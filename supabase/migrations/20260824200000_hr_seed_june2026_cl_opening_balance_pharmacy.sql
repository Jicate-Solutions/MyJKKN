-- Seed the June-2026 opening Casual Leave consumption for the Pharmacy batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Batch 6 of the
-- series (1 Main Office 20260822160000, 2 AHS 20260824120000,
-- 3 Dental 20260824140000, 4 Engineering 20260824160000,
-- 5 Nursing 20260824180000).
--
-- SCOPE: JKKN College of Pharmacy ONLY
--   (hr_organization 3f73dbf5-9977-4582-b0c0-53e31b3a4afd).
--
-- SOURCE: "Leave History (6).xlsx", the legacy app's "JKKN COLLEGE OF PHARMACY"
-- export -- 1,307 rows, 165 employees, 30 leave names, 68 closure windows.
-- Filtered to 01/06/2026 - 31/05/2027 (427 rows, 80 employees).
--
-- WHICH LEAVE NAME: one clean 'Casual Leave' bucket -- 80 rows, Total
-- Eligibility 9.5 through 12, 79.50 days across 39 people. The only name whose
-- eligibility matches hr_leave_types.default_entitled_days (12) for this org;
-- 'On Duty' and both LOP variants are 365 days, 'Clinical duty' 315-365.
--
-- RECONCILIATION of the 39 employees carrying June Casual Leave / 79.50 days:
--   33 matched verbatim, active, Pharmacy                        65.00 days
--    5 pinned by staff UUID (see below)                          12.00 days
--    1 skipped, INACTIVE: COP077 BABYKALA M                       2.50 days
-- Nothing quarantined -- every code resolved to a real Pharmacy person.
--
-- DOES NOT DISTURB BATCH 1. Two Pharmacy staff already carry June days from the
-- Main Office batch -- NOT192 ABARNA P (1.50) and NOT257 NANDHINI R (2.00).
-- Neither appears in this export, so neither is touched; Pharmacy's CL total
-- goes 3.50 -> 80.50.
--
-- NOT imported: the legacy pro-rated eligibility (9.5 / 10 / 10.5 / 11 / 11.5
-- alongside 12). Only `used` is ours to set; `entitled` stays NULL.

WITH by_code(code, june_days) AS (VALUES
  ('COP003', 1.00),            -- SEKAR V
  ('COP005', 2.00),            -- VENKATESHWARAMOORTHY N -> MyJKKN DR. VENKATESWARAMURTHY N
  ('COP016', 2.50),            -- VENKATESWARAN V
  ('COP018', 1.00),            -- DEVI P
  ('COP035', 1.00),            -- ESWARA MOORTHI M
  ('COP042', 1.00),            -- MOHANA PRIYA N
  ('COP046', 1.00),            -- KARTHICK RAJA S
  ('COP050', 4.00),            -- SNEHA K K
  ('COP055', 1.00),            -- KAVYADHARSHINI V
  ('COP056', 1.50),            -- RAJKUMAR J
  ('COP057', 2.00),            -- RAMYA G
  ('COP058', 1.00),            -- JANASHREE M
  ('COP073', 3.00),            -- SENTHIL M
  ('COP074', 3.00),            -- THAMARAISELVI K
  ('COP075', 1.00),            -- KARTHIKA J
  ('COP081', 1.50),            -- MEENA S
  ('COP087', 4.00),            -- KRANTI KUMAR P
  ('COP090', 3.00),            -- DEETCHANA N
  ('COP092', 1.00),            -- LASHIKA L.K
  ('COP093', 2.00),            -- SHARMITHA R.M
  ('COP229', 2.50),            -- SENTHILKUMAR K.L -> MyJKKN DR.K.L.SENTHIL KUMAR
  ('COP230', 1.50),            -- KOWSALYA M
  ('COP233', 1.00),            -- SNEHA A
  ('COP234', 2.00),            -- SHALIGA R
  ('NOT072', 2.00),            -- PRABHAKARAN P
  ('NOT083', 1.00),            -- SOBHA P
  ('NOT090', 2.00),            -- VIJAYA LAKSHMI A
  ('NOT151', 2.50),            -- LATHIKA M
  ('NOT181', 4.00),            -- VELARASU V J
  ('NOT208', 2.00),            -- GOWRI D
  -- These three NOT codes are Pharmacy's own, verbatim, with no spaced twin
  -- competing for them. NOT216 and NOT226 are also the codes the Dental export
  -- (batch 3) mis-claimed for RAMYA M and SUGANYA M; those were quarantined
  -- there precisely because MyJKKN resolves them to these two Pharmacy people.
  ('NOT216', 1.00),            -- UMA BHARATHI M
  ('NOT218', 3.00),            -- SATHYA P
  ('NOT226', 3.00)             -- PAVITHRA V
),
-- Five people the sheet files under a code that does not reach them verbatim.
-- Four are WHITESPACE TWINS -- MyJKKN stores the code with an internal space --
-- and three of those four are live collisions where the unspaced form belongs
-- to a real, active person at another college. Matching loosely here would have
-- written Pharmacy's June leave onto Engineering and Dental staff:
--
--   sheet NOT219 SALINI P        -> 'NOT 219' MISS. SALINI P, Pharmacy
--     ('NOT219' unspaced = MISS. SNEKA P, Engineering)
--   sheet NOT224 VIRUTHASARANI A -> 'NOT 224' MRS. VIRUTHASARANI A, Pharmacy
--     ('NOT224' unspaced = MRS. JAYA R, Engineering -- paid in batch 4)
--   sheet NOT220 SINDHU S        -> 'NOT 220' MISS. SINDHU S, Pharmacy
--     ('NOT220' unspaced = MR. DINESH M, Dental -- paid in batch 3)
--   sheet NOT227 DHANISHYA M     -> 'NOT 227' DHANISHYA M, Pharmacy
--     (no unspaced twin exists; a stray space, not a collision)
-- All four carry an exact name match and a name-derived @jkkn.ac.in address.
--
--   sheet COP094 NARMADHA S      -> NARMADHA S with staff_id IS NULL, Pharmacy
--     Only NARMADHA in the whole staff table; active; date_of_joining
--     2026-05-15, immediately before the June leave; drnarmadha05@gmail.com
--     carries the name; and COP094 is the gap next to COP093 SHARMITHA R.M.
pinned(employee_id, june_days) AS (VALUES
  ('64a17876-c771-4be1-bd71-06db03969b7b'::uuid, 3.00),  -- sheet NOT219 SALINI P        (staff_id 'NOT 219')
  ('546e6e92-3fe3-4b23-a486-bf2a5cf9e598'::uuid, 3.00),  -- sheet NOT224 VIRUTHASARANI A (staff_id 'NOT 224')
  ('ea198f0c-f4eb-4d12-9159-0aa3e6397032'::uuid, 2.50),  -- sheet NOT227 DHANISHYA M     (staff_id 'NOT 227')
  ('5beb6849-d15c-40de-86a0-78ab312883d9'::uuid, 2.50),  -- sheet COP094 NARMADHA S      (staff_id IS NULL)
  ('b63a526c-bf64-4452-8bf4-7b96506abb18'::uuid, 1.00)   -- sheet NOT220 SINDHU S        (staff_id 'NOT 220')
),
matched AS (
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded, and
  -- this college is the sharpest illustration of why: four of its codes differ
  -- from another college's only by an internal space. `staff` also holds
  -- 'COPO88' and 'cop083' here -- a capital letter O where a zero looks right,
  -- and a lower-case junk duplicate of 'COP083'.
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
  -- The leave type comes from the STAFF's institution, never the sheet's
  -- "Department Name". hr_leave_types is scoped per hr_organization.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id = '3f73dbf5-9977-4582-b0c0-53e31b3a4afd'::uuid
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
  -- approved, so re-running converges instead of double-counting and genuine
  -- in-app approvals survive. (Pharmacy has 0 approved CL applications today.)
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
