-- ============================================================================
-- Migration: 20260614_hr_forms_notification_policy
-- Wave 3 — M9 follow-up: workflow engine + WhatsApp notifications
-- ============================================================================
-- Seeds the platform_policies row that holds notification templates rendered
-- by the form-submission workflow engine. Director / super_admin can edit
-- copy in production without redeploying.
--
-- One policy key: `hr.forms.notification_templates`
--   Object shape:
--     {
--       "submitted_to_first_approver": { "in_app_title", "in_app_body",
--                                        "whatsapp_body" },
--       "submitted_to_next_approver":  { ... same shape ... },
--       "approved_to_submitter":       { ... },
--       "rejected_to_submitter":       { ... },
--       "approved_final_to_submitter": { ... }
--     }
--
-- Each body string supports placeholders resolved at dispatch time:
--   {form_title}, {submitter_name}, {step_label}, {actor_name},
--   {reason}, {submission_url}
--
-- TIER-0 safe-additive. Idempotent via ON CONFLICT.
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system)
VALUES
  (
    'hr.forms.notification_templates',
    'global',
    NULL,
    $$
    {
      "submitted_to_first_approver": {
        "in_app_title": "Form awaiting your approval",
        "in_app_body": "{submitter_name} submitted {form_title}. You are the approver at step \"{step_label}\".",
        "whatsapp_body": "Hi, {submitter_name} submitted the {form_title}. You are the approver at step \"{step_label}\". Please review on JKKN."
      },
      "submitted_to_next_approver": {
        "in_app_title": "Form moved to your approval queue",
        "in_app_body": "{form_title} from {submitter_name} has advanced to step \"{step_label}\". Please review.",
        "whatsapp_body": "{form_title} from {submitter_name} has advanced to step \"{step_label}\". Please review on JKKN."
      },
      "approved_to_submitter": {
        "in_app_title": "Form step approved",
        "in_app_body": "{actor_name} approved step \"{step_label}\" of your {form_title}. It is moving to the next approver.",
        "whatsapp_body": "Update: {actor_name} approved step \"{step_label}\" of your {form_title}. It is moving to the next approver."
      },
      "rejected_to_submitter": {
        "in_app_title": "Form rejected",
        "in_app_body": "{actor_name} rejected your {form_title} at step \"{step_label}\". Reason: {reason}",
        "whatsapp_body": "Your {form_title} was rejected at step \"{step_label}\" by {actor_name}. Reason: {reason}"
      },
      "approved_final_to_submitter": {
        "in_app_title": "Form fully approved",
        "in_app_body": "Your {form_title} has been approved through all steps. {actor_name} signed off on the final step.",
        "whatsapp_body": "Good news — your {form_title} is fully approved. {actor_name} signed off on the final step."
      }
    }
    $$::jsonb,
    'Per-form notification templates rendered by the HR forms workflow engine. Supports placeholders: {form_title}, {submitter_name}, {step_label}, {actor_name}, {reason}, {submission_url}.',
    'object',
    NULL,
    true
  )
ON CONFLICT (policy_key, scope_type, scope_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Smoke test
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value INTO v_value FROM platform_policies
    WHERE policy_key = 'hr.forms.notification_templates'
      AND scope_type = 'global'
      AND scope_id IS NULL;

  IF v_value IS NULL THEN
    RAISE EXCEPTION 'hr.forms.notification_templates row missing after seed';
  END IF;

  IF NOT (v_value ? 'submitted_to_first_approver') THEN
    RAISE EXCEPTION 'submitted_to_first_approver key missing in templates';
  END IF;

  RAISE NOTICE 'hr.forms.notification_templates seeded OK';
END
$$;
