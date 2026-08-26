-- fn_act_on_receipt_cancellation: decide by the configured flow, not by a
-- hardcoded is_super_admin().
--
-- Patched in place from pg_get_functiondef rather than retyped: the function
-- is ~4KB of void/revert logic that this change has no business touching, and
-- every replacement below is asserted, so a body that has drifted since
-- 20260825160000 fails the migration instead of silently keeping the old rule.
--
-- Four changes:
--   1. the authority test  -> fn_can_decide_receipt_cancellation()
--   2. both "super admin" error messages -> "approver", since that is no
--      longer the only identity that can act
--   3. decided_by_is_super_admin / actor_is_super_admin were hardcoded TRUE.
--      With a non-super-admin approver that would have written a false claim
--      into an audit trail whose whole purpose is answering "who did this".
--   4. the audit role lookup gains the profiles.role fallback that
--      user_has_permission() already has — a role-keyed approver may hold the
--      role only there, and would otherwise be logged with a NULL role.

DO $$
DECLARE
  v_def  text;
  v_next text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_act_on_receipt_cancellation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_act_on_receipt_cancellation not found';
  END IF;

  -- 1 + 2a: authority test
  v_next := replace(
    v_def,
    'IF NOT is_super_admin() THEN
    RAISE EXCEPTION ''Only a super admin can decide receipt cancellation requests'';
  END IF;',
    'IF NOT public.fn_can_decide_receipt_cancellation(p_request_id) THEN
    RAISE EXCEPTION ''You are not an approver for this institution''''s receipt cancellations'';
  END IF;'
  );
  IF v_next = v_def THEN
    RAISE EXCEPTION 'Authority guard not found — body drifted, aborting';
  END IF;
  v_def := v_next;

  -- 2b: four-eyes message
  v_next := replace(
    v_def,
    'You cannot approve your own cancellation request - another super admin must act on it',
    'You cannot decide your own cancellation request - another approver must act on it'
  );
  IF v_next = v_def THEN
    RAISE EXCEPTION 'Four-eyes message not found — body drifted, aborting';
  END IF;
  v_def := v_next;

  -- 3a: request row no longer claims the decider was a super admin
  v_next := replace(v_def, 'decided_by_is_super_admin=true', 'decided_by_is_super_admin=is_super_admin()');
  IF v_next = v_def THEN
    RAISE EXCEPTION 'decided_by_is_super_admin literal not found — body drifted, aborting';
  END IF;
  v_def := v_next;

  -- 3b: action rows, same
  v_next := replace(v_def, 'v_email, true,', 'v_email, is_super_admin(),');
  IF v_next = v_def THEN
    RAISE EXCEPTION 'actor_is_super_admin literal not found — body drifted, aborting';
  END IF;
  v_def := v_next;

  -- 4: audit role lookup gains the profiles.role fallback
  v_next := replace(
    v_def,
    'SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;',
    'SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  IF v_role IS NULL THEN
    SELECT cr.role_name INTO v_role
    FROM public.profiles p JOIN public.custom_roles cr ON cr.role_key = p.role
    WHERE p.id = auth.uid() LIMIT 1;
  END IF;'
  );
  IF v_next = v_def THEN
    RAISE EXCEPTION 'Role lookup not found — body drifted, aborting';
  END IF;
  v_def := v_next;

  EXECUTE v_def;
END $$;

-- Prove the new rule is actually in the installed body, not just in this file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_act_on_receipt_cancellation'
      AND pg_get_functiondef(p.oid) LIKE '%fn_can_decide_receipt_cancellation%'
  ) THEN
    RAISE EXCEPTION 'Patch did not take effect';
  END IF;
END $$;
