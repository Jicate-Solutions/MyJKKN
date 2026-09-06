-- =====================================================================
-- Solution department capability catalogue — the value list behind
-- sh_solution_departments.capabilities
--
-- NOT applied to any database - Director-gated apply.
--
-- Date: 2026-08-01
--
-- WHY THIS EXISTS
--   sh_solution_departments holds 44 rows across 6 colleges, every one
--   status='active', and `capabilities` (text[]) is '{}' on all 44
--   (verified live 2026-08-01 via PostgREST). The registry knows WHO
--   participates and nothing about WHAT any of them can do, so a problem
--   can never be matched to a department.
--
--   The reason it is empty is not neglect. A capability editor DID exist
--   (app/(routes)/solutions/departments/[id]/_components/capabilities-editor.tsx)
--   and was deleted on 2026-04-02 by commit 29c5f424f8, which retired the
--   whole /solutions/departments tree because its NOMINATION/APPROVAL
--   workflow had become obsolete ("all departments are now Solutions
--   Departments as of April 1, 2026"). The capability editor was
--   collateral damage in that delete, not a decision to stop declaring
--   capabilities. Since then the only writer of the column has been gone,
--   which is exactly why every row still reads '{}'.
--
--   That deleted editor was a FREE-TEXT tag box: it lowercased and
--   hyphenated whatever was typed. Two departments that both do the same
--   thing could therefore store 'data-analytics' and 'data-analysis' and
--   never match. Re-shipping free text would rebuild the same dead end.
--   Hence a value list.
--
-- WHAT THIS MIGRATION DOES
--   PHASE 1: CREATE TABLE sh_department_capabilities — institution-scoped
--            master (capability_code, capability_name, description,
--            sort_order, is_system, is_active). Unique per
--            (institution_id, capability_code). Mirrors the
--            public.leave_types / public.hostel_leave_types pattern
--            (20260421000005_hostel_leave_types_crudable.sql) so each
--            college owns and curates its own list.
--
--   PHASE 2: Seed 16 cross-disciplinary defaults x every institution
--            (14 institutions live on 2026-08-01 => 224 rows).
--            is_system=true on every seeded row so the UI and the DELETE
--            path can refuse to wipe the defaults.
--
--   PHASE 3: RLS + explicit grants.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   - It does not alter sh_solution_departments. `capabilities` stays
--     text[]; it now stores capability_code values drawn from this
--     catalogue instead of free text. Nothing is dropped, nothing is
--     backfilled, existing readers keep compiling.
--   - It adds no FK from the text[] to this table (Postgres cannot
--     FK-constrain an array element). Validation is enforced in
--     lib/services/solutions/department-capability-service.ts, which
--     rejects any code that is not an active catalogue row for that
--     institution.
--   - It does not tighten the pre-existing sh_solution_departments RLS.
--     See the note at the bottom — that policy is weak and is reported,
--     not silently changed, because paradigm-shift and the department
--     tracker also write that table.
--
-- Atomicity: single BEGIN/COMMIT — all-or-nothing.
-- Idempotency: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING,
--              DROP POLICY IF EXISTS, CREATE INDEX IF NOT EXISTS.
-- Rollback: DROP TABLE public.sh_department_capabilities CASCADE;
--           No other table is modified, so rollback loses nothing else.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: the catalogue table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sh_department_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL
        REFERENCES public.institutions(id) ON DELETE CASCADE,
    capability_code VARCHAR(40) NOT NULL,
    capability_name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sh_department_capability_code_per_institution
        UNIQUE (institution_id, capability_code),
    CONSTRAINT chk_sh_department_capability_code_shape
        CHECK (capability_code ~ '^[a-z][a-z0-9_]{1,39}$')
);

COMMENT ON TABLE public.sh_department_capabilities IS
  'CRUDable per-institution catalogue of the capabilities a solution '
  'department can declare. Feeds the multi-select on /solutions/departments; '
  'the chosen capability_code values are stored in '
  'sh_solution_departments.capabilities (text[]). Replaces the free-text tag '
  'box deleted with the /solutions/departments tree on 2026-04-02, which let '
  'two departments spell the same capability two ways and never match.';

COMMENT ON COLUMN public.sh_department_capabilities.capability_code IS
  'Machine-readable code stored inside sh_solution_departments.capabilities. '
  'Lowercase letters, digits and underscores; unique per institution. '
  'Postgres cannot FK-constrain an array element, so the service layer '
  'validates every code against the active rows for that institution.';

COMMENT ON COLUMN public.sh_department_capabilities.is_system IS
  'TRUE for the 16 seeded defaults. The UI hides destructive actions on '
  'system rows and the DELETE policy refuses them.';

CREATE INDEX IF NOT EXISTS sh_department_capabilities_institution_idx
  ON public.sh_department_capabilities (institution_id);

CREATE INDEX IF NOT EXISTS sh_department_capabilities_active_idx
  ON public.sh_department_capabilities (institution_id, is_active);

ALTER TABLE public.sh_department_capabilities ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_sh_department_capabilities_updated_at
  ON public.sh_department_capabilities;
CREATE TRIGGER trg_sh_department_capabilities_updated_at
  BEFORE UPDATE ON public.sh_department_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- PHASE 2: seed 16 defaults x every institution
--
-- The list is deliberately cross-disciplinary: the 44 participating
-- departments span engineering, dental, pharmacy, nursing, allied health
-- and arts & science, so a per-college list would not let the Solutions
-- Hub match one problem across colleges. Colleges add their own rows on
-- top (is_system=false) as needed.
-- ---------------------------------------------------------------------

INSERT INTO public.sh_department_capabilities (
    institution_id, capability_code, capability_name, description,
    sort_order, is_system, is_active
)
SELECT
    i.id,
    d.code,
    d.name,
    d.description,
    d.sort_order,
    true,
    true
FROM public.institutions i
CROSS JOIN (
    VALUES
        ('software_development', 'Software development',
         'Building and maintaining web, mobile or embedded applications.', 10),
        ('data_analytics', 'Data analysis and dashboards',
         'Cleaning, analysing and visualising a client''s data.', 20),
        ('ai_ml', 'AI and machine learning',
         'Model building, evaluation and applied AI work.', 30),
        ('hardware_prototyping', 'Hardware and prototyping',
         'Electronics, mechanical design, fabrication and 3D printing.', 40),
        ('sample_testing', 'Testing and sample analysis',
         'Bench testing, sample analysis and instrumented measurement.', 50),
        ('clinical_services', 'Clinical services',
         'Patient-facing care delivered under qualified supervision.', 60),
        ('diagnostics_screening', 'Diagnostics and screening',
         'Screening camps, diagnostic panels and result interpretation.', 70),
        ('formulation_development', 'Formulation and product development',
         'Developing a formulation, prototype or product from a brief.', 80),
        ('quality_regulatory', 'Quality and regulatory',
         'Quality systems, audits, documentation and regulatory dossiers.', 90),
        ('training_delivery', 'Training delivery',
         'Designing and running skill-building sessions for a client.', 100),
        ('content_production', 'Content production',
         'Video, print and digital content produced to a brief.', 110),
        ('field_survey', 'Field survey and data collection',
         'Questionnaire design, field enumeration and data capture.', 120),
        ('design_creative', 'Design and creative',
         'Visual design, branding and creative direction.', 130),
        ('community_outreach', 'Community outreach',
         'Awareness drives, camps and community-facing programmes.', 140),
        ('consulting_advisory', 'Consulting and advisory',
         'Diagnostic studies, feasibility work and expert advice.', 150),
        ('technical_writing', 'Technical writing',
         'Manuals, standard operating procedures and technical reports.', 160)
) AS d(code, name, description, sort_order)
ON CONFLICT (institution_id, capability_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- PHASE 3: grants + RLS
--
-- GRANT ORDER MATTERS. Supabase ships
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES TO anon, authenticated, service_role;
-- so this table was born with anon=arwdDxt AND authenticated=arwdDxt.
-- A bare GRANT SELECT would be a silent no-op that leaves INSERT/UPDATE/
-- DELETE in place. The REVOKE must come first, and it must name
-- `authenticated` as well as anon and PUBLIC.
--
-- What is granted back, and why it is wider than SELECT: the shipped UI
-- lets an authorised person add a capability to their institution's list
-- from inside the declare dialog (a value list nobody can extend is not a
-- value list — that was the failure of the free-text box's replacement).
-- INSERT and UPDATE are therefore granted and the four RLS policies below
-- are the actual authorisation. DELETE is NOT granted at all: this
-- codebase soft-deletes master rows by flipping is_active
-- (solution-types-manager.tsx does exactly that), so a hard delete has no
-- caller and no grant.
-- ---------------------------------------------------------------------

REVOKE ALL ON public.sh_department_capabilities FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sh_department_capabilities TO authenticated;

DROP POLICY IF EXISTS sh_department_capabilities_select_permission
  ON public.sh_department_capabilities;
CREATE POLICY sh_department_capabilities_select_permission
  ON public.sh_department_capabilities FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('solutions.departments.view')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS sh_department_capabilities_insert_permission
  ON public.sh_department_capabilities;
CREATE POLICY sh_department_capabilities_insert_permission
  ON public.sh_department_capabilities FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('solutions.departments.capabilities.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS sh_department_capabilities_update_permission
  ON public.sh_department_capabilities;
CREATE POLICY sh_department_capabilities_update_permission
  ON public.sh_department_capabilities FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('solutions.departments.capabilities.edit')
          AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('solutions.departments.capabilities.edit')
          AND role_has_institution_access(institution_id))
  );

COMMIT;

-- =====================================================================
-- Post-migration verification (run in the Supabase SQL editor)
-- =====================================================================
--
-- -- 1. Seed landed for every institution (expect 16 per institution):
-- SELECT i.name AS institution, COUNT(c.id) AS capability_count
-- FROM public.institutions i
-- LEFT JOIN public.sh_department_capabilities c ON c.institution_id = i.id
-- GROUP BY i.id, i.name
-- ORDER BY i.name;
--
-- -- 2. anon holds nothing, authenticated holds exactly SELECT/INSERT/UPDATE:
-- SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name = 'sh_department_capabilities'
-- GROUP BY grantee;
-- -- Expected: no `anon` row at all; authenticated = INSERT,SELECT,UPDATE.
--
-- -- 3. RLS on, three policies:
-- SELECT relrowsecurity FROM pg_class
-- WHERE oid = 'public.sh_department_capabilities'::regclass;
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'sh_department_capabilities' ORDER BY policyname;
--
-- =====================================================================
-- REPORTED, NOT CHANGED — pre-existing weakness on the table this feature
-- writes:
--
--   supabase/migrations/20260209000001_solution_department_tracker.sql
--   created sh_solution_departments with
--       CREATE POLICY "sh_solution_departments_update"
--         ON public.sh_solution_departments FOR UPDATE
--         TO authenticated USING (true) WITH CHECK (true);
--
--   Any signed-in person can therefore update any of the 44 rows,
--   including another college's, regardless of permission or institution.
--   No later migration in this repo touches that policy. The capability
--   declaration written by this feature is gated in the UI and the
--   service, but the database will not stop a direct PostgREST call.
--
--   It is left alone here on purpose: paradigm-shift and the department
--   tracker also write that table, so tightening it is a separate,
--   separately-tested change rather than a side effect of adding a
--   catalogue.
-- =====================================================================
