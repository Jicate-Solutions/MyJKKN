-- HR Head can correct a leave balance again (2026-09-08)
--
-- REVERSES PART OF 20260906130000, deliberately and narrowly.
--
-- That migration made every lever of the Adjust dialog super-admin only —
-- set_used, set/clear_entitlement and the month-wise total — because they
-- rewrite consumed days and entitlement directly, with no application and no
-- approval chain behind them. Its own header records that this removed access
-- hr_head previously held through hr.leave.policies.write.
--
-- The HR Head is being given it back, by decision. Two people hold that role.
--
-- WHY A NEW KEY AND NOT hr.leave.balance.manage. That key is held by SEVEN
-- roles — hr_head, managing_director, ceo, coo, hr_admin, board, hr_manager —
-- so reusing it would hand these levers to six people who were never meant to
-- have them. hr.leave.balance.adjust is new, so it grants nobody by accident,
-- and it is granted below to hr_head alone. `.manage` keeps its own meaning:
-- GENERATE balances from policy, which is a different act from overwriting one
-- by hand.
--
-- NOT A ROLE NAME IN SQL. The gate tests the KEY, never `role_key = 'hr_head'`
-- — so Role Management stays the single source of truth and a later grant needs
-- no migration. (CLAUDE.md: never hardcode role names in SQL.)
--
-- WHAT STILL CONSTRAINS THE CALLER. role_has_institution_access(v_inst) sits
-- below the gate in both functions and is unchanged: a permission check is never
-- a tenant boundary. is_super_admin() short-circuits it; a key holder does not,
-- so an HR Head can only correct balances inside institutions they can reach.
-- Every write continues to land in hr_leave_balance_adjustments with who, when,
-- old -> new and a mandatory reason.
--
-- HOW THIS EDITS THE FUNCTIONS. Both carry a byte-identical five-line gate. This
-- swaps exactly that text and leaves every other line untouched, rather than
-- retyping ~200 lines of balance arithmetic where one transcription slip would
-- silently change a payroll figure. The DO block RAISEs if either function does
-- not contain the expected text, so a drifted definition fails the migration
-- instead of being quietly rewritten.
--
-- No BEGIN/COMMIT: scripts/apply-migration-file.mjs refuses transaction control.

DO $mig$
DECLARE
  v_old CONSTANT text :=
    E'  IF NOT public.is_super_admin() THEN\n'
    || E'    RAISE EXCEPTION\n'
    || E'      ''Insufficient permission: leave balance adjustments are restricted to super administrators'';\n'
    || E'  END IF;';
  v_new CONSTANT text :=
    E'  IF NOT (public.is_super_admin()\n'
    || E'          OR public.user_has_permission(''hr.leave.balance.adjust'')) THEN\n'
    || E'    RAISE EXCEPTION\n'
    || E'      ''Insufficient permission: correcting a leave balance needs hr.leave.balance.adjust'';\n'
    || E'  END IF;';
  v_fn    text;
  v_src   text;
  v_done  int := 0;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['hr_leave_balance_adjust', 'hr_leave_month_entry_set'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn;

    IF v_src IS NULL THEN
      RAISE EXCEPTION 'public.% does not exist', v_fn;
    END IF;
    IF position(v_old IN v_src) = 0 THEN
      RAISE EXCEPTION
        'public.% no longer contains the expected super-admin gate; review it by hand before widening', v_fn;
    END IF;

    EXECUTE replace(v_src, v_old, v_new);
    v_done := v_done + 1;
  END LOOP;

  IF v_done <> 2 THEN
    RAISE EXCEPTION 'Expected to rewrite 2 functions, rewrote %', v_done;
  END IF;
END
$mig$;

-- Re-creating a function silently re-grants EXECUTE to PUBLIC, and PUBLIC
-- includes anon. Both were rewritten above, so restate the ACL rather than
-- trusting what CREATE OR REPLACE left behind.
REVOKE ALL ON FUNCTION public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text)
  TO authenticated, service_role;

-- The key exists for a role only once it is in that role's JSONB. Declaring it
-- in lib/constants/permissions.ts does nothing on its own.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.leave.balance.adjust', true),
       updated_at = now()
 WHERE role_key = 'hr_head';
