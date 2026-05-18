-- Seed: hr_onboarding_checklists for JKKN Main Office (per role_category)
--
-- Context: /api/hr/recruitment/candidates/[id]/onboarding/start maps the
-- candidate's role_category to a checklist name and looks it up by:
--   .eq('checklist_name', name).eq('is_active', true).maybeSingle()
--
-- cadreMap (from route.ts:58-64):
--   teaching_faculty  -> 'Teaching Faculty Onboarding'
--   medical           -> 'Teaching Faculty Onboarding'
--   non_teaching      -> 'Non-Technical Administrative Staff Onboarding'
--   senior_leadership -> 'Administrative Leadership Onboarding'
--   contract          -> 'Non-Technical Administrative Staff Onboarding'
--
-- That collapses to 3 distinct checklist names that must exist for the
-- production org. We also seed 'Supporting Technical Staff Onboarding' to
-- match supabase/setup/01_tables.sql parity (used by future cadre routes).
--
-- Steps shape: {"step": "..."} — route reads s.step at line 92 + notify uses
-- firstStep.step at line 138. Existing 'Standard Onboarding — X' rows use
-- a different {title:..., order:...} shape and a different cadre-based
-- lookup, so they don't collide with this name-based lookup path.
--
-- Idempotency: WHERE NOT EXISTS guards each insert by (org, name) since the
-- table has no unique constraint on (hr_organization_id, checklist_name).

BEGIN;

-- Teaching Faculty Onboarding (covers teaching_faculty + medical)
INSERT INTO public.hr_onboarding_checklists (
  hr_organization_id,
  checklist_name,
  steps,
  is_active
)
SELECT
  'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid,
  'Teaching Faculty Onboarding',
  '[
    {"step": "Collect and verify original certificates (degree, PG, PhD if applicable)"},
    {"step": "Issue institutional ID card and biometric registration"},
    {"step": "Set up official email account (name@jkkn.ac.in)"},
    {"step": "Complete HR policies acknowledgement form"},
    {"step": "Department introduction and HOD meeting"},
    {"step": "Timetable and Learning Studio assignment briefing"},
    {"step": "Issue offer letter and appointment order"},
    {"step": "Open salary account (JKKN partner bank)"},
    {"step": "Add to MyJKKN attendance and leave management"},
    {"step": "NAAC faculty data entry in academic portal"}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_onboarding_checklists
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid
    AND checklist_name = 'Teaching Faculty Onboarding'
);

-- Non-Technical Administrative Staff Onboarding (covers non_teaching + contract)
INSERT INTO public.hr_onboarding_checklists (
  hr_organization_id,
  checklist_name,
  steps,
  is_active
)
SELECT
  'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid,
  'Non-Technical Administrative Staff Onboarding',
  '[
    {"step": "Collect identity and address proof documents"},
    {"step": "Issue institutional ID card and biometric registration"},
    {"step": "Set up official email account"},
    {"step": "Complete HR policies acknowledgement form"},
    {"step": "Office orientation and reporting manager introduction"},
    {"step": "System access setup (MyJKKN module permissions)"},
    {"step": "Issue appointment order"},
    {"step": "Open salary account (JKKN partner bank)"},
    {"step": "Add to MyJKKN attendance and leave management"}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_onboarding_checklists
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid
    AND checklist_name = 'Non-Technical Administrative Staff Onboarding'
);

-- Administrative Leadership Onboarding (covers senior_leadership)
INSERT INTO public.hr_onboarding_checklists (
  hr_organization_id,
  checklist_name,
  steps,
  is_active
)
SELECT
  'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid,
  'Administrative Leadership Onboarding',
  '[
    {"step": "Collect and verify all credential documents"},
    {"step": "Issue institutional ID card and biometric registration"},
    {"step": "Set up official email account with elevated access"},
    {"step": "Complete HR policies and governance acknowledgement"},
    {"step": "Board and senior leadership introduction"},
    {"step": "MyJKKN admin module access provisioning"},
    {"step": "Issue appointment letter and joining report"},
    {"step": "Open salary account (JKKN partner bank)"},
    {"step": "Add to payroll and leave management"},
    {"step": "Hand over role-specific SOP documentation"}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_onboarding_checklists
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid
    AND checklist_name = 'Administrative Leadership Onboarding'
);

-- Supporting Technical Staff Onboarding (parity with supabase/setup/01_tables.sql;
-- not currently mapped from any role_category but kept for future cadre-based routes)
INSERT INTO public.hr_onboarding_checklists (
  hr_organization_id,
  checklist_name,
  steps,
  is_active
)
SELECT
  'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid,
  'Supporting Technical Staff Onboarding',
  '[
    {"step": "Collect identity and address proof documents"},
    {"step": "Issue institutional ID card and biometric registration"},
    {"step": "Set up official email account"},
    {"step": "Complete HR policies acknowledgement form"},
    {"step": "Department introduction and supervisor meeting"},
    {"step": "Lab or facility orientation and safety briefing"},
    {"step": "Issue appointment order"},
    {"step": "Open salary account (JKKN partner bank)"},
    {"step": "Add to MyJKKN attendance and leave management"}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_onboarding_checklists
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid
    AND checklist_name = 'Supporting Technical Staff Onboarding'
);

COMMIT;
