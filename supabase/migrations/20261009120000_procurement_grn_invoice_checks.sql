-- ============================================================================
-- Migration: 20261009120000_procurement_grn_invoice_checks
-- Updated: 2026-10-09 - Invoice checks I1-I4 for goods receipts (audit trail +
--                       near-expiry setting). Spec: Draft PR #4289.
-- ============================================================================
-- The invoice checks themselves run APP-SIDE and deterministically
-- (lib/services/procurement/invoice-checks.ts, applied by the GRN form and by
-- ProcurementGrnService.createGrnAgainstPO). The model only reads the PDF. This
-- migration adds only what those checks need to RECORD, plus the one server-side
-- rule the Director asked to be enforced below the app:
--
--   1. procurement_grn.duplicate_confirmed_by / _at  (I1 - who confirmed that a
--      repeated invoice number is genuinely a different invoice, and when)
--   2. procurement_grn.late_invoice_reason           (I4 - why an invoice older than
--      the receiver's limit was accepted)
--   3. platform_policies 'procurement.invoice.near_expiry_days' = 30  (I2 window,
--      one global value, changeable without new code)
--   4. trg_pgrn_invoice_checks - a duplicate confirmation is valid only when it is
--      made by the signed-in user themself, that user holds verify rights
--      (super admin / admin / procurement.grn_verify, the same test
--      fn_procurement_guard_approval applies to verifying), and that user is NOT
--      the GRN's received_by. The time is stamped here, never trusted from the
--      client. Institution scope is already enforced by the pgrn_institution_scope
--      RLS policy on the INSERT/UPDATE itself.
--
--   5. I1 HELD SAVE (Director 2026-10-09): a receipt whose invoice number repeats an
--      earlier one from the same supplier is saved, but cannot be VERIFIED until
--      that confirmation exists. Enforced by extending the existing verify guard,
--      fn_procurement_guard_approval (procurement_grn branch), via
--      fn_procurement_grn_has_duplicate. "Held" is derived live, not stored: a
--      later cancellation of the earlier receipt releases the hold by itself.
--   6. Private bucket procurement-invoice-pdfs for the invoice PDFs the Max-lane
--      runner reads. Read/upload/delete for GRN rights only (grn_create /
--      grn_verify, super admin, admin) - quotation-only managers cannot read it.
--      Mirrors the procurement-quotation-pdfs bucket (20260805090000).
--
-- I1 is deliberately NOT a unique index: the Director chose "confirm and allow" for
-- honest resends, which a unique constraint would forbid.
--
-- Idempotent. Safe to re-apply. NOT applied by the PR that adds it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1-2. Audit-trail columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.procurement_grn
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_invoice_reason text;

COMMENT ON COLUMN public.procurement_grn.duplicate_confirmed_by IS
  'I1: verifier (never received_by) who confirmed a same-supplier, same-number invoice is a different invoice. Validated by trg_pgrn_invoice_checks.';
COMMENT ON COLUMN public.procurement_grn.duplicate_confirmed_at IS
  'I1: when duplicate_confirmed_by confirmed. Stamped by trg_pgrn_invoice_checks.';
COMMENT ON COLUMN public.procurement_grn.late_invoice_reason IS
  'I4: typed reason for accepting an invoice older than the receiver''s max_invoice_age_days.';

-- ----------------------------------------------------------------------------
-- 3. Near-expiry window (I2) - substrate shape of 20260429000002 / ...000011
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
)
SELECT
  'procurement.invoice.near_expiry_days',
  'global',
  NULL,
  '30'::jsonb,
  'Days before expiry at which a received goods line is WARNED as near-expiry on the Record delivery form (invoice check I2). Already-expired lines are blocked regardless. Read by components/procurement/grn-form.tsx; in-code default 30. Director decision 2026-10-09.',
  'number',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'procurement.invoice.near_expiry_days'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 4. Who may confirm a duplicate invoice (I1), enforced in the database
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER, like fn_procurement_guard_approval: it reads nothing of its
-- own; the permission helpers it calls are SECURITY DEFINER already.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_invoice_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- No confirmation: nothing to judge. Clearing one is always allowed (stricter).
  IF NEW.duplicate_confirmed_by IS NULL THEN
    NEW.duplicate_confirmed_at := NULL;
    RETURN NEW;
  END IF;

  -- An unchanged confirmation on an unchanged receipt keeps its original stamp.
  IF TG_OP = 'UPDATE'
     AND NEW.duplicate_confirmed_by IS NOT DISTINCT FROM OLD.duplicate_confirmed_by
     AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by THEN
    NEW.duplicate_confirmed_at := OLD.duplicate_confirmed_at;
    RETURN NEW;
  END IF;

  IF NEW.duplicate_confirmed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'a duplicate invoice can only be confirmed by the signed-in verifier themself'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.duplicate_confirmed_by IS NOT DISTINCT FROM NEW.received_by THEN
    RAISE EXCEPTION 'the person who received the goods cannot confirm a duplicate invoice — the verifier must'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RAISE EXCEPTION 'not authorized to confirm a duplicate invoice — this requires the procurement.grn_verify permission'
      USING ERRCODE = '42501';
  END IF;

  NEW.duplicate_confirmed_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_invoice_checks() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_invoice_checks() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrn_invoice_checks ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_invoice_checks
  BEFORE INSERT OR UPDATE ON public.procurement_grn
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_invoice_checks();

-- ----------------------------------------------------------------------------
-- 5. I1 held save - verify is refused while a detected duplicate is unconfirmed
-- ----------------------------------------------------------------------------
-- Same normalisation as normaliseInvoiceNumber() in
-- lib/services/procurement/invoice-checks.ts: case-folded, every whitespace
-- character (incl. the Unicode spaces JS \s matches) and every dash removed.
-- Empty -> NULL, which never matches.
CREATE OR REPLACE FUNCTION public.fn_procurement_normalise_invoice_number(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(
      lower(coalesce(p_raw, '')),
      U&'[[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF\2010-\2015\2212-]+',
      '', 'g'),
    '');
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_normalise_invoice_number(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_normalise_invoice_number(text) TO authenticated;

-- Does another, non-cancelled receipt from this supplier carry the same normalised
-- invoice number? SECURITY DEFINER so a duplicate recorded at a college the verifier
-- cannot see still holds the receipt. Answers only a yes/no, and only to procurement
-- users (grn_create / grn_verify / super admin / admin); anyone else gets false.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_has_duplicate(
  p_grn_id uuid,
  p_supplier_id uuid,
  p_invoice_number text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.fn_procurement_normalise_invoice_number(p_invoice_number);
BEGIN
  IF v_key IS NULL OR p_supplier_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.procurement_grn g
     WHERE g.supplier_id = p_supplier_id
       AND g.id IS DISTINCT FROM p_grn_id
       AND g.status <> 'cancelled'
       AND public.fn_procurement_normalise_invoice_number(g.invoice_number) = v_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text) TO authenticated;

-- The verify guard, extended. Copied from the live definition (identical to
-- 20271006130000_procurement_final_approval_chain.sql, checked 2026-10-09); the
-- ONLY change is the I1 block in the procurement_grn branch. Re-check the live
-- definition before applying: if another migration has moved it since, merge the
-- I1 block into that version instead of applying this copy.
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key   text;
  v_what  text;
  v_chain boolean := current_setting('procurement.chain_ok', true) = 'on';
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'procurement_rfqs'
     AND (NEW.status = 'awarded'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'pending_award_approval')) THEN
    IF NOT v_chain AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to approve or send back a vendor award — only its final approvers can'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected', 'returned') THEN
        IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT NULL
           AND public.procurement_request_has_chain(NEW.id) THEN
          IF NOT v_chain THEN
            RAISE EXCEPTION 'this request follows its category''s approval steps — use Approve / Send back on the request'
              USING ERRCODE = '42501';
          END IF;
        ELSE
          v_key  := 'procurement.request_approve';
          v_what := 'approve, reject or send back a purchase requisition';
        END IF;
      END IF;
      IF NEW.status = 'returned' THEN
        IF nullif(trim(coalesce(NEW.returned_reason, '')), '') IS NULL THEN
          RAISE EXCEPTION 'say what the requester must change before sending it back'
            USING ERRCODE = '23502';
        END IF;
        NEW.returned_by  := coalesce(NEW.returned_by, auth.uid());
        NEW.returned_at  := now();
        NEW.return_count := coalesce(OLD.return_count, 0) + 1;
      END IF;
      IF NEW.status = 'approved' THEN
        NEW.approved_by := coalesce(NEW.approved_by, auth.uid());
        NEW.approved_at := coalesce(NEW.approved_at, now());
        IF NEW.approved_by IS NULL THEN
          RAISE EXCEPTION 'an approved request must record who approved it'
            USING ERRCODE = '23502';
        END IF;
        IF NOT v_chain AND NEW.requested_by IS NOT DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
          RAISE EXCEPTION 'you cannot approve your own request — another approver must sign it off'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    WHEN 'procurement_rfqs' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.rfq_approve';
        v_what := 'approve or reject an RFQ';
      END IF;
    WHEN 'procurement_purchase_orders' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.po_approve';
        v_what := 'approve or reject a purchase order';
      END IF;
    WHEN 'procurement_grn' THEN
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested')
         AND (TG_OP = 'INSERT' OR OLD.status IN ('draft', 'pending_verification')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
        -- Added 2026-10-09 (invoice check I1, held save): a receipt whose invoice
        -- number repeats an earlier one from the same supplier cannot be verified
        -- until a verifier other than the receiver has confirmed it is a different
        -- invoice. Who may confirm is checked by fn_procurement_grn_invoice_checks.
        IF NEW.duplicate_confirmed_by IS NULL
           AND public.fn_procurement_grn_has_duplicate(NEW.id, NEW.supplier_id, NEW.invoice_number) THEN
          RAISE EXCEPTION 'this delivery''s invoice number repeats an earlier one from the same supplier — a verifier other than the receiver must confirm it is a different invoice before it is added to stock'
            USING ERRCODE = '42501';
        END IF;
      END IF;
  END CASE;
  IF v_key IS NULL OR v_chain THEN
    RETURN NEW;
  END IF;
  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. Private bucket for the supplier invoice PDFs (mirrors 20260805090000)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'procurement-invoice-pdfs',
  'procurement-invoice-pdfs',
  false,
  15728640, -- 15 MB — matches the extract-invoice route limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Upload: people who record or verify deliveries (or admins) only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'procurement-invoice-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')
        )
      )
    $policy$;
  END IF;
END $$;

-- Read: same gate. NOT public, and NOT quotation_manage — supplier bills.
-- (The Max-lane runner reads with the service role, which bypasses RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'procurement-invoice-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'procurement-invoice-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')
        )
      )
    $policy$;
  END IF;
END $$;
