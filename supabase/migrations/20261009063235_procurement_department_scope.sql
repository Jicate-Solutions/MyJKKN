-- Procurement: department-level visibility (2026-10-09)
--
-- Until now any user with access to a college saw every purchase request,
-- quotation request (RFQ) and PO of that college. HODs hold procurement_officer
-- + store_admin, so every HOD saw every other department's purchases.
--
-- New rule (READS only — writes keep the college scope so approvals, quotes and
-- awards that touch another person's request keep working):
--   a request is visible when the viewer has the college AND one of
--     * they raised it
--     * it belongs to their department (profiles.department_id)
--     * they hold procurement.view_all_departments, or are Super Admin
--   (approvers keep seeing requests routed to them via ppr_approver_read)
--   an RFQ / PO is visible when its source request is visible, or the viewer
--   created it, or they see all departments.
--
-- Staff with no department on their profile see only what they raised (or must
-- approve) until HR sets their department.

-- 1. Whole-college permission --------------------------------------------------
CREATE OR REPLACE FUNCTION public.procurement_sees_all_departments()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT is_super_admin() OR user_has_permission('procurement.view_all_departments');
$$;

CREATE OR REPLACE FUNCTION public.procurement_can_see_request(
  p_institution_id uuid,
  p_department_id uuid,
  p_requested_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- The college check comes first in meaning: false for any college the caller can't see.
  SELECT (
          p_requested_by = (SELECT auth.uid())
       OR procurement_sees_all_departments()
       OR (
            p_department_id IS NOT NULL
        AND p_department_id = (SELECT department_id FROM profiles WHERE id = (SELECT auth.uid()))
          )
         )
     AND role_has_institution_access(p_institution_id);
$$;

REVOKE ALL ON FUNCTION public.procurement_sees_all_departments() FROM anon, public;
REVOKE ALL ON FUNCTION public.procurement_can_see_request(uuid, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.procurement_sees_all_departments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_can_see_request(uuid, uuid, uuid) TO authenticated;

-- 2. Requests carry the requester's department ---------------------------------
CREATE OR REPLACE FUNCTION public.procurement_request_fill_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.department_id IS NULL AND NEW.requested_by IS NOT NULL THEN
    SELECT department_id INTO NEW.department_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_request_fill_department ON public.procurement_purchase_requests;
CREATE TRIGGER trg_procurement_request_fill_department
  BEFORE INSERT ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.procurement_request_fill_department();

-- Backfill: every existing request takes its requester's current department.
UPDATE public.procurement_purchase_requests r
   SET department_id = p.department_id
  FROM public.profiles p
 WHERE p.id = r.requested_by
   AND r.department_id IS NULL
   AND p.department_id IS NOT NULL;

-- 3. Purchase requests: split the college-wide ALL policy -----------------------
DROP POLICY IF EXISTS ppr_institution_scope ON public.procurement_purchase_requests;

CREATE POLICY ppr_department_read ON public.procurement_purchase_requests
  FOR SELECT TO authenticated
  USING (procurement_can_see_request(institution_id, department_id, requested_by));

CREATE POLICY ppr_institution_insert ON public.procurement_purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY ppr_institution_update ON public.procurement_purchase_requests
  FOR UPDATE TO authenticated
  USING (role_has_institution_access(institution_id))
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY ppr_institution_delete ON public.procurement_purchase_requests
  FOR DELETE TO authenticated
  USING (role_has_institution_access(institution_id));

-- 4. RFQs: visible when the source request is (subquery runs under the request RLS)
DROP POLICY IF EXISTS prfq_institution_scope ON public.procurement_rfqs;

CREATE POLICY prfq_department_read ON public.procurement_rfqs
  FOR SELECT TO authenticated
  USING (
    role_has_institution_access(institution_id)
    AND (
         procurement_sees_all_departments()
      OR created_by = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM procurement_purchase_requests r WHERE r.id = procurement_rfqs.source_request_id)
    )
  );

CREATE POLICY prfq_institution_insert ON public.procurement_rfqs
  FOR INSERT TO authenticated
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY prfq_institution_update ON public.procurement_rfqs
  FOR UPDATE TO authenticated
  USING (role_has_institution_access(institution_id))
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY prfq_institution_delete ON public.procurement_rfqs
  FOR DELETE TO authenticated
  USING (role_has_institution_access(institution_id));

-- 5. Purchase orders: visible when their RFQ is (subquery runs under the RFQ RLS)
DROP POLICY IF EXISTS ppo_institution_scope ON public.procurement_purchase_orders;

CREATE POLICY ppo_department_read ON public.procurement_purchase_orders
  FOR SELECT TO authenticated
  USING (
    role_has_institution_access(institution_id)
    AND (
         procurement_sees_all_departments()
      OR created_by = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM procurement_rfqs q WHERE q.id = procurement_purchase_orders.rfq_id)
    )
  );

CREATE POLICY ppo_institution_insert ON public.procurement_purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY ppo_institution_update ON public.procurement_purchase_orders
  FOR UPDATE TO authenticated
  USING (role_has_institution_access(institution_id))
  WITH CHECK (role_has_institution_access(institution_id));

CREATE POLICY ppo_institution_delete ON public.procurement_purchase_orders
  FOR DELETE TO authenticated
  USING (role_has_institution_access(institution_id));

-- 6. Grant the whole-college view to Principal and Procurement Manager ----------
UPDATE public.custom_roles
   SET permissions = coalesce(permissions, '{}'::jsonb) || '{"procurement.view_all_departments": true}'::jsonb
 WHERE role_key IN ('principal', 'procurement_manager');
