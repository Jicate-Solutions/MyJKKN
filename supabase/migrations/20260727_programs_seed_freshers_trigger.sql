-- ============================================================================
-- Auto-seed the "Freshers" semester + section "A" whenever a program is created
-- ============================================================================
-- Companion to 20260727_seed_freshers_semester_and_section.sql, which backfilled
-- the existing programs. Without this trigger the guarantee reopens the next
-- time anyone adds a program.
--
-- Why a trigger rather than application code: programs are created through
-- several paths -- the /organizations/programs form, the Excel bulk import at
-- app/api/organizations/programs/import, the API-key surface, and future data
-- migrations. A trigger covers all of them uniformly; wiring the service layer
-- would silently skip whichever path nobody remembered to update.
--
-- Why SECURITY DEFINER: the sections_insert_admin RLS policy gates on
--   institution_id IN (SELECT profiles.institution_id ... WHERE profiles.id = auth.uid())
-- i.e. the ACTOR's own institution. A multi-institution admin creating a program
-- in a secondary institution would have the section insert silently rejected --
-- the "no error, just no row" failure mode. Running as the owner (postgres,
-- which carries rolbypassrls) sidesteps that. This is a trigger, not a callable
-- RPC, so it cannot be invoked directly and needs no self-authorization guard.
--
-- The seeded values mirror the backfill exactly; see that migration's header for
-- why semester_order = 0 and initial_semester = false are load bearing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_freshers_semester_for_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_semester_id uuid;
BEGIN
  -- semesters declares institution_id / degree_id / department_id NOT NULL, but
  -- programs allows all three to be null. No-op on a partial hierarchy instead
  -- of failing the caller's INSERT with 23502.
  IF NEW.institution_id IS NULL
     OR NEW.degree_id IS NULL
     OR NEW.department_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Seeded regardless of is_active: a program created inactive and activated
  -- later would otherwise be permanently missing its Freshers row.
  INSERT INTO semesters (
    institution_id, degree_id, department_id, program_id,
    semester_code, semester_name, semester_type,
    semester_order, initial_semester, terminal_semester, is_active
  )
  VALUES (
    NEW.institution_id, NEW.degree_id, NEW.department_id, NEW.id,
    upper(left(btrim(NEW.program_id), 14)) || '-FRESH',
    'Freshers', 'odd', 0, false, false, true
  )
  ON CONFLICT ON CONSTRAINT unique_semester_hierarchy DO NOTHING
  RETURNING id INTO v_semester_id;

  -- ON CONFLICT DO NOTHING suppresses RETURNING, leaving v_semester_id NULL.
  -- Re-read so section A still gets attached instead of being silently skipped.
  IF v_semester_id IS NULL THEN
    SELECT id INTO v_semester_id
    FROM semesters
    WHERE program_id     = NEW.id
      AND semester_name  = 'Freshers'
      AND semester_order = 0;
  END IF;

  IF v_semester_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO sections (
    institution_id, degree_id, department_id, program_id,
    semester_id, section_name, is_active
  )
  VALUES (
    NEW.institution_id, NEW.degree_id, NEW.department_id, NEW.id,
    v_semester_id, 'A', true
  )
  ON CONFLICT ON CONSTRAINT sections_unique_per_semester DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_freshers_semester_for_program() IS
  'AFTER INSERT trigger on programs: seeds the default "Freshers" semester (semester_order = 0, initial_semester = false) and its section "A". No-ops when the program hierarchy is incomplete. SECURITY DEFINER because sections_insert_admin binds to the actor''s own institution.';

DROP TRIGGER IF EXISTS programs_seed_freshers ON public.programs;

CREATE TRIGGER programs_seed_freshers
  AFTER INSERT ON public.programs
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_freshers_semester_for_program();
