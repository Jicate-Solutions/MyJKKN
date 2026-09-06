-- Grant the new HR leave admin keys.
--
-- A key declared in lib/constants/permissions.ts does NOTHING until it is
-- present in custom_roles.permissions. Pages render empty without this.
--
-- Granted to roles that already hold hr.dashboard.view TRUE — the gate every
-- other /hr/admin/* route uses. Test by VALUE, not key presence: 63 roles
-- carry HR keys explicitly set to false.

UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('hr.leave.types.manage', true)
  || jsonb_build_object('hr.leave.balance.manage', true)
WHERE (permissions->>'hr.dashboard.view')::boolean IS TRUE;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.custom_roles
  WHERE (permissions->>'hr.leave.types.manage')::boolean IS TRUE;
  RAISE NOTICE 'hr.leave.types.manage granted to % roles', v_count;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No role received hr.leave.types.manage — pages would render empty';
  END IF;
END $$;
