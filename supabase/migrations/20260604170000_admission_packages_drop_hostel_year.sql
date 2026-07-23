-- Remove hostel_year_id from admission_packages.
-- A package is hostel-year-independent (its eligibility uses admission_year); the
-- hostel-year-varying FEE lives on hostel_fees (package_id, hostel_year_id). The
-- learner's per-year assignment stays on learner_package_assignment.hostel_year_id.
-- DROP COLUMN cascades the admission_packages_hostel_year_id_fkey FK.
ALTER TABLE admission_packages DROP COLUMN IF EXISTS hostel_year_id;
