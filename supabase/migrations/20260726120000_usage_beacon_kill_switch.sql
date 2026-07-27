-- =============================================================================
-- Migration: analytics.usage_beacon.enabled — kill switch for the Usage Beacon
-- Date: 2026-07-26
--
-- WHY
--   The usage-tracking substrate has been live since 2026-02-06: usage_events
--   (+ archive), module_usage_daily, feature_usage_summary,
--   institution_health_scores, the compute_* rollup RPCs, UsageTrackingService,
--   and POST /api/analytics/usage/events. Nothing in the browser ever called
--   the endpoint, so usage_events stayed empty and no module's adoption could
--   be measured. This wave adds the missing client (components/analytics/
--   usage-beacon.tsx, mounted once in app/(routes)/layout.tsx).
--
--   Because that mount turns on writes for EVERY page view by EVERY user at
--   once, it ships dark behind this policy and is flipped deliberately.
--
-- SAFETY: additive. One platform_policies row. No schema change, no new table,
--   no new function, no grant change. Reverting = flip the row to false.
--
-- FAIL-SAFE: the route reads this via fn_get_policy_bool(p_default => false),
--   and treats any read error as false. A missing row therefore means OFF.
--
-- NOTE: seeded with WHERE NOT EXISTS, not ON CONFLICT — platform_policies'
--   uniqueness is an expression index, so ON CONFLICT (policy_key, scope_type)
--   fails with 42P10.
-- =============================================================================

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('analytics.usage_beacon.enabled','global','false'::jsonb,'boolean',
   'Master switch for the in-app Usage Beacon (PAGE VISITS ONLY). When true, each page view inside the authenticated shell is posted to /api/analytics/usage/events and recorded in usage_events (event_type=page_visit, source=explicit), which feeds module_usage_daily, feature_usage_summary and institution_health_scores — the substrate behind per-module adoption reporting. When false that endpoint writes nothing for page visits and instructs the client to stand down for the session. SCOPE NOTE: this policy does NOT gate the endpoint''s explicit feature-tracking mode ({module,feature,event_type}), which has 16 live call sites via lib/utils/track-usage.ts (billing invoices + receipts, academic attendance + timetables, learner profiles, exports) firing since 2026-02-06 — those keep working regardless of this switch. Dark by default: enabling it starts write traffic proportional to platform-wide navigation, so flip it deliberately and watch usage_events volume. Read-only telemetry — it never changes what any user can see or do.',
   true, true, 'major','published','toggle','analytics')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');
