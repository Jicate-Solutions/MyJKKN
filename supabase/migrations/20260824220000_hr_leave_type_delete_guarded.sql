-- =============================================================================
-- 20260824220000_hr_leave_type_delete_guarded.sql
--
-- hr_leave_type_delete() -- a hard delete for a leave type that refuses to
-- destroy history, and says exactly what stopped it.
--
-- WHY AN RPC AND NOT A .delete() FROM THE CLIENT
-- ----------------------------------------------
-- Nine tables FK to hr_leave_types, and they do NOT behave the same way:
--
--   NO ACTION (the delete fails)      CASCADE (the rows vanish, silently)
--     hr_leave_applications             hr_leave_balance_adjustments
--     hr_leave_balances                 hr_leave_entitlement_overrides
--     hr_leave_encashments              hr_leave_policies
--     hr_leave_types.superseded_by      hr_leave_type_assignments
--                                       hr_leave_type_entitlements
--
-- A client-side delete would therefore do one of two bad things: fail with a
-- raw 23503 naming a constraint nobody outside this file can interpret, or
-- succeed and take the balance-adjustment audit trail and every per-staff
-- entitlement override with it. Neither is acceptable for a destructive action
-- an admin triggers from a dropdown.
--
-- The cascade list is also not something the caller can see. Checking it here,
-- in the same transaction as the delete, is the only way the answer cannot go
-- stale between the check and the act.
--
-- WHAT COUNTS AS HISTORY (refuses)
--   * a leave application of this type, in any state
--   * an encashment
--   * a balance row with used > 0 or carried_forward > 0 -- somebody actually
--     consumed or carried this leave
--   * a per-staff entitlement override, or a balance adjustment -- both are
--     deliberate, reasoned, per-person acts, and both CASCADE, so nothing else
--     would stop them being erased
--   * another leave type naming this one as its superseded_by
--
-- WHAT COUNTS AS CONFIG (removed with it, and reported)
--   * balance rows with nothing consumed. These are generated placeholders --
--     generate_hr_leave_balances writes one per staff member per type per year
--     whether or not anyone ever touches it, which is why all 23 archived types
--     currently carry between 2 and 250 of them. An untouched entitlement to a
--     type that no longer exists carries no information.
--   * assignments, cadre entitlements and policies -- pure configuration,
--     re-creatable from the UI in a minute.
--
-- ARCHIVE FIRST. The RPC refuses an active type outright. Deleting is a
-- two-step act on purpose: archive it, satisfy yourself nothing broke, then
-- remove it. It also means the delete action never appears next to a type
-- staff are currently applying against.
--
-- p_dry_run (default true) runs every check and returns the same shape without
-- writing, so the confirmation dialog and the commit share one implementation
-- and cannot disagree about what will happen.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hr_leave_type_delete(
  p_leave_type_id uuid,
  p_dry_run       boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type        record;
  v_apps        int;
  v_encash      int;
  v_consumed    int;
  v_overrides   int;
  v_adjust      int;
  v_superseding int;
  v_placeholder int;
  v_assign      int;
  v_cadre       int;
  v_policies    int;
  v_blockers    jsonb;
  v_total       int;
BEGIN
  -- Mirrors the hlt_write RLS policy exactly. SECURITY DEFINER bypasses RLS,
  -- so this check IS the access control -- there is no second line of defence
  -- behind it. No caller-supplied identity is accepted for the same reason.
  IF NOT user_has_permission('hr.leave.types.manage') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT id, leave_type_name, leave_type_code, is_active, hr_organization_id
    INTO v_type
    FROM hr_leave_types
   WHERE id = p_leave_type_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_type.is_active THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'still_active',
      'leave_type_name', v_type.leave_type_name,
      'message', 'Archive this leave type first. Deleting is deliberately a two-step act.'
    );
  END IF;

  SELECT count(*) INTO v_apps   FROM hr_leave_applications WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_encash FROM hr_leave_encashments  WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_consumed
    FROM hr_leave_balances
   WHERE leave_type_id = p_leave_type_id
     AND (COALESCE(used, 0) > 0 OR COALESCE(carried_forward, 0) > 0);
  SELECT count(*) INTO v_overrides FROM hr_leave_entitlement_overrides WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_adjust    FROM hr_leave_balance_adjustments   WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_superseding FROM hr_leave_types WHERE superseded_by = p_leave_type_id;

  SELECT count(*) INTO v_placeholder
    FROM hr_leave_balances
   WHERE leave_type_id = p_leave_type_id
     AND COALESCE(used, 0) = 0 AND COALESCE(carried_forward, 0) = 0;
  SELECT count(*) INTO v_assign   FROM hr_leave_type_assignments   WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_cadre    FROM hr_leave_type_entitlements  WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_policies FROM hr_leave_policies           WHERE leave_type_id = p_leave_type_id;

  v_blockers := jsonb_build_object(
    'applications',      v_apps,
    'encashments',       v_encash,
    'consumed_balances', v_consumed,
    'overrides',         v_overrides,
    'adjustments',       v_adjust,
    'superseding_types', v_superseding
  );
  v_total := v_apps + v_encash + v_consumed + v_overrides + v_adjust + v_superseding;

  IF v_total > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'in_use',
      'leave_type_name', v_type.leave_type_name,
      'blockers', v_blockers,
      'message', 'This leave type has history attached, so it can only stay archived.'
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true, 'dry_run', true,
      'leave_type_name', v_type.leave_type_name,
      'blockers', v_blockers,
      'will_remove', jsonb_build_object(
        'placeholder_balances', v_placeholder,
        'assignments',          v_assign,
        'cadre_entitlements',   v_cadre,
        'policies',             v_policies
      )
    );
  END IF;

  -- Placeholder ledger rows go first and explicitly: hr_leave_balances is a
  -- NO ACTION parent, so leaving them would abort the whole delete. Repeating
  -- the used/carried predicate here rather than trusting the count above keeps
  -- the write and the guard describing the same rows.
  DELETE FROM hr_leave_balances
   WHERE leave_type_id = p_leave_type_id
     AND COALESCE(used, 0) = 0 AND COALESCE(carried_forward, 0) = 0;

  -- Assignments, cadre entitlements and policies go with it by CASCADE.
  DELETE FROM hr_leave_types WHERE id = p_leave_type_id;

  RETURN jsonb_build_object(
    'ok', true, 'dry_run', false,
    'leave_type_name', v_type.leave_type_name,
    'removed', jsonb_build_object(
      'placeholder_balances', v_placeholder,
      'assignments',          v_assign,
      'cadre_entitlements',   v_cadre,
      'policies',             v_policies
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.hr_leave_type_delete(uuid, boolean) IS
  'Hard-deletes an ARCHIVED leave type, but only when nothing of consequence references it. Refuses on applications, encashments, consumed balances, per-staff overrides, balance adjustments, or another type superseded by this one -- the last three CASCADE, so nothing else would stop them being erased. Removes unconsumed placeholder balance rows plus the cascading config (assignments, cadre entitlements, policies). p_dry_run = true returns the same verdict without writing, so the confirmation dialog and the commit cannot disagree.';

REVOKE ALL ON FUNCTION public.hr_leave_type_delete(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_type_delete(uuid, boolean) TO authenticated;
