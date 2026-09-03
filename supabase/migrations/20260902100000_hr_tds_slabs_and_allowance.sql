-- ============================================================================
-- TDS BANDS + SALARY ALLOWANCE (2026-09-02)
--
-- TWO ADDITIONS TO WHAT EACH PERSON EARNS:
--
--   1. hr_tds_slabs — monthly gross bands with a flat rate. A salary inside a
--      band is taxed at that band's percentage OF THE WHOLE MONTHLY GROSS; a
--      salary outside every band is not taxed at all.
--   2. hr_staff_salaries.allowance_amount / _label — some staff are paid an
--      allowance on top of the gross. It counts toward earnings and is
--      pro-rated with the gross, but it is NEVER in the TDS base.
--
-- THIS IS NOT THE STATUTORY TDS CALCULATION, AND THAT IS DELIBERATE.
-- deduction-engine.ts already contains the progressive annual computation
-- (annualise, less the 75,000 standard deduction, walk 0/5/10/15/20/30, 87A
-- rebate, 4% cess, divide by 12) driven by platform_policies
-- 'hr.payroll.tds_slabs'. On a 1,50,000 gross that yields 17,983/month where
-- these bands yield 7,500. That engine is DEAD — it feeds payslip-generator.ts
-- and hr_payslips, which has zero rows — and it is left alone rather than
-- extended: one policy key cannot mean "annual progressive brackets" to the
-- payroll preview and "flat monthly bands" to the register without one of the
-- two silently reading the wrong thing.
--
-- hr_allowances is likewise left alone: zero rows, referenced by nothing, and
-- shaped as an ORGANISATION-LEVEL CATALOGUE of allowance definitions with a
-- JSONB rules engine — not a per-staff amount.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. hr_tds_slabs
--
-- NO institution_id, ON PURPOSE. Income tax is national and the group runs one
-- scheme, so a per-institution rate would be a way to get them out of step
-- rather than a capability anyone wants.
--
-- It also buys the constraint below: with no equality column in the EXCLUDE,
-- the index is a pure range overlap, which plain GiST handles natively.
-- Including institution_id would need `btree_gist`, which is NOT installed on
-- this project. If per-institution rates ever become real, that is the moment
-- to install it.
--
-- BOUNDS ARE [min, max) — INCLUSIVE FLOOR, EXCLUSIVE CEILING. Bands written the
-- way people say them ("1,06,250 to 2,00,000", next one starting at 2,00,001)
-- leave every paise value in between matching NOTHING, and a salary of
-- 2,00,000.50 would be silently untaxed. Half-open, the next band starts at
-- exactly 2,00,000 and there is no crack. Verified on this database:
--   199,999.99 -> band 1     200,000.00 -> band 2     200,000.50 -> band 2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_tds_slabs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_monthly_gross numeric(12,2) NOT NULL CHECK (min_monthly_gross >= 0),
  -- NULL = open-ended. Exactly one band must be, so nobody can earn their way
  -- out of TDS; see the constraint trigger below.
  max_monthly_gross numeric(12,2),
  rate_pct          numeric(5,2)  NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  label             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  CONSTRAINT hr_tds_slabs_max_above_min
    CHECK (max_monthly_gross IS NULL OR max_monthly_gross > min_monthly_gross),
  -- Two bands may not both claim the same rupee. Without this, the band that
  -- wins a lookup is whichever the planner returns first — a wrong tax figure
  -- that is stable enough to look deliberate.
  CONSTRAINT hr_tds_slabs_no_overlap EXCLUDE USING gist (
    numrange(min_monthly_gross, max_monthly_gross, '[)') WITH &&
  )
);

COMMENT ON TABLE public.hr_tds_slabs IS
  'Monthly-gross bands for TDS. A salary inside a band is taxed at rate_pct of the WHOLE monthly gross; outside every band, no TDS. Not the statutory progressive calculation — see the migration header.';
COMMENT ON COLUMN public.hr_tds_slabs.max_monthly_gross IS
  'NULL = open-ended top band. Exactly one row must be open-ended whenever any rows exist.';

ALTER TABLE public.hr_tds_slabs ENABLE ROW LEVEL SECURITY;

-- READ IS DELIBERATELY WIDER THAN WRITE. The register RESOLVES these bands
-- while it generates, under the generating user's own session — and a slab read
-- that returns zero rows because of RLS is indistinguishable from "no bands
-- configured", which silently produces a register with no tax on it. Whoever
-- can see a salary or a register can see the bands; only salary.manage edits.
CREATE POLICY hr_tds_slabs_select ON public.hr_tds_slabs
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.view'))
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
    OR (SELECT public.user_has_permission('hr.payroll.register.view'))
    OR (SELECT public.user_has_permission('hr.payroll.register.manage'))
  );

CREATE POLICY hr_tds_slabs_write ON public.hr_tds_slabs
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.salary.manage'))
  );

CREATE POLICY hr_tds_slabs_service_role ON public.hr_tds_slabs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. The set-level rules a per-row CHECK cannot express
--
-- SECURITY DEFINER, and this one is not a judgement call: the function's entire
-- job is to see EVERY row. Under RLS an editor holding salary.manage but not
-- salary.view would count zero rows and validate an empty set — the check would
-- pass by being blind. It takes no arguments, derives no caller identity and
-- makes no authorisation decision; it is a constraint that happens to need a
-- query. search_path is pinned.
--
-- ZERO ROWS IS VALID — that is "TDS switched off", and it is the state this
-- migration ships in. Nothing is seeded: a single 1,06,250-2,00,000 band would
-- itself violate the open-ended rule, so there is no correct set to guess.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_tds_slabs_validate_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
  v_open int;
  v_gap  record;
BEGIN
  SELECT count(*) INTO v_rows FROM public.hr_tds_slabs;
  IF v_rows = 0 THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_open
    FROM public.hr_tds_slabs WHERE max_monthly_gross IS NULL;

  IF v_open = 0 THEN
    RAISE EXCEPTION
      'The highest TDS band must be open-ended (leave its upper limit blank), or the highest earners pay no tax at all.'
      USING ERRCODE = '23514';
  END IF;
  IF v_open > 1 THEN
    RAISE EXCEPTION
      'Only one TDS band can be open-ended; % of them have no upper limit.', v_open
      USING ERRCODE = '23514';
  END IF;

  -- Contiguity. Ordered by floor, the open-ended band sorts last (any other
  -- band would overlap it), so its NULL ceiling is never compared.
  SELECT * INTO v_gap
    FROM (
      SELECT max_monthly_gross AS ceiling,
             lead(min_monthly_gross) OVER (ORDER BY min_monthly_gross) AS next_floor
        FROM public.hr_tds_slabs
    ) t
   WHERE t.ceiling IS NOT NULL
     AND t.next_floor IS DISTINCT FROM t.ceiling
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'TDS bands must not leave a gap: one band ends at % and the next begins at %. To exempt that range on purpose, add a band covering it at 0%%.',
      v_gap.ceiling, COALESCE(v_gap.next_floor::text, 'nothing')
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.hr_tds_slabs_validate_set() IS
  'Set-level integrity for hr_tds_slabs: exactly one open-ended band, and no gaps between bands. Deferred to COMMIT so a multi-row edit is judged as a whole.';

-- DEFERRABLE INITIALLY DEFERRED so a multi-band edit is judged once, at COMMIT,
-- rather than rejecting every intermediate state along the way — reordering
-- bands or raising a ceiling would be impossible otherwise.
DROP TRIGGER IF EXISTS trg_hr_tds_slabs_validate_set ON public.hr_tds_slabs;
CREATE CONSTRAINT TRIGGER trg_hr_tds_slabs_validate_set
  AFTER INSERT OR UPDATE OR DELETE ON public.hr_tds_slabs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.hr_tds_slabs_validate_set();

-- Keep updated_at honest; trg_set_updated_at is the repo-wide helper.
DROP TRIGGER IF EXISTS trg_hr_tds_slabs_updated_at ON public.hr_tds_slabs;
CREATE TRIGGER trg_hr_tds_slabs_updated_at
  BEFORE UPDATE ON public.hr_tds_slabs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. hr_staff_salaries — the allowance
--
-- annual_gross is left as GENERATED ALWAYS AS (monthly_gross * 12). It is the
-- annual GROSS and the TDS base; the gross + allowance figure is derived for
-- display rather than stored, and rebuilding a generated column would rewrite
-- the table for a number the UI can add up itself.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_staff_salaries
  ADD COLUMN IF NOT EXISTS allowance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowance_label  text;

ALTER TABLE public.hr_staff_salaries
  DROP CONSTRAINT IF EXISTS hr_staff_salaries_allowance_non_negative;
ALTER TABLE public.hr_staff_salaries
  ADD CONSTRAINT hr_staff_salaries_allowance_non_negative CHECK (allowance_amount >= 0);

COMMENT ON COLUMN public.hr_staff_salaries.allowance_amount IS
  'Monthly allowance paid on top of the gross. Counts toward earnings and is pro-rated with the gross, but is NEVER part of the TDS base.';
COMMENT ON COLUMN public.hr_staff_salaries.allowance_label IS
  'Free text saying what the allowance is for (e.g. Conveyance). Display only.';

-- ---------------------------------------------------------------------------
-- 4. hr_salary_register_lines — two more snapshots
--
-- tds_deduction is SNAPSHOTTED, which is what lets the slab table be edited
-- later without making an issued register inexplicable — and is why the bands
-- need no effective-dating of their own.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS allowance     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_deduction numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_salary_register_lines.allowance IS
  'Allowance earned on this line, included in total_earnings and pro-rated with the gross.';
COMMENT ON COLUMN public.hr_salary_register_lines.tds_deduction IS
  'TDS withheld, included in total_deductions. Computed from the monthly gross ALONE against hr_tds_slabs, and snapshotted here.';

-- ---------------------------------------------------------------------------
-- 5. fn_hr_set_staff_salary — THIRD signature change, both traps handled up front
--
--   a) A changed parameter list makes CREATE OR REPLACE an OVERLOAD, not a
--      replacement. PostgREST then answers PGRST203 "could not choose the best
--      candidate function" on EVERY call. Hence the explicit DROP.
--   b) The DROP discards the ACL, and a NEW function is executable by PUBLIC —
--      which includes anon. The REVOKE at the end is not optional.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric
);

CREATE FUNCTION public.fn_hr_set_staff_salary(
  p_staff_id               uuid,
  p_hr_organization_id     uuid,
  p_monthly_gross          numeric,
  p_effective_from         date,
  p_salary_structure       text    DEFAULT 'Monthly',
  p_overtime_level         text    DEFAULT 'No overtime',
  p_overtime_amount        numeric DEFAULT 0,
  p_eligible_for_pf        boolean DEFAULT false,
  p_exempt_edli            boolean DEFAULT false,
  p_eligible_for_insurance boolean DEFAULT false,
  p_eligible_for_gratuity  boolean DEFAULT false,
  p_eligible_for_etf       boolean DEFAULT false,
  p_notes                  text    DEFAULT NULL,
  p_epf_amount             numeric DEFAULT 0,
  p_eligible_for_esi       boolean DEFAULT false,
  p_esi_amount             numeric DEFAULT 0,
  p_allowance_amount       numeric DEFAULT 0,
  p_allowance_label        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id    uuid := gen_random_uuid();
  v_current   record;
  v_epf       numeric;
  v_esi       numeric;
  v_allowance numeric;
  v_alw_label text;
BEGIN
  IF p_staff_id IS NULL OR p_hr_organization_id IS NULL THEN
    RAISE EXCEPTION 'Staff and payroll organisation are both required'
      USING ERRCODE = '22023';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly salary must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Effective date is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_epf_amount, 0) < 0 OR COALESCE(p_esi_amount, 0) < 0 THEN
    RAISE EXCEPTION 'EPF and ESI amounts cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_allowance_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Allowance cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- An amount against a flag that is OFF is zeroed, not rejected. The bulk
  -- importer feeds this from a spreadsheet where a leftover figure beside a "No"
  -- is a formatting slip, and a hard failure there would abort a 754-row import.
  v_epf := CASE WHEN p_eligible_for_pf  THEN COALESCE(p_epf_amount, 0) ELSE 0 END;
  v_esi := CASE WHEN p_eligible_for_esi THEN COALESCE(p_esi_amount, 0) ELSE 0 END;

  v_allowance := COALESCE(p_allowance_amount, 0);
  -- A label with no money behind it is noise on every screen that renders it.
  v_alw_label := CASE WHEN v_allowance > 0
                      THEN NULLIF(TRIM(COALESCE(p_allowance_label, '')), '')
                      ELSE NULL END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary', 0));

  SELECT * INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-writing an IDENTICAL record would bury the real history under duplicates,
  -- so the incumbent is returned untouched instead.
  --
  -- COMPARES THE WHOLE PAYLOAD. It once tested only monthly_gross and
  -- effective_from, which made every other kind of edit a silent no-op that
  -- still reported success. Every column written below must appear here.
  --
  -- IS DISTINCT FROM throughout, not <>. p_notes and p_allowance_label are
  -- nullable, and `x <> NULL` is NULL rather than false — a plain <> chain would
  -- evaluate to NULL, be read as "not different", and restore the very bug this
  -- comparison exists to prevent.
  IF FOUND
     AND v_current.monthly_gross          IS NOT DISTINCT FROM p_monthly_gross
     AND v_current.effective_from         IS NOT DISTINCT FROM p_effective_from
     AND v_current.hr_organization_id     IS NOT DISTINCT FROM p_hr_organization_id
     AND v_current.salary_structure       IS NOT DISTINCT FROM p_salary_structure
     AND v_current.overtime_level         IS NOT DISTINCT FROM p_overtime_level
     AND v_current.overtime_amount        IS NOT DISTINCT FROM COALESCE(p_overtime_amount, 0)
     AND v_current.eligible_for_pf        IS NOT DISTINCT FROM p_eligible_for_pf
     AND v_current.exempt_edli            IS NOT DISTINCT FROM p_exempt_edli
     AND v_current.eligible_for_insurance IS NOT DISTINCT FROM p_eligible_for_insurance
     AND v_current.eligible_for_gratuity  IS NOT DISTINCT FROM p_eligible_for_gratuity
     AND v_current.eligible_for_etf       IS NOT DISTINCT FROM p_eligible_for_etf
     AND v_current.epf_amount             IS NOT DISTINCT FROM v_epf
     AND v_current.eligible_for_esi       IS NOT DISTINCT FROM p_eligible_for_esi
     AND v_current.esi_amount             IS NOT DISTINCT FROM v_esi
     AND v_current.allowance_amount       IS NOT DISTINCT FROM v_allowance
     AND v_current.allowance_label        IS NOT DISTINCT FROM v_alw_label
     AND v_current.notes                  IS NOT DISTINCT FROM p_notes THEN
    RETURN v_current.id;
  END IF;

  IF FOUND THEN
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.hr_staff_salaries (
    id, staff_id, hr_organization_id, salary_structure, monthly_gross,
    overtime_level, overtime_amount, eligible_for_pf, exempt_edli,
    eligible_for_insurance, eligible_for_gratuity, eligible_for_etf,
    epf_amount, eligible_for_esi, esi_amount,
    allowance_amount, allowance_label,
    effective_from, notes, created_by, updated_by
  ) VALUES (
    v_new_id, p_staff_id, p_hr_organization_id, p_salary_structure, p_monthly_gross,
    p_overtime_level, p_overtime_amount, p_eligible_for_pf, p_exempt_edli,
    p_eligible_for_insurance, p_eligible_for_gratuity, p_eligible_for_etf,
    v_epf, p_eligible_for_esi, v_esi,
    v_allowance, v_alw_label,
    p_effective_from, p_notes, auth.uid(), auth.uid()
  );

  RETURN v_new_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. hr_staff_salary_directory() — DROP + recreate, two more columns
--
-- Postgres refuses CREATE OR REPLACE on a changed return type outright.
--
-- TDS IS NOT RETURNED HERE AND IS NOT STORED ANYWHERE ON hr_staff_salaries. It
-- is derived from the gross and the bands, so a stored copy would go stale the
-- moment a rate changed and would need 433 rows recomputed on every slab edit.
-- The screen resolves it; the register snapshots it onto the line.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hr_staff_salary_directory();

CREATE FUNCTION public.hr_staff_salary_directory()
RETURNS TABLE(
  staff_uuid uuid, staff_code text, person_name text, role_title text,
  is_active boolean, works_at_id uuid, works_at_name text,
  payer_org_id uuid, payer_org_name text,
  salary_id uuid, salary_structure text, monthly_gross numeric, annual_gross numeric,
  overtime_level text, overtime_amount numeric,
  eligible_for_pf boolean, exempt_edli boolean, eligible_for_insurance boolean,
  eligible_for_gratuity boolean, eligible_for_etf boolean,
  epf_amount numeric, eligible_for_esi boolean, esi_amount numeric,
  allowance_amount numeric, allowance_label text,
  effective_from date, notes text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.salary.view') THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to see employee salaries.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         COALESCE(s.is_active, false),
         i.id,
         i.name::text,
         o.id,
         o.name::text,
         sal.id,
         sal.salary_structure::text,
         sal.monthly_gross,
         sal.annual_gross,
         sal.overtime_level::text,
         sal.overtime_amount,
         sal.eligible_for_pf,
         sal.exempt_edli,
         sal.eligible_for_insurance,
         sal.eligible_for_gratuity,
         sal.eligible_for_etf,
         sal.epf_amount,
         sal.eligible_for_esi,
         sal.esi_amount,
         sal.allowance_amount,
         sal.allowance_label,
         sal.effective_from,
         sal.notes
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
   WHERE (COALESCE(s.is_active, false) OR sal.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   ORDER BY (sal.id IS NOT NULL), i.name, 3;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Grants. REVOKE FROM PUBLIC first — a newly created function is executable
--    by PUBLIC, which includes anon, so a bare re-GRANT would leave both of
--    these wider than the originals were.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.hr_staff_salary_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_tds_slabs_validate_set() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.hr_staff_salary_directory() TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_tds_slabs TO authenticated;
GRANT ALL ON public.hr_tds_slabs TO service_role;

COMMIT;
