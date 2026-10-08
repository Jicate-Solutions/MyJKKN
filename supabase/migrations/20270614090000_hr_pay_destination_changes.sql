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
--   2. Triggers on both tables. They fire for every write path (the staff
--      form, the bank-account RPC, the payroll-organisation page, bulk
--      assignment, imports), because they sit on the tables, not the screens.
--   3. fn_hr_pay_destination_changes(p_since): the list, with names, for the
--      Director list or the weekly job (service_role) only.
--   4. A Monday 08:17 IST schedule row for the weekly notice.
--
-- The log starts when this is applied. Changes made before then are not
-- reconstructed (the payer table never kept them).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_pay_destination_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('bank', 'payer')),
  -- auth.uid() of whoever made the change; NULL = a system job (service role).
  changed_by  uuid,
  -- clock_timestamp(), not now(): two changes in one transaction keep their order.
  changed_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- bank:  { holder, account_last4, ifsc, bank }   (never the full number)
  -- payer: { organization_id, organization_name }
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
  'Every change to where a person''s pay goes: bank account (masked) or paying trust. Written only by triggers on hr_staff_bank_accounts and hr_staff_payroll; readable only by the Director list. Director ruling 1 Oct 2026. Migration 20270614090000.';

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
    -- destination. A staff delete cascades here; the log row would cascade
    -- away with it, so that case is skipped.
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
  -- A staff delete cascades here; the log row would cascade away with it.
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
-- 5. The list, with names, for the Director list and the weekly job
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_pay_destination_changes(p_since timestamptz)
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
  changed_at      timestamptz
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
  SELECT c.id,
         c.staff_id,
         NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), '') AS staff_name,
         s.staff_id::text,
         i.name::text,
         c.kind,
         c.before,
         c.after,
         CASE WHEN c.changed_by IS NULL THEN 'a system job'
              ELSE COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'unknown account') END,
         c.changed_at
    FROM public.hr_pay_destination_changes c
    JOIN public.staff s ON s.id = c.staff_id
    LEFT JOIN public.institutions i ON i.id = s.institution_id
    LEFT JOIN public.profiles p ON p.id = c.changed_by
   WHERE c.changed_at >= COALESCE(p_since, now() - interval '7 days')
   ORDER BY c.changed_at DESC
   LIMIT 2000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_pay_destination_changes(timestamptz) IS
  'Bank-account and paying-trust changes since p_since (default 7 days), newest first, with the person, their college and who made the change. Director list or service_role only. Migration 20270614090000.';

-- ----------------------------------------------------------------------------
-- 6. Monday 08:17 IST, off the :00/:30 marks (minute_of_day 497)
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('hr-pay-destination-weekly', true, true, ARRAY[1]::smallint[], 497)
ON CONFLICT (routine_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
