-- ============================================================================
-- HR Shifts — Templates + Assignments foundation (T1.6 Phase 2a)
-- ============================================================================
-- Created: 2026-05-10
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.6)
-- Q-locks (Director answered 2026-05-10):
--   1. HYBRID model — templates as defaults + per-employee override.
--   2. Swap permissions (Phase 2b only — schema-readiness here).
--   3. BOTH rotation patterns — single-week default, multi-week opt-in
--      (rotation_weeks 1-4 stored; UI surfaces single-week only this phase).
--   4. Cross-institution shared templates with per-institution overrides.
--      hr_shift_templates rows: is_global=true (visible to all institutions)
--      OR institution_id set (institution-specific override).
--
-- Why new tables (not extending hr_work_schedules)
-- ------------------------------------------------
-- hr_work_schedules (existing) is org+cadre-scoped (hr_organization_id +
-- cadre_id with valid_from/valid_until/superseded_by versioning). It carries
-- grace_minutes, lunch windows, working_days_mask — semantics tied to a cadre
-- attendance window.
--
-- T1.6 Phase 2a needs:
--   - staff-level assignment (FK to staff.id) — not cadre-level
--   - template inheritance + per-staff override (start/end time)
--   - cross-institution global templates (is_global flag)
--   - rotation_weeks for multi-week patterns (Phase 2b)
--
-- These are different shapes; conflating them would muddy hr_work_schedules'
-- cadre-scoped purpose. New tables are the cleaner Q-lock fit. hr_work_schedules
-- stays untouched.
--
-- RLS pattern mirrors hr_recruitment_jobs (PR #810, 2026-05-09): super_admin
-- OR admin OR (specific permission AND role_has_institution_access). For
-- Phase 2a we don't introduce a new `hr.shifts.*` permission key; the
-- admin/super_admin gate (matching T1.5a — required-documents) is enforced
-- both in RLS and in PolicyPageShell `permission="admin_or_super_admin"`.
-- Employees reading their own assignment is gated by staff_id = auth.uid()
-- ↔ profiles join (see SELECT policy on hr_shift_assignments).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_shift_templates — master shift templates.
--    is_global=true → visible to all institutions (cross-institution defaults).
--    institution_id set → institution-specific override (precedence on assign).
--    Versioning mirrors hr_required_documents (valid_from / valid_until /
--    superseded_by) so a template can be retired without deleting history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_shift_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code   text NOT NULL,                                  -- e.g. 'MORNING_8_5', 'NIGHT_10_6'
  template_name   text NOT NULL,                                  -- "Morning 8am-5pm"
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  is_global       boolean NOT NULL DEFAULT false,                 -- true = visible to all institutions
  institution_id  uuid REFERENCES public.institutions(id),        -- null when is_global=true; required otherwise
  category        text,                                           -- optional grouping ('hostel','security','transport','lab','faculty')
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  -- Versioning (mirrors hr_required_documents)
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz,
  superseded_by   uuid REFERENCES public.hr_shift_templates(id),
  -- Audit cols
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A template is either global OR institution-scoped, never both.
  CONSTRAINT hr_shift_templates_scope_chk CHECK (
    (is_global = true  AND institution_id IS NULL)
    OR (is_global = false AND institution_id IS NOT NULL)
  ),
  -- start/end ordering not enforced — overnight shifts (e.g. 22:00-06:00) are
  -- valid; assignments interpret end < start as next-day rollover at runtime.
  CONSTRAINT hr_shift_templates_code_not_empty CHECK (length(trim(template_code)) > 0),
  CONSTRAINT hr_shift_templates_name_not_empty CHECK (length(trim(template_name)) > 0)
);

COMMENT ON TABLE public.hr_shift_templates IS
  'HR Shifts — Master shift templates. is_global=true → cross-institution default; institution_id set → institution-specific override. Versioned via valid_from/valid_until/superseded_by. Phase 2a (T1.6) of HR module decomposition.';
COMMENT ON COLUMN public.hr_shift_templates.template_code IS
  'Stable machine-friendly identifier (e.g. MORNING_8_5). Code may repeat across global + institution-specific rows; institution row takes precedence in assign flow.';
COMMENT ON COLUMN public.hr_shift_templates.is_global IS
  'When true, template is visible to all institutions. CHECK constraint enforces is_global=true XOR institution_id NOT NULL.';
COMMENT ON COLUMN public.hr_shift_templates.start_time IS
  'Shift start time (24h, no timezone). Pair with end_time. If end_time < start_time, the assignment spans midnight (e.g. 22:00 → 06:00 next day).';
COMMENT ON COLUMN public.hr_shift_templates.superseded_by IS
  'When set, this row is the prior version of the referenced row. valid_until is closed at the supersede time. Mirrors hr_required_documents pattern.';

-- ---------------------------------------------------------------------------
-- 2) hr_shift_assignments — per-staff shift assignment.
--    template_id → defaults (hours come from the template).
--    start_time_override / end_time_override → per-employee override.
--    Either template_id is set, OR both overrides are set (CHECK constraint).
--    rotation_weeks 1 = single-week (default); 2-4 = multi-week opt-in
--    (Phase 2b will surface UI; storage is ready now).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_shift_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id             uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id          uuid REFERENCES public.hr_shift_templates(id),
  start_time_override  time,                                    -- nullable; if set, overrides template's start_time
  end_time_override    time,                                    -- same for end_time
  effective_from       date NOT NULL,
  effective_until      date,                                    -- nullable for ongoing assignments
  rotation_weeks       integer NOT NULL DEFAULT 1
                         CHECK (rotation_weeks BETWEEN 1 AND 4),
  rotation_pattern     jsonb,                                   -- multi-week: array of templates per week; single-week: null
  notes                text,
  -- Audit cols
  created_by           uuid REFERENCES public.profiles(id),
  updated_by           uuid REFERENCES public.profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Must have either template OR freeform times.
  CONSTRAINT hr_shift_assignments_template_or_override_chk CHECK (
    template_id IS NOT NULL
    OR (start_time_override IS NOT NULL AND end_time_override IS NOT NULL)
  ),
  -- effective_until cannot precede effective_from.
  CONSTRAINT hr_shift_assignments_dates_chk CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  )
);

COMMENT ON TABLE public.hr_shift_assignments IS
  'HR Shifts — Per-staff shift assignment. template_id provides default hours; start_time_override / end_time_override provide per-employee override (HYBRID model per Q-lock #1). rotation_weeks 1-4 (single-week default; multi-week opt-in for Phase 2b).';
COMMENT ON COLUMN public.hr_shift_assignments.start_time_override IS
  'When set, overrides template start_time for this staff member. NULL = inherit template. CHECK constraint requires either template_id OR both overrides.';
COMMENT ON COLUMN public.hr_shift_assignments.rotation_weeks IS
  'Number of weeks in the rotation cycle (1=single-week default; 2-4=multi-week). UI surfaces single-week only in Phase 2a; Phase 2b adds rotation_pattern jsonb input.';
COMMENT ON COLUMN public.hr_shift_assignments.rotation_pattern IS
  'Multi-week rotation only (rotation_weeks > 1). Expected shape: array of template_id per week, e.g. [{"week":1,"template_id":"…"},{"week":2,"template_id":"…"}]. Null for single-week assignments.';

-- ---------------------------------------------------------------------------
-- 3) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_shift_templates_institution
  ON public.hr_shift_templates(institution_id) WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_shift_templates_global_active
  ON public.hr_shift_templates(is_global, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_hr_shift_templates_code
  ON public.hr_shift_templates(template_code);

CREATE INDEX IF NOT EXISTS idx_hr_shift_assignments_staff_effective
  ON public.hr_shift_assignments(staff_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_hr_shift_assignments_template
  ON public.hr_shift_assignments(template_id) WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_shift_assignments_active
  ON public.hr_shift_assignments(effective_from, effective_until)
  WHERE effective_until IS NULL OR effective_until > now();

-- ---------------------------------------------------------------------------
-- 4) Triggers — keep updated_at fresh.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_shift_templates_updated_at
  ON public.hr_shift_templates;
CREATE TRIGGER hr_shift_templates_updated_at
  BEFORE UPDATE ON public.hr_shift_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_shift_assignments_updated_at
  ON public.hr_shift_assignments;
CREATE TRIGGER hr_shift_assignments_updated_at
  BEFORE UPDATE ON public.hr_shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) Row Level Security — hr_shift_templates
--    SELECT: super_admin / admin always; otherwise visible if is_global=true
--      OR institution_id is one the user has access to.
--    INSERT/UPDATE/DELETE: super_admin / admin only (Phase 2a; future
--      `hr.shifts.manage` permission would slot in here per pattern).
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_shift_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_shift_templates_select_permission"
  ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_select_permission"
  ON public.hr_shift_templates FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR is_global = true
    OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "hr_shift_templates_insert_permission"
  ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_insert_permission"
  ON public.hr_shift_templates FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_shift_templates_update_permission"
  ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_update_permission"
  ON public.hr_shift_templates FOR UPDATE USING (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_shift_templates_delete_permission"
  ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_delete_permission"
  ON public.hr_shift_templates FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 6) Row Level Security — hr_shift_assignments
--    SELECT: super_admin / admin / HR officer always; staff sees own assignments.
--    INSERT/UPDATE/DELETE: super_admin / admin only (Phase 2a — no permission
--      key yet; matches T1.5a pattern of admin_or_super_admin gate).
--    Employee sees own assignment via staff.profile_id → auth.uid().
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_shift_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_shift_assignments_select_permission"
  ON public.hr_shift_assignments;
CREATE POLICY "hr_shift_assignments_select_permission"
  ON public.hr_shift_assignments FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_assignments.staff_id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_shift_assignments_insert_permission"
  ON public.hr_shift_assignments;
CREATE POLICY "hr_shift_assignments_insert_permission"
  ON public.hr_shift_assignments FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_shift_assignments_update_permission"
  ON public.hr_shift_assignments;
CREATE POLICY "hr_shift_assignments_update_permission"
  ON public.hr_shift_assignments FOR UPDATE USING (
    is_super_admin() OR is_admin()
  );

DROP POLICY IF EXISTS "hr_shift_assignments_delete_permission"
  ON public.hr_shift_assignments;
CREATE POLICY "hr_shift_assignments_delete_permission"
  ON public.hr_shift_assignments FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------------
-- 7) Done. Tables start empty per Phase 2a scope (no seed migration).
-- ---------------------------------------------------------------------------
