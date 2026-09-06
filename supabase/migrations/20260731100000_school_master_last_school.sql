-- School Master: board+district-wise schools lookup powering the Last School
-- dropdown (admin EnquiryForm + public student-form). learners_profiles.last_school
-- (text) stays the display source of truth; last_school_id is an additive nullable
-- FK — no existing learner data is modified by this migration.

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  board text NOT NULL DEFAULT 'state_board',
  district text NOT NULL,
  state text NOT NULL DEFAULT 'Tamil Nadu',
  pincode text,
  udise_code text,
  management_type text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe guard for bulk import (case-insensitive within board+district)
CREATE UNIQUE INDEX IF NOT EXISTS school_master_board_district_name_uq
  ON public.school_master (board, district, lower(school_name));

CREATE INDEX IF NOT EXISTS school_master_board_district_idx
  ON public.school_master (board, district);

-- Advanced search (ILIKE '%term%'): trigram GIN index. pg_trgm lives in the
-- `extensions` schema on this project, so the opclass must be qualified.
CREATE INDEX IF NOT EXISTS school_master_name_trgm_idx
  ON public.school_master USING gin (school_name extensions.gin_trgm_ops);

DROP TRIGGER IF EXISTS school_master_touch_updated_at ON public.school_master;
CREATE TRIGGER school_master_touch_updated_at
  BEFORE UPDATE ON public.school_master
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 2. RLS ---------------------------------------------------------------------
-- Global lookup table: SELECT for all authenticated users (the dropdown must
-- work for every form-entry role); writes gated on permission keys, never role
-- names. Public student-form reads go through the token-validated service-role
-- endpoint, so anon gets nothing.
ALTER TABLE public.school_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_master_select ON public.school_master
  FOR SELECT TO authenticated USING (true);

CREATE POLICY school_master_insert ON public.school_master
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('learners.school_master.create'));

CREATE POLICY school_master_update ON public.school_master
  FOR UPDATE TO authenticated
  USING (public.user_has_permission('learners.school_master.edit'))
  WITH CHECK (public.user_has_permission('learners.school_master.edit'));

CREATE POLICY school_master_delete ON public.school_master
  FOR DELETE TO authenticated
  USING (public.user_has_permission('learners.school_master.delete'));

REVOKE ALL ON public.school_master FROM anon;

-- 3. Learner profiles: additive nullable FK ----------------------------------
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS last_school_id uuid REFERENCES public.school_master(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS learners_profiles_last_school_id_idx
  ON public.learners_profiles (last_school_id)
  WHERE last_school_id IS NOT NULL;

-- 4. Permission grants --------------------------------------------------------
-- Roles that can create learners maintain the school master. Gate on an
-- existing permission key (learners.create), not on role names.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'learners.school_master.view', true,
  'learners.school_master.create', true,
  'learners.school_master.edit', true,
  'learners.school_master.delete', true
)
WHERE is_active = true
  AND permissions->'learners.create' = 'true'::jsonb;
