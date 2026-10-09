-- Approval chains: common approvers PLUS college approvers.
-- Before (20261008052910) a college's own list REPLACED the category's default list.
-- Now the default list is the COMMON list for every college, and a college's own list is
-- ADDED in front of it:  college steps (in order) → common steps (in order), renumbered 1..n.
--   e.g. Dental · Lab chemicals:  HOD → Principal (Dental)  →  CAO → Super Admin (common)
-- Same for both lists (request approval and final approval). A college with no list of its
-- own gets only the common list, exactly as before. When a named person is on both lists they
-- are asked once, at their college position.
-- No college lists existed live when this was written, so no request changes route.
--
-- Readers are patched from their live bodies (pg_get_functiondef + regexp_replace, asserted),
-- as in 20261008052910, so nothing else in them can drift from what is deployed.

-- The steps a request from this college goes through, in order (internal helper).
CREATE OR REPLACE FUNCTION public.procurement_chain_steps(p_category_id uuid, p_institution_id uuid, p_stage text)
RETURNS SETOF public.procurement_category_approval_steps
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.category_id,
         (row_number() OVER (ORDER BY (s.institution_id IS NULL), s.step_order))::int AS step_order,
         s.label, s.approver_kind, s.role_key, s.same_college, s.user_id, s.created_at, s.stage, s.institution_id
  FROM procurement_category_approval_steps s
  WHERE s.category_id = p_category_id AND s.stage = p_stage
    AND (s.institution_id IS NULL OR s.institution_id = p_institution_id)
    -- a named person already on the college list is not asked again on the common list
    AND NOT (s.institution_id IS NULL AND s.approver_kind = 'user' AND EXISTS (
          SELECT 1 FROM procurement_category_approval_steps c
           WHERE c.category_id = p_category_id AND c.stage = p_stage
             AND c.institution_id = p_institution_id
             AND c.approver_kind = 'user' AND c.user_id = s.user_id))
  ORDER BY 3;
$$;
-- Internal helper: only the SECURITY DEFINER functions below call it, and they run as the owner.
REVOKE ALL ON FUNCTION public.procurement_chain_steps(uuid, uuid, text) FROM public, anon, authenticated;

DO $$
DECLARE
  d text;
  d2 text;
BEGIN
  -- request approval built at submit (the "any approvers?" check and the loop)
  d := pg_get_functiondef('public.fn_procurement_build_approval_chain()'::regprocedure);
  d2 := regexp_replace(d,
    $re$procurement_category_approval_steps\s+WHERE category_id = NEW\.category_id AND stage = 'request' AND institution_id IS NOT DISTINCT FROM procurement_chain_institution\(NEW\.category_id, NEW\.institution_id\)$re$,
    $to$procurement_chain_steps(NEW.category_id, NEW.institution_id, 'request')$to$, 'g');
  IF d2 = d OR position('procurement_chain_institution' IN d2) > 0 THEN
    RAISE EXCEPTION 'fn_procurement_build_approval_chain: pattern not found';
  END IF;
  EXECUTE d2;

  -- final approval built when the award is sent
  d := pg_get_functiondef('public.fn_procurement_build_final_chain()'::regprocedure);
  d2 := regexp_replace(d,
    $re$procurement_category_approval_steps\s+WHERE category_id = v_req\.category_id AND stage = 'final' AND institution_id IS NOT DISTINCT FROM procurement_chain_institution\(v_req\.category_id, v_req\.institution_id\)$re$,
    $to$procurement_chain_steps(v_req.category_id, v_req.institution_id, 'final')$to$, 'g');
  IF d2 = d OR position('procurement_chain_institution' IN d2) > 0 THEN
    RAISE EXCEPTION 'fn_procurement_build_final_chain: pattern not found';
  END IF;
  EXECUTE d2;

  -- preview shown to the requester before submitting
  d := pg_get_functiondef('public.procurement_preview_chain(uuid,uuid,uuid)'::regprocedure);
  d2 := regexp_replace(d,
    $re$FROM procurement_category_approval_steps s\M$re$,
    $to$FROM procurement_chain_steps(p_category_id, p_institution_id, 'request') s$to$);
  d2 := regexp_replace(d2,
    $re$s\.category_id = p_category_id AND s\.stage = 'request' AND s\.institution_id IS NOT DISTINCT FROM procurement_chain_institution\(p_category_id, p_institution_id\)\s+AND\s+$re$,
    '');
  IF d2 = d OR position('procurement_chain_institution' IN d2) > 0 THEN
    RAISE EXCEPTION 'procurement_preview_chain: pattern not found';
  END IF;
  EXECUTE d2;

  -- "Super Admin" fallback row in My approvals (no final approvers for this college at all)
  d := pg_get_functiondef('public.procurement_my_approvals()'::regprocedure);
  d2 := regexp_replace(d,
    $re$procurement_category_approval_steps s\s+WHERE s\.category_id = r\.category_id AND s\.stage = 'final' AND s\.institution_id IS NOT DISTINCT FROM procurement_chain_institution\(r\.category_id, r\.institution_id\)$re$,
    $to$procurement_chain_steps(r.category_id, r.institution_id, 'final') s$to$);
  IF d2 = d OR position('procurement_chain_institution' IN d2) > 0 THEN
    RAISE EXCEPTION 'procurement_my_approvals: pattern not found';
  END IF;
  EXECUTE d2;
END $$;

-- The "college replaces default" picker is no longer used by anything.
DROP FUNCTION IF EXISTS public.procurement_chain_institution(uuid, uuid);

COMMENT ON COLUMN public.procurement_category_approval_steps.institution_id IS
  'NULL = common approvers for every college. Set = this college''s own approvers, asked BEFORE the common ones (both lists).';
