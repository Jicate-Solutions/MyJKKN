-- Grant learner read + edit permissions to accountant_assistant and accounts roles
-- Reason: Both roles already had full billing.* permissions and institution_scope='all',
-- but the billing student-search (lib/services/billing/schedule/student-search-service.ts)
-- queries learners_profiles directly. The learners_profiles_select_policy RLS requires
-- one of: learners.admissions.view | learners.profiles.view | learners.view.
-- All three were stored as `false` for these roles, so the RLS filtered every row out
-- and student search returned empty results. Edit permissions added so billing staff can
-- correct profile fields (e.g. wrong roll number) inline during receipt/invoice creation.

UPDATE custom_roles
SET permissions = permissions
                 || jsonb_build_object(
                      'learners.view',             true,
                      'learners.profiles.view',    true,
                      'learners.admissions.view',  true,
                      'learners.profiles.edit',    true,
                      'learners.edit',             true
                    ),
    updated_at = now()
WHERE role_key IN ('accountant_assistant', 'accounts');
