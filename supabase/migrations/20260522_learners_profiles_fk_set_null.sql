-- 2026-05-22: Convert 12 NO ACTION FK constraints on learners_profiles to ON DELETE SET NULL.
--
-- Background: deleteLearnerProfile() did a single DELETE on learners_profiles and was failing
-- with Postgres 23503 against admission_leads and consultant_lead_attributions (and would have
-- failed against 11 more NO ACTION FKs as soon as each was hit). Those tables are audit /
-- attribution / launch-record tables that should survive their learner being deleted with the
-- link nulled out, not block the delete entirely.
--
-- CASCADE (47 FKs) and RESTRICT (billing_*, cdc_placements — 4 FKs) constraints are deliberately
-- left untouched. Billing RESTRICT must keep blocking deletes that would orphan invoices/receipts.

BEGIN;

ALTER TABLE admission_applications
  DROP CONSTRAINT admission_applications_learner_profile_id_fkey,
  ADD  CONSTRAINT admission_applications_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE admission_leads
  DROP CONSTRAINT admission_leads_learner_profile_id_fkey,
  ADD  CONSTRAINT admission_leads_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE consultant_commission_transactions
  DROP CONSTRAINT consultant_commission_transactions_learner_profile_id_fkey,
  ADD  CONSTRAINT consultant_commission_transactions_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE consultant_lead_attributions
  DROP CONSTRAINT consultant_lead_attributions_learner_profile_id_fkey,
  ADD  CONSTRAINT consultant_lead_attributions_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE generated_documents
  DROP CONSTRAINT generated_documents_learner_id_fkey,
  ADD  CONSTRAINT generated_documents_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE internship_assignments
  DROP CONSTRAINT internship_assignments_learner_id_fkey,
  ADD  CONSTRAINT internship_assignments_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE internship_evaluations
  DROP CONSTRAINT internship_evaluations_learner_id_fkey,
  ADD  CONSTRAINT internship_evaluations_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE internship_logbook_entries
  DROP CONSTRAINT internship_logbook_entries_learner_id_fkey,
  ADD  CONSTRAINT internship_logbook_entries_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE lti_grades
  DROP CONSTRAINT lti_grades_learner_profile_id_fkey,
  ADD  CONSTRAINT lti_grades_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE lti_launches
  DROP CONSTRAINT lti_launches_learner_profile_id_fkey,
  ADD  CONSTRAINT lti_launches_learner_profile_id_fkey
    FOREIGN KEY (learner_profile_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE obe_indirect_assessments
  DROP CONSTRAINT obe_indirect_assessments_learner_id_fkey,
  ADD  CONSTRAINT obe_indirect_assessments_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

ALTER TABLE sf100_roster_changes
  DROP CONSTRAINT sf100_roster_changes_learner_id_fkey,
  ADD  CONSTRAINT sf100_roster_changes_learner_id_fkey
    FOREIGN KEY (learner_id) REFERENCES learners_profiles(id) ON DELETE SET NULL;

COMMIT;
