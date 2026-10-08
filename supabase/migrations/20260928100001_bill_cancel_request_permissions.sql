-- Permission grants for the bill cancel request flow (split from 20260928100000 to stay under the exec_sql statement timeout).

-- ---------------------------------------------------------------------------
-- 13. Permissions. A key does nothing until it is in a role's JSONB.
--     billing.schedule.cancel.request: Chief Accountant + Accountant Assistant.
--     billing.schedule.cancel is retired -- approval authority now comes from
--     billing_bill_cancel_approval_flows, not a key.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.schedule.cancel.request', true),
       updated_at  = now()
 WHERE role_key IN ('accounts', 'accountant_assistant');

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.schedule.cancel.request', false),
       updated_at  = now()
 WHERE role_key NOT IN ('accounts', 'accountant_assistant')
   AND (NOT (permissions ? 'billing.schedule.cancel.request')
        OR (permissions->>'billing.schedule.cancel.request')::boolean IS TRUE);

UPDATE public.custom_roles
   SET permissions = permissions - 'billing.schedule.cancel',
       updated_at  = now()
 WHERE permissions ? 'billing.schedule.cancel';

DO $$
DECLARE
  v_holders text;
BEGIN
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_holders
  FROM public.custom_roles
  WHERE (permissions->>'billing.schedule.cancel.request')::boolean IS TRUE;

  IF v_holders IS DISTINCT FROM 'accountant_assistant, accounts' THEN
    RAISE EXCEPTION 'billing.schedule.cancel.request holders must be accounts + accountant_assistant, found: %',
      COALESCE(v_holders, '(none)');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'fn_cancel_student_bill') THEN
    RAISE EXCEPTION 'fn_cancel_student_bill still exists -- direct cancel route is open';
  END IF;
END $$;
