-- /billing/schedule/students/[id] showed "Unspecified" academic-year groups
-- and N/A Semester/Section for billing-staff roles (e.g. Chief Accountant),
-- while super admin saw everything. The bill/profile embeds join
-- academic_years / semesters / sections, whose SELECT RLS requires
-- academic.years.view / organizations.semesters.view /
-- organizations.sections.view — keys the billing roles never received (and
-- the institution-match fallback also fails for cross-institution users whose
-- profiles.institution_id is NULL). RLS returns 0 rows -> embeds resolve to
-- null -> silent-empty labels.
--
-- Grant the three lookup VIEW keys (names only, non-sensitive) to every role
-- that can view billing schedules/bills — they need these lookups to render
-- billing pages. Verified affected: Chief Accountant, Accountant Assistant,
-- Chief Administrative Officer, Learner Counsellor, Administrator,
-- Payment Audit Admin (CEO/EAO already had them).

UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'academic.years.view', true,
  'organizations.semesters.view', true,
  'organizations.sections.view', true
)
WHERE COALESCE((permissions->>'billing.schedule.view')::boolean, false)
   OR COALESCE((permissions->>'billing.bills.view')::boolean, false);
