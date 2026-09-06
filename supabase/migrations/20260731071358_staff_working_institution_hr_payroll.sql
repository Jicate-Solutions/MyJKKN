-- Updated: 2026-07-31 - Separate "where you work" from "who pays you"
--
-- WHY
-- public.staff.institution_id is being asked to carry TWO different facts, and
-- today it means different things for different people:
--   * 103 bus drivers, hostel ayaahs, cooking masters, scavengers and security
--     sit under "JKKN Main Office" because they work ACROSS the whole campus.
--     For them the column means WHERE THEY WORK.
--   * ~13 senior officers - including the CEO and the Chief Business Officer -
--     sit under "JKKN College of Engineering and Technology" because Engineering
--     is the entity that PAYS them. None of them works there. For them the
--     column means WHO PAYS THEM.
--   * Everyone else: both facts coincide, so the column is unambiguous.
--
-- Director decision 2026-07-31: institution_id keeps its VALUES and all of its
-- wiring, and is DECLARED to mean WHERE THE PERSON WORKS. That is already what
-- the rest of the platform assumes of it - attendance, timetables, class
-- incharges, principal/HOD scoping and every "own institution" RLS check read it
-- as a work location. Declaring the meaning that those modules already rely on
-- costs zero changes in any of them.
--
-- WHO PAYS is a separate and much NARROWER fact that only the HR module needs,
-- so it moves OUT of staff into its own table.
--
-- ############################################################################
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON staff
-- ############################################################################
-- The payroll organisation must be visible to HR only (Director, 2026-07-31).
-- Postgres RLS under Supabase is ROW level: there is no column-level RLS, and
-- column GRANTs cannot express it either, because every signed-in user shares
-- the single `authenticated` role - the database cannot tell an HR officer from
-- a lecturer at column granularity.
--
-- A column on staff would therefore be readable by everyone who can read the
-- staff row, and this codebase hands that row out in three places that all use
-- select('*'):
--   * StaffService list queries        (lib/services/staff/staff-service.ts)
--   * the external staff API           (/api/api-management/staff, jkkn_ keys)
--   * the MCP server                   (app/api/mcp/[transport]/route.ts)
-- Not selecting the column would be security by omission - any holder of a valid
-- token could still request it straight from PostgREST.
--
-- A dedicated table makes ordinary row-level RLS do the job, and carries a
-- second benefit: because the value lives in another table, a non-HR user
-- editing a staff record physically CANNOT overwrite it.
--
-- ############################################################################
-- WHY "JKKN Main Office" GETS NO PAYROLL ROW
-- ############################################################################
-- Main Office is a WORK location only - it does not pay anyone (Director,
-- 2026-07-31). Copying institution_id into the payroll table for those 103
-- people would record 103 facts we know to be false. They are deliberately left
-- WITHOUT a row: absence means "payer not yet recorded" and is a work queue for
-- HR, never a silent default.
--
-- BLAST RADIUS: none. staff keeps every column, value, constraint, policy and
-- trigger it has today; institution_id is not read, written or re-pointed. No
-- existing query changes behaviour, because nothing reads the new table yet.
-- Measured before writing: 857 staff rows, 741 active, 0 payroll periods and
-- 0 payslips in production - payroll has never run, so there is no live payroll
-- and no historical payslip data that this could disturb.

-- ---------------------------------------------------------------------------
-- 1) Record the meaning of the existing column, in the database itself.
--    The column is NOT renamed: 618 tables carry institution_id, 779 RLS
--    policies reach it through role_has_institution_access(), and
--    trg_sync_staff_to_profiles copies it into profiles.institution_id, which
--    get_current_user_institution_id() reads. Renaming it is not worth it; the
--    comment is where the new contract lives.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.staff.institution_id IS
  'WORKING organisation - where this person actually works. This is the column every module scopes on (attendance, timetables, class incharges, RLS "own institution" checks) and it syncs to profiles.institution_id, so it remains the one that affects permissions. WHO PAYS the salary is a separate HR-only fact held in hr_staff_payroll.';

-- ---------------------------------------------------------------------------
-- 2) Which organisations actually run a payroll.
--    A flag rather than a hardcoded name check, so a future non-paying entity
--    (Nattraja Incubation Forum, for instance) is a data edit and not a patch.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_organizations
  ADD COLUMN IF NOT EXISTS is_payroll_entity boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hr_organizations.is_payroll_entity IS
  'false = this organisation is a work location only and pays nobody. Enforced: hr_staff_payroll cannot reference an organisation with this set to false.';

UPDATE public.hr_organizations o
   SET is_payroll_entity = false,
       updated_at        = now()
  FROM public.institutions i
 WHERE i.id = o.institution_id
   AND i.name = 'JKKN Main Office'
   AND o.is_payroll_entity;

-- Composite-unique on the PK plus the flag. Redundant on its own; it exists so
-- hr_staff_payroll below can point a foreign key at (id, is_payroll_entity) and
-- have Postgres guarantee the referenced organisation really does run payroll.
ALTER TABLE public.hr_organizations
  DROP CONSTRAINT IF EXISTS hr_organizations_id_payroll_entity_key;
ALTER TABLE public.hr_organizations
  ADD CONSTRAINT hr_organizations_id_payroll_entity_key UNIQUE (id, is_payroll_entity);

-- ---------------------------------------------------------------------------
-- 3) The payroll link. One payer per person; absence = not yet recorded.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_staff_payroll (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One row per person. CASCADE because a payroll link for a deleted staff
  -- record is meaningless, and leaving it would strand a row nobody can see.
  staff_id           uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,

  -- Keyed on hr_organization_id rather than institution_id to match the ~30
  -- sibling hr_* tables and hr_payroll_periods.hr_organization_id, which is what
  -- the payslip generator already filters on. hr_organizations is a 1:1 mirror
  -- of institutions (14 rows), so institution_id is one join away when needed.
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),

  -- Always true. Exists only to carry the composite foreign key below, because
  -- a CHECK constraint cannot run the subquery that "this organisation runs
  -- payroll" would need. This is what makes "Main Office can never be a payer"
  -- a database guarantee instead of a convention. It also blocks flipping an
  -- organisation to is_payroll_entity=false while staff are still attached.
  is_payroll_entity  boolean NOT NULL DEFAULT true CHECK (is_payroll_entity),

  notes              text,

  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT hr_staff_payroll_org_must_run_payroll
    FOREIGN KEY (hr_organization_id, is_payroll_entity)
    REFERENCES public.hr_organizations (id, is_payroll_entity)
);

COMMENT ON TABLE public.hr_staff_payroll IS
  'WHO PAYS each staff member. HR-only: this is a separate table rather than a column on staff because Supabase RLS is row-level, so a column could not be hidden from the staff list, the external staff API or the MCP server. NO ROW = payer not yet recorded (a work queue for HR), which is the state of everyone whose work location does not run a payroll.';

CREATE INDEX IF NOT EXISTS idx_hr_staff_payroll_organization
  ON public.hr_staff_payroll (hr_organization_id);

DROP TRIGGER IF EXISTS update_hr_staff_payroll_updated_at ON public.hr_staff_payroll;
CREATE TRIGGER update_hr_staff_payroll_updated_at
  BEFORE UPDATE ON public.hr_staff_payroll
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) RLS - HR only, gated on permission KEYS, never on role names.
--    The sibling hr_payslips policies still hardcode role_key IN ('hr_officer',
--    'hr_admin', ...); that pattern is not copied here.
--    Each check is wrapped in (SELECT ...) so Postgres evaluates it ONCE per
--    query instead of once per row - the variable-free-check rule that the
--    57014 timeouts on this database were traced to.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_staff_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_payroll_select ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_select ON public.hr_staff_payroll
  FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('hr.payroll.institution.view')));

DROP POLICY IF EXISTS hr_staff_payroll_write ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_write ON public.hr_staff_payroll
  FOR ALL TO authenticated
  USING ((SELECT public.user_has_permission('hr.payroll.institution.manage')))
  WITH CHECK ((SELECT public.user_has_permission('hr.payroll.institution.manage')));

DROP POLICY IF EXISTS hr_staff_payroll_service_role ON public.hr_staff_payroll;
CREATE POLICY hr_staff_payroll_service_role ON public.hr_staff_payroll
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon must never see payroll data. REVOKE FROM anon (not FROM public - that
-- would also strip authenticated and service_role).
REVOKE ALL ON public.hr_staff_payroll FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_payroll TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Permission keys. Declaring them in lib/constants/permissions.ts does
--    nothing on its own - a key only exists for a role once it is in that
--    role's JSONB, so the grant has to happen here or the HR screens render
--    empty. Deliberately narrow: HR roles only. Widening later (accounts, cao)
--    is one line; clawing back a leaked salary-payer list is not.
--    super_admin needs no grant - user_has_permission() bypasses for them.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('hr.payroll.institution.view', true)
                     || jsonb_build_object('hr.payroll.institution.manage', true),
       updated_at  = now()
 WHERE role_key IN ('hr_admin', 'hr_head', 'hr_manager');

-- Every other role gets the keys present-and-false, so Role Management renders
-- the toggles instead of hiding them. jsonb_set with create_missing writes one
-- path at a time and cannot clobber a neighbouring key.
UPDATE public.custom_roles
   SET permissions = jsonb_set(
                       jsonb_set(COALESCE(permissions, '{}'::jsonb),
                                 ARRAY['hr.payroll.institution.view'], 'false'::jsonb, true),
                       ARRAY['hr.payroll.institution.manage'], 'false'::jsonb, true),
       updated_at  = now()
 WHERE role_key NOT IN ('hr_admin', 'hr_head', 'hr_manager')
   AND NOT (permissions ? 'hr.payroll.institution.view');

-- ---------------------------------------------------------------------------
-- 6) Backfill. Note there is no name check here: the is_payroll_entity join
--    excludes Main Office by itself, so the rule lives in exactly one place.
--    For the ~13 officers this records the CORRECT payer, because their
--    institution_id is still the paying college at this point - the later phase
--    that moves them to their real work location leaves this row untouched.
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_staff_payroll (staff_id, hr_organization_id)
SELECT s.id, o.id
  FROM public.staff s
  JOIN public.hr_organizations o ON o.institution_id = s.institution_id
 WHERE o.is_payroll_entity
ON CONFLICT (staff_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Guards. Fail loudly rather than leave a half-populated payroll table.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_filled  int;
  v_total   int;
  v_pending int;
  v_missed  int;
BEGIN
  -- Main Office must not be a payer.
  IF EXISTS (
    SELECT 1 FROM public.hr_organizations o
      JOIN public.institutions i ON i.id = o.institution_id
     WHERE i.name = 'JKKN Main Office' AND o.is_payroll_entity
  ) THEN
    RAISE EXCEPTION 'JKKN Main Office is still flagged as a payroll entity. It is a work location only.';
  END IF;

  -- Nobody at a paying organisation may be left without a payer.
  SELECT count(*) INTO v_missed
    FROM public.staff s
    JOIN public.hr_organizations o ON o.institution_id = s.institution_id
   WHERE o.is_payroll_entity
     AND NOT EXISTS (SELECT 1 FROM public.hr_staff_payroll p WHERE p.staff_id = s.id);
  IF v_missed > 0 THEN
    RAISE EXCEPTION 'Backfill missed % staff at payroll-running organisations.', v_missed;
  END IF;

  -- This column must never become load-bearing for access. Permissions continue
  -- to derive from staff.institution_id via profiles; if a policy ever starts
  -- reading the payroll table to decide access, that decision should be
  -- deliberate and not arrive by accident.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename <> 'hr_staff_payroll'
       AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) ILIKE '%hr_staff_payroll%'
  ) THEN
    RAISE EXCEPTION 'hr_staff_payroll is referenced by an RLS policy on another table. Payroll organisation is a reporting fact; access must continue to derive from staff.institution_id.';
  END IF;

  SELECT count(*) INTO v_filled FROM public.hr_staff_payroll;
  SELECT count(*) INTO v_total  FROM public.staff;
  v_pending := v_total - v_filled;

  RAISE NOTICE 'hr_staff_payroll: % of % staff have a recorded payer; % await HR (work locations that run no payroll).',
    v_filled, v_total, v_pending;
END
$verify$;
