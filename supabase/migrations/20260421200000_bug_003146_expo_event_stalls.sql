-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-003146: Per-stall accountability + operations for expo events.
--
-- Business context: JKKN attends expos where they may run MULTIPLE stalls at
-- the same event (e.g., Engineering booth + Nursing booth + Dental booth).
-- Before this migration, 1 expo = 1 implicit stall.
--
-- This migration:
--   1. Creates `expo_event_stalls` table — first-class stall entity with
--      assigned staff, expenses, photos, promotional materials, notes.
--   2. Adds `admission_leads.stall_id` — optional attribution so captured
--      leads can be traced to the specific stall that captured them.
--   3. Adds RLS following the modern permission pattern:
--      `is_super_admin() OR is_admin() OR user_has_permission(...) + role_has_institution_access(...)`
--   4. Adds updated_at trigger.
--
-- NOTE ON FK TARGET: `assigned_staff_id` references `profiles(id)`, NOT
-- `staff(id)`. This matches the existing expo_event_team_members pattern
-- (staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL) and the
-- `useFilteredStaffForDropdown` hook which queries `profiles` filtered by
-- role IN ('faculty','staff','hod','principal').
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. expo_event_stalls table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expo_event_stalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id uuid NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  stall_name text NOT NULL,
  assigned_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  total_expenses numeric(10,2) DEFAULT 0,
  photos text[] DEFAULT ARRAY[]::text[],
  -- promotional_materials is an array of { name: string, quantity: number, notes?: string }
  promotional_materials jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_expo_event_id
  ON expo_event_stalls(expo_event_id);
CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_institution_id
  ON expo_event_stalls(institution_id);
CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_assigned_staff_id
  ON expo_event_stalls(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

-- ─── 2. RLS ──────────────────────────────────────────────────────────────

ALTER TABLE expo_event_stalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expo_event_stalls_select" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_select" ON expo_event_stalls
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.expos.view')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "expo_event_stalls_insert" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_insert" ON expo_event_stalls
  FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.expos.create')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "expo_event_stalls_update" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_update" ON expo_event_stalls
  FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.expos.edit')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "expo_event_stalls_delete" ON expo_event_stalls;
CREATE POLICY "expo_event_stalls_delete" ON expo_event_stalls
  FOR DELETE
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.marketing.expos.delete')
        AND role_has_institution_access(institution_id))
  );

-- ─── 3. admission_leads.stall_id ─────────────────────────────────────────
-- Optional/nullable: preserves all existing leads and non-expo leads.

ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS stall_id uuid
  REFERENCES expo_event_stalls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admission_leads_stall_id
  ON admission_leads(stall_id)
  WHERE stall_id IS NOT NULL;

-- ─── 4. updated_at trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_expo_event_stalls_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expo_event_stalls_touch ON expo_event_stalls;
CREATE TRIGGER trg_expo_event_stalls_touch
  BEFORE UPDATE ON expo_event_stalls
  FOR EACH ROW
  EXECUTE FUNCTION touch_expo_event_stalls_updated_at();

COMMIT;
