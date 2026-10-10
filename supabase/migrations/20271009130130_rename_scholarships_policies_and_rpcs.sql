-- ─── Rename billing "discounts" → "scholarships" — part 2d: table policies, permission RPCs ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale.
--
-- Runs AFTER the three permission-key batches (130100 / 130110 / 130120). The guard below
-- aborts if any role still holds an old key, because the policies switch to the new keys
-- here and a role skipped by the batches would silently lose access.
-- Applied through the Supabase MCP apply_migration as "rename_scholarships_policies_and_rpcs"; ledger version
-- aligned to 20271009130130. The user_activity_logs policy moved to 20271009130140 (a first attempt
-- that included it deadlocked with a concurrent writer and rolled back).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.custom_roles cr
              WHERE jsonb_typeof(cr.permissions) = 'object'
                AND EXISTS (SELECT 1 FROM jsonb_object_keys(cr.permissions) k
                             WHERE k LIKE 'billing.discounts.%')) THEN
    RAISE EXCEPTION 'custom_roles still holds billing.discounts.* keys — apply 130100 / 130110 / 130120 first';
  END IF;
END $$;

-- ── 6. Policies — rename, then point at the new keys ────────────────────────
ALTER POLICY billing_discounts_select_permission ON public.billing_scholarships
  RENAME TO billing_scholarships_select_permission;
ALTER POLICY billing_discounts_insert_permission ON public.billing_scholarships
  RENAME TO billing_scholarships_insert_permission;
ALTER POLICY billing_discounts_update_permission ON public.billing_scholarships
  RENAME TO billing_scholarships_update_permission;
ALTER POLICY billing_discounts_delete_permission ON public.billing_scholarships
  RENAME TO billing_scholarships_delete_permission;

ALTER POLICY billing_scholarships_select_permission ON public.billing_scholarships
  USING ((SELECT is_super_admin()) OR (SELECT is_admin())
         OR (SELECT user_has_permission('billing.scholarships.view')));
ALTER POLICY billing_scholarships_insert_permission ON public.billing_scholarships
  WITH CHECK ((SELECT is_super_admin()) OR (SELECT is_admin())
              OR (SELECT user_has_permission('billing.scholarships.create')));
ALTER POLICY billing_scholarships_update_permission ON public.billing_scholarships
  USING ((SELECT is_super_admin()) OR (SELECT is_admin())
         OR (SELECT user_has_permission('billing.scholarships.edit')));
ALTER POLICY billing_scholarships_delete_permission ON public.billing_scholarships
  USING ((SELECT is_super_admin()) OR (SELECT is_admin())
         OR (SELECT user_has_permission('billing.scholarships.delete')));

-- ── 8. Permission RPCs (SECURITY INVOKER — unchanged apart from the keys) ───
CREATE OR REPLACE FUNCTION public.get_scholarship_permissions(target_role_key text)
 RETURNS TABLE(role_name text, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean, can_approve boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cr.role_name::TEXT,
    COALESCE((cr.permissions->>'billing.scholarships.view')::BOOLEAN, FALSE),
    COALESCE((cr.permissions->>'billing.scholarships.create')::BOOLEAN, FALSE),
    COALESCE((cr.permissions->>'billing.scholarships.edit')::BOOLEAN, FALSE),
    COALESCE((cr.permissions->>'billing.scholarships.delete')::BOOLEAN, FALSE),
    COALESCE((cr.permissions->>'billing.scholarships.approve')::BOOLEAN, FALSE)
  FROM custom_roles cr
  WHERE cr.role_key = target_role_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_scholarship_permissions(target_role_key text, can_view boolean DEFAULT false, can_create boolean DEFAULT false, can_edit boolean DEFAULT false, can_delete boolean DEFAULT false, can_approve boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update the role permissions for billing.scholarships
  UPDATE custom_roles
  SET permissions = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(permissions, '{}'::jsonb),
            '{billing.scholarships.view}', to_jsonb(can_view)
          ),
          '{billing.scholarships.create}', to_jsonb(can_create)
        ),
        '{billing.scholarships.edit}', to_jsonb(can_edit)
      ),
      '{billing.scholarships.delete}', to_jsonb(can_delete)
    ),
    '{billing.scholarships.approve}', to_jsonb(can_approve)
  ),
  updated_at = NOW()
  WHERE role_key = target_role_key;

  -- Log the permission change
  RAISE NOTICE 'Updated scholarship permissions for role: %', target_role_key;
END;
$function$;

