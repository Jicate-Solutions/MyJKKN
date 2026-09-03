-- Record a staff member's bank account, superseding whatever was in use.
--
-- Same ordering problem, and the same solution, as fn_hr_set_staff_salary: the
-- partial unique index forbids two current rows, so the new id is minted first,
-- the incumbent is pointed at it, and the insert follows -- which is why
-- superseded_by has to be DEFERRABLE.
--
-- SECURITY INVOKER on purpose: hr_staff_bank_accounts_write enforces
-- hr.payroll.bank.manage, so a caller without it writes nothing.
--
-- CHANGING THE ACCOUNT CLEARS THE VERIFICATION. A row that was verified against
-- a passbook says nothing about the number that replaced it, and carrying the
-- tick forward would let an edit inherit trust it never earned. Verification is
-- re-asserted through fn_hr_verify_staff_bank_account, never as a side effect.

CREATE OR REPLACE FUNCTION public.fn_hr_set_staff_bank_account(
  p_staff_id            uuid,
  p_account_holder_name text,
  p_account_number      text,
  p_ifsc_code           text,
  p_bank_name           text,
  p_branch_name         text DEFAULT NULL,
  p_account_type        text DEFAULT 'savings',
  p_effective_from      date DEFAULT CURRENT_DATE,
  p_notes               text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id  uuid := gen_random_uuid();
  v_current record;
  v_ifsc    text := upper(trim(coalesce(p_ifsc_code, '')));
  v_acct    text := trim(coalesce(p_account_number, ''));
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff is required' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_account_holder_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Account holder name is required' USING ERRCODE = '22023';
  END IF;
  -- Re-checked here as well as by the CHECK constraint so the message names the
  -- field. A raw 23514 tells the user only that "a constraint failed".
  IF v_acct !~ '^[0-9]{6,20}$' THEN
    RAISE EXCEPTION 'Account number must be 6 to 20 digits' USING ERRCODE = '22023';
  END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'IFSC must be 4 letters, then 0, then 6 letters or digits'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':bank', 0));

  SELECT id, account_number, ifsc_code INTO v_current
    FROM public.hr_staff_bank_accounts
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-saving the identical destination would bury the real history under
  -- duplicates, so the incumbent is returned untouched instead.
  IF FOUND AND v_current.account_number = v_acct AND v_current.ifsc_code = v_ifsc THEN
    RETURN v_current.id;
  END IF;

  IF FOUND THEN
    UPDATE public.hr_staff_bank_accounts
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.hr_staff_bank_accounts (
    id, staff_id, account_holder_name, account_number, ifsc_code, bank_name,
    branch_name, account_type, effective_from, notes, created_by, updated_by
  ) VALUES (
    v_new_id, p_staff_id, trim(p_account_holder_name), v_acct, v_ifsc,
    trim(p_bank_name), nullif(trim(coalesce(p_branch_name, '')), ''),
    coalesce(p_account_type, 'savings'), coalesce(p_effective_from, CURRENT_DATE),
    p_notes, auth.uid(), auth.uid()
  );

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_set_staff_bank_account(uuid, text, text, text, text, text, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_bank_account(uuid, text, text, text, text, text, text, date, text) TO authenticated, service_role;


-- Mark the account in use as checked against a passbook or cancelled cheque.
--
-- A SEPARATE ACT FROM RECORDING IT, deliberately. If saving also verified, the
-- flag would only ever mean "somebody typed this", which is precisely what it
-- exists to distinguish from "somebody checked it".
CREATE OR REPLACE FUNCTION public.fn_hr_verify_staff_bank_account(
  p_account_id uuid,
  p_verified   boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.hr_staff_bank_accounts
     SET verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
         verified_by = CASE WHEN p_verified THEN auth.uid() ELSE NULL END,
         updated_at  = now(),
         updated_by  = auth.uid()
   -- Superseded rows are history and stay exactly as they were.
   WHERE id = p_account_id AND superseded_by IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That bank account is not the one currently in use'
      USING ERRCODE = '22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_verify_staff_bank_account(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_verify_staff_bank_account(uuid, boolean) TO authenticated, service_role;


-- Every payable person and where their money goes, INCLUDING those with no
-- account on file -- the same roster-driven shape as hr_staff_salary_directory,
-- and for the same reason: the gap is the work.
--
-- THE ACCOUNT NUMBER IS RETURNED IN FULL. The audience is two roles, and the
-- edit form needs it; the list masks it in the client. Masking in SQL instead
-- would mean a second privileged path just to populate the edit dialog.
CREATE OR REPLACE FUNCTION public.hr_staff_bank_directory()
RETURNS TABLE(
  staff_uuid          uuid,
  staff_code          text,
  person_name         text,
  role_title          text,
  is_active           boolean,
  works_at_id         uuid,
  works_at_name       text,
  payer_org_id        uuid,
  payer_org_name      text,
  account_id          uuid,
  account_holder_name text,
  account_number      text,
  ifsc_code           text,
  bank_name           text,
  branch_name         text,
  account_type        text,
  verified_at         timestamptz,
  effective_from      date,
  notes               text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.bank.view') THEN
    RAISE EXCEPTION 'hr.payroll.bank.view is required to see employee bank accounts.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.staff_id::text,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.designation::text,
         COALESCE(s.is_active, false),
         i.id,
         i.name::text,
         o.id,
         o.name::text,
         b.id,
         b.account_holder_name,
         b.account_number,
         b.ifsc_code,
         b.bank_name,
         b.branch_name,
         b.account_type,
         b.verified_at,
         b.effective_from,
         b.notes
    FROM public.staff s
    JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.hr_staff_payroll p ON p.staff_id = s.id
    LEFT JOIN public.hr_organizations o ON o.id = p.hr_organization_id
    LEFT JOIN public.hr_staff_bank_accounts b
           ON b.staff_id = s.id AND b.superseded_by IS NULL
   -- Active staff, plus anyone inactive who still has an account on file --
   -- a final settlement is paid to someone who has already left.
   WHERE (COALESCE(s.is_active, false) OR b.id IS NOT NULL)
     AND public.role_has_institution_access(s.institution_id)
   -- Unrecorded first, then recorded-but-unverified, then done.
   ORDER BY (b.id IS NOT NULL), (b.verified_at IS NOT NULL), i.name, 3;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_staff_bank_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_bank_directory() TO authenticated, service_role;
