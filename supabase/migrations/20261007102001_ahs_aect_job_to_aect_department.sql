-- Follow-up to 20261007101918_ahs_program_departments_for_recruitment.sql:
-- ASST PROF - AECT - AHS had department_id NULL (not AHS-1), so the first
-- migration's AHS-1 guard skipped it. Move it onto AHS-2 (Accident & Emergency
-- Care Technology). Idempotent: only touches the row while still unset.

UPDATE public.hr_recruitment_jobs j
SET department_id = nd.id
FROM public.departments nd
WHERE nd.institution_id = '9c1554e8-12a2-4b76-a9d6-8242bb05eba1' AND nd.department_code = 'AHS-2'
  AND j.id = '1708aa05-649a-4fcc-a6e7-d9764eeb522e'
  AND j.department_id IS NULL;
