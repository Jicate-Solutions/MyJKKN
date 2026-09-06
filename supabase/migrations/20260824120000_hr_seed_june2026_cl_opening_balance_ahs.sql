-- Seed the June-2026 opening Casual Leave consumption for the AHS batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Without this
-- backfill every staff member's Casual Leave ledger reads a full 12 days even
-- for the people who already spent leave in June -- they can over-draw, and the
-- year-end figure is wrong. Batch 2 of the series; batch 1 was
-- 20260822160000_hr_seed_june2026_cl_opening_balance_main_office.sql.
--
-- SCOPE: JKKN College of Allied Health Sciences ONLY
--   (hr_organization 542db659-e4b7-4c6e-93eb-bcc829091ebb). Staff whose MyJKKN
--   institution_id is anything else are dropped even if the sheet lists them.
--
-- SOURCE: "Leave History (2).xlsx", the legacy app's "JKKN AHS" company export,
-- rows where Leave Name = 'Casual Leave' AND the leave-closure window is
-- 01/06/2026 - 31/05/2027. The file also carries stale 2024-2025 and 2025-2026
-- closure windows -- filtering on the window is mandatory or those get picked up.
--
-- RECONCILIATION of the sheet's 46 employee codes / 12.50 Casual Leave days:
--   11 written here                                  12.50 days  (100%)
--    2 quarantined: the code belongs to a DIFFERENT person in MyJKKN --
--      NOT112 (sheet Jayamarish N vs GOKULAPRIYA M, Arts & Science Self) and
--      NOT100 (sheet INDHIRANI J vs GUNASEKARAN S, Main Office)   0.00 days
--    6 inactive: AHS098 AHS113 AHS114 AHS115 AHS119 AHS129        0.00 days
--   19 with no staff row: 1 SA01 SA03 SA04 SA05 AHS002 AHS003 AHS005 AHS009
--      AHS097 AHS099 AHS112 AHS116 AHS124 AHS125 AHS130 NOT075 NOT098 NOT163
--                                                                 0.00 days
--   8 matched active staff whose sheet row reads 0.00 are simply no-ops.
-- Every excluded row is at 0.00 days, so no leave is lost.
--
-- Only Casual Leave is carried across. The export's other 7 leave names have no
-- sound MyJKKN counterpart: 'On Duty' is 365 days in the legacy app vs 6 here,
-- LOP is a payroll concept with no leave type, and the three vacation rows are
-- ad-hoc one-offs.
--
-- NOT imported: the legacy app's pro-rated eligibility (AHS135 10.5, AHS133
-- 11.5, AHS118/AHS134 11.0 against MyJKKN's flat 12). All four are at 0.00 June
-- days so it changes no consumption, and writing it would flip those rows off
-- hr_leave_types.default_entitled_days -- see the `entitled` note below.

WITH by_code(code, june_days) AS (VALUES
  ('AHS110', 2.0),   -- PRISKALA M
  ('AHS126', 1.5),   -- HARINI E
  ('AHS107', 1.0),   -- GIRIDHARAN P
  ('AHS117', 1.0),   -- MANIKANDAN P
  ('AHS123', 1.0),   -- POOJA S / POOJA SURESH
  ('AHS127', 1.0),   -- BHAVADHARANI G
  ('AHS128', 1.0),   -- POOMIGA G
  ('AHS131', 1.0),   -- NANDHINI SHRI G
  ('AHS132', 1.0)    -- SANJAI V
),
-- Two people whose MyJKKN staff_id is a placeholder rather than their AHS code,
-- pinned by staff UUID because matching them by code would find nothing and
-- matching by name is forbidden (staff holds 4 KRISHNAVENIs, 5 MOHANRAJs).
-- Corroborated four ways before pinning: a whole-table name probe returns
-- exactly one ACTIVE match each; both sit in the AHS institution, Department of
-- Allied (UG), joined 2025-08-04, with @jkkn.ac.in addresses; and AHS120/AHS121
-- are the only gaps in an otherwise complete AHS107..AHS135 block.
-- If HR later corrects staff_id to AHS120/AHS121 these lines can move up into
-- by_code -- the migration is idempotent either way.
pinned(employee_id, june_days) AS (VALUES
  ('ba31bb65-cccc-46a7-a9cb-cca18bb5fd07'::uuid, 1.0),  -- sheet AHS120 SHANTHINI B    (staff_id '1234')
  ('7eb732d7-bd2d-4ee2-a09e-70354c6c31ec'::uuid, 1.0)   -- sheet AHS121 MURALIDHARAN C (staff_id '121')
),
matched AS (
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded here;
  -- five pairs in this table differ only by an internal space and belong to
  -- different people, so a loosened match silently fans the join out.
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
  -- are 14 distinct "Casual Leave" rows, and the sheet's department is a work
  -- location rather than an HR org. This export proves it: AHS122 sits in the
  -- AHS company sheet but is College of Pharmacy staff, and CEO001 / COE001 /
  -- DCH108 resolve to Engineering, Main Office and Dental.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         -- SCOPE GUARD: AHS institution staff only. The AHS company
                         -- export is not the same population as the AHS institution --
                         -- AHS122 is College of Pharmacy staff, CEO001 Engineering,
                         -- COE001 Main Office, DCH108 Dental, NOT112 Arts & Science.
                         -- All of those read 0.00 June days so none reach this INSERT
                         -- today, but that is a property of this sheet, not of the
                         -- query. Without the guard a later batch could file one
                         -- college's June leave against another college's ledger.
                         AND o.id = '542db659-e4b7-4c6e-93eb-bcc829091ebb'::uuid
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
  -- hr_leave_types.default_entitled_days permanently. Only `used` is ours to set.
  NULL,
  -- Idempotent by construction: rather than adding a delta to whatever `used`
  -- currently holds, recompute it as the legacy opening plus everything MyJKKN
  -- itself has approved. hr_leave_applications is the durable record of the
  -- latter, so this expression is a pure function of state -- safe to re-run,
  -- and it preserves genuine MyJKKN approvals that a blunt `used = june_days`
  -- would erase. (At time of writing all 11 have 0 approved CL applications.)
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
