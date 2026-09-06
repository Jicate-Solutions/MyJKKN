-- 2026-07-30 — Removing a team member must never be blocked by a role assignment.
--
-- WHAT WENT WRONG
-- hr_additional_roles.staff_id is ON DELETE SET NULL, and a BEFORE DELETE trigger on
-- staff snapshots the holder's name and retires the assignment so the history survives.
-- The trigger only matches rows that are BOTH improvement-area-scoped AND current:
--
--   WHERE r.staff_id = OLD.id AND r.improvement_area_id IS NOT NULL AND r.is_current
--
-- Every other row that references the departing team member is left with staff_id set
-- to NULL by the foreign key and nothing to identify its holder, so the subject CHECK
-- rejects it and the whole DELETE aborts. Removing a team member fails outright, and
-- the error names a constraint on an HR table nobody was looking at.
--
-- Reproduced on production with throwaway rows inside a rolled-back transaction:
--
--   CASE A org-scoped row (improvement_area_id IS NULL)   ->  FAILED 23514 check violation
--   CASE B retired area row with no name snapshot         ->  FAILED 23514 check violation
--   CASE C current area row (control)                     ->  SUCCEEDED
--
-- CASE B is a second path the review did not name. fn_mba_dept_role_assignment_set
-- retires the standing row on a handover with a plain
-- "SET is_current = false, end_date = CURRENT_DATE" and never snapshots the name, so
-- any department that has ever handed a role over already holds a row shaped like B.
--
-- THE FIX, in the shape already ratified for area-scoped rows
-- The design decision that a RETIRED row may identify its holder by name alone was
-- taken for the improvement-area branch of the CHECK. It was never extended to the
-- organisation branch, which is the whole of CASE A. Both halves are needed:
--
--   1. The trigger snapshots the name on EVERY row referencing the departing team
--      member — either scope, current or already retired — so the relaxed CHECK is
--      satisfiable by the time the foreign key nulls staff_id.
--   2. The organisation branch of the CHECK accepts a retired row that names its
--      holder by snapshot alone, exactly as the improvement-area branch already does.
--
-- No history is destroyed and no row is deleted: the assignment stays, end-dated, with
-- the holder's name preserved as text.

-- ---------------------------------------------------------------------------
-- 1. Snapshot and retire EVERY referencing row, not only the current area-scoped ones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_add_roles_retire_on_staff_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Every row that names the departing team member, in either scope, whether it is
  -- still standing or was retired earlier by a handover. The last COALESCE branch is
  -- a floor, not a label anyone should read: staff.first_name and staff.last_name are
  -- NOT NULL, so it is reachable only if both are blank, and its only job is to keep
  -- the subject CHECK satisfiable so the delete can never be blocked.
  UPDATE public.hr_additional_roles r
  SET holder_display_name = COALESCE(
        r.holder_display_name,
        NULLIF(btrim(COALESCE(OLD.first_name, '') || ' ' || COALESCE(OLD.last_name, '')), ''),
        (SELECT p.full_name FROM public.profiles p WHERE p.id = OLD.profile_id),
        'Former team member (record removed)'
      ),
      is_current = false,
      end_date   = COALESCE(r.end_date, CURRENT_DATE),
      updated_at = now()
  WHERE r.staff_id = OLD.id;

  RETURN OLD;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Let an ORGANISATION-scoped retired row name its holder by snapshot alone —
--    the same allowance the improvement-area branch has carried since 2026-07-29.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_subject_check;

ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_subject_check
  CHECK (
    CASE
      WHEN improvement_area_id IS NULL THEN (
        -- A standing organisation role names exactly one kind of subject.
        (staff_id IS NOT NULL AND hr_employee_id IS NULL)
        OR (staff_id IS NULL AND hr_employee_id IS NOT NULL)
        -- A RETIRED one may name its holder by snapshot alone, because the team
        -- member's record is gone and the foreign key has nulled staff_id.
        OR (
          staff_id IS NULL
          AND hr_employee_id IS NULL
          AND is_current = false
          AND btrim(COALESCE(holder_display_name, '')) <> ''
        )
      )
      ELSE (
        hr_employee_id IS NULL
        AND (
          staff_id IS NOT NULL
          OR btrim(COALESCE(notes, '')) <> ''
          OR (is_current = false AND btrim(COALESCE(holder_display_name, '')) <> '')
        )
      )
    END
  );

COMMENT ON CONSTRAINT hr_additional_roles_subject_check
  ON public.hr_additional_roles IS
  'A standing assignment must name a real subject. A retired one may name its holder by holder_display_name alone, in either scope, so that removing a team member is never blocked by their assignment history.';
