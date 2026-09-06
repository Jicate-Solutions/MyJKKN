-- Seed the June-2026 opening Casual Leave consumption for the Main Office batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Without this
-- backfill every staff member's Casual Leave ledger reads a full 12 days even
-- for the people who already spent leave in June -- they can over-draw, and the
-- year-end figure is wrong.
--
-- SOURCE: "Leave History (1).xlsx", the legacy app's "JKKN MAIN OFFICE" company
-- export, rows where Leave Name = 'Casual Leave' and the leave-closure window is
-- 01/06/2026 - 31/05/2027. Of its 71 CL rows: 31 land here (35.5 days); 21 are
-- matched-but-zero; 13 have no staff record; 3 are inactive; 3 are quarantined
-- because the employee code belongs to a DIFFERENT person in MyJKKN (DCH106,
-- NOT219, NOT247 -- 4.5 days). Every excluded row except those 3 has taken=0.00,
-- so no leave days are lost. Once HR assigns the right staff_id to those three,
-- re-running this migration picks them up.
--
-- Only Casual Leave is carried across. The export's other 13 leave names have no
-- sound MyJKKN counterpart: 'On Duty' is 365 days in the legacy app vs 6 here,
-- LOP is a payroll concept with no leave type, and the rest are ad-hoc one-offs.

WITH sheet(code, june_days) AS (VALUES
  ('NOT104', 2.0),    ('DTO277', 2.0),    ('NOT118', 0.5),    ('NOT124', 1.0),
  ('NOT125', 1.0),    ('NOT127', 1.5),    ('NOT128', 1.0),    ('NOT176', 1.0),
  ('NOT192', 1.5),    ('CET141', 1.0),    ('NOT223', 1.0),    ('NOT230', 0.5),
  ('NOT236', 2.0),    ('JICATE100', 1.5), ('JICATE103', 1.0), ('JICATE104', 1.0),
  ('JICATE108', 1.0), ('JICATE109', 1.0), ('NOT245', 1.0),    ('JICATE110', 1.0),
  ('JICATE112', 1.0), ('NOT254', 1.0),    ('NOT255', 1.0),    ('NOT256', 1.0),
  ('NOT257', 2.0),    ('JICATE115', 1.0), ('JICATE114', 1.0), ('JICATE113', 1.0),
  ('NOT259', 1.0),    ('NOT260', 1.0),    ('NOT261', 1.0)
),
resolved AS (
  SELECT s.id AS employee_id, lt.id AS leave_type_id,
         o.id AS hr_organization_id, sh.june_days
  FROM sheet sh
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded here;
  -- a loosened match would silently pull in a neighbouring code.
  JOIN staff s            ON s.staff_id = sh.code AND s.is_active
  -- The leave type comes from the STAFF's institution, never the sheet's
  -- "Department Name". hr_leave_types is scoped per hr_organization, so there
  -- are 14 distinct "Casual Leave" rows, and the sheet's department is a work
  -- location rather than an HR org -- NOT124 reads "COLLEGE OF PHARMACY" there
  -- but is Main Office staff; NOT260 reads the same but is Jicate. Joining on
  -- the sheet's string would file their leave against another college's ledger.
  JOIN hr_organizations o ON o.institution_id = s.institution_id
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
  -- latter, so this expression is a pure function of state -- safe to re-run
  -- after HR fixes a staff_id, and it preserves genuine MyJKKN approvals that a
  -- blunt `used = june_days` would erase (NOT148 holds 2.00 from a real
  -- approval while its sheet row reads 0.00).
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
