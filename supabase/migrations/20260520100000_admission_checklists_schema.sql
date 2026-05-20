-- ============================================================================
-- Programme Checklists (Admission)
-- ----------------------------------------------------------------------------
-- Created: 2026-05-19
-- Purpose:
--   Three-table programme-wise checklist system, scoped hierarchically across
--   institution → degree → department → programme. Admins author checklists
--   at any level, and the items aggregate (union) for any learner whose
--   programme rolls up into the chosen scope.
--
--   Mirrors the proven event_checklists / event_checklist_items /
--   event_checklist_completions pattern.
--
-- Tables:
--   1. admission_checklists           — named template bound to ONE scope node
--   2. admission_checklist_items      — items inside a checklist
--   3. admission_checklist_completions — per-learner state (lazy rows only)
--
-- RLS:
--   * Templates + items are readable by anyone with EITHER the settings.view
--     key (admin module) OR the enquiries.checklist.view key (so the enquiry
--     tab can render without dragging the full settings perm into counselor
--     roles).
--   * Templates + items are WRITTEN only by holders of settings.checklists.manage.
--   * Completions are read by enquiries.checklist.view, written via the
--     mark_checklist_item SECURITY DEFINER RPC (which gates on .mark).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admission_checklists — parent template
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_checklists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type  text NOT NULL CHECK (scope_type IN ('institution','degree','department','program')),
  scope_id    uuid NOT NULL,
  name        text NOT NULL,
  description text,
  applies_to_lifecycle text[] NOT NULL DEFAULT ARRAY['lead','admitted','enrolled']::text[],
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid -- soft FK to profiles (audit pattern, no constraint)
);

COMMENT ON TABLE public.admission_checklists IS
'Programme-checklist templates. scope_type+scope_id polymorphically reference one of institutions/degrees/departments/programs (validated by trigger). applies_to_lifecycle restricts which learner stages see the checklist.';

CREATE INDEX IF NOT EXISTS admission_checklists_scope_idx
  ON public.admission_checklists(scope_type, scope_id) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. admission_checklist_items — items inside a checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.admission_checklists(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  order_index  int NOT NULL DEFAULT 0,
  is_required  boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admission_checklist_items_checklist_idx
  ON public.admission_checklist_items(checklist_id) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 3. admission_checklist_completions — per-learner state (lazy rows)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_checklist_completions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_profile_id  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  checklist_item_id   uuid NOT NULL REFERENCES public.admission_checklist_items(id) ON DELETE CASCADE,
  is_done             boolean NOT NULL DEFAULT true,
  marked_by           uuid,  -- soft FK to profiles (audit pattern)
  marked_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_checklist_completions_unique UNIQUE (learner_profile_id, checklist_item_id)
);

CREATE INDEX IF NOT EXISTS admission_checklist_completions_learner_idx
  ON public.admission_checklist_completions(learner_profile_id);
CREATE INDEX IF NOT EXISTS admission_checklist_completions_item_idx
  ON public.admission_checklist_completions(checklist_item_id);

-- ----------------------------------------------------------------------------
-- Scope-validation trigger
-- ----------------------------------------------------------------------------
-- Postgres can't enforce a polymorphic FK directly. This trigger fires on
-- INSERT/UPDATE of admission_checklists and verifies the scope_id actually
-- exists in the table named by scope_type.
CREATE OR REPLACE FUNCTION public._validate_admission_checklist_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scope_type = 'institution' AND NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'scope_id % does not reference an institution', NEW.scope_id;
  ELSIF NEW.scope_type = 'degree' AND NOT EXISTS (SELECT 1 FROM public.degrees WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'scope_id % does not reference a degree', NEW.scope_id;
  ELSIF NEW.scope_type = 'department' AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'scope_id % does not reference a department', NEW.scope_id;
  ELSIF NEW.scope_type = 'program' AND NOT EXISTS (SELECT 1 FROM public.programs WHERE id = NEW.scope_id) THEN
    RAISE EXCEPTION 'scope_id % does not reference a program', NEW.scope_id;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_admission_checklist_scope ON public.admission_checklists;
CREATE TRIGGER trg_validate_admission_checklist_scope
  BEFORE INSERT OR UPDATE ON public.admission_checklists
  FOR EACH ROW EXECUTE FUNCTION public._validate_admission_checklist_scope();

-- Generic updated_at touch for items table
CREATE OR REPLACE FUNCTION public._touch_admission_checklist_item_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_admission_checklist_item_updated_at ON public.admission_checklist_items;
CREATE TRIGGER trg_touch_admission_checklist_item_updated_at
  BEFORE UPDATE ON public.admission_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_admission_checklist_item_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.admission_checklists                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_checklist_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_checklist_completions     ENABLE ROW LEVEL SECURITY;

-- Templates: read = either settings.view OR enquiries.checklist.view
DROP POLICY IF EXISTS admission_checklists_select ON public.admission_checklists;
CREATE POLICY admission_checklists_select ON public.admission_checklists
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission('admission.settings.checklists.view')
    OR public.user_has_permission('admission.enquiries.checklist.view')
  );

DROP POLICY IF EXISTS admission_checklists_insert ON public.admission_checklists;
CREATE POLICY admission_checklists_insert ON public.admission_checklists
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('admission.settings.checklists.manage'));

DROP POLICY IF EXISTS admission_checklists_update ON public.admission_checklists;
CREATE POLICY admission_checklists_update ON public.admission_checklists
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('admission.settings.checklists.manage'))
  WITH CHECK (public.user_has_permission('admission.settings.checklists.manage'));

DROP POLICY IF EXISTS admission_checklists_delete ON public.admission_checklists;
CREATE POLICY admission_checklists_delete ON public.admission_checklists
  FOR DELETE TO authenticated
  USING (public.user_has_permission('admission.settings.checklists.manage'));

-- Items: mirror parent rules
DROP POLICY IF EXISTS admission_checklist_items_select ON public.admission_checklist_items;
CREATE POLICY admission_checklist_items_select ON public.admission_checklist_items
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission('admission.settings.checklists.view')
    OR public.user_has_permission('admission.enquiries.checklist.view')
  );

DROP POLICY IF EXISTS admission_checklist_items_insert ON public.admission_checklist_items;
CREATE POLICY admission_checklist_items_insert ON public.admission_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('admission.settings.checklists.manage'));

DROP POLICY IF EXISTS admission_checklist_items_update ON public.admission_checklist_items;
CREATE POLICY admission_checklist_items_update ON public.admission_checklist_items
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('admission.settings.checklists.manage'))
  WITH CHECK (public.user_has_permission('admission.settings.checklists.manage'));

DROP POLICY IF EXISTS admission_checklist_items_delete ON public.admission_checklist_items;
CREATE POLICY admission_checklist_items_delete ON public.admission_checklist_items
  FOR DELETE TO authenticated
  USING (public.user_has_permission('admission.settings.checklists.manage'));

-- Completions: read by enquiries.checklist.view; writes go through RPC
DROP POLICY IF EXISTS admission_checklist_completions_select ON public.admission_checklist_completions;
CREATE POLICY admission_checklist_completions_select ON public.admission_checklist_completions
  FOR SELECT TO authenticated
  USING (public.user_has_permission('admission.enquiries.checklist.view'));

-- No INSERT/UPDATE/DELETE policies — completions are written exclusively via
-- the mark_checklist_item SECURITY DEFINER RPC defined in the next migration.
-- Anyone trying to bypass the RPC and INSERT directly will be denied by RLS.
