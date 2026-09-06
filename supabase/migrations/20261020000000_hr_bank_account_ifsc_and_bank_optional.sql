-- The account number alone is now enough to record a bank account.
--
-- WHY THIS CHANGES. The original table demanded account number + IFSC + bank
-- name together, on the reasoning that a destination is not a destination until
-- it is complete. In practice the data arrives in pieces: the finance salary
-- registers carry an account number per person and nothing else, and refusing
-- the row entirely meant the number sat in a spreadsheet instead of in the
-- system, which is strictly worse for both audit and correctness.
--
-- SO THE RULE MOVES RATHER THAN DISAPPEARS. It is no longer "you may not record
-- an incomplete account"; it is "an incomplete account is not payable". The
-- format checks are untouched -- a MALFORMED IFSC is still rejected, because a
-- wrong IFSC is worse than an absent one. Absent says "we do not know yet";
-- wrong says "we know, confidently, and we are wrong", and only the second one
-- silently pays the wrong branch.
--
-- WHAT ENFORCES PAYABILITY. Nothing in this schema, deliberately -- there is no
-- payout or bank-file path in the codebase yet. When one is built, it MUST
-- filter on ifsc_code IS NOT NULL rather than on the mere existence of a row.
-- The directory RPC already returns ifsc_code, so the UI marks these rows
-- "Incomplete" and they can never be mistaken for ready.
--
-- NOT RELAXED: account_number and account_holder_name stay NOT NULL. The first
-- is the entire point of the record; the second is what a bank matches on, and
-- it defaults to the HR name rather than being guessed at.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_staff_bank_accounts
  ALTER COLUMN ifsc_code DROP NOT NULL,
  ALTER COLUMN bank_name DROP NOT NULL;

-- The inline CHECKs from 20260821240000 were auto-named <table>_<column>_check.
-- Dropped and re-added under explicit names so a later migration is not guessing.
ALTER TABLE public.hr_staff_bank_accounts
  DROP CONSTRAINT IF EXISTS hr_staff_bank_accounts_ifsc_code_check,
  DROP CONSTRAINT IF EXISTS hr_staff_bank_accounts_bank_name_check;

-- NULL is allowed; a present value must still be a real IFSC. Empty string is
-- NOT a third state -- the RPC folds '' to NULL so "unknown" has one spelling.
ALTER TABLE public.hr_staff_bank_accounts
  ADD CONSTRAINT hr_staff_bank_accounts_ifsc_format
    CHECK (ifsc_code IS NULL OR ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

ALTER TABLE public.hr_staff_bank_accounts
  ADD CONSTRAINT hr_staff_bank_accounts_bank_name_nonblank
    CHECK (bank_name IS NULL OR length(trim(bank_name)) > 0);

COMMENT ON COLUMN public.hr_staff_bank_accounts.ifsc_code IS
  'NULL = not captured yet. A row without an IFSC is RECORDED BUT NOT PAYABLE -- any payout or bank-file query must filter on ifsc_code IS NOT NULL.';
COMMENT ON COLUMN public.hr_staff_bank_accounts.bank_name IS
  'NULL = not captured yet. Optional since 2026-09-02; the account number alone is enough to record a row.';

-- ---------------------------------------------------------------------------
-- The write path
-- ---------------------------------------------------------------------------
-- Two changes from 20260821250000:
--   1. IFSC and bank name are optional, and blank folds to NULL.
--   2. The "same destination, do nothing" test uses IS NOT DISTINCT FROM.
--      This is the subtle one. The old test read
--          v_current.ifsc_code = v_ifsc
--      which under NULL = NULL yields NULL, not true -- so re-saving an
--      IFSC-less account would fail the short-circuit and supersede itself,
--      quietly filling the history with duplicates of the same number.
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
  -- nullif(...,'') is what makes "absent" a single value rather than two.
  v_ifsc    text := nullif(upper(trim(coalesce(p_ifsc_code, ''))), '');
  v_bank    text := nullif(trim(coalesce(p_bank_name, '')), '');
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
  -- Absent is fine. Present and malformed is not, and never will be.
  IF v_ifsc IS NOT NULL AND v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'IFSC must be 4 letters, then 0, then 6 letters or digits'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':bank', 0));

  SELECT id, account_number, ifsc_code INTO v_current
    FROM public.hr_staff_bank_accounts
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-saving the identical destination would bury the real history under
  -- duplicates, so the incumbent is returned untouched instead.
  IF FOUND
     AND v_current.account_number IS NOT DISTINCT FROM v_acct
     AND v_current.ifsc_code      IS NOT DISTINCT FROM v_ifsc THEN
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
    v_bank, nullif(trim(coalesce(p_branch_name, '')), ''),
    coalesce(p_account_type, 'savings'), coalesce(p_effective_from, CURRENT_DATE),
    p_notes, auth.uid(), auth.uid()
  );

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_set_staff_bank_account(uuid, text, text, text, text, text, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_bank_account(uuid, text, text, text, text, text, text, date, text) TO authenticated, service_role;
