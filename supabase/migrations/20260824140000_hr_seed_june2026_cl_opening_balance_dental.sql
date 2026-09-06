-- Seed the June-2026 opening Casual Leave consumption for the Dental batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Without this
-- backfill every staff member's Casual Leave ledger reads a full 12 days even
-- for the people who already spent leave in June. Batch 3 of the series
-- (1 = Main Office 20260822160000, 2 = AHS 20260824120000).
--
-- SCOPE: JKKN Dental College and Hospital ONLY
--   (hr_organization 96fb95a4-ef15-46c4-95e1-1078f94a39bd). Staff whose MyJKKN
--   institution_id is anything else are dropped even if the sheet lists them.
--   This guard is load-bearing here, unlike in batch 2: seven of this sheet's
--   employee codes resolve to a REAL ACTIVE PERSON AT ANOTHER COLLEGE (see the
--   quarantine list), so without it this migration would debit Engineering,
--   Pharmacy, Main Office and Arts & Science ledgers with Dental's June leave.
--
-- SOURCE: "Leave History (3).xlsx", the legacy app's "JKKN DENTAL COLLEGE AND
-- HOSPITAL" export -- 2,550 rows, 298 employees, 38 leave names and 150+
-- leave-closure windows. Filtered to the 01/06/2026 - 31/05/2027 window.
--
-- WHICH LEAVE NAMES: 'Casual Leave' is a DECOY here -- it has zero rows in the
-- 2026-2027 window and is a dead legacy bucket. Dental splits casual leave into
-- three named buckets, and the durable signal is Total Eligibility matching
-- hr_leave_types.default_entitled_days, not the name:
--   'Casual Leave -NOT'                   81 rows, elig 10.5-12, 116.50 days
--   'Casual leave -6 days Working staffs' 55 rows, elig 12,       82.00 days
--   'Casual leave-5 days working staffs'   4 rows, elig 6,         4.00 days
-- MyJKKN's Dental org has exactly ONE casual type (CL, 12 days), so all three
-- collapse into it. The 6-day bucket is included by decision: only `used` is
-- written, never entitlement, so the 6-vs-12 policy gap never reaches the
-- ledger, and 4 days of casual leave consumed are 4 days consumed. Only 2
-- employees appear in more than one bucket and both are at 0.00, so summing
-- across buckets introduces no double count.
--
-- RECONCILIATION of the 79 employees carrying June Casual Leave / 202.50 days:
--   69 written here                                             176.00 days
--   10 quarantined                                               26.50 days
-- The quarantined codes, and what a verbatim match actually hits:
--   NOT237 SUDEEP S      6.0  -> SAKTHIVEL M.R      (Main Office)
--   NOT250 KOWSHIKA S    3.5  -> no staff row
--   NOT216 RAMYA M       3.0  -> UMA BHARATHI M     (Pharmacy)
--   NOT236 THENMOZHI S   3.0  -> KRISHNAKUMAR R     (Main Office)
--   NOT248 TAMILSELVI V  3.0  -> no staff row
--   NOT221 SELVARAJ M    2.0  -> AARTHY P.K         (Engineering)
--   NOT226 SUGANYA M     2.0  -> PAVITHRA V         (Pharmacy)
--   NOT232 MADHU BALA R  2.0  -> NANDHAGOPALAN S    (Engineering)
--   NOT246 SOWNDARYA S   1.0  -> KEERTHANA V        (Arts & Science Self)
--   NOT249 JOHNSIRANI J  1.0  -> no staff row
-- NOT216 was deliberately NOT remapped to DCH104 MRS. RAMYA RAJENDRAN despite
-- the name hit: she is HOD of Orthodontics on a DCH teaching code while NOT216
-- is a non-teaching series code, and RAMYA is a common name. One weak signal is
-- below the corroboration bar used for the pinned row below.
--
-- NOT imported: the legacy pro-rated eligibility (the -NOT bucket carries 10.5 /
-- 11 / 11.5 alongside 12). Writing it would flip those rows off
-- hr_leave_types.default_entitled_days. Only `used` is ours to set.

WITH by_code(code, june_days) AS (VALUES
  ('DCH001', 1.50),            -- SASIKUMAR P. K
  ('DCH002', 1.50),            -- DHINESH KUMAR C
  ('DCH003', 3.50),            -- SAI SADAN D
  ('DCH004', 1.00),            -- JAGADESAN N
  ('DCH006', 5.00),            -- PRAVEENA K
  ('DCH012', 3.00),            -- CHRIS SUSAN A          [5-day bucket, elig 6]
  ('DCH017', 3.00),            -- MAHESHWARI S
  ('DCH018', 2.00),            -- SWATHI RAMAN
  ('DCH020', 2.00),            -- VINOD THANGASWAMY S
  ('DCH021', 2.00),            -- VIJAYTHIYAGARAJAN J
  ('DCH023', 3.50),            -- SANTHOSH S
  ('DCH024', 3.00),            -- DHIVYA R
  ('DCH031', 1.00),            -- KUMARAN V              [5-day bucket, elig 6]
  ('DCH033', 5.50),            -- THANKAMANI AMMAL K
  ('DCH034', 4.00),            -- KALARANJENI N
  ('DCH037', 2.50),            -- SAKTHISARANYADEVI K
  ('DCH038', 1.00),            -- GOKULAPRIYA S
  ('DCH047', 1.00),            -- DHANABALAN S
  ('DCH051', 2.50),            -- KARKUZHALI M
  ('DCH065', 3.00),            -- SHANMATHEE K
  ('DCH069', 3.00),            -- SANTHOSHKUMAR K
  ('DCH076', 3.50),            -- NIVETHITHA M
  ('DCH090', 4.00),            -- DHINESHKUMAR T
  ('DCH108', 2.00),            -- DHANASEKAR B
  ('DCH125', 2.50),            -- MEENAPRIYA P.K
  ('DCH128', 3.00),            -- EZHILARASI A.V.S
  ('DCH129', 7.50),            -- INDHUMATHI S
  ('DCH133', 3.00),            -- RESHAF ISMAEL
  ('DCH137', 2.50),            -- SRUTHI SRIVAISNAVI S.N
  ('DCH139', 2.00),            -- GOPI KRISHNA S
  ('DCH140', 1.00),            -- HARIHARAN M
  ('DCH141', 0.50),            -- JANAPRIYA M
  ('NOT017', 1.00),            -- SARANYA DEVI PM
  ('NOT018', 1.50),            -- PRABHAKARAN S
  ('NOT019', 7.50),            -- BALASUBRAMANIAM G
  ('NOT020', 4.00),            -- JOTHIKRISHNAN K
  ('NOT027', 3.00),            -- MALATHI M
  ('NOT031', 2.00),            -- SAMPOORANAM K
  ('NOT034', 1.00),            -- SANGEETHA M
  ('NOT035', 2.00),            -- SULAKSHANA T
  ('NOT043', 1.00),            -- MALARKODI R
  ('NOT048', 1.00),            -- ANBUROSE N
  ('NOT051', 2.00),            -- THANGAM S
  ('NOT053', 1.00),            -- KARPAGAM T
  ('NOT054', 1.00),            -- GOWRI K
  ('NOT056', 2.00),            -- SUDHA C
  ('NOT057', 1.00),            -- JANAKI S
  ('NOT066', 5.00),            -- FATHIMA K
  ('NOT067', 1.00),            -- DEVAKI M
  ('NOT152', 2.00),            -- SARANYA K
  ('NOT154', 1.00),            -- KEERTHANA K
  ('NOT164', 1.00),            -- KALAIVANI D
  ('NOT173', 1.50),            -- S MANJULA
  ('NOT175', 3.00),            -- VIGNESWARI S
  ('NOT179', 1.00),            -- SIVAKAMI T -> MyJKKN SIVAGAMI T, see `matched`
  ('NOT184', 5.00),            -- PARIMALADEVI M
  ('NOT199', 1.00),            -- USHA NANDHINI
  ('NOT204', 2.00),            -- SATHIYA T
  ('NOT205', 5.00),            -- NANDHINI R
  ('NOT207', 1.00),            -- HEMASRI R
  ('NOT2092', 1.00),           -- RADHIKA S
  ('NOT213', 6.50),            -- SUMITHRA K
  ('NOT214', 4.00),            -- ISHWARYA M
  ('NOT220', 1.00),            -- DINESH M  (NOT220 Dental; 'NOT 220' is SINDHU S, Pharmacy)
  ('NOT240', 4.00),            -- JOHN CAROLIN J
  ('NOT241', 3.50),            -- DHANALAKSHMI S
  ('NOT242', 2.00),            -- MONISHA M
  ('NOT243', 2.00)             -- MANIMEGALA D
),
-- One person pinned by staff UUID. The sheet's NOT247 is NIRMALA R, but a
-- verbatim match on 'NOT247' hits MR. VINU V at Engineering -- a different real
-- person at a different college. Dental's NIRMALA R is 'NOT 247' WITH AN
-- INTERNAL SPACE, one of five documented pairs in this table that differ only
-- by whitespace and belong to different people. staff_id is therefore still
-- never normalised; the space variant is pinned by id instead, corroborated by
-- an exact name match, the Dental institution, and nirmala@jkkn.ac.in.
pinned(employee_id, june_days) AS (VALUES
  ('c8868521-b7a0-4789-a92d-230962947491'::uuid, 5.50)  -- sheet NOT247 NIRMALA R (staff_id 'NOT 247')
),
matched AS (
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded.
  -- NOT179 is in by_code above even though the sheet spells the name SIVAKAMI T
  -- and MyJKKN holds SIVAGAMI T: the CODE match is exact, the institution and
  -- the sivagami@jkkn.ac.in address agree, and a one-letter transcription
  -- difference is not a different person.
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
  -- "Department Name". hr_leave_types is scoped per hr_organization, so there
  -- are 14 distinct "Casual Leave" rows across the group.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id = '96fb95a4-ef15-46c4-95e1-1078f94a39bd'::uuid
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
  -- writing a literal here would flip the row to 'frozen' and detach it from
  -- hr_leave_types.default_entitled_days permanently.
  NULL,
  -- Idempotent by construction: the legacy opening plus everything MyJKKN has
  -- approved, so re-running converges instead of double-counting and genuine
  -- in-app approvals survive. (Dental has 0 approved CL applications today.)
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
