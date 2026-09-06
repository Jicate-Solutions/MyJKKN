-- HR gets its own academic year dimension.
--
-- WHY THIS EXISTS
-- Every HR leave table is keyed on hr_organization_id, but the year they
-- referenced (academic_years) is keyed on institution_id. Every read therefore
-- detoured through hr_organizations.institution_id, and the same logical year
-- existed once per institution: 17 distinct academic_year_id values in
-- hr_leave_balances represented just 2 real years (2024-2025 x7, 2025-2026 x1,
-- 2026-2027 x9).
--
-- Two workarounds grew out of that and are removed by this change:
--   1. hr_leave_balance_analytics matched on btrim(academic_year_name) because
--      no single id could address a cross-institution view.
--   2. hr_leave_period_window stretched a 10-month academic year
--      (Jun 1 -> Mar 31) to 12 months so leave taken in April and May was not
--      orphaned.
--
-- hr_academic_years is GROUP-WIDE: one row per year for all of JKKN HR, on the
-- Indian financial year (Apr 1 -> Mar 31) that payroll, gratuity and encashment
-- already run on. Row-level tenancy stays where it belongs -- on
-- hr_leave_balances.hr_organization_id -- and the year becomes a pure calendar
-- dimension.
--
-- This is migration A of two. It leaves academic_year_id in place but no longer
-- load-bearing, so the backfill can be verified in the UI before
-- 20260811_hr_academic_years_drop_legacy.sql removes it.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.hr_academic_years (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_name   text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id),
  updated_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_academic_years_name_uq   UNIQUE (year_name),
  CONSTRAINT hr_academic_years_dates_ck  CHECK (end_date > start_date),

  -- The constraint academic_years lacks. Without it a second row covering the
  -- same days can be created, which is how 'JKKN Dental 2026-2027 Additional 2'
  -- and three more shadow rows came to exist there. Two active HR years must
  -- never contain the same day, because resolution is by date bracket.
  CONSTRAINT hr_academic_years_no_overlap
    EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
    WHERE (is_active)
);

COMMENT ON TABLE public.hr_academic_years IS
  'Group-wide HR leave/payroll year (Apr 1 -> Mar 31). Deliberately has no '
  'institution_id or hr_organization_id: one row serves all of JKKN HR. Tenancy '
  'lives on the referencing rows (hr_leave_balances.hr_organization_id).';

CREATE INDEX hr_academic_years_dates_idx
  ON public.hr_academic_years (start_date, end_date) WHERE is_active;

CREATE TRIGGER hr_academic_years_updated_at
  BEFORE UPDATE ON public.hr_academic_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS
--
-- SELECT is open to authenticated. This is a four-row calendar with no PII, and
-- every staff member's apply-leave drawer has to resolve the current year --
-- gating it on a permission would mean granting that key to 5,000+ users.
-- Writes are gated on hr.academic_years.manage.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hr_academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_academic_years_select_authenticated
  ON public.hr_academic_years FOR SELECT TO authenticated
  USING (true);

CREATE POLICY hr_academic_years_insert_manage
  ON public.hr_academic_years FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.academic_years.manage'))
  );

CREATE POLICY hr_academic_years_update_manage
  ON public.hr_academic_years FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.academic_years.manage'))
  );

CREATE POLICY hr_academic_years_delete_manage
  ON public.hr_academic_years FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.academic_years.manage'))
  );

-- ---------------------------------------------------------------------------
-- 3. Seed
--
-- Covers every year present in hr_leave_balances today (2024-2025, 2025-2026,
-- 2026-2027) plus the next one, so HR can generate ahead.
-- ---------------------------------------------------------------------------

INSERT INTO public.hr_academic_years (year_name, start_date, end_date, is_active)
VALUES
  ('2024-2025', DATE '2024-04-01', DATE '2025-03-31', true),
  ('2025-2026', DATE '2025-04-01', DATE '2026-03-31', true),
  ('2026-2027', DATE '2026-04-01', DATE '2027-03-31', true),
  ('2027-2028', DATE '2027-04-01', DATE '2028-03-31', true);

-- ---------------------------------------------------------------------------
-- 4. Permission key
--
-- A key declared in lib/constants/permissions.ts does not exist until it is in
-- a role's custom_roles.permissions JSONB. Granted to exactly the roles that
-- already hold hr.leave.balance.manage -- the same people who provision leave.
-- ---------------------------------------------------------------------------

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object('hr.academic_years.manage', true)
WHERE role_name IN (
  'HR Head', 'HR Administrator', 'HR Manager',
  'Chief Executive Officer', 'Chief Operating Officer',
  'Managing Director', 'Board Member'
);

-- ---------------------------------------------------------------------------
-- 5. Rollback snapshots
--
-- Captured before any write, so the old academic_year_id mapping survives even
-- after migration B drops the column.
-- ---------------------------------------------------------------------------

CREATE TABLE public.bak_hr_leave_ay_20260810_balances AS
SELECT employee_id, leave_type_id, academic_year_id, hr_organization_id,
       entitled, used, carried_forward
FROM public.hr_leave_balances;

CREATE TABLE public.bak_hr_leave_ay_20260810_applications AS
SELECT id, employee_id, leave_type_id, academic_year_id, hr_organization_id,
       start_date, end_date, status
FROM public.hr_leave_applications;

CREATE TABLE public.bak_hr_leave_ay_20260810_encashments AS
SELECT id, employee_id, leave_type_id, academic_year_id, hr_organization_id
FROM public.hr_leave_encashments;

-- ---------------------------------------------------------------------------
-- 6. New column + backfill
--
-- The mapping is by trimmed year name and is unambiguous: only three names are
-- in use and all three are seeded above. academic_year_name is TEXT and some
-- values carry a trailing space, hence btrim.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hr_leave_balances
  ADD COLUMN hr_academic_year_id uuid REFERENCES public.hr_academic_years(id);
ALTER TABLE public.hr_leave_applications
  ADD COLUMN hr_academic_year_id uuid REFERENCES public.hr_academic_years(id);
ALTER TABLE public.hr_leave_encashments
  ADD COLUMN hr_academic_year_id uuid REFERENCES public.hr_academic_years(id);

UPDATE public.hr_leave_balances b
SET hr_academic_year_id = h.id
FROM public.academic_years a
JOIN public.hr_academic_years h ON h.year_name = btrim(a.academic_year_name)
WHERE a.id = b.academic_year_id;

UPDATE public.hr_leave_applications l
SET hr_academic_year_id = h.id
FROM public.academic_years a
JOIN public.hr_academic_years h ON h.year_name = btrim(a.academic_year_name)
WHERE a.id = l.academic_year_id;

UPDATE public.hr_leave_encashments e
SET hr_academic_year_id = h.id
FROM public.academic_years a
JOIN public.hr_academic_years h ON h.year_name = btrim(a.academic_year_name)
WHERE a.id = e.academic_year_id;

-- Applications may legitimately have carried a NULL academic_year_id. Resolve
-- those from the date the leave starts -- possible only now that exactly one HR
-- year contains any given day.
UPDATE public.hr_leave_applications l
SET hr_academic_year_id = h.id
FROM public.hr_academic_years h
WHERE l.hr_academic_year_id IS NULL
  AND h.is_active
  AND l.start_date BETWEEN h.start_date AND h.end_date;

-- ---------------------------------------------------------------------------
-- 7. Verify gate
--
-- The PK swap below is irreversible in-place, so refuse to reach it with an
-- unmapped row. Expected at authoring time: 5496 balances, 284 applications,
-- 0 encashments.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bal_null  bigint;
  v_app_null  bigint;
  v_enc_null  bigint;
  v_bal_total bigint;
  v_app_total bigint;
BEGIN
  SELECT count(*) FILTER (WHERE hr_academic_year_id IS NULL), count(*)
    INTO v_bal_null, v_bal_total FROM public.hr_leave_balances;
  SELECT count(*) FILTER (WHERE hr_academic_year_id IS NULL), count(*)
    INTO v_app_null, v_app_total FROM public.hr_leave_applications;
  SELECT count(*) FILTER (WHERE hr_academic_year_id IS NULL)
    INTO v_enc_null FROM public.hr_leave_encashments;

  IF v_bal_null > 0 OR v_app_null > 0 OR v_enc_null > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete -- aborting before the PK swap. Unmapped rows: balances=%, applications=%, encashments=%',
      v_bal_null, v_app_null, v_enc_null;
  END IF;

  RAISE NOTICE 'hr_academic_years backfill OK: % balances, % applications mapped',
    v_bal_total, v_app_total;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Constraint swap
--
-- hr_leave_balances identifies a row by (employee, type, year), so the column
-- being replaced is part of the primary key. Dropping a PK in Postgres leaves
-- the NOT NULL it implied in place, hence the explicit DROP NOT NULL -- without
-- it every future insert would still have to supply the dead column.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hr_leave_balances   ALTER COLUMN hr_academic_year_id SET NOT NULL;
ALTER TABLE public.hr_leave_encashments ALTER COLUMN hr_academic_year_id SET NOT NULL;

ALTER TABLE public.hr_leave_balances DROP CONSTRAINT hr_leave_balances_pkey;
ALTER TABLE public.hr_leave_balances
  ADD CONSTRAINT hr_leave_balances_pkey
  PRIMARY KEY (employee_id, leave_type_id, hr_academic_year_id);

ALTER TABLE public.hr_leave_balances    ALTER COLUMN academic_year_id DROP NOT NULL;
ALTER TABLE public.hr_leave_encashments ALTER COLUMN academic_year_id DROP NOT NULL;

CREATE INDEX hr_leave_applications_hr_ay_idx
  ON public.hr_leave_applications (hr_academic_year_id);
CREATE INDEX hr_leave_encashments_hr_ay_idx
  ON public.hr_leave_encashments (hr_academic_year_id);
