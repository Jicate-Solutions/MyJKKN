-- Migration: 20260816000100_procurement_approval_guards
-- Purpose:  Make the procurement approval permissions real.
--
--           THE GAP: every RLS policy on the procurement tables checks institution
--           access and nothing else —
--               USING (role_has_institution_access(institution_id))
--           — with no permission key anywhere. Approval is a plain table UPDATE
--           (lib/services/procurement/purchase-order-service.ts:215), not a guarded
--           RPC, and the services use the browser client. So the create-vs-approve
--           separation that lib/constants/permissions.ts:2569 describes existed only
--           in the UI: the approve button was hidden, but a direct PostgREST call
--           went straight through.
--
--           WHY TRIGGERS, NOT RLS: the existing policies are single FOR ALL policies
--           per table. Splitting them into per-command policies would put the 3 live
--           store_admin users and every super-admin path at risk for no extra safety.
--           RLS also cannot see that `status` moved from pending_approval to approved
--           — only a BEFORE trigger comparing OLD to NEW can. Same pattern as
--           fn_kit_pin_provenance in the store-kit migrations.
--
--           NOT COVERED — procurement.vendor_manage. Vendors are `ims_suppliers`,
--           shared with the IMS module (purchase-order-service.ts:161,
--           quotation-service.ts:130, rfq-service.ts:354). A trigger there would also
--           police IMS supplier management, which is out of scope. That key stays
--           UI-only. Stated here rather than left as a silent half-measure.
--
--           NO REGRESSION EXPECTED: both users who have ever approved a PO are super
--           admins, so the is_super_admin() bypass covers every approval in flight.
--           store_admin already has these four keys pinned false and its 6 execution
--           keys are untouched by this migration.
--
--           Reversible: DROP the four triggers and every write behaves as before.

-- ---------------------------------------------------------------------------
-- Guard function — one function, branching on the table that fired it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_key  text;
  v_what text;
BEGIN
  -- Trusted server context (service_role key, e.g. a future backend job) is not a
  -- user and holds no role permissions; auth.uid() would be NULL and every check
  -- below would fail it. RLS still keeps anon off these tables.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that does not move the status is an ordinary edit (a line item, a
  -- delivery date, a note). Those are not sign-offs and stay unguarded.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME

    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.request_approve';
        v_what := 'approve or reject a purchase requisition';
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
      -- Verification is the act of LEAVING draft/pending_verification for the
      -- accepted family — that is the step that posts stock. Later bookkeeping
      -- (accepted -> completed) is downstream of an already-verified GRN and is
      -- deliberately left alone, so it is not blocked for whoever closes it out.
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested')
         AND (TG_OP = 'INSERT' OR OLD.status IN ('draft', 'pending_verification')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
      END IF;

  END CASE;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.fn_procurement_guard_approval() IS
  'Refuses procurement sign-off transitions (PR/RFQ/PO approve-reject, GRN verify) '
  'when the caller lacks the matching procurement.* permission. Enforces server-side '
  'what the UI already hides. Bypassed for super admins, admins and service_role.';

-- ---------------------------------------------------------------------------
-- Triggers — INSERT as well as UPDATE, so a row cannot be created already signed off
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ppr_guard_approval ON public.procurement_purchase_requests;
CREATE TRIGGER trg_ppr_guard_approval
  BEFORE INSERT OR UPDATE ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_guard_approval();

DROP TRIGGER IF EXISTS trg_prfq_guard_approval ON public.procurement_rfqs;
CREATE TRIGGER trg_prfq_guard_approval
  BEFORE INSERT OR UPDATE ON public.procurement_rfqs
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_guard_approval();

DROP TRIGGER IF EXISTS trg_ppo_guard_approval ON public.procurement_purchase_orders;
CREATE TRIGGER trg_ppo_guard_approval
  BEFORE INSERT OR UPDATE ON public.procurement_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_guard_approval();

DROP TRIGGER IF EXISTS trg_pgrn_guard_approval ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_guard_approval
  BEFORE INSERT OR UPDATE ON public.procurement_grn
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_guard_approval();

-- ---------------------------------------------------------------------------
-- Anon lockdown (Supabase grants EXECUTE to anon by default on new functions)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_procurement_guard_approval() FROM PUBLIC, anon;
