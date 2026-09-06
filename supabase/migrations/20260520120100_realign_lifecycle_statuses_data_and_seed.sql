-- Phase 1.2: Data migration + schema extension + seed for the new workflow.
-- Runs in a single transaction; enum values from 20260520120000 must already be committed.
--
-- Steps:
--   (a) Add admission_statuses.auto_promote_when_universal_paid column + unique index
--   (b) Migrate existing 'admitted' learner_profiles -> 'enquiry' (~554 rows, +status_history)
--   (c) Update existing 'admitted' admission_statuses row to new meaning
--   (d) Seed new statuses: enquiry, enquiry_submitted, reserved
--   (e) Re-order learner statuses to match the new workflow

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- (a) Add the universal-paid auto-promote flag
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE admission_statuses
  ADD COLUMN IF NOT EXISTS auto_promote_when_universal_paid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN admission_statuses.auto_promote_when_universal_paid IS
  'When true, evaluate_learner_status_after_payment() promotes a learner to this status once both kind=application_fee and kind=tuition bills are fully paid. Mutually exclusive (only one learner-scope status may hold this flag).';

-- Enforce "only one learner-scope status has the universal-paid flag" (mirrors is_seat_filled pattern)
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_statuses_one_universal_paid
  ON admission_statuses(scope)
  WHERE auto_promote_when_universal_paid = true AND is_active = true;

-- Enforce "universal-paid auto-promote is learner-scope only"
ALTER TABLE admission_statuses
  DROP CONSTRAINT IF EXISTS universal_paid_only_for_learner;
ALTER TABLE admission_statuses
  ADD CONSTRAINT universal_paid_only_for_learner
  CHECK (auto_promote_when_universal_paid = false OR scope = 'learner');

-- ─────────────────────────────────────────────────────────────────────────
-- (b) Migrate existing learners_profiles.lifecycle_status='admitted' -> 'enquiry'
--     Reason: the meaning of 'admitted' is changing (entry point -> post-threshold).
--     Existing rows that came in via the old "Convert to Admitted" flow are
--     semantically equivalent to the new 'enquiry' entry point.
-- ─────────────────────────────────────────────────────────────────────────

-- Log each transition for audit (matches the existing trigger pattern)
INSERT INTO learners_profile_status_history
  (learner_id, from_status, to_status, reason_code, metadata)
SELECT
  id, 'admitted'::lifecycle_status, 'enquiry'::lifecycle_status,
  'taxonomy_realignment_20260520',
  jsonb_build_object(
    'migration', '20260520120100_realign_lifecycle_statuses_data_and_seed',
    'note', 'Bulk migrate: old admitted (entry point) -> new enquiry (entry point). New admitted is now post-threshold.'
  )
FROM learners_profiles
WHERE lifecycle_status = 'admitted';

-- Perform the actual migration
UPDATE learners_profiles
   SET lifecycle_status = 'enquiry'::lifecycle_status,
       updated_at = NOW()
 WHERE lifecycle_status = 'admitted';

-- ─────────────────────────────────────────────────────────────────────────
-- (c) Reset the 'admitted' admission_statuses row to its NEW meaning:
--     post-threshold gate (balance fees crossed configurable percent).
--     Default threshold is 50%; admin can tune via UI.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE admission_statuses
   SET label = 'Admitted',
       color = '#10B981', -- emerald: signals progression past financial gate
       sort_order = 7,
       fee_paid_threshold_percent = 50.00,
       description = 'Learner has crossed the configurable fees-paid threshold (default 50%) for the balance fees. Ready for onboarding.',
       updated_at = NOW()
 WHERE scope = 'learner' AND code = 'admitted';

-- ─────────────────────────────────────────────────────────────────────────
-- (d) Seed new statuses
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO admission_statuses
  (scope, code, label, color, sort_order, is_active, is_terminal, is_seat_filled,
   fee_paid_threshold_percent, auto_promote_when_universal_paid, gates_login, description)
VALUES
  ('learner', 'enquiry',           'Enquiry',           '#3B82F6', 1, true, false, false, NULL, false, false,
   'Lead moved from admission CRM; awaiting learner to submit the QR-code form.'),
  ('learner', 'enquiry_submitted', 'Enquiry Submitted', '#A855F7', 2, true, false, false, NULL, false, false,
   'Learner completed the QR self-fill form. Awaiting admission officer verification.'),
  ('learner', 'reserved',          'Reserved',          '#0EA5E9', 6, true, false, false, NULL, true,  false,
   'Universal fees (Application Fee + Tuition) fully paid. Seat reserved pending balance threshold.')
ON CONFLICT (scope, code) DO UPDATE
   SET label = EXCLUDED.label,
       color = EXCLUDED.color,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       fee_paid_threshold_percent = EXCLUDED.fee_paid_threshold_percent,
       auto_promote_when_universal_paid = EXCLUDED.auto_promote_when_universal_paid,
       description = EXCLUDED.description,
       updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- (e) Re-order remaining learner statuses to reflect the new workflow
--     Final ordering: enquiry, enquiry_submitted, pending, approved, account,
--     reserved, admitted, waitlisted, rejected, active, inactive, exited,
--     graduated, alumni
-- ─────────────────────────────────────────────────────────────────────────
UPDATE admission_statuses SET sort_order = 3  WHERE scope='learner' AND code='pending';
UPDATE admission_statuses SET sort_order = 4  WHERE scope='learner' AND code='approved';
UPDATE admission_statuses SET sort_order = 5  WHERE scope='learner' AND code='account';
-- enquiry=1, enquiry_submitted=2 already set in INSERT
-- reserved=6 already set in INSERT
-- admitted=7 already set in (c)
UPDATE admission_statuses SET sort_order = 8  WHERE scope='learner' AND code='waitlisted';
UPDATE admission_statuses SET sort_order = 9  WHERE scope='learner' AND code='rejected';
UPDATE admission_statuses SET sort_order = 10 WHERE scope='learner' AND code='active';
UPDATE admission_statuses SET sort_order = 11 WHERE scope='learner' AND code='inactive';
UPDATE admission_statuses SET sort_order = 12 WHERE scope='learner' AND code='exited';
UPDATE admission_statuses SET sort_order = 13 WHERE scope='learner' AND code='graduated';
UPDATE admission_statuses SET sort_order = 14 WHERE scope='learner' AND code='alumni';

COMMIT;
