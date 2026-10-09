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
--   4. trg_pgrn_00_invoice_checks - a duplicate confirmation is valid only when it is
--      made by the signed-in user themself, that user holds verify rights
--      (super admin / admin / procurement.grn_verify, the same test
--      fn_procurement_guard_approval applies to verifying), and that user is NOT
--      the GRN's received_by. The time is stamped here, never trusted from the
--      client. received_by is pinned to the signed-in user at INSERT and frozen
--      after (admins excepted); invoice_number / supplier_id are frozen once the
--      receipt leaves pending, and changing them while pending voids the
--      confirmation. Institution scope is already enforced by the
--      pgrn_institution_scope RLS policy on the INSERT/UPDATE itself.
--
--   5. I1 HELD SAVE (Director 2026-10-09): a receipt whose invoice number repeats an
--      EARLIER one from the same supplier is saved, but cannot be VERIFIED (moved
--      into any posted status, 'completed' included) until that confirmation
--      exists. Enforced by extending the existing verify guard,
--      fn_procurement_guard_approval (procurement_grn branch), via
--      fn_procurement_grn_has_duplicate. "Held" is derived live, not stored: a
--      later cancellation of the earlier receipt releases the hold by itself —
--      cancelling an already-verified receipt needs grn_verify.
--   6. Private bucket procurement-invoice-pdfs for the invoice PDFs the Max-lane
--      runner reads. Read/upload for GRN rights only (grn_create / grn_verify,
--      super admin, admin) AND only under a <po_id>/ folder of a purchase order
--      the caller can see (RLS) - quotation-only managers cannot read it. Delete is
--      admins only. Mirrors the procurement-quotation-pdfs bucket (20260805090000).
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
--
-- Column rules only (status-transition rules live in fn_procurement_guard_approval):
--   a. received_by is the signed-in user, set at INSERT; only an admin may change it
--      later. The "confirmer is not the receiver" rule below therefore compares
--      against a value the client cannot choose (review round, 2026-10-09).
--   b. invoice_number / supplier_id are frozen once the receipt is no longer draft /
--      pending_verification; while pending, changing either VOIDS any duplicate
--      confirmation, so a confirmation always belongs to one number + supplier.
--   c. Who may confirm a duplicate (the original rule).
--
-- ORDERING IS LOAD-BEARING: this trigger is named trg_pgrn_00_invoice_checks so it
-- fires BEFORE trg_pgrn_guard_approval (Postgres fires same-timing triggers in name
-- order). The guard's I1 check must see the confirmation AFTER rule (b) voided it.
-- A later migration that renames either trigger must keep this one sorting first.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_invoice_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- a. The receiver is whoever is signed in when the receipt is recorded.
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.received_by := auth.uid();
    END IF;
  ELSE
    IF NEW.received_by IS DISTINCT FROM OLD.received_by
       AND NOT (public.is_super_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'the person who received the goods cannot be changed after the delivery is recorded'
        USING ERRCODE = '42501';
    END IF;

    -- b. A confirmation is tied to one invoice number + supplier.
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      IF OLD.status NOT IN ('draft', 'pending_verification') THEN
        RAISE EXCEPTION 'the invoice number and supplier of a delivery cannot be changed once it is verified or cancelled'
          USING ERRCODE = '42501';
      END IF;
      NEW.duplicate_confirmed_by := NULL;
      NEW.duplicate_confirmed_at := NULL;
      RETURN NEW;
    END IF;
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

  -- Checked against the stored receiver too (OLD), never only the value sent now.
  IF NEW.duplicate_confirmed_by IS NOT DISTINCT FROM NEW.received_by
     OR (TG_OP = 'UPDATE' AND NEW.duplicate_confirmed_by IS NOT DISTINCT FROM OLD.received_by) THEN
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

-- Old name dropped too (an earlier draft of this migration used it).
DROP TRIGGER IF EXISTS trg_pgrn_invoice_checks ON public.procurement_grn;
DROP TRIGGER IF EXISTS trg_pgrn_00_invoice_checks ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_00_invoice_checks
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

-- Does an EARLIER, non-cancelled receipt from this supplier carry the same normalised
-- invoice number? Only receipts recorded before this one count (created_at, then id
-- as the tie-break), so the original receipt is never held by a later repeat of it —
-- only the repeat is. p_created_at NULL = a receipt not saved yet: every other one is
-- earlier. SECURITY DEFINER so a duplicate recorded at a college the verifier cannot
-- see still holds the receipt. Answers only a yes/no, and only to procurement users
-- (grn_create / grn_verify / super admin / admin); anyone else gets false.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_has_duplicate(
  p_grn_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_created_at timestamptz DEFAULT NULL
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
       AND (p_created_at IS NULL
            OR g.created_at < p_created_at
            OR (g.created_at = p_created_at AND g.id < p_grn_id))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz) TO authenticated;

-- The verify guard, extended. Copied from the live definition (identical to
-- 20271006130000_procurement_final_approval_chain.sql, checked 2026-10-09); the
-- ONLY changes are in the procurement_grn branch:
--   * a move INTO a posted status (accepted / partially_accepted /
--     replacement_requested / completed) from draft, pending_verification or
--     cancelled needs grn_verify. 'completed' and 'cancelled' are new here: before,
--     pending -> completed and cancelled -> accepted were unguarded. An INSERT keeps
--     the old set (no 'completed'), so receiveReplacement's pre-inspected
--     'completed' replacement receipt is unchanged.
--   * any status change OUT of a posted status (including to cancelled) needs
--     grn_verify — a receiver with grn_create only can no longer cancel an earlier
--     accepted receipt to lift a hold.
--   * I1: any entry into a posted status (INSERT or UPDATE) is refused while an
--     earlier same-number receipt exists and nobody has confirmed it. A
--     replacement receipt carries no invoice number, so it never matches.
-- Re-check the live definition before applying: if another migration has moved it
-- since, merge these blocks into that version instead of applying this copy.
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
      IF (TG_OP = 'INSERT'
          AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested'))
         OR (TG_OP = 'UPDATE'
             AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
             AND OLD.status IN ('draft', 'pending_verification', 'cancelled')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
      ELSIF TG_OP = 'UPDATE'
            AND OLD.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
        -- Added 2026-10-09 (review round): undoing or re-stating a verified receipt.
        v_key  := 'procurement.grn_verify';
        v_what := 'change the status of a verified goods receipt note';
      END IF;
      -- Added 2026-10-09 (invoice check I1, held save): a receipt whose invoice
      -- number repeats an earlier one from the same supplier cannot be verified
      -- until a verifier other than the receiver has confirmed it is a different
      -- invoice. Who may confirm is checked by fn_procurement_grn_invoice_checks,
      -- which fires first (trg_pgrn_00_invoice_checks) and voids a confirmation
      -- whose invoice number or supplier changed.
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND (TG_OP = 'INSERT'
              OR OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))
         AND NEW.duplicate_confirmed_by IS NULL
         AND public.fn_procurement_grn_has_duplicate(NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at) THEN
        RAISE EXCEPTION 'this delivery''s invoice number repeats an earlier one from the same supplier — a verifier other than the receiver must confirm it is a different invoice before it is added to stock'
          USING ERRCODE = '42501';
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

-- Upload: people who record or verify deliveries (or admins) only, and only into
-- the folder of an order they can see.
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
        -- Only under <po_id>/ of an order the caller can see (the subquery runs
        -- under the caller's RLS on procurement_purchase_orders). CASE keeps the
        -- uuid cast from ever running on a name that is not one.
        AND CASE
              WHEN (storage.foldername(objects.name))[1]
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN EXISTS (
                SELECT 1 FROM public.procurement_purchase_orders po
                 WHERE po.id = ((storage.foldername(objects.name))[1])::uuid
              )
              ELSE false
            END
      )
    $policy$;
  END IF;
END $$;

-- Read: same gate, same folder rule. NOT public, and NOT quotation_manage — supplier bills.
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
        -- Only under <po_id>/ of an order the caller can see (the subquery runs
        -- under the caller's RLS on procurement_purchase_orders). CASE keeps the
        -- uuid cast from ever running on a name that is not one.
        AND CASE
              WHEN (storage.foldername(objects.name))[1]
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN EXISTS (
                SELECT 1 FROM public.procurement_purchase_orders po
                 WHERE po.id = ((storage.foldername(objects.name))[1])::uuid
              )
              ELSE false
            END
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
        -- Admins only (review round, 2026-10-09): the route never deletes, and a
        -- delete + re-upload at the same content-addressed key would swap the bytes.
        AND (public.is_super_admin() OR public.is_admin())
      )
    $policy$;
  END IF;
END $$;
