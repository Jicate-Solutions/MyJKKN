-- =============================================================================
-- Housekeeping RLS ↔ permission-catalog alignment
--
-- The permission catalog (lib/constants/permissions.ts) declares and Role
-- Management grants:
--   campus_living.housekeeping.view       (View Housekeeping Schedules)
--   campus_living.housekeeping.schedule   (Create/Edit Schedule)
--   campus_living.housekeeping.mark_done  (Mark Task Done)
-- ...but the hostel_cleaning_schedules / hostel_cleaning_tasks policies were
-- written against campus_living.housekeeping.create/.edit/.delete — keys that
-- exist in NO role and NOT in the catalog. Net effect: only super_admin/admin
-- could ever write housekeeping rows; Warden/Chief Warden (which hold
-- .schedule) were silently denied. Classic catalog-vs-RLS drift
-- (see feedback_rpc_perm_gate_must_use_catalog_key).
--
-- Mapping applied here:
--   schedules INSERT/UPDATE/DELETE -> .schedule (the catalog's manage key)
--   tasks     INSERT/DELETE        -> .schedule (task generation/cleanup is
--                                     schedule management)
--   tasks     UPDATE               -> .mark_done OR .schedule (cleaning staff
--                                     update status; managers can correct)
--   SELECTs unchanged (.view).
-- =============================================================================

-- hostel_cleaning_schedules -------------------------------------------------
ALTER POLICY hostel_cleaning_schedules_insert_permission ON public.hostel_cleaning_schedules
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

ALTER POLICY hostel_cleaning_schedules_update_permission ON public.hostel_cleaning_schedules
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

ALTER POLICY hostel_cleaning_schedules_delete_permission ON public.hostel_cleaning_schedules
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id)
        AND role_has_block_access(block_id))
  );

-- hostel_cleaning_tasks -------------------------------------------------------
ALTER POLICY hostel_cleaning_tasks_insert_permission ON public.hostel_cleaning_tasks
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id))
  );

ALTER POLICY hostel_cleaning_tasks_update_permission ON public.hostel_cleaning_tasks
  USING (
    is_super_admin() OR is_admin()
    OR ((user_has_permission('campus_living.housekeeping.mark_done')
         OR user_has_permission('campus_living.housekeeping.schedule'))
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR ((user_has_permission('campus_living.housekeeping.mark_done')
         OR user_has_permission('campus_living.housekeeping.schedule'))
        AND role_has_institution_access(institution_id))
  );

ALTER POLICY hostel_cleaning_tasks_delete_permission ON public.hostel_cleaning_tasks
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(institution_id))
  );
