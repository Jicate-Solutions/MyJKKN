-- =============================================================================
-- 20261006120000_hr_leave_type_super_admin_delete.sql
--
-- hr_leave_type_delete_super_admin() -- a super-admin-only hard delete that,
-- unlike hr_leave_type_delete(), is allowed to remove a leave type's BALANCE
-- history. Plus hr_leave_type_deletions, a tombstone of every such delete.
--
-- WHY A SECOND RPC
-- ----------------
-- hr_leave_type_delete() (20260824220000) is deliberately conservative: it needs
-- the type archived first and refuses when ANY history exists (consumed balances,
-- adjustments, overrides, ...). That is right for the HR admin who holds
-- hr.leave.types.manage, and it stays exactly as it is.
--
-- It also leaves a real class of types undeletable: those belonging to an
-- organization that is NOT in HR (hr_organizations.included_in_hr = false --
-- Arts & Science (Aided), Testing Institution, Nattraja Incubation Forum). Their
-- Casual Leave carries generated balances and bulk adjustment rows, and nobody
-- can tell whose they are because the Institution column resolves to blank.
-- A super admin needs to be able to remove them for good.
--
-- WHAT IT REFUSES, ALWAYS (even for a super admin)
--   * a leave application of this type, in any state
--   * an encashment
--   * another leave type naming this one as superseded_by
-- Those are real staff requests, real money and a version chain. They are never
-- wiped from here; the answer for them is "stay archived".
--
-- WHAT IT REMOVES
--   * every balance row, consumed or not. hr_leave_balances.leave_type_id is
--     NO ACTION, so these are deleted explicitly, first.
--   * then the type itself, whose delete CASCADEs to: balance adjustments,
--     per-staff entitlement overrides, assignments, cadre entitlements,
--     policies, eligibilities, month entries, work-pattern leave entitlements.
--     Every one is counted BEFORE it goes, so the dialog can say the number.
--   There are no DELETE triggers on any of these tables (checked 2026-10-06).
--
-- NO "ARCHIVE FIRST"
--   Unlike hr_leave_type_delete(), an active type may be deleted. The dialog
--   says so when it is. The row is locked FOR UPDATE for the whole call, so an
--   application cannot slip in between the check and the delete (an FK insert
--   takes a KEY SHARE lock on the type row, which that lock excludes); and if
--   one somehow did, the NO ACTION FK fails the DELETE and the EXCEPTION handler
--   rolls the whole call back.
--
-- ACCESS
--   SECURITY DEFINER bypasses RLS, so the check IS the access control. It uses
--   is_super_admin() -- profiles.is_super_admin only, derived from auth.uid() --
--   NOT hr.leave.types.manage and not role = 'super_admin'. The UI gates on the
--   same predicate. search_path is empty and every object is schema-qualified.
--   is_super_admin() is COALESCEd to false, so `NOT` cannot fail open on NULL.
--
-- THE TOMBSTONE
--   hr_leave_type_deletions keeps who/when, the counts, and the type row as
--   jsonb. It has NO foreign keys on purpose: it must outlive the type, the
--   organization and the user. Balances and adjustments are NOT recoverable from
--   it -- it records that they existed and how many, not their contents.
--
-- DOES NOT TOUCH hr_leave_type_delete().
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_leave_type_deletions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at          timestamptz NOT NULL DEFAULT now(),
  deleted_by          uuid,
  leave_type_id       uuid        NOT NULL,
  leave_type_name     text        NOT NULL,
  leave_type_code     text,
  hr_organization_id  uuid,
  organization_name   text,
  was_active          boolean,
  removed             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  type_snapshot       jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS hr_leave_type_deletions_deleted_at_idx
  ON public.hr_leave_type_deletions (deleted_at DESC);

ALTER TABLE public.hr_leave_type_deletions ENABLE ROW LEVEL SECURITY;

-- Read-only for super admins. No INSERT/UPDATE/DELETE policy exists, so nothing
-- but the DEFINER function below (and the service role) can write a row.
DROP POLICY IF EXISTS hr_leave_type_deletions_select ON public.hr_leave_type_deletions;
CREATE POLICY hr_leave_type_deletions_select ON public.hr_leave_type_deletions
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));

REVOKE ALL ON public.hr_leave_type_deletions FROM anon, authenticated;
GRANT SELECT ON public.hr_leave_type_deletions TO authenticated;

COMMENT ON TABLE public.hr_leave_type_deletions IS
  'Tombstone of every hr_leave_type_delete_super_admin() commit: who, when, how many rows of each kind went with the type, and the type row itself as jsonb. No foreign keys on purpose. Balances and adjustments are NOT recoverable from it.';

CREATE OR REPLACE FUNCTION public.hr_leave_type_delete_super_admin(
  p_leave_type_id uuid,
  p_dry_run       boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type            record;
  v_apps            int;
  v_encash          int;
  v_superseding     int;
  v_bal_consumed    int;
  v_bal_unused      int;
  v_adjust          int;
  v_overrides       int;
  v_assign          int;
  v_cadre           int;
  v_policies        int;
  v_elig            int;
  v_months          int;
  v_wp              int;
  v_blockers        jsonb;
  v_removed         jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT t.id, t.leave_type_name, t.leave_type_code, t.is_active,
         t.hr_organization_id, o.name AS organization_name, to_jsonb(t) AS snapshot
    INTO v_type
    FROM public.hr_leave_types t
    LEFT JOIN public.hr_organizations o ON o.id = t.hr_organization_id
   WHERE t.id = p_leave_type_id
     FOR UPDATE OF t;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_apps        FROM public.hr_leave_applications WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_encash      FROM public.hr_leave_encashments  WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_superseding FROM public.hr_leave_types        WHERE superseded_by = p_leave_type_id;

  v_blockers := jsonb_build_object(
    'applications',      v_apps,
    'encashments',       v_encash,
    'superseding_types', v_superseding
  );

  IF v_apps + v_encash + v_superseding > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'in_use',
      'leave_type_name', v_type.leave_type_name,
      'organization_name', v_type.organization_name,
      'was_active', v_type.is_active,
      'blockers', v_blockers,
      'message', 'This leave type has leave applications, encashments or a newer version attached, so it can only stay archived.'
    );
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE(used, 0) > 0 OR COALESCE(carried_forward, 0) > 0),
         count(*) FILTER (WHERE COALESCE(used, 0) = 0 AND COALESCE(carried_forward, 0) = 0)
    INTO v_bal_consumed, v_bal_unused
    FROM public.hr_leave_balances WHERE leave_type_id = p_leave_type_id;

  SELECT count(*) INTO v_adjust    FROM public.hr_leave_balance_adjustments       WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_overrides FROM public.hr_leave_entitlement_overrides     WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_assign    FROM public.hr_leave_type_assignments          WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_cadre     FROM public.hr_leave_type_entitlements         WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_policies  FROM public.hr_leave_policies                  WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_elig      FROM public.hr_leave_eligibilities             WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_months    FROM public.hr_leave_month_entries             WHERE leave_type_id = p_leave_type_id;
  SELECT count(*) INTO v_wp        FROM public.hr_work_pattern_leave_entitlements WHERE leave_type_id = p_leave_type_id;

  v_removed := jsonb_build_object(
    'balances_with_leave_taken', v_bal_consumed,
    'balances_unused',           v_bal_unused,
    'adjustments',               v_adjust,
    'overrides',                 v_overrides,
    'assignments',               v_assign,
    'cadre_entitlements',        v_cadre,
    'policies',                  v_policies,
    'eligibilities',             v_elig,
    'month_entries',             v_months,
    'work_pattern_entitlements', v_wp
  );

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true, 'dry_run', true,
      'leave_type_name', v_type.leave_type_name,
      'organization_name', v_type.organization_name,
      'was_active', v_type.is_active,
      'blockers', v_blockers,
      'will_remove', v_removed
    );
  END IF;

  DELETE FROM public.hr_leave_balances WHERE leave_type_id = p_leave_type_id;

  INSERT INTO public.hr_leave_type_deletions (
    deleted_by, leave_type_id, leave_type_name, leave_type_code,
    hr_organization_id, organization_name, was_active, removed, type_snapshot
  ) VALUES (
    (SELECT auth.uid()), v_type.id, v_type.leave_type_name, v_type.leave_type_code,
    v_type.hr_organization_id, v_type.organization_name, v_type.is_active,
    v_removed, v_type.snapshot
  );

  DELETE FROM public.hr_leave_types WHERE id = p_leave_type_id;

  RETURN jsonb_build_object(
    'ok', true, 'dry_run', false,
    'leave_type_name', v_type.leave_type_name,
    'organization_name', v_type.organization_name,
    'was_active', v_type.is_active,
    'removed', v_removed
  );
EXCEPTION
  -- Returned, not raised: same contract as hr_leave_type_delete(), so the client
  -- reads `ok` and a refused or failed commit can never look like a success. The
  -- block is a subtransaction, so a failure here has already undone every DELETE
  -- above.
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_leave_type_delete_super_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_type_delete_super_admin(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.hr_leave_type_delete_super_admin(uuid, boolean) IS
  'Super-admin-only hard delete of a leave type INCLUDING its balances and adjustments. Refuses when a leave application, an encashment or a superseding type exists. p_dry_run (default true) returns the counts without writing; a commit writes a hr_leave_type_deletions tombstone first. Gate: is_super_admin().';
