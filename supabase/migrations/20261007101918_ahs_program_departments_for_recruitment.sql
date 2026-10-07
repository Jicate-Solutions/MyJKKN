-- JKKN College of Allied Health Sciences: one department per BSc program, for
-- the HR → Recruitment → All Candidates department filter. Requested 2026-10-07.
--
-- AHS had a single department ("Department of Allied (UG)", AHS-1) holding all
-- nine programs, so the filter could only ever offer that one entry. This adds
-- AHS-2..AHS-10 (same degree as AHS-1) and moves the five program-named job
-- postings onto them. RECRUITMENT ONLY: programs, learners, timetables and HOD
-- scope stay on AHS-1 — moving programs would change attendance/timetable scope.
-- Postings that name no program (TUTOR - AHS, Micro Biology, Librarian, the
-- generic PROFESSOR/TUTOR/LECTURER rows) stay on AHS-1.
--
-- Idempotent: ON CONFLICT on (institution_id, department_code); job updates key
-- on fixed job ids and only move rows still on AHS-1.

INSERT INTO public.departments (institution_id, degree_id, department_code, department_name, department_order)
SELECT d.institution_id, d.degree_id, v.code, v.name, v.ord
FROM public.departments d
CROSS JOIN (VALUES
  ('AHS-2',  'Accident & Emergency Care Technology',       2),
  ('AHS-3',  'Critical Care Technology',                   3),
  ('AHS-4',  'Cardiac Technology',                         4),
  ('AHS-5',  'Dialysis Technology',                        5),
  ('AHS-6',  'Medical Record Science',                     6),
  ('AHS-7',  'Operation Theatre & Anaesthesia Technology', 7),
  ('AHS-8',  'Physician Assistant',                        8),
  ('AHS-9',  'Radiography & Imaging Technology',           9),
  ('AHS-10', 'Respiratory Therapy',                       10)
) AS v(code, name, ord)
WHERE d.id = '7646521a-a252-4756-bd8f-ba7c1d36ff56'  -- AHS-1, Department of Allied (UG)
ON CONFLICT (institution_id, department_code) DO NOTHING;

UPDATE public.hr_recruitment_jobs j
SET department_id = nd.id
FROM (VALUES
  ('1708aa05-649a-4fcc-a6e7-d9764eeb522e'::uuid, 'AHS-2'),   -- ASST PROF - AECT - AHS
  ('635a2024-29c7-4d88-b817-a7fcb0da3209'::uuid, 'AHS-3'),   -- ASST PROF - CCT - AHS
  ('8fd63572-4809-4ea8-a2ee-11087ad0322d'::uuid, 'AHS-7'),   -- ASST PROF - OTAT - AHS
  ('d9bb5c32-33ec-4a67-b256-bc74656a39eb'::uuid, 'AHS-9'),   -- ASST PROF - RIT -- AHS
  ('33054797-82e3-4dc0-b45e-1eca6dd78cc6'::uuid, 'AHS-10')   -- ASST PROF - R.T. - AHS
) AS m(job_id, code)
JOIN public.departments nd
  ON nd.institution_id = '9c1554e8-12a2-4b76-a9d6-8242bb05eba1' AND nd.department_code = m.code
WHERE j.id = m.job_id
  AND j.department_id = '7646521a-a252-4756-bd8f-ba7c1d36ff56';
-- The AECT posting had department_id NULL, so this skipped it; moved by
-- 20261007102001_ahs_aect_job_to_aect_department.sql.
