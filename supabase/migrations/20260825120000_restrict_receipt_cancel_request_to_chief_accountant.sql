-- Restrict billing.receipts.cancel.request to the Chief Accountant role.
--
-- Raising a receipt cancellation puts money back on a bill, so the request
-- side is now as narrow as the approval side already is. Only two identities
-- may raise one:
--   * super admins  — bypass the key entirely via is_super_admin(), both in
--                     fn_request_receipt_cancellation and in the UI, so they
--                     need no grant here and none is added.
--   * Chief Accountant (role_key 'accounts') — the accounts team.
--
-- Revoked from three roles that held it (12 active users):
--   accountant_assistant  (5 users)
--   administrator         (1 user)
--   admission             (6 users)  -- an admissions role holding a receipt
--                                       reversal key was never intentional.
--
-- Set to FALSE rather than removed with `-`: Role Management renders a toggle
-- per declared key, and a role whose JSONB omits the key shows the toggle in
-- an indeterminate state. An explicit false is what every other denied role
-- in this table stores.
--
-- Learners are additionally blocked in the UI on role (`!isStudentView`) on
-- both surfaces that offer the action, so a future mis-grant cannot expose it
-- to them.

UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('billing.receipts.cancel.request', false),
    updated_at  = now()
WHERE role_key <> 'accounts'
  AND (permissions->>'billing.receipts.cancel.request')::boolean IS TRUE;

-- Make the intended holder explicit rather than assuming it is already set.
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('billing.receipts.cancel.request', true),
    updated_at  = now()
WHERE role_key = 'accounts'
  AND (permissions->>'billing.receipts.cancel.request')::boolean IS DISTINCT FROM TRUE;

DO $$
DECLARE
  v_holders text;
BEGIN
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_holders
  FROM custom_roles
  WHERE (permissions->>'billing.receipts.cancel.request')::boolean IS TRUE;

  IF v_holders IS DISTINCT FROM 'accounts' THEN
    RAISE EXCEPTION
      'billing.receipts.cancel.request must be held by role_key ''accounts'' alone, found: %',
      COALESCE(v_holders, '(none)');
  END IF;
END $$;
