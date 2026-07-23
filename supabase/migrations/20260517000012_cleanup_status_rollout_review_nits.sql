BEGIN;

-- ============================================================
-- 1. Align write policies with sibling admission_settings tables.
-- Currently admission_statuses INSERT/UPDATE/DELETE require either
-- is_super_admin() or the manage permission. Sibling tables include
-- is_admin() in the OR — restoring consistency.
-- ============================================================

DROP POLICY IF EXISTS admission_statuses_insert ON public.admission_statuses;
DROP POLICY IF EXISTS admission_statuses_update ON public.admission_statuses;
DROP POLICY IF EXISTS admission_statuses_delete ON public.admission_statuses;

CREATE POLICY admission_statuses_insert
  ON public.admission_statuses FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_update
  ON public.admission_statuses FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.statuses.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_delete
  ON public.admission_statuses FOR DELETE
  USING (is_super_admin() OR is_admin());


-- ============================================================
-- 2. ON DELETE SET NULL for actor FKs (mirrors sibling settings tables).
-- ============================================================

ALTER TABLE public.admission_statuses
  DROP CONSTRAINT IF EXISTS admission_statuses_created_by_fkey,
  ADD CONSTRAINT admission_statuses_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.admission_statuses
  DROP CONSTRAINT IF EXISTS admission_statuses_updated_by_fkey,
  ADD CONSTRAINT admission_statuses_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.learners_profile_status_history
  DROP CONSTRAINT IF EXISTS learners_profile_status_history_changed_by_fkey,
  ADD CONSTRAINT learners_profile_status_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ============================================================
-- 3. Grant manage to administrator role (peer parity with
-- admission.settings.{sources,workflows}.manage which administrator holds).
-- ============================================================

UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('admission.settings.statuses.manage', true)
WHERE role_key = 'administrator';


-- ============================================================
-- 4. Retag "N Year Tuition Fee" billing categories from 'other' to 'tuition'.
-- The Tuition% ILIKE pattern in A3 missed these due to leading digit.
-- ============================================================

UPDATE public.billing_categories
SET kind = 'tuition'
WHERE category_name ~* '^\d+\s*year\s+tuition';


COMMIT;
