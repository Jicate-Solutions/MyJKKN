-- Migration: 20270614090000_hr_pay_destination_changes
-- ============================================================================
-- Where pay goes: a log of every bank-account and paying-trust change, and a
-- weekly list of them for the Director list.
--
-- Director ruling, 1 Oct 2026 (AskUserQuestion, pane f007c6fb): the HR head
-- MAY change a person's bank account and paying trust, and every such change
-- goes on a weekly list to the Director list (director@ and isvarya@): who
-- changed what, and when. Changing the account a salary is paid into is the
-- classic way pay is stolen, and until now nothing recorded WHO did it:
--   * hr_staff_bank_accounts keeps old rows (superseded_by), but no reader
--     shows them side by side and created_by is not surfaced anywhere;
--   * hr_staff_payroll keeps ONE row per person and upserts over it, so a
--     change of paying trust leaves no trace at all.
--
-- What this adds:
--   1. hr_pay_destination_changes: one row per change, written ONLY by the
--      triggers below (no insert/update/delete policy, no grant to write).
--      Account numbers are stored MASKED (last 4 digits): the log is a list
--      for a person to read, not a second copy of everyone's bank details.
--      Each row keeps who it was for (name, code, college) and survives a
--      staff delete (staff_id goes NULL), so the history cannot be erased
--      by deleting the person.
--   2. Triggers on both tables. They fire for every write path (the staff
--      form, the bank-account RPC, the payroll-organisation page, bulk
--      assignment, imports), because they sit on the tables, not the screens.
--      Guards refuse the two writes the log could not describe: moving a
--      bank row or a payer row to a different person (staff_id), and
--      pointing one person's bank row at another person's (superseded_by).
--   3. Triggers on the salary register's copies of both:
--      hr_salary_register_lines.bank_account_number (the number the Bank
--      Letter and bank statement print) and paid_by_organization_id (the
--      paying trust a register line names). An edit to either, or a line
--      written with a value that is not the one on file, is logged too.
--   4. fn_hr_pay_destination_changes(p_since, p_until): the list, with names,
--      for the Director list or the weekly job (service_role) only. At most
--      2,000 rows; every row carries total_count, the true number of changes.
--   5. A Monday 08:17 IST schedule row for the weekly notice.
--
-- Every write path, checked against main on 9 Oct 2026:
--   hr_staff_bank_accounts  fn_hr_set_staff_bank_account (the HR bank page
--                           and the staff form), StaffBankAccountService
--                           .setVerified, and any direct write a
--                           bank.manage holder makes (FOR ALL policy).
--   hr_staff_payroll        StaffPayrollService.setPayer / setPayersBulk /
--                           clearPayer (payroll-organisation page, staff form),
--                           and any direct write an institution.manage holder
--                           makes (FOR ALL policy).
--   hr_salary_register_lines.bank_account_number and .paid_by_organization_id
--                           written by register generation; editable by a
--                           register.manage holder (UPDATE policy).
-- No server route writes any of them with the service role today; the
-- salary import only READS hr_staff_payroll.
--
-- The log starts when this is applied. Changes made before then are not
-- reconstructed (the payer table never kept them).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_pay_destination_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: deleting a staff record must not erase the history
  -- of where their pay went. The snapshot below keeps who it was.
  staff_id    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  -- The person as they were when the change was made, filled by
  -- fn_hr_pay_destination_snapshot(). The list prefers the live record and
  -- falls back to these once the staff record is gone.
  staff_name  text,
  staff_code  text,
  college     text,
  -- bank: the account on file. payer: the paying trust. register_bank and
  -- register_payer: the account number and the paying trust on one salary
  -- register line (their own kinds, so they never count as what is on file
  -- when the next bank or payer change looks back).
  kind        text NOT NULL CHECK (kind IN ('bank', 'payer', 'register_bank', 'register_payer')),
  -- auth.uid() of whoever made the change. NULL = nobody was signed in: a
  -- server job or a change made straight in the database. The list says so.
  changed_by  uuid,
  -- clock_timestamp(), not now(): two changes in one transaction keep their order.
  changed_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- bank:  { holder, account_last4, ifsc, bank }   (never the full number)
  -- payer: { organization_id, organization_name }
  -- register_bank:  { account_last4, register_run_id, differs_from_file }
  -- register_payer: { organization_id, organization_name, register_run_id, differs_from_file }
  -- NULL before = first time recorded; NULL after = removed.
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_pay_destination_changes_changed_at
  ON public.hr_pay_destination_changes (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_pay_destination_changes_staff
  ON public.hr_pay_destination_changes (staff_id, changed_at DESC);

ALTER TABLE public.hr_pay_destination_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_pay_destination_changes_select_director ON public.hr_pay_destination_changes;
CREATE POLICY hr_pay_destination_changes_select_director
  ON public.hr_pay_destination_changes
  FOR SELECT TO authenticated
  USING (public.fn_is_the_director());
-- No INSERT / UPDATE / DELETE policy: only the SECURITY DEFINER triggers write.

REVOKE ALL ON public.hr_pay_destination_changes FROM anon, PUBLIC;
GRANT SELECT ON public.hr_pay_destination_changes TO authenticated;

COMMENT ON TABLE public.hr_pay_destination_changes IS
  'Every change to where a person''s pay goes: bank account (masked), paying trust, or either one as copied onto a salary register line. Written only by triggers on hr_staff_bank_accounts, hr_staff_payroll and hr_salary_register_lines; readable only by the Director list. Director ruling 1 Oct 2026. Migration 20270614090000.';

-- ----------------------------------------------------------------------------
-- 1b. Who the change was for, kept on the row
-- ----------------------------------------------------------------------------
-- Filled on every insert from the staff record, so a later staff delete
-- (staff_id goes NULL) still leaves a name, code and college on the list.
-- SECURITY INVOKER: it only ever runs inside the SECURITY DEFINER logging
-- triggers below, the only writers of this table.
CREATE OR REPLACE FUNCTION public.fn_hr_pay_destination_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    SELECT NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), ''), s.staff_id::text, i.name::text
      INTO NEW.staff_name, NEW.staff_code, NEW.college
      FROM public.staff s
      LEFT JOIN public.institutions i ON i.id = s.institution_id
     WHERE s.id = NEW.staff_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_pay_destination_snapshot() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_pay_destination_snapshot ON public.hr_pay_destination_changes;
CREATE TRIGGER trg_hr_pay_destination_snapshot
  BEFORE INSERT ON public.hr_pay_destination_changes
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_pay_destination_snapshot();

-- ----------------------------------------------------------------------------
-- 2. What one bank row looks like in the log (never the full number)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_bank_destination_json(
  p_holder text, p_account text, p_ifsc text, p_bank text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'holder', p_holder,
    'account_last4', CASE WHEN p_account IS NULL THEN NULL ELSE right(p_account, 4) END,
    'ifsc', p_ifsc,
    'bank', p_bank
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_bank_destination_json(text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_bank_destination_json(text, text, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2b. Guards: a row belongs to one person
-- ----------------------------------------------------------------------------
-- The log is written per person. Two direct writes would move pay between
-- people in a way no per-person entry describes, so they are refused:
--   * changing staff_id on a bank row or a payer row (the account, or the
--     trust, silently becomes someone else's);
--   * pointing one person's bank row at another person's (superseded_by),
--     in either order: the pointer first and the row later, or the reverse.
-- No screen or function does either: the save function and the payer upserts
-- always keep staff_id, and the save function only ever points a person's old
-- row at their own new one. SECURITY DEFINER so the check sees every row,
-- not only the colleges the writer's own access shows.
CREATE OR REPLACE FUNCTION public.fn_hr_bank_account_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.staff_id IS DISTINCT FROM NEW.staff_id THEN
    RAISE EXCEPTION 'A bank account belongs to one person. Record a new account for the other person instead of moving this one.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.superseded_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts n
                  WHERE n.id = NEW.superseded_by AND n.staff_id IS DISTINCT FROM NEW.staff_id) THEN
    RAISE EXCEPTION 'A bank account can only be replaced by another account of the same person.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts o
              WHERE o.superseded_by = NEW.id AND o.id <> NEW.id
                AND o.staff_id IS DISTINCT FROM NEW.staff_id) THEN
    RAISE EXCEPTION 'A bank account can only be replaced by another account of the same person.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_bank_account_owner_guard() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_bank_account_owner_guard ON public.hr_staff_bank_accounts;
CREATE TRIGGER trg_hr_bank_account_owner_guard
  BEFORE INSERT OR UPDATE ON public.hr_staff_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_bank_account_owner_guard();

CREATE OR REPLACE FUNCTION public.fn_hr_staff_payroll_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.staff_id IS DISTINCT FROM NEW.staff_id THEN
    RAISE EXCEPTION 'A paying-trust record belongs to one person. Record the trust for the other person instead of moving this one.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_staff_payroll_owner_guard() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_staff_payroll_owner_guard ON public.hr_staff_payroll;
CREATE TRIGGER trg_hr_staff_payroll_owner_guard
  BEFORE UPDATE OF staff_id ON public.hr_staff_payroll
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_staff_payroll_owner_guard();

-- ----------------------------------------------------------------------------
-- 3. Trigger: bank accounts
-- ----------------------------------------------------------------------------
-- Every way the account in use can change is logged, because the table's
-- write policy lets a bank.manage holder write it directly, not only through
-- fn_hr_set_staff_bank_account():
--   * a new row becomes the account in use (the save function, or a direct
--     insert), or an old row is put back in use;
--   * the account in use is edited in place (number, IFSC, holder or bank);
--   * the account in use is deleted, or superseded with nothing in its place.
-- Verifying it, touching its notes, or editing an old superseded row is NOT a
-- change of destination and is ignored.
CREATE OR REPLACE FUNCTION public.fn_hr_log_bank_destination_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Deleting the account in use leaves the person with nowhere to be paid:
    -- logged as removed. Deleting an old, superseded row is not a change of
    -- destination. A staff delete cascades here: the record is already gone,
    -- so there is no one to name and the foreign key would refuse the row.
    -- That case is skipped; the person's earlier log rows stay (staff_id
    -- set to NULL, name kept by the snapshot).
    IF OLD.superseded_by IS NULL
       AND EXISTS (SELECT 1 FROM public.staff s WHERE s.id = OLD.staff_id) THEN
      INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
      VALUES (OLD.staff_id, 'bank', auth.uid(),
              public.fn_hr_bank_destination_json(OLD.account_holder_name, OLD.account_number, OLD.ifsc_code, OLD.bank_name),
              NULL);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.superseded_by IS NOT NULL THEN
    -- The row is not (or no longer) the account in use. Normally the row that
    -- replaces it logs the change. But if it was the account in use and now
    -- points at a row that already exists and is itself not in use, nothing
    -- is in use any more: that is a removal.
    IF TG_OP = 'UPDATE' AND OLD.superseded_by IS NULL
       AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts n
                    WHERE n.id = NEW.superseded_by AND n.superseded_by IS NOT NULL) THEN
      INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
      VALUES (NEW.staff_id, 'bank', auth.uid(),
              public.fn_hr_bank_destination_json(OLD.account_holder_name, OLD.account_number, OLD.ifsc_code, OLD.bank_name),
              NULL);
    END IF;
    -- The same thing in the other order: the account in use was pointed at
    -- an id that did not exist yet (the update above could not see it), and
    -- that id is now inserted already retired. The person is left with
    -- nothing in use. Logged once: not when the log already says removed.
    IF TG_OP = 'INSERT'
       AND EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts o
                    WHERE o.superseded_by = NEW.id AND o.id <> NEW.id)
       AND NOT EXISTS (SELECT 1 FROM public.hr_staff_bank_accounts c
                        WHERE c.staff_id = NEW.staff_id AND c.superseded_by IS NULL)
       AND COALESCE((SELECT l.after IS NOT NULL FROM public.hr_pay_destination_changes l
                      WHERE l.staff_id = NEW.staff_id AND l.kind = 'bank'
                      ORDER BY l.changed_at DESC LIMIT 1), true) THEN
      SELECT public.fn_hr_bank_destination_json(o.account_holder_name, o.account_number, o.ifsc_code, o.bank_name)
        INTO v_before
        FROM public.hr_staff_bank_accounts o
       WHERE o.superseded_by = NEW.id AND o.id <> NEW.id
       ORDER BY o.updated_at DESC
       LIMIT 1;
      INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
      VALUES (NEW.staff_id, 'bank', auth.uid(), v_before, NULL);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.superseded_by IS NULL THEN
    -- The account in use, edited in place. Verifying it or touching its notes
    -- is not a change of destination.
    IF OLD.account_number      IS DISTINCT FROM NEW.account_number
    OR OLD.ifsc_code           IS DISTINCT FROM NEW.ifsc_code
    OR OLD.account_holder_name IS DISTINCT FROM NEW.account_holder_name
    OR OLD.bank_name           IS DISTINCT FROM NEW.bank_name THEN
      INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
      VALUES (NEW.staff_id, 'bank', auth.uid(),
              public.fn_hr_bank_destination_json(OLD.account_holder_name, OLD.account_number, OLD.ifsc_code, OLD.bank_name),
              public.fn_hr_bank_destination_json(NEW.account_holder_name, NEW.account_number, NEW.ifsc_code, NEW.bank_name));
    END IF;
    RETURN NEW;
  END IF;

  -- A row has just become the account in use: a new row, or an old row put
  -- back in use. What it replaced is, in order:
  --   1. the row whose superseded_by points at it (fn_hr_set_staff_bank_account
  --      stamps that before it inserts);
  --   2. otherwise the last destination the log recorded for this person.
  --      This is what catches "delete the old row, then insert a new one":
  --      the old row is gone, but the log saw it (as removed) and keeps it.
  SELECT public.fn_hr_bank_destination_json(b.account_holder_name, b.account_number, b.ifsc_code, b.bank_name)
    INTO v_before
    FROM public.hr_staff_bank_accounts b
   WHERE b.staff_id = NEW.staff_id AND b.superseded_by = NEW.id AND b.id <> NEW.id
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF v_before IS NULL THEN
    SELECT COALESCE(c.after, c.before)
      INTO v_before
      FROM public.hr_pay_destination_changes c
     WHERE c.staff_id = NEW.staff_id AND c.kind = 'bank'
     ORDER BY c.changed_at DESC
     LIMIT 1;
  END IF;

  INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
  VALUES (NEW.staff_id, 'bank', auth.uid(), v_before,
          public.fn_hr_bank_destination_json(NEW.account_holder_name, NEW.account_number, NEW.ifsc_code, NEW.bank_name));
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_log_bank_destination_change() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_log_bank_destination_change ON public.hr_staff_bank_accounts;
CREATE TRIGGER trg_hr_log_bank_destination_change
  AFTER INSERT OR UPDATE OR DELETE ON public.hr_staff_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_log_bank_destination_change();

-- ----------------------------------------------------------------------------
-- 4. Trigger: paying trust
-- ----------------------------------------------------------------------------
-- hr_staff_payroll holds one row per person and is upserted over, so the old
-- trust survives only in OLD here. Removing the payer (DELETE) is logged too.
CREATE OR REPLACE FUNCTION public.fn_hr_log_payer_destination_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
  v_staff  uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.hr_organization_id IS NOT DISTINCT FROM NEW.hr_organization_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT jsonb_build_object('organization_id', o.id, 'organization_name', o.name)
      INTO v_before FROM public.hr_organizations o WHERE o.id = OLD.hr_organization_id;
    v_before := COALESCE(v_before, jsonb_build_object('organization_id', OLD.hr_organization_id, 'organization_name', NULL));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT jsonb_build_object('organization_id', o.id, 'organization_name', o.name)
      INTO v_after FROM public.hr_organizations o WHERE o.id = NEW.hr_organization_id;
    v_after := COALESCE(v_after, jsonb_build_object('organization_id', NEW.hr_organization_id, 'organization_name', NULL));
  END IF;

  v_staff := CASE WHEN TG_OP = 'DELETE' THEN OLD.staff_id ELSE NEW.staff_id END;
  -- A staff delete cascades here: the record is already gone, so the row is
  -- skipped. The person's earlier log rows stay (staff_id NULL, name kept).
  IF EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff) THEN
    INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
    VALUES (v_staff, 'payer', auth.uid(), v_before, v_after);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_log_payer_destination_change() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_log_payer_destination_change ON public.hr_staff_payroll;
CREATE TRIGGER trg_hr_log_payer_destination_change
  AFTER INSERT OR UPDATE OF hr_organization_id OR DELETE ON public.hr_staff_payroll
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_log_payer_destination_change();

-- ----------------------------------------------------------------------------
-- 4b. Trigger: the account number printed on a salary register
-- ----------------------------------------------------------------------------
-- Register generation copies each person's account in use onto their line,
-- and the Bank Letter and bank statement print that copy. A register.manage
-- holder can update a line directly, so the copy is a second place where
-- pay can be sent elsewhere without touching the account on file. Logged:
--   * an edit of the number on a line (before and after, both masked);
--   * a line written, or moved to another person, with a number that is not
--     that person's account on file.
-- A line written with the account on file (normal generation), or with no
-- number, is not a change. Other edits (adjustments, remarks, hand-entered
-- days) do not touch this column and do not fire.
CREATE OR REPLACE FUNCTION public.fn_hr_log_register_bank_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_number text;
  v_file        jsonb;
  v_before      jsonb;
  v_after       jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.bank_account_number IS NOT DISTINCT FROM NEW.bank_account_number
     AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number THEN
    v_before := CASE WHEN OLD.bank_account_number IS NULL THEN NULL ELSE
      public.fn_hr_bank_destination_json(NULL, OLD.bank_account_number, NULL, NULL)
        || jsonb_build_object('register_run_id', OLD.run_id) END;
    v_after := CASE WHEN NEW.bank_account_number IS NULL THEN NULL ELSE
      public.fn_hr_bank_destination_json(NULL, NEW.bank_account_number, NULL, NULL)
        || jsonb_build_object('register_run_id', NEW.run_id) END;
  ELSE
    -- A new line, or a line moved to another person with its number.
    IF NEW.bank_account_number IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT b.account_number,
           public.fn_hr_bank_destination_json(b.account_holder_name, b.account_number, b.ifsc_code, b.bank_name)
      INTO v_file_number, v_file
      FROM public.hr_staff_bank_accounts b
     WHERE b.staff_id = NEW.staff_id AND b.superseded_by IS NULL;
    IF v_file_number IS NOT DISTINCT FROM NEW.bank_account_number THEN
      RETURN NEW;
    END IF;
    v_before := v_file;
    v_after := public.fn_hr_bank_destination_json(NULL, NEW.bank_account_number, NULL, NULL)
      || jsonb_build_object('register_run_id', NEW.run_id, 'differs_from_file', true);
  END IF;

  INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
  VALUES (NEW.staff_id, 'register_bank', auth.uid(), v_before, v_after);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_log_register_bank_change() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_log_register_bank_change ON public.hr_salary_register_lines;
CREATE TRIGGER trg_hr_log_register_bank_change
  AFTER INSERT OR UPDATE OF bank_account_number, staff_id ON public.hr_salary_register_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_log_register_bank_change();

-- The paying trust on a register line (paid_by_organization_id), the same
-- way: an edit of it is logged, and so is a line written, or moved to another
-- person, naming a trust that is not that person's paying trust on file
-- (hr_staff_payroll). A line written with the trust on file, or with no
-- trust, is not a change.
CREATE OR REPLACE FUNCTION public.fn_hr_log_register_payer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_org uuid;
  v_before   jsonb;
  v_after    jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.paid_by_organization_id IS NOT DISTINCT FROM NEW.paid_by_organization_id
     AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.paid_by_organization_id IS DISTINCT FROM NEW.paid_by_organization_id THEN
    IF OLD.paid_by_organization_id IS NOT NULL THEN
      SELECT jsonb_build_object('organization_id', OLD.paid_by_organization_id, 'organization_name', o.name,
                                'register_run_id', OLD.run_id)
        INTO v_before FROM (SELECT 1) x LEFT JOIN public.hr_organizations o ON o.id = OLD.paid_by_organization_id;
    END IF;
    IF NEW.paid_by_organization_id IS NOT NULL THEN
      SELECT jsonb_build_object('organization_id', NEW.paid_by_organization_id, 'organization_name', o.name,
                                'register_run_id', NEW.run_id)
        INTO v_after FROM (SELECT 1) x LEFT JOIN public.hr_organizations o ON o.id = NEW.paid_by_organization_id;
    END IF;
  ELSE
    -- A new line, or a line moved to another person with its trust. A line
    -- naming no trust is a gap the register already reports, not a change
    -- (and is what a generator who cannot read payers would write for all).
    IF NEW.paid_by_organization_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT p.hr_organization_id INTO v_file_org
      FROM public.hr_staff_payroll p WHERE p.staff_id = NEW.staff_id;
    IF v_file_org IS NOT DISTINCT FROM NEW.paid_by_organization_id THEN
      RETURN NEW;
    END IF;
    IF v_file_org IS NOT NULL THEN
      SELECT jsonb_build_object('organization_id', v_file_org, 'organization_name', o.name)
        INTO v_before FROM (SELECT 1) x LEFT JOIN public.hr_organizations o ON o.id = v_file_org;
    END IF;
    SELECT jsonb_build_object('organization_id', NEW.paid_by_organization_id, 'organization_name', o.name,
                              'register_run_id', NEW.run_id, 'differs_from_file', true)
      INTO v_after FROM (SELECT 1) x LEFT JOIN public.hr_organizations o ON o.id = NEW.paid_by_organization_id;
  END IF;

  INSERT INTO public.hr_pay_destination_changes (staff_id, kind, changed_by, before, after)
  VALUES (NEW.staff_id, 'register_payer', auth.uid(), v_before, v_after);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_log_register_payer_change() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_hr_log_register_payer_change ON public.hr_salary_register_lines;
CREATE TRIGGER trg_hr_log_register_payer_change
  AFTER INSERT OR UPDATE OF paid_by_organization_id, staff_id ON public.hr_salary_register_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_log_register_payer_change();

-- ----------------------------------------------------------------------------
-- 5. The list, with names, for the Director list and the weekly job
-- ----------------------------------------------------------------------------
-- p_until bounds the weekly notice to one fixed IST week (Monday 00:00 to
-- the next Monday 00:00), so a late or retried run neither skips nor repeats
-- changes. NULL = up to now (the panel).
DROP FUNCTION IF EXISTS public.fn_hr_pay_destination_changes(timestamptz);
CREATE OR REPLACE FUNCTION public.fn_hr_pay_destination_changes(p_since timestamptz, p_until timestamptz DEFAULT NULL)
RETURNS TABLE (
  change_id       uuid,
  staff_id        uuid,
  staff_name      text,
  staff_code      text,
  college         text,
  kind            text,
  before          jsonb,
  after           jsonb,
  changed_by_name text,
  changed_at      timestamptz,
  -- Every matching change, before the 2,000-row cap: readers must show it
  -- so nothing past the cap goes unmentioned.
  total_count     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Written so a NULL can never pass: both answers must be a plain yes.
  IF NOT (COALESCE(public.fn_is_the_director(), false) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Only the Director list can read the bank and payer change list.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- LEFT joins: a change whose staff record was deleted still lists, named
  -- from the snapshot kept on the row.
  SELECT c.id,
         c.staff_id,
         COALESCE(NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), ''), c.staff_name) AS staff_name,
         COALESCE(s.staff_id::text, c.staff_code),
         COALESCE(i.name::text, c.college),
         c.kind,
         c.before,
         c.after,
         CASE WHEN c.changed_by IS NULL THEN 'nobody signed in (a server job or a database change)'
              ELSE COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'unknown account') END,
         c.changed_at,
         count(*) OVER ()
    FROM public.hr_pay_destination_changes c
    LEFT JOIN public.staff s ON s.id = c.staff_id
    LEFT JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.profiles p ON p.id = c.changed_by
   WHERE c.changed_at >= COALESCE(p_since, now() - interval '7 days')
     AND (p_until IS NULL OR c.changed_at < p_until)
   ORDER BY c.changed_at DESC
   LIMIT 2000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz, timestamptz) IS
  'Bank-account and paying-trust changes, on file or on a salary register line, from p_since (default 7 days ago) up to p_until (default now), newest first, with the person, their college and who made the change; at most 2,000 rows, total_count gives the true number. Director list or service_role only. Migration 20270614090000.';

-- ----------------------------------------------------------------------------
-- 6. Monday 08:17 IST, off the :00/:30 marks (minute_of_day 497)
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('hr-pay-destination-weekly', true, true, ARRAY[1]::smallint[], 497)
ON CONFLICT (routine_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
