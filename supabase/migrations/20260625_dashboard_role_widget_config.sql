-- ============================================================================
-- T8.6 Multi-role Dashboard Refinements — seed dashboard.role_widgets policy
-- ============================================================================
-- Risk tier: TIER-0 (safe-additive seed of a single platform_policies row).
-- No DDL, no destructive ops. ON CONFLICT DO NOTHING — idempotent.
--
-- WHAT IT DOES
-- ------------
-- Seeds one row into platform_policies with policy_key='dashboard.role_widgets'
-- holding the curated per-role widget order shown on /dashboard.
--
-- Shape of the value (object/JSON):
--   {
--     "director":     ["todays_focus","morning_brief","hero","streak", ...],
--     "cao":          [...],
--     "hr_officer":   [...],
--     "counselor":    [...],
--     "hod":          [...],
--     "faculty":      [...],
--     "principal":    [...],
--     "accounts":     [...],
--     "student":      [...],
--     "_default":     [...]   -- fallback for unmapped roles
--   }
--
-- The Dashboard page reads this once via fn_get_policy + filters its widget
-- render order. Director can edit live via /admin/dashboard/widget-config.
--
-- Consumed by:
--   - lib/services/dashboard/widget-config-service.ts (read)
--   - app/(routes)/dashboard/page.tsx (gate render order)
--   - app/(routes)/admin/dashboard/widget-config/page.tsx (write)
--
-- ============================================================================

INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
) VALUES (
  'dashboard.role_widgets',
  'global',
  NULL,
  $JSON${
    "director": [
      "todays_focus",
      "morning_brief",
      "counselor_staffing_alert",
      "whatsapp_health",
      "hero",
      "streak",
      "institution_chips",
      "decision_queue",
      "activity_feed",
      "leaderboards"
    ],
    "cao": [
      "morning_brief",
      "counselor_staffing_alert",
      "whatsapp_health",
      "hero",
      "decision_queue",
      "activity_feed",
      "leaderboards"
    ],
    "hr_officer": [
      "morning_brief",
      "hero",
      "decision_queue",
      "activity_feed"
    ],
    "counselor": [
      "morning_brief",
      "counselor_staffing_alert",
      "hero",
      "streak",
      "decision_queue",
      "activity_feed",
      "leaderboards"
    ],
    "hod": [
      "morning_brief",
      "whatsapp_health",
      "hero",
      "decision_queue",
      "activity_feed"
    ],
    "faculty": [
      "morning_brief",
      "hero",
      "decision_queue",
      "activity_feed"
    ],
    "principal": [
      "morning_brief",
      "hero",
      "decision_queue",
      "activity_feed"
    ],
    "accounts": [
      "morning_brief",
      "hero",
      "decision_queue",
      "activity_feed"
    ],
    "student": [
      "morning_brief",
      "hero"
    ],
    "_default": [
      "morning_brief",
      "decision_queue"
    ]
  }$JSON$::jsonb,
  'T8.6 — per-role widget order for /dashboard. Object: role_key -> ordered widget_id array. "_default" used when role has no entry. Edited via /admin/dashboard/widget-config.',
  'object',
  NULL,
  true
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ============================================================================
-- Verification (SELECT-only, runs at apply time — no INSERTs in the smoke test
-- so we don't trip NOT NULL columns we forgot. Pattern locked 2026-05-15.)
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key = 'dashboard.role_widgets'
    AND scope_type = 'global'
    AND scope_id IS NULL;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'T8.6 seed failed: dashboard.role_widgets row missing after INSERT';
  END IF;

  RAISE NOTICE 'T8.6 seed verified: dashboard.role_widgets present (% row)', v_count;
END $$;
