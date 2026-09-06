-- Seed the June-2026 opening Casual Leave consumption for the two schools.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Batch 8, the last
-- of the supplied exports (1 Main Office, 2 AHS, 3 Dental, 4 Engineering,
-- 5 Nursing, 6 Pharmacy, 7 Arts Self).
--
-- SCOPE: BOTH schools, and only they --
--   JKKN Matric Higher Secondary School  e04f5d22-2c8b-4194-a776-b06377aa91fe
--   Nattraja Vidhyalya CBSE              151c9ef3-35a6-4f9d-9e94-bb86288fb3ba
-- This is the FIRST batch whose single legacy company spans two MyJKKN
-- institutions. The export is headed "JKK NATTRAJA MATRIC HR SEC SCHOOL" but
-- carries both the `MHS*` (Matric) and `NV*` (Nattraja) code series, and the
-- two resolve to different hr_organizations with different Casual Leave type
-- ids. Contrast batch 7, where one Arts company mapped to only ONE of the two
-- Arts institutions. Neither shape can be assumed -- check the code prefixes.
--
-- SOURCE: "Leave History (8).xlsx" -- 1,247 rows, 192 employees, 12 leave
-- names, 5 closure windows. Filtered to 01/06/2026 - 31/05/2027 (755 rows,
-- 151 employees).
--
-- WHICH LEAVE NAME: one clean 'Casual Leave' bucket -- 151 rows, Total
-- Eligibility a uniform 12.00 (the only export with no pro-rating at all),
-- 84.50 days across 72 people. 'On Duty' and both LOP variants are 365 days.
--
-- RECONCILIATION of the 72 employees carrying June Casual Leave / 84.50 days:
--   49 matched verbatim, active                                  60.50 days
--    9 pinned by staff UUID (see below)                          11.00 days
--   14 quarantined -- no MyJKKN staff row at all                 13.00 days
--
-- The 14 quarantined, all `MHS*` and none with a plausible candidate:
--   MHS12003 POORNIMA S 1.0 | MHS12004 ABIRAAMI A 1.0 | MHS12005 SAMPATH V 1.0
--   MHS12009 Ananth H 1.0   | MHS12051 NAZARKHAN K 1.0 | MHS12072 Ananthan N 1.0
--   MHS12102 Ravishankar E 1.0 | MHS12116 Mekala R 1.0 | MHS12119 Lakshmi R 1.0
--   MHS12125 SUMITHRA V 1.0 | MHS12127 NIRANCHANADEVI k 1.0 | MHS6170 Vinodhini M 1.0
--   MHS12007 BIRUNDHA S 0.5 | MHS12008 Yasodha M 0.5
-- Two of those had a near-miss that was deliberately REJECTED: MHS12005
-- SAMPATH V against MHS12109 SAMPATHKUMAR A (different person, different
-- initial and number), and MHS12119 Lakshmi R against MHS12111 RAJALAKSHMI K /
-- NV12425 SEETHALAKSHMI M (substring artifacts; both already matched to their
-- own sheet rows).
--
-- NOT imported: nothing to skip here -- eligibility is a flat 12.00 throughout.

WITH by_code(code, june_days) AS (VALUES
  ('MHS12052', 0.50),          -- Srinivasan K
  ('MHS12054', 2.00),          -- Chandramohan C
  ('MHS12055', 1.00),          -- Ponnaiyan S
  ('MHS12056', 1.00),          -- Venkatesh M
  ('MHS12057', 1.00),          -- Sundhar Kasilingam.S
  ('MHS12058', 1.00),          -- Prabavathi S      -> MyJKKN PRABHAVATHI S
  ('MHS12060', 1.00),          -- Saranya R
  ('MHS12061', 1.00),          -- Sakthikumar S
  ('MHS12062', 1.00),          -- Savitha S
  ('MHS12063', 1.00),          -- Balasundaram A    -> MyJKKN BALASUNDRAM A
  ('MHS12064', 1.00),          -- Sangeetha K
  ('MHS12065', 1.50),          -- Balasundaram M    -> MyJKKN BALASUNDRAM M
  ('MHS12066', 1.00),          -- Usha c
  ('MHS12067', 1.00),          -- Govindaraj C
  ('MHS12068', 1.50),          -- Sathishkumar C
  ('MHS12069', 2.00),          -- Duraimurugan K
  ('MHS12070', 1.00),          -- Nandhini A
  ('MHS12071', 1.00),          -- Vennila S
  ('MHS12073', 2.00),          -- SOUNDERARAJ N
  ('MHS12074', 1.00),          -- NIVETHA S
  ('MHS12101', 0.50),          -- Padmavathi M
  ('MHS12104', 1.00),          -- Geetha G
  ('MHS12111', 1.00),          -- RAJALAKSHMI K
  ('MHS12112', 2.00),          -- GOWRI A
  ('MHS12115', 2.00),          -- Annie Prince C
  ('MHS12117', 1.00),          -- SHANMUGAPRIYA M
  ('MHS12118', 1.00),          -- Kokila A          (distinct from NV 12421 KOKILA S)
  ('MHS12120', 1.00),          -- NAGESWARI J
  ('MHS12121', 1.00),          -- RAMESH K
  ('MHS12128', 1.00),          -- Dayana R
  ('MHS12151', 2.00),          -- REVATHI R
  ('MHS12154', 1.00),          -- MOHANASUNDARI R   -> MyJKKN MOHANA SUNDARI R
  ('MHS12157', 1.00),          -- Chithra A
  ('NV12402',  1.00),          -- Vigneshwari Annadurai
  ('NV12403',  1.00),          -- Kavinkumar m
  ('NV12404',  2.00),          -- Sivakami A
  ('NV12408',  2.00),          -- Anitha Arul mary Rayappan
  ('NV12409',  2.00),          -- Devika Arumugam
  ('NV12411',  1.00),          -- Shanthi P
  ('NV12412',  1.00),          -- Santhi C          (distinct from NV12411 Shanthi P)
  ('NV12415',  1.50),          -- Prabhabharathi V  -> MyJKKN PRABHA BHARATHI V
  ('NV12417',  1.00),          -- Kalaiselvi Sundaram
  ('NV12418',  1.00),          -- Carolinal Sebastian
  ('NV12419',  2.00),          -- Lourdumary Mathalai Muthu -> MyJKKN LOURDU MARY M
  ('NV12423',  1.00),          -- Reka C
  ('NV12424',  2.00),          -- Mohanavalli S
  ('NV12425',  1.00),          -- Seethalakshmi M
  ('NV12428',  1.00),          -- MYTHILI SAKTHIVEL
  ('NV12429',  1.00)           -- Mohankumar V
),
-- Nine people pinned by staff UUID. Every one is ACTIVE, at the right school,
-- and -- the decisive check here -- carries a full name that is UNIQUE across
-- the entire staff table (verified by an exact whitespace-insensitive count).
-- MyJKKN stores their codes in four systematic variants of what the sheet has:
--
--   'MHSI' prefix instead of 'MHS' (a stray I):
--     MHS12152 Kuppuraji C -> MHSI12152 | MHS12153 Arulmary P -> MHSI12153
--     MHS12155 SUDHA S     -> MHSI12155
--   bare number in the sheet, prefixed in MyJKKN:
--     12122 THIRUMALAISAMY C -> MHS12122 | 12430 ELAIYARAJA K -> NV12430
--     12406 Esther SJ        -> NV12406 ESTHER RAMYA SIMON (exact number match;
--       the only Esther at either school)
--   a dropped zero:
--     MHS12053 Kalpana K -> MHS1253
--   the documented whitespace twin, and a code with no number at all:
--     NV12421 Kokila S -> 'NV 12421' KOKILA S (distinct from NV12420 KOKILAMBAL K
--       and from MHS12118 KOKILA A, who has her own row above)
--     MHS12105 Mariyabowlin Martin Guruz -> staff_id literally 'MHS'
pinned(employee_id, june_days) AS (VALUES
  ('170436c8-c76f-4a2b-9ac4-66c631ae97dd'::uuid, 2.00),  -- sheet 12406    Esther SJ        -> NV12406
  ('057094a5-425a-4d71-b3dc-9b0d102f5002'::uuid, 2.00),  -- sheet MHS12153 Arulmary P       -> MHSI12153
  ('5796db2b-9650-449a-98e3-3c0a2fb11659'::uuid, 1.00),  -- sheet 12122    THIRUMALAISAMY C -> MHS12122
  ('f81ba95a-a197-48c4-9b20-e89503b2e7c8'::uuid, 1.00),  -- sheet 12430    ELAIYARAJA K     -> NV12430
  ('7f72fa1b-84d6-4aa0-8d08-0176804281f3'::uuid, 1.00),  -- sheet MHS12053 Kalpana K        -> MHS1253
  ('f8c6401f-43b5-4b10-a5a9-1861335d446a'::uuid, 1.00),  -- sheet MHS12105 Mariyabowlin ... -> 'MHS'
  ('e07efec7-2e31-4c35-9e1e-1e8181d5e377'::uuid, 1.00),  -- sheet MHS12152 Kuppuraji C      -> MHSI12152
  ('c85168f3-1e43-440d-91e0-ba8b863e77d0'::uuid, 1.00),  -- sheet MHS12155 SUDHA S          -> MHSI12155
  ('23aa360e-62f7-4cd8-a659-299d1f2123d8'::uuid, 1.00)   -- sheet NV12421  Kokila S         -> 'NV 12421'
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
  -- Two orgs, and the leave type is resolved per staff member's own
  -- institution: Matric and Nattraja have DIFFERENT Casual Leave type ids
  -- (b8397dea... and cf93b203...). Hardcoding either would file half the
  -- school's June leave against the other school's ledger.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id IN ('e04f5d22-2c8b-4194-a776-b06377aa91fe'::uuid,
                                      '151c9ef3-35a6-4f9d-9e94-bb86288fb3ba'::uuid)
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
