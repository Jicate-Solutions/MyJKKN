-- Classify leave types into the three request surfaces the Time Off workspace
-- exposes: Leave, Short Time Off, Compensatory Off.
--
-- WHY: /hr/leave/apply offered all six types in one dropdown, so staff were
-- asked to pick "Permission (Hourly)" or "Compensatory Off" from the same list
-- as Casual Leave. Those are different request kinds with different forms —
-- Permission is an hourly in-day request, Comp Off is an earned credit — and
-- they belong on their own tabs.
--
-- The classification lives in the DATABASE, not the frontend. Hardcoding
-- leave_type_code in React would break the moment an institution adds a
-- seventh type, and there are 11 organizations each free to define their own
-- catalog. Admins now set this on /hr/admin/leave-types.
--
-- Backfill rule, derived from the actual production values:
--   duration_type='hourly' OR allow_hourly   -> short_time_off   (Permission)
--   leave_type_code='comp_off'               -> compensatory_off
--   everything else                          -> leave            (CL/HPL/OD/Vacation)

ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS request_category varchar NOT NULL DEFAULT 'leave';

-- Added separately so re-running against a table that already has the column
-- does not fail on a duplicate constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hr_leave_types'::regclass
      AND conname  = 'hr_leave_types_request_category_check'
  ) THEN
    ALTER TABLE public.hr_leave_types
      ADD CONSTRAINT hr_leave_types_request_category_check
      CHECK (request_category IN ('leave','short_time_off','compensatory_off'));
  END IF;
END $$;

UPDATE public.hr_leave_types
SET request_category = CASE
      WHEN duration_type = 'hourly' OR allow_hourly THEN 'short_time_off'
      WHEN leave_type_code = 'comp_off'             THEN 'compensatory_off'
      ELSE 'leave'
    END;

-- Every tab query filters (org, category, is_active).
CREATE INDEX IF NOT EXISTS idx_hlt_org_category
  ON public.hr_leave_types(hr_organization_id, request_category, is_active);

COMMENT ON COLUMN public.hr_leave_types.request_category IS
  'Which Time Off tab this type is requested from: leave | short_time_off | compensatory_off. Drives the Apply form shown to staff.';

-- Post-conditions. 11 orgs x 6 types = 66 rows; per org: 4 leave, 1 hourly,
-- 1 comp off. Abort rather than ship a half-classified catalog.
DO $$
DECLARE
  v_leave integer; v_short integer; v_comp integer; v_null integer;
BEGIN
  SELECT count(*) INTO v_leave FROM public.hr_leave_types WHERE request_category='leave';
  SELECT count(*) INTO v_short FROM public.hr_leave_types WHERE request_category='short_time_off';
  SELECT count(*) INTO v_comp  FROM public.hr_leave_types WHERE request_category='compensatory_off';
  SELECT count(*) INTO v_null  FROM public.hr_leave_types WHERE request_category IS NULL;

  RAISE NOTICE 'request_category backfill: leave=%, short_time_off=%, compensatory_off=%', v_leave, v_short, v_comp;

  IF v_null > 0 THEN
    RAISE EXCEPTION 'Unclassified hr_leave_types rows: %', v_null;
  END IF;
  IF v_short = 0 THEN
    RAISE EXCEPTION 'No short_time_off type classified — the hourly Permission type should have matched';
  END IF;
END $$;
