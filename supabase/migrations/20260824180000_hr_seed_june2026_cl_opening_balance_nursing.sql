-- Seed the June-2026 opening Casual Leave consumption for the Nursing batch.
--
-- WHY: the HR academic year runs 1 Jun -> 31 May, so AY 2026-2027 opened on
-- 2026-06-01, but MyJKKN only has biometric/attendance data from July 2026.
-- June 2026 was run entirely in the previous HR application. Batch 5 of the
-- series (1 Main Office 20260822160000, 2 AHS 20260824120000,
-- 3 Dental 20260824140000, 4 Engineering 20260824160000).
--
-- SCOPE: JKKN College of Nursing and Research ONLY
--   (hr_organization 179a922c-1a9e-4e60-a674-3a7216cc5928). Staff whose MyJKKN
--   institution_id is anything else are dropped even if the sheet lists them.
--
-- SOURCE: "Leave History (5).xlsx". NOTE the company header reads
-- "SRESAKTHIMAYEIL INSTITUTE OF NURSING AND RESEARCH" -- that is the legacy
-- name for what MyJKKN calls "JKKN College of Nursing and Research". Confirmed
-- by the CNR* employee-code prefix, which is the Nursing code series in
-- `staff`, and by every matched name landing in that one institution.
-- 486 rows, 71 employees, 20 leave names; the 01/06/2026 - 31/05/2027 window
-- holds 228 rows across 43 employees.
--
-- WHICH LEAVE NAME: one clean 'Casual Leave' bucket in the window -- 43 rows,
-- Total Eligibility 11/12, 55.00 days across 22 people. It is the only name
-- whose eligibility matches hr_leave_types.default_entitled_days (12) for this
-- org; 'On Duty', 'Clinical duty' and both LOP variants are all 365 days here.
--
-- RECONCILIATION of the 22 employees carrying June Casual Leave / 55.00 days:
--   18 matched verbatim, active, Nursing                         49.50 days
--    2 pinned by staff UUID -- present under a DIFFERENT code      2.00 days
--    2 skipped, INACTIVE in MyJKKN                                3.50 days
-- The two inactive are worth a second look by HR, because the legacy app has
-- them spending leave in June 2026 while MyJKKN has them deactivated:
--   CNR212 MYTHILI B 2.50d -> CNR001 MYTHILI B (Nursing, inactive)
--   CNR208 BHAVADHARANI S 1.00d -> verbatim match (Nursing, inactive)
-- If either is reactivated, re-running this migration picks them up: add the
-- code to by_code (BHAVADHARANI S) or pin CNR001's UUID (MYTHILI B).
--
-- NOT imported: the legacy pro-rated eligibility (11 alongside 12). Only `used`
-- is ours to set; `entitled` stays NULL so the row keeps tracking policy.

WITH by_code(code, june_days) AS (VALUES
  ('CNR002', 3.50),            -- GOWRI B
  ('CNR003', 1.00),            -- AROCKIAMARY M
  ('CNR006', 2.50),            -- RADHA S
  ('CNR008', 2.00),            -- THILAGAM L
  ('CNR011', 2.00),            -- KRISHNAVENI M  (verbatim; `staff` holds 4 KRISHNAVENIs)
  ('CNR012', 3.50),            -- RENUKA M
  ('CNR013', 2.50),            -- VENNILA A
  ('CNR014', 2.50),            -- SARANYA M
  ('CNR017', 3.00),            -- SATHYA S
  ('CNR025', 5.00),            -- APSARA KUMAR
  ('CNR029', 4.00),            -- DHANAPRIYA S
  ('CNR030', 3.00),            -- SATHYASURESH B
  ('CNR215', 1.00),            -- SANTHIYA B
  ('CNR217', 3.00),            -- CHITRA P
  ('CNR218', 2.50),            -- JASWANTH J
  ('CNR219', 2.50),            -- DHARSHINI R
  ('CNR222', 3.00),            -- SUJITHA S
  ('CNR223', 3.00)             -- ELAMATHI R
),
-- Two people the sheet files under a code MyJKKN does not use for them. Pinned
-- by staff UUID rather than remapped inside by_code, so that by_code stays a
-- pure list of literal sheet codes matched verbatim.
--
--   sheet CNR221 VIMALA V  -> MyJKKN 'CNR8003' MRS VIMALA V
--     Only VIMALA V in the entire staff table; active; Nursing institution.
--     The other VIMALAs are CET029 MRS.VIMALA C (Engineering, different
--     initial) and an unnamed-code VIMALA S at Dental. Her address is a
--     personal gmail, which is normal at this college and therefore neutral.
--
--   sheet NOT011 PUSHPA S  -> MyJKKN 'NTO554' PUSHPA S
--     Exact name match, active, Nursing, pushpa.s@jkkn.ac.in. The only other
--     PUSHPA is CAS129 PUSHPA R at Arts & Science (Self) -- different initial.
--     The codes differ wholesale ('NOT011' vs 'NTO554'), which is exactly why
--     this cannot be a code match: staff_id is never transformed to bridge a
--     gap, and 'NOT011' as written belongs to nobody.
pinned(employee_id, june_days) AS (VALUES
  ('0c2b1269-e172-4ae8-9050-944470dd017a'::uuid, 1.00),  -- sheet CNR221 VIMALA V  (staff_id 'CNR8003')
  ('703e94c9-0df7-4430-9c06-a519d15bc253'::uuid, 1.00)   -- sheet NOT011 PUSHPA S  (staff_id 'NTO554')
),
matched AS (
  -- Verbatim match. staff_id is never whitespace-stripped or case-folded. This
  -- college is the reason that rule exists in its harshest form: `staff` holds
  -- 'CNRO27' with a capital letter O where a zero looks right.
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
  -- "Department Name" (which here is a clinical specialty -- CHILD HEALTH
  -- NURSING, LIBRARY, OFFICE -- not an HR org at all).
  JOIN hr_organizations o ON o.institution_id = s.institution_id
                         AND o.id = '179a922c-1a9e-4e60-a674-3a7216cc5928'::uuid
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
  -- in-app approvals survive. (Nursing has 0 approved CL applications today.)
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
