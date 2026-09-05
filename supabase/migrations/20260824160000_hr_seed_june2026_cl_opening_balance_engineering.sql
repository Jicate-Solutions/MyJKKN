-- Seed the June-2026 opening Casual Leave consumption for the Engineering batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Batch 4 of the
-- series (1 = Main Office 20260822160000, 2 = AHS 20260824120000,
-- 3 = Dental 20260824140000).
--
-- SCOPE: JKKN College of Engineering and Technology ONLY
--   (hr_organization af210159-723c-4da2-9663-19f464d8c64e). Staff whose MyJKKN
--   institution_id is anything else are dropped even if the sheet lists them.
--
-- SOURCE: "Leave History (4).xlsx", the legacy app's "JKKN COLLEGE OF
-- ENGINEERING & TECHNOLOGY" export -- 1,314 rows, 179 employees, 39 leave
-- names. Filtered to the 01/06/2026 - 31/05/2027 window (388 rows, 78 staff).
--
-- WHICH LEAVE NAME: unlike Dental, Engineering has a single clean 'Casual
-- Leave' bucket in the window -- 78 rows, Total Eligibility 10.5/11/11.5/12,
-- 32.00 days across 32 people. It is the only name whose eligibility matches
-- hr_leave_types.default_entitled_days (12) for this org. 'OFFICIAL ON DUTY'
-- and 'On-Duty' are 40 days here vs 6 in MyJKKN, and LOP has no leave type.
--
-- RECONCILIATION of the 32 employees carrying June Casual Leave / 32.00 days:
--   31 matched verbatim, active, Engineering                     31.00 days
--    1 pinned by staff UUID (CET252, see below)                    1.00 days
--    0 quarantined -- the cleanest batch in the series so far.
--
-- DOES NOT DISTURB BATCH 1. Two Engineering staff already carry June days
-- written by the Main Office batch -- DTO277 MR. RANJITH K (2.00) and CET141
-- MUTHAZHAHAN D (1.00). Neither appears anywhere in this export, so neither is
-- touched here; Engineering's CL total goes 3.00 -> 35.00.
--
-- NOT imported: the legacy pro-rated eligibility (10.5 / 11 / 11.5 alongside
-- 12). Only `used` is ours to set; `entitled` stays NULL.

WITH by_code(code, june_days) AS (VALUES
  ('CET024', 0.50),            -- PORKODI G
  ('CET027', 0.50),            -- MOHANRAJ G
  ('CET039', 1.00),            -- BABY M
  ('CET043', 1.00),            -- TAMILSELVI S
  ('CET053', 1.00),            -- ARULJOTHI K
  ('CET107', 1.00),            -- BANUMATHI R
  ('CET126', 1.00),            -- MOHANRAJ M R
  ('CET129', 1.00),            -- ARUN V P
  ('CET134', 1.00),            -- BALAKUMARAN B
  ('CET135', 0.50),            -- PALANISAMY K
  ('CET138', 1.00),            -- AKILA M
  ('CET144', 1.00),            -- VIGNESH M
  ('CET146', 1.00),            -- SUJI S
  ('CET148', 1.00),            -- SARANYA G
  ('CET221', 1.00),            -- Vaishnave M
  ('CET222', 1.00),            -- DEEPIKA R
  ('CET225', 1.00),            -- RAJESH K.P
  ('CET229', 1.00),            -- AKALYA K
  ('CET235', 1.00),            -- JEEVITHA V.M
  ('CET238', 1.00),            -- SINDHUJA D
  ('CET240', 1.00),            -- SHAANTHANU K
  ('CET242', 2.00),            -- DHARSHINI DEVI M
  ('CET243', 1.50),            -- LAVANYA L
  ('CET244', 1.00),            -- MOUNIGA G
  ('CET245', 1.00),            -- SASIKUMAR R
  ('CET248', 1.00),            -- MAHENDIRAN S
  ('CET249', 1.00),            -- KALAIVANI S
  ('CET250', 1.00),            -- REVATHI S
  ('NOT008', 1.00),            -- Sathish S
  -- The two NOT codes below are exactly the whitespace pairs that make
  -- normalising staff_id dangerous. Both resolve correctly VERBATIM here:
  --   'NOT224' = JAYA R (Engineering)   vs 'NOT 224' = VIRUTHASARANI A (Pharmacy)
  --   'NOT247' = MR. VINU V (Engineering) vs 'NOT 247' = NIRMALA R (Dental)
  -- NOT247 is worth pausing on: three company exports make three different
  -- claims about it. Main Office (batch 1) said VISWANATHAN S and was correctly
  -- quarantined; Dental (batch 3) said NIRMALA R and was pinned to 'NOT 247';
  -- this sheet says VINU V, which is what MyJKKN actually holds under 'NOT247'.
  -- Only this batch's claim matches, which is why only this one is a plain join.
  ('NOT224', 1.00),            -- JAYA R
  ('NOT247', 1.00)             -- VINU V
),
-- CET252 DHANDAPANI M exists at Engineering and is active, but his
-- staff.staff_id is NULL, so no code match can reach him. Pinned by UUID on:
-- exactly ONE person named DHANDAPANI in the entire staff table; the
-- Engineering institution, matching this export's company; active; a
-- date_of_joining of 2026-06-08 consistent with spending casual leave in June
-- 2026; and CET252 being the gap between CET251 (SILAMBARASAN V) and CET253
-- (SASIKALA N), both real active Engineering staff.
-- Weaker than the batch 2/3 pins in one respect: his address is a personal
-- gmail rather than a name-derived @jkkn.ac.in one, so email neither confirms
-- nor contradicts. It is not a usable signal at this college -- CET253 carries
-- an unrelated gmail too.
-- He is one of 13 active Engineering staff with a NULL staff_id; once HR
-- assigns him CET252 this line can move up into by_code.
pinned(employee_id, june_days) AS (VALUES
  ('c4ea7c30-7a98-4c67-b61c-6adaa7c92fa5'::uuid, 1.00)  -- sheet CET252 DHANDAPANI M (staff_id IS NULL)
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
  -- The leave type comes from the STAFF's institution, never the sheet's
  -- "Department Name". hr_leave_types is scoped per hr_organization.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id = 'af210159-723c-4da2-9663-19f464d8c64e'::uuid
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
  -- in-app approvals survive. (Engineering has 0 approved CL applications today.)
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
