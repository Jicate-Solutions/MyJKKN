-- ============================================================================
-- Migration: 20260504140028_dashboard_drilldown_seeds
-- B.1 Substrate — Group Dashboard Clickable Drill-Downs
-- ============================================================================
-- Spec: specs/group-dashboard-clickable-drill-downs-spec.md (§3.0, §3.0.1, §3.1)
--
-- Seeds 64 rows into platform_policies for the dashboard.drilldown.* keys.
-- ZERO schema change — extends the existing canonical platform_policies
-- substrate (PR Phase 1.5a, 2026-04-29).
--
-- 9 metrics × 7 keys/metric (destination, columns, 3 role action_buttons,
-- empty_state_copy, enabled) + 1 global key (performance_budget_ms) = 64 rows.
--
-- Idempotent: ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, ...))
-- DO NOTHING. Safe to re-apply. To change a default, edit the row via the
-- /admin/dashboard-drilldowns admin UI (B.3) — never edit this migration.
--
-- Standing rule (CLAUDE.md memory feedback_policy_decisions_must_be_config_rows.md):
--   every threshold/mapping/feature-flag = row in config table + super_admin UI.
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system) VALUES

-- ---- total_leads --------------------------------------------------------
('dashboard.drilldown.total_leads.destination', 'global', NULL, '"/admission/leads"'::jsonb,
  'Drill-down destination URL when Director/staff clicks "Total Leads" card on Group Dashboard.',
  'string', true),
('dashboard.drilldown.total_leads.columns', 'global', NULL,
  '["name","status","institution","date","source"]'::jsonb,
  'Columns to render on the destination list for total_leads drill-down.',
  'array', true),
('dashboard.drilldown.total_leads.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director (read-only). Keys: call, whatsapp, update_status.',
  'array', true),
('dashboard.drilldown.total_leads.action_buttons.counselor', 'global', NULL,
  '["call","whatsapp","update_status"]'::jsonb,
  'Per-row action buttons for counselor (work-surface mode).',
  'array', true),
('dashboard.drilldown.total_leads.action_buttons.principal', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for principal (read-only by default).',
  'array', true),
('dashboard.drilldown.total_leads.empty_state_copy', 'global', NULL,
  '"No leads in this admission year."'::jsonb,
  'Empty-state message shown when total_leads drill-down has zero rows.',
  'string', true),
('dashboard.drilldown.total_leads.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch: when false, total_leads card is not clickable.',
  'boolean', true),

-- ---- applied ------------------------------------------------------------
('dashboard.drilldown.applied.destination', 'global', NULL,
  '"/admission/leads?status=applied"'::jsonb,
  'Drill-down destination URL for "Applied" stat card.',
  'string', true),
('dashboard.drilldown.applied.columns', 'global', NULL,
  '["name","date_applied","institution","source"]'::jsonb,
  'Columns to render for applied drill-down.',
  'array', true),
('dashboard.drilldown.applied.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.applied.action_buttons.counselor', 'global', NULL,
  '["call","whatsapp","update_status"]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.applied.action_buttons.principal', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.applied.empty_state_copy', 'global', NULL,
  '"No applied leads in this admission year."'::jsonb,
  'Empty-state message for applied drill-down.', 'string', true),
('dashboard.drilldown.applied.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for applied drill-down.', 'boolean', true),

-- ---- filled (enrolled) --------------------------------------------------
('dashboard.drilldown.filled.destination', 'global', NULL,
  '"/admission/leads?status=enrolled"'::jsonb,
  'Drill-down destination URL for "Filled" / Enrolled stat card.',
  'string', true),
('dashboard.drilldown.filled.columns', 'global', NULL,
  '["name","date_enrolled","institution","program"]'::jsonb,
  'Columns to render for filled drill-down.', 'array', true),
('dashboard.drilldown.filled.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.filled.action_buttons.counselor', 'global', NULL,
  '["call","whatsapp","update_status"]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.filled.action_buttons.principal', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.filled.empty_state_copy', 'global', NULL,
  '"No enrolled learners in this admission year."'::jsonb,
  'Empty-state message for filled drill-down.', 'string', true),
('dashboard.drilldown.filled.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for filled drill-down.', 'boolean', true),

-- ---- rejected -----------------------------------------------------------
('dashboard.drilldown.rejected.destination', 'global', NULL,
  '"/admission/leads?status=rejected"'::jsonb,
  'Drill-down destination URL for "Rejected" stat card.',
  'string', true),
('dashboard.drilldown.rejected.columns', 'global', NULL,
  '["name","rejection_reason","institution","date"]'::jsonb,
  'Columns to render for rejected drill-down.', 'array', true),
('dashboard.drilldown.rejected.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.rejected.action_buttons.counselor', 'global', NULL,
  '["call","whatsapp","update_status"]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.rejected.action_buttons.principal', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.rejected.empty_state_copy', 'global', NULL,
  '"No rejected leads in this admission year."'::jsonb,
  'Empty-state message for rejected drill-down.', 'string', true),
('dashboard.drilldown.rejected.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for rejected drill-down.', 'boolean', true),

-- ---- total_seats --------------------------------------------------------
('dashboard.drilldown.total_seats.destination', 'global', NULL,
  '"/admission/settings/seat-config"'::jsonb,
  'Drill-down destination URL for "Total Seats" stat card. Note: actual route is /admission/settings/seat-config (not /admission/seat-configuration as the spec drafted).',
  'string', true),
('dashboard.drilldown.total_seats.columns', 'global', NULL,
  '["institution","program","sanctioned_intake","filled","balance"]'::jsonb,
  'Columns to render for total_seats drill-down.', 'array', true),
('dashboard.drilldown.total_seats.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.total_seats.action_buttons.counselor', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for counselor (no seat-edit by default).', 'array', true),
('dashboard.drilldown.total_seats.action_buttons.principal', 'global', NULL,
  '["edit_intake"]'::jsonb,
  'Per-row action buttons for principal (can edit own institution intake).', 'array', true),
('dashboard.drilldown.total_seats.empty_state_copy', 'global', NULL,
  '"Seat data not configured for this admission year."'::jsonb,
  'Empty-state message for total_seats drill-down.', 'string', true),
('dashboard.drilldown.total_seats.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for total_seats drill-down.', 'boolean', true),

-- ---- fill_rate ----------------------------------------------------------
('dashboard.drilldown.fill_rate.destination', 'global', NULL,
  '"/admission/leads?status=enrolled&seat_filled=true"'::jsonb,
  'Drill-down destination URL for "Fill Rate" stat card (shows the filled-seat learners).',
  'string', true),
('dashboard.drilldown.fill_rate.columns', 'global', NULL,
  '["name","institution","program","date_enrolled"]'::jsonb,
  'Columns to render for fill_rate drill-down.', 'array', true),
('dashboard.drilldown.fill_rate.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.fill_rate.action_buttons.counselor', 'global', NULL,
  '["call","whatsapp"]'::jsonb,
  'Per-row action buttons for counselor (already enrolled — no status-update).', 'array', true),
('dashboard.drilldown.fill_rate.action_buttons.principal', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.fill_rate.empty_state_copy', 'global', NULL,
  '"No filled seats in this admission year."'::jsonb,
  'Empty-state message for fill_rate drill-down.', 'string', true),
('dashboard.drilldown.fill_rate.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for fill_rate drill-down.', 'boolean', true),

-- ---- seat_balance -------------------------------------------------------
('dashboard.drilldown.seat_balance.destination', 'global', NULL,
  '"/admission/settings/seat-config?fill_state=open"'::jsonb,
  'Drill-down destination URL for "Balance" / open-seats stat card.',
  'string', true),
('dashboard.drilldown.seat_balance.columns', 'global', NULL,
  '["institution","program","sanctioned_intake","filled","balance"]'::jsonb,
  'Columns to render for seat_balance drill-down.', 'array', true),
('dashboard.drilldown.seat_balance.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.seat_balance.action_buttons.counselor', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.seat_balance.action_buttons.principal', 'global', NULL,
  '["edit_intake"]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.seat_balance.empty_state_copy', 'global', NULL,
  '"No open seats remaining for this admission year."'::jsonb,
  'Empty-state message for seat_balance drill-down.', 'string', true),
('dashboard.drilldown.seat_balance.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for seat_balance drill-down.', 'boolean', true),

-- ---- chart_bar (per-institution chart bar in Seat Analytics) ------------
-- The `:id` placeholder is replaced at click time by the dashboard with the
-- institution UUID. Per-institution dashboard route does NOT exist on
-- jicate/main as of 2026-05-04 — B.2 must either build it or change this
-- destination via the admin UI. NO new route is being shipped in B.1.
('dashboard.drilldown.chart_bar.destination', 'global', NULL,
  '"/admission/dashboard?institution_id=:id"'::jsonb,
  'Drill-down destination URL for chart-bar clicks. :id is replaced with institution UUID at click time. Per-institution dashboard route does not yet exist; spec defers to follow-up if absent.',
  'string', true),
('dashboard.drilldown.chart_bar.columns', 'global', NULL,
  '["program","sanctioned_intake","filled","balance","fill_rate"]'::jsonb,
  'Columns to render for chart_bar drill-down.', 'array', true),
('dashboard.drilldown.chart_bar.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.chart_bar.action_buttons.counselor', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.chart_bar.action_buttons.principal', 'global', NULL,
  '["edit_intake"]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.chart_bar.empty_state_copy', 'global', NULL,
  '"No admission data for this institution in the selected year."'::jsonb,
  'Empty-state message for chart_bar drill-down.', 'string', true),
('dashboard.drilldown.chart_bar.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for chart_bar drill-down.', 'boolean', true),

-- ---- comparison_row (institution row in comparison table) --------------
('dashboard.drilldown.comparison_row.destination', 'global', NULL,
  '"/admission/dashboard?institution_id=:id"'::jsonb,
  'Drill-down destination URL for comparison-table-row clicks. :id replaced at click time.',
  'string', true),
('dashboard.drilldown.comparison_row.columns', 'global', NULL,
  '["program","sanctioned_intake","filled","balance","fill_rate"]'::jsonb,
  'Columns to render for comparison_row drill-down.', 'array', true),
('dashboard.drilldown.comparison_row.action_buttons.director', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for director.', 'array', true),
('dashboard.drilldown.comparison_row.action_buttons.counselor', 'global', NULL, '[]'::jsonb,
  'Per-row action buttons for counselor.', 'array', true),
('dashboard.drilldown.comparison_row.action_buttons.principal', 'global', NULL,
  '["edit_intake"]'::jsonb,
  'Per-row action buttons for principal.', 'array', true),
('dashboard.drilldown.comparison_row.empty_state_copy', 'global', NULL,
  '"No admission data for this institution in the selected year."'::jsonb,
  'Empty-state message for comparison_row drill-down.', 'string', true),
('dashboard.drilldown.comparison_row.enabled', 'global', NULL, 'true'::jsonb,
  'Kill-switch for comparison_row drill-down.', 'boolean', true),

-- ---- global -------------------------------------------------------------
('dashboard.drilldown.performance_budget_ms', 'global', NULL, '2000'::jsonb,
  'Performance budget in milliseconds for drill-down destination page load. Used by telemetry; not enforced.',
  'number', true)

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;
