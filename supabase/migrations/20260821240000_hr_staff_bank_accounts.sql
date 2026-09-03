-- WHERE THE MONEY LANDS. The payment destination for a staff member.
--
-- WHY ITS OWN TABLE
-- -----------------
-- Not on staff, for the reason hr_staff_payroll and hr_staff_salaries are also
-- separate: RLS is row-level, and StaffService, /api/api-management/staff and
-- the MCP server all select('*'), so a column here would be readable by
-- everyone who can read the staff row.
--
-- Not on hr_staff_salaries either, which is the tempting shortcut. That table
-- supersedes on every raise; a bank account has nothing to do with a pay
-- revision, so riding along would copy the account number into every historical
-- salary row and leave "which account do we pay into" without one answer.
--
-- ONE CURRENT ACCOUNT PER PERSON, superseded rather than updated. Editing an
-- account number just before a payout run is the classic payroll fraud vector,
-- so the previous value is never destroyed -- who changed it, when, and what it
-- was are all still readable afterwards. Same partial-unique + superseded_by
-- shape as hr_staff_salaries, and the same DEFERRABLE foreign key for the same
-- reason (the RPC points the incumbent at a row inserted one statement later,
-- and a partial unique INDEX cannot be deferred).
--
-- SPLIT PAYMENTS ARE NOT MODELLED. There is no is_primary flag and no second
-- account, because nothing in this organisation splits a salary across
-- accounts today. Adding a flag "just in case" would put a decision in the
-- schema that nobody has made.
--
-- STATUTORY IDS (PAN / UAN / ESI) ARE DELIBERATELY ABSENT. The payslip prints
-- them; the bank file does not. They belong with payroll identity rather than
-- payment destination, and are best added as their own table when a payslip
-- actually needs to print one -- not guessed at now.

CREATE TABLE IF NOT EXISTS public.hr_staff_bank_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- As printed by the BANK, which is frequently not the name HR holds
  -- (initials expanded, married name, order reversed). A transfer is rejected
  -- on a name mismatch, so this is captured rather than derived from staff.
  account_holder_name text NOT NULL CHECK (length(trim(account_holder_name)) > 0),

  -- Digits only. Stored as text: an account number is an identifier, not a
  -- quantity -- numeric would eat leading zeros and overflow on longer numbers.
  account_number      text NOT NULL CHECK (account_number ~ '^[0-9]{6,20}$'),

  -- Indian IFSC: 4 letters, then a literal 0, then 6 alphanumerics. Enforced
  -- here as well as in the UI because a malformed code does not bounce loudly;
  -- it fails the payout quietly or pays the wrong branch.
  ifsc_code           text NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),

  bank_name           text NOT NULL CHECK (length(trim(bank_name)) > 0),
  branch_name         text,
  account_type        text NOT NULL DEFAULT 'savings'
                        CHECK (account_type IN ('savings', 'current')),

  -- "Somebody checked this against a passbook or cancelled cheque."
  -- A wrong IFSC or account number does not raise an error -- it silently pays
  -- the wrong person -- so the distinction between entered and verified is the
  -- only thing standing between a typo and a misdirected salary.
  verified_at         timestamptz,
  verified_by         uuid,

  effective_from      date NOT NULL DEFAULT CURRENT_DATE,
  -- Set when a later row replaces this one. NULL = the account in use.
  superseded_by       uuid REFERENCES public.hr_staff_bank_accounts(id)
                        DEFERRABLE INITIALLY DEFERRED,
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_bank_accounts_one_current
  ON public.hr_staff_bank_accounts (staff_id)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS hr_staff_bank_accounts_staff_idx
  ON public.hr_staff_bank_accounts (staff_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_hr_staff_bank_accounts_updated_at ON public.hr_staff_bank_accounts;
CREATE TRIGGER trg_hr_staff_bank_accounts_updated_at
  BEFORE UPDATE ON public.hr_staff_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- NOTE THE DIFFERENCE FROM hr_staff_salaries: there is no "read your own row"
-- clause. The salary table has one because a payslip screen would otherwise be
-- unbuildable for ordinary staff. No such screen exists for bank accounts, and
-- opening the read path before there is something to read it widens the blast
-- radius for nothing.
ALTER TABLE public.hr_staff_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_staff_bank_accounts_service_role ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_service_role ON public.hr_staff_bank_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS hr_staff_bank_accounts_select ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_select ON public.hr_staff_bank_accounts
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.view'))
  );

DROP POLICY IF EXISTS hr_staff_bank_accounts_write ON public.hr_staff_bank_accounts;
CREATE POLICY hr_staff_bank_accounts_write ON public.hr_staff_bank_accounts
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.manage'))
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.user_has_permission('hr.payroll.bank.manage'))
  );

COMMENT ON TABLE public.hr_staff_bank_accounts IS
  'Payment destination for a staff member. One current account per person, superseded rather than updated so a changed account number leaves a trail.';
COMMENT ON COLUMN public.hr_staff_bank_accounts.account_holder_name IS
  'The name AS THE BANK HOLDS IT, which often differs from the HR record. A transfer is rejected on a name mismatch.';
COMMENT ON COLUMN public.hr_staff_bank_accounts.verified_at IS
  'Somebody checked this against a passbook or cancelled cheque. A wrong account number does not error -- it pays the wrong person.';

-- ---------------------------------------------------------------------------
-- Grants. A key in lib/constants/permissions.ts does nothing until it is in a
-- role's JSONB. HR HEAD ALONE, matching the salary decision of the same day --
-- the Super Administrator reaches it through is_super_admin() and needs no
-- stored grant.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.payroll.bank.view',   true,
                               'hr.payroll.bank.manage', true),
       updated_at = now()
 WHERE is_active AND role_key = 'hr_head';

-- Everyone else is stored as an explicit denial rather than left absent: a
-- key-PRESENCE test reads an absent key and a false one differently, and
-- Role Management rewrites the whole catalogue on every save.
UPDATE public.custom_roles
   SET permissions = permissions
         || jsonb_build_object('hr.payroll.bank.view',   false,
                               'hr.payroll.bank.manage', false),
       updated_at = now()
 WHERE is_active AND role_key NOT IN ('hr_head', 'super_admin');
