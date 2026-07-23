-- ============================================================================
-- HR Automation Rule Fires — audit substrate (Workisy gap #1, Wave 1)
-- ============================================================================
-- Created: 2026-05-15
-- TIER-0 safe-additive: new table + RLS + indexes only. No DML, no DDL on
-- existing tables. Idempotent (CREATE IF NOT EXISTS / DROP-then-CREATE POLICY).
--
-- Purpose
-- -------
-- Companion operational table for the `hr.automation_rules` policy
-- (platform_policies; seeded by Agent α in feat/hr-automation-rules-policy).
-- The policy itself defines the rules (late-entry, break, early-exit,
-- overtime — threshold, deduction shape, monthly cap). This table records
-- each FIRING of those rules against attendance data so HR officers can
-- audit per-staff deductions and the Director can audit aggregate behavior.
--
-- One row per (staff_id, rule_key, fired_on) firing event. occurrence_index
-- tracks which occurrence of THIS rule for THIS staff in the calendar month
-- (so the "Set Occurrences (Monthly)" cap in the policy can be enforced
-- without re-walking attendance — the writer reads MAX(occurrence_index)
-- WHERE staff_id=X AND rule_key=Y AND fired_on month-matches).
--
-- Pattern
-- -------
-- - RLS mirrors hr_shift_assignments (PR #810/#820): super_admin / admin /
--   HR officer always; staff sees own rows via staff.profile_id ↔ auth.uid().
-- - institution_id retained on the row (denormalized from staff.institution_id
--   at write time) for fast per-institution dashboards without join.
-- - context JSONB holds writer-provided detail (e.g. {"actual_clock_in":
--   "09:17", "threshold": "09:00", "minutes_over": 17}).
--
-- Reader (Wave 2)
-- ---------------
-- /hr/automation operational page lists recent firings filtered by RLS.
-- Director-side /admin/hr/automation-rules edits the policy via
-- platform_policies upsert. No fn_get_policy_* RPC needed for THIS table —
-- the policy lookup is on the rule definitions (Agent α's substrate).
--
-- Standing rule (2026-04-29): every policy decision = config-table row +
-- super_admin UI. This table is the OPERATIONAL ledger; the POLICY rows
-- live in platform_policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: hr_automation_rule_fires
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_automation_rule_fires (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key            text NOT NULL,                                  -- 'late_entry' | 'break' | 'early_exit' | 'overtime' | future rule_keys
  staff_id            uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution_id      uuid REFERENCES public.institutions(id),        -- denormalized from staff at write time; nullable for global rules
  fired_on            date NOT NULL,                                  -- attendance date the rule fired against
  fired_at            timestamptz NOT NULL DEFAULT now(),             -- when the writer recorded the firing
  deduction_minutes   integer,                                        -- nullable: rule may deduct minutes (late_entry, early_exit) OR amount (fixed_amount) — not both
  deduction_amount    numeric(12,2),                                  -- nullable: rule may deduct amount (₹) OR minutes — not both. CHECK: at most one is set.
  occurrence_index    integer NOT NULL DEFAULT 1
                        CHECK (occurrence_index >= 1),                -- which occurrence of this rule for this staff in the calendar month of fired_on
  context             jsonb,                                          -- writer-provided detail: actual_clock_in, threshold_used, minutes_over, etc.
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_automation_rule_fires_rule_key_not_empty
    CHECK (length(trim(rule_key)) > 0),

  -- At most one deduction shape per firing (minutes OR amount, not both).
  -- Both NULL is allowed (e.g. "informational" rules that don't deduct).
  CONSTRAINT hr_automation_rule_fires_deduction_shape_chk CHECK (
    NOT (deduction_minutes IS NOT NULL AND deduction_amount IS NOT NULL)
  )
);

COMMENT ON TABLE public.hr_automation_rule_fires IS
  'HR Automation — operational audit ledger of rule firings. One row per (staff_id, rule_key, fired_on) event. Rule definitions live in platform_policies under policy_key=hr.automation_rules (Agent α substrate). Workisy gap #1, Wave 1 (2026-05-15).';
COMMENT ON COLUMN public.hr_automation_rule_fires.rule_key IS
  'Stable identifier matching a rule in the platform_policies hr.automation_rules array (e.g. late_entry, break, early_exit, overtime). Free-form text so new rule types do not require a schema change.';
COMMENT ON COLUMN public.hr_automation_rule_fires.occurrence_index IS
  '1-based count of how many times this rule has fired for this staff in the calendar month of fired_on. Writer computes via MAX()+1 lookup. Used to enforce the "Set Occurrences (Monthly)" cap from the policy without re-walking attendance.';
COMMENT ON COLUMN public.hr_automation_rule_fires.context IS
  'Writer-provided JSONB explaining the firing. Expected keys vary by rule (e.g. actual_clock_in, threshold, minutes_over, break_id). Not schema-enforced; readers handle missing keys gracefully.';

-- ---------------------------------------------------------------------------
-- 2. Indexes — per task brief + operational reader hot-paths.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_automation_rule_fires_staff_fired
  ON public.hr_automation_rule_fires(staff_id, fired_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_automation_rule_fires_institution_fired
  ON public.hr_automation_rule_fires(institution_id, fired_on DESC)
  WHERE institution_id IS NOT NULL;

-- Hot path for occurrence_index lookup at write time:
-- SELECT MAX(occurrence_index) FROM hr_automation_rule_fires
-- WHERE staff_id=$1 AND rule_key=$2 AND date_trunc('month', fired_on) = date_trunc('month', $3::date)
CREATE INDEX IF NOT EXISTS idx_hr_automation_rule_fires_staff_rule_month
  ON public.hr_automation_rule_fires(staff_id, rule_key, fired_on);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--    SELECT: super_admin / admin / HR officer always; staff sees own rows
--      via staff.profile_id ↔ auth.uid() (mirrors hr_shift_assignments PR #820).
--    INSERT: super_admin / admin only (Wave 1 — writer is the cron job that
--      runs the rules; cron uses SERVICE_ROLE which bypasses RLS).
--    UPDATE: super_admin / admin only (audit row corrections).
--    DELETE: super_admin only (audit row deletion is unusual).
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_automation_rule_fires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_automation_rule_fires_select_permission"
  ON public.hr_automation_rule_fires;
CREATE POLICY "hr_automation_rule_fires_select_permission"
  ON public.hr_automation_rule_fires FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_automation_rule_fires.staff_id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_automation_rule_fires_insert_permission"
  ON public.hr_automation_rule_fires;
CREATE POLICY "hr_automation_rule_fires_insert_permission"
  ON public.hr_automation_rule_fires FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_automation_rule_fires_update_permission"
  ON public.hr_automation_rule_fires;
CREATE POLICY "hr_automation_rule_fires_update_permission"
  ON public.hr_automation_rule_fires FOR UPDATE USING (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_automation_rule_fires_delete_permission"
  ON public.hr_automation_rule_fires;
CREATE POLICY "hr_automation_rule_fires_delete_permission"
  ON public.hr_automation_rule_fires FOR DELETE USING (
    is_super_admin()
  );

-- ---------------------------------------------------------------------------
-- 4. GRANTs — authenticated role reads via RLS; service_role bypasses.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.hr_automation_rule_fires TO authenticated;
GRANT INSERT, UPDATE ON public.hr_automation_rule_fires TO authenticated;
GRANT ALL ON public.hr_automation_rule_fires TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Done. Table starts empty per Wave 1 scope (cron writer ships Wave 2).
-- ---------------------------------------------------------------------------
