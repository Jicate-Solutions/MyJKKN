-- ============================================================================
-- THE GATE MUST CHECK BOTH LINKAGES WHERE BOTH EXIST (2026-09-06) — PART E.1
--
-- 20260906160000 gated hr_staff_details on hr_organization_id alone. One row
-- still leaked, and the reason is a data-quality fact worth recording:
--
--   staff NOTCOP004 belongs to JKKN College of Arts and Science (Aided) —
--   excluded — but its hr_staff_details row carries the hr_organization_id of
--   JKKN College of PHARMACY, which is included.
--
-- The row is CROSS-FILED: the person's institution and the org their HR detail
-- record sits under disagree. Gating on the org alone therefore let an excluded
-- institution's staff member through, because the org named on the row really
-- is included. It was not a NULL problem — hr_staff_details has zero NULLs in
-- either column.
--
-- So where a table carries BOTH linkages, both are now required. ANDing them is
-- the conservative reading: a row is in HR only if the org it is filed under AND
-- the institution its person belongs to are both included. For a consistent row
-- the two agree and nothing changes; for a cross-filed one the stricter answer
-- wins, which is what "this institution is out of the HR module" has to mean.
--
-- Cross-filing is not fixed here — that is a data correction, and silently
-- repointing somebody's HR organization is not a side effect a permissions
-- migration should have.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

DROP POLICY IF EXISTS hr_included_gate ON public.hr_staff_details;
CREATE POLICY hr_included_gate ON public.hr_staff_details
  AS RESTRICTIVE FOR SELECT USING (
    public.fn_hr_org_included(hr_organization_id)
    AND public.fn_hr_staff_institution_included(staff_id)
  );

-- Same shape: institution_id and staff_id can disagree the same way.
DROP POLICY IF EXISTS hr_included_gate ON public.hr_employee_documents;
CREATE POLICY hr_included_gate ON public.hr_employee_documents
  AS RESTRICTIVE FOR SELECT USING (
    public.fn_hr_institution_included(institution_id)
    AND public.fn_hr_staff_institution_included(staff_id)
  );

-- hr_payroll_periods carries hr_organization_id AND institution_id.
DROP POLICY IF EXISTS hr_included_gate ON public.hr_payroll_periods;
CREATE POLICY hr_included_gate ON public.hr_payroll_periods
  AS RESTRICTIVE FOR SELECT USING (
    public.fn_hr_org_included(hr_organization_id)
    AND public.fn_hr_institution_included(institution_id)
  );
