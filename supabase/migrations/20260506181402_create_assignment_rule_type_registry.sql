-- Migration: assignment_rule_type_registry
-- Created: 2026-05-06
-- Purpose: Director's standing rule (2026-04-29) — every policy decision = config-table row.
--          Replaces the hardcoded `AssignmentRuleType` TS union (lib/services/admission/
--          assignment-rules-service.ts) and `RULE_TYPES` constant (components/shared/
--          assignment-rules-crud/rule-form-dialog.tsx) with a registry table so adding a
--          new rule strategy no longer requires a code deploy.
--
-- Hardcoded source of truth (frozen as of jicate/main faef343d9):
--   AssignmentRuleType union: 'program' | 'round_robin' | 'location' | 'score'
--                           | 'source' | 'workload'
--   RULE_TYPES constant labels match (Program / Round Robin / Location / Score / Source / Workload)
--   getRuleTypeIcon() switch maps each key to a lucide icon name:
--     program → graduation-cap, round_robin → shuffle, location → map-pin,
--     score → target, source → building, workload → activity
--
-- Pattern reference: supabase/migrations/20260429_counselor_routing_config.sql
-- Memory: feedback_policy_decisions_must_be_config_rows.md

CREATE TABLE IF NOT EXISTS public.assignment_rule_type_registry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type_key text UNIQUE NOT NULL CHECK (length(rule_type_key) BETWEEN 2 AND 64),
  display_label text NOT NULL,
  description   text,
  icon_name     text,                            -- lucide icon name (matches getRuleTypeIcon)
  sort_order    integer NOT NULL DEFAULT 0,
  is_system     boolean NOT NULL DEFAULT false,  -- true for seeded defaults; UI prevents delete
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assignment_rule_type_registry IS
  'Director''s standing rule (2026-04-29): policy decisions live as config rows. Replaces the AssignmentRuleType TS union with a CRUDable list. Edited via /admin/counselors/rule-types UI. Zero deploys for new rule strategies.';

-- Seed the existing hardcoded rule types so the registry is populated on day one.
-- Values mirror the frozen TS source of truth above. DO NOT change keys/labels here
-- without a coordinated UI change — keys are referenced by AssignmentRulesService.enrichRule().
INSERT INTO public.assignment_rule_type_registry
  (rule_type_key, display_label, description, icon_name, sort_order, is_system, is_active)
SELECT * FROM (VALUES
  ('program',     'Program',     'Routes leads based on the program(s) they expressed interest in (matches admission_leads.interested_programs).',                          'graduation-cap', 10, true, true),
  ('round_robin', 'Round Robin', 'Distributes leads evenly across the configured counselors in rotation order; picks the active counselor with fewest current leads.',     'shuffle',        20, true, true),
  ('location',    'Location',    'Routes leads based on city or state on the lead record.',                                                                                'map-pin',        30, true, true),
  ('score',       'Score',       'Routes leads based on a numeric lead score threshold (e.g. score > 70).',                                                                'target',         40, true, true),
  ('source',      'Source',      'Routes leads based on the lead source channel (e.g. website, referral, expo).',                                                          'building',       50, true, true),
  ('workload',    'Workload',    'Routes to a counselor pool with workload-aware fallback (assign_to_pool action with round_robin fallback).',                             'activity',       60, true, true)
) AS r(rule_type_key, display_label, description, icon_name, sort_order, is_system, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_rule_type_registry WHERE rule_type_key = r.rule_type_key
);

-- RLS
ALTER TABLE public.assignment_rule_type_registry ENABLE ROW LEVEL SECURITY;

-- Read: public — every authenticated role that opens the rule-form-dialog needs to see
-- the dropdown options (super_admin, admin, admission_counselor, etc.). Lock writes only.
DROP POLICY IF EXISTS art_registry_select ON public.assignment_rule_type_registry;
CREATE POLICY art_registry_select ON public.assignment_rule_type_registry
  FOR SELECT USING (true);

-- Write: super_admin only (registry drives prod routing UX — locked tight)
DROP POLICY IF EXISTS art_registry_write ON public.assignment_rule_type_registry;
CREATE POLICY art_registry_write ON public.assignment_rule_type_registry
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Trigger to auto-update updated_at on writes (matches counselor_routing_config pattern)
CREATE OR REPLACE FUNCTION fn_assignment_rule_type_registry_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_rule_type_registry_touch ON public.assignment_rule_type_registry;
CREATE TRIGGER assignment_rule_type_registry_touch
BEFORE UPDATE ON public.assignment_rule_type_registry
FOR EACH ROW EXECUTE FUNCTION fn_assignment_rule_type_registry_touch();

-- Index for ordered listings (sort_order then key for stable secondary order)
CREATE INDEX IF NOT EXISTS idx_assignment_rule_type_registry_active_sort
  ON public.assignment_rule_type_registry (is_active, sort_order, rule_type_key);
