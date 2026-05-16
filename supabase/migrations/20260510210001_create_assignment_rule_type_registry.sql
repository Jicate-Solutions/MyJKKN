-- ============================================================================
-- Assignment Rule Type Registry — config-row substrate (Pattern B: per-module typed)
-- ============================================================================
-- Created: 2026-05-07
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write.
--
-- Purpose
-- -------
-- The assignment-rule "type" picker (program / round_robin / location / score / source /
-- workload) was a hardcoded TS enum + RULE_TYPES constant. Adding a new strategy required
-- a code deploy. This migration ships the SUBSTRATE: table + RLS + seed of the existing
-- 6 hardcoded types so the UI can read the registry on day one.
--
-- This PR ships ONLY the substrate. The TS enum (`AssignmentRuleType`) stays as `string`
-- at runtime; UI fetches the active rows. Companion migration NOT required for the SQL
-- function executor — `executeRulesForLead` already runs purely off `criteria`/`action`
-- shape, not off `type`. The `type` field is presentation-only (used to pick an icon
-- and group rows visually).
--
-- Companion service: lib/services/admission/rule-type-registry-service.ts
-- Companion hook:    hooks/admission/use-rule-types.ts
-- Companion admin UI: app/(routes)/admin/counselors/rule-types/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_rule_type_registry (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type_key            text UNIQUE NOT NULL CHECK (length(rule_type_key) BETWEEN 2 AND 64),
  display_label            text NOT NULL,
  description              text,
  icon_name                text,                  -- lucide icon name (matches getRuleTypeIcon)
  sort_order               integer NOT NULL DEFAULT 0,
  is_system                boolean NOT NULL DEFAULT false,  -- true for seeded defaults; UI prevents delete
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assignment_rule_type_registry IS
  'Director config: catalog of assignment-rule strategies surfaced by the rule-form picker. One row per supported type. is_system=true rows mirror the previously-hardcoded TS enum and cannot be deleted from the admin UI (deactivate instead).';
COMMENT ON COLUMN public.assignment_rule_type_registry.rule_type_key IS
  'Stable machine key (e.g. round_robin, weighted). Matches the `type` virtual field on AssignmentRule. snake_case, 2-64 chars.';
COMMENT ON COLUMN public.assignment_rule_type_registry.icon_name IS
  'Lucide icon name (e.g. Shuffle, GraduationCap). Resolved client-side by getRuleTypeIcon(iconName) helper.';
COMMENT ON COLUMN public.assignment_rule_type_registry.is_system IS
  'true = seeded default, prevents admin-UI delete (deactivate via is_active instead). false = admin-created custom type.';

-- Helpful covering index for the form-dialog dropdown query (active, ordered)
CREATE INDEX IF NOT EXISTS idx_assignment_rule_type_registry_active_sort
  ON public.assignment_rule_type_registry (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 2) Seed the existing hardcoded rule types so the registry is populated on day one.
--    Mirrors components/shared/assignment-rules-crud/rule-form-dialog.tsx RULE_TYPES
--    AND lib/services/admission/assignment-rules-service.ts AssignmentRuleType union.
--    Idempotent — only inserts rows whose keys don't already exist.
-- ---------------------------------------------------------------------------
INSERT INTO public.assignment_rule_type_registry
  (rule_type_key, display_label, description, icon_name, sort_order, is_system, is_active)
SELECT * FROM (VALUES
  ('program',     'Program',     'Match leads by interested program (e.g. Engineering vs Arts)',         'GraduationCap', 10, true, true),
  ('round_robin', 'Round Robin', 'Distribute leads evenly across counselors in rotation order',          'Shuffle',       20, true, true),
  ('location',    'Location',    'Match leads by city or state for geographic counselor specialisation', 'MapPin',        30, true, true),
  ('score',       'Score',       'Threshold-gated routing on lead score (e.g. score > 70 to senior team)', 'Target',      40, true, true),
  ('source',      'Source',      'Match leads by acquisition source (e.g. organic vs paid campaign)',    'Building',      50, true, true),
  ('workload',    'Workload',    'Pool-based assignment that respects each counselor''s max_leads cap',  'Activity',      60, true, true)
) AS r(rule_type_key, display_label, description, icon_name, sort_order, is_system, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_rule_type_registry x WHERE x.rule_type_key = r.rule_type_key
);

-- ---------------------------------------------------------------------------
-- 3) RLS — public read so the form-dialog dropdown works for every authenticated
--    role; only super_admin can write (matches counselor_tier_policy pattern).
-- ---------------------------------------------------------------------------
ALTER TABLE public.assignment_rule_type_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS art_registry_select ON public.assignment_rule_type_registry;
CREATE POLICY art_registry_select ON public.assignment_rule_type_registry
  FOR SELECT USING (true);   -- public read; the rule-type names are not sensitive

DROP POLICY IF EXISTS art_registry_write ON public.assignment_rule_type_registry;
CREATE POLICY art_registry_write ON public.assignment_rule_type_registry
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
