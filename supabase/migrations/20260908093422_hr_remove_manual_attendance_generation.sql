-- Reverses 20260908073506 and 20260908073629.
--
-- Manual attendance is not being generated after all: staff without a biometric
-- device will be added from an exported spreadsheet instead, so the flag, the
-- generator and its permission key have no consumer. Dead-but-plausible code is
-- worse than none -- an unused SECURITY DEFINER RPC stays callable, and a later
-- reader would reasonably wire it up expecting a supported path.
--
-- Part A (per-day hours / duration mode) is untouched. The `attendance_mode`
-- column on hr_shift_timings is a DIFFERENT thing and stays.

-- 1. The key first, so nothing can call the function while it still exists.
UPDATE public.custom_roles
   SET permissions = permissions - 'hr.attendance.manual.generate',
       updated_at  = now()
 WHERE permissions ? 'hr.attendance.manual.generate';

DROP FUNCTION IF EXISTS public.fn_hr_generate_manual_attendance(uuid, integer, integer, uuid[]);

-- 2. v_hr_staff back to its 68 columns.
--    DROP + CREATE, not REPLACE: a view cannot drop a column in place. Verified
--    first that nothing else depends on it (no dependent views, no policy and no
--    function reads staff.attendance_mode). The grants a DROP takes with it are
--    restored below, matching what the view carried.
DROP VIEW IF EXISTS public.v_hr_staff;
CREATE VIEW public.v_hr_staff AS
 SELECT s.id,
    s.first_name,
    s.last_name,
    s.gender,
    s.date_of_birth,
    s.marital_status,
    s.blood_group,
    s.email,
    s.phone,
    s.staff_id,
    s.profile_picture,
    s.address,
    s.state,
    s.district,
    s.pincode,
    s.date_of_joining,
    s.designation,
    s.category_id,
    s.institution_id,
    s.department_id,
    s.is_active,
    s.created_at,
    s.updated_at,
    s.created_by,
    s.updated_by,
    s.institution_email,
    s.profile_id,
    s.role_type,
    s.facilitator_certification,
    s.outcome_metrics,
    s.role_key,
    s.has_extended_profile,
    s.slug,
    s.status,
    s.display_order,
    s.experience_years,
    s.research_papers,
    s.phd_scholars,
    s.awards_won,
    s.pg_dissertations_guided,
    s.ug_projects_guided,
    s.qualification_summary,
    s.professional_summary,
    s.mentoring_description,
    s.google_scholar_url,
    s.researchgate_url,
    s.orcid_url,
    s.badges,
    s.qualifications,
    s.specialisations,
    s.experience_entries,
    s.research_focus_areas,
    s.publications,
    s.funded_projects,
    s.certifications,
    s.awards,
    s.memberships,
    s.phd_scholars_list,
    s.faqs,
    s.achievements,
    s.login_enabled,
    s.employment_type,
    s.bus_required,
    s.transport_route_id,
    s.transport_stop_id,
    s.tags,
    s.biometric_id,
    s.biometric_institution_id
   FROM staff s
     JOIN employment_categories ec ON ec.id = s.category_id
     JOIN hr_organizations o ON o.institution_id = s.institution_id
  WHERE ec.included_in_hr AND o.included_in_hr;

GRANT ALL ON public.v_hr_staff TO authenticated, service_role, postgres;

-- 3. The column itself, now that nothing reads it.
DROP INDEX IF EXISTS public.staff_manual_attendance_idx;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_attendance_mode_check;
ALTER TABLE public.staff DROP COLUMN IF EXISTS attendance_mode;
