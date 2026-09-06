-- ============================================================================
-- COE role · BoS Courses + Course Scheme grants
-- Created: 2026-08-01
--
-- The 'coe' role (Controller of Examiner) previously held only:
--   academic.bos-syllabus.view / .create / .edit / .export
--   academic.bos-scheme.view
-- so COE users could open /bos/syllabus and read /bos/course-scheme, but had no
-- access to /bos/courses at all (MENU_PERMISSIONS['/bos/courses'] gates on
-- academic.bos-courses.view — see lib/sidebarMenuLink.ts) and could not edit the
-- scheme grid (/api/bos/course-mapping POST/PUT gate on academic.bos-scheme.edit).
--
-- Locked requirement (2026-08-01): COE needs view + insert + edit across
-- Courses, Course Scheme and Syllabus, plus the Excel bulk import on Courses.
-- Syllabus keys are already present, so this migration adds the missing five:
--   academic.bos-courses.view / .create / .edit / .import
--   academic.bos-scheme.edit
--
-- Deliberately NOT granted: any delete key, bos-syllabus.approve (approval stays
-- with admins), and every other academic.bos-* module (compositions, meetings,
-- experts, members, reports, ta-da, taxonomy, sop).
--
-- Scope note (defence in depth is unchanged): the keys only decide which pages
-- and buttons render. Row-level writes stay gated by guardCourseInstitutionWrite
-- (own institution / institutions where the user serves on a board) and
-- guardSyllabusEdit (creator or board chairman only) in lib/utils/bos/bos-access.ts.
--
-- Idempotent — the jsonb || merge is safe to re-run.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'academic.bos-courses.view',   true,
      'academic.bos-courses.create', true,
      'academic.bos-courses.edit',   true,
      'academic.bos-courses.import', true,
      'academic.bos-scheme.edit',    true
    ),
    updated_at = now()
WHERE role_key = 'coe';
