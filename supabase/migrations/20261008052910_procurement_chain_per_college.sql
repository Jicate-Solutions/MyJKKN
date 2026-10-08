-- Approval chains per college.
-- A category has a DEFAULT chain (institution_id NULL) and, optionally, a chain of its own
-- for one college. A college chain replaces the whole default chain for that college —
-- request approval AND final approval. A college with no rows uses the default.
-- Existing rows are the default; nothing changes for them.
--
-- Functions that read the steps are patched from their live bodies (pg_get_functiondef +
-- replace, asserted) so nothing else in them can drift from what is deployed.

ALTER TABLE public.procurement_category_approval_steps
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE;
COMMENT ON COLUMN public.procurement_category_approval_steps.institution_id IS
  'NULL = default chain for every college. Set = this college''s own chain (replaces the default, both lists).';

ALTER TABLE public.procurement_category_approval_steps
  DROP CONSTRAINT IF EXISTS pcas_category_stage_order_key;
CREATE UNIQUE INDEX IF NOT EXISTS pcas_scope_stage_order_key
  ON public.procurement_category_approval_steps
  (category_id, coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid), stage, step_order);

-- Which chain applies: the college's own when it has request approvers, else the default (NULL).
-- (A college list with only final approvers is ignored: requests would have nobody to start with.)
CREATE OR REPLACE FUNCTION public.procurement_chain_institution(p_category_id uuid, p_institution_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_institution_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM procurement_category_approval_steps s
                 WHERE s.category_id = p_category_id AND s.institution_id = p_institution_id
                   AND s.stage = 'request')
              THEN p_institution_id END;
$$;
-- Internal helper: only the SECURITY DEFINER functions below (and the chain-building triggers)
-- call it, and they run as the owner. Signed-in users never call it directly.
REVOKE ALL ON FUNCTION public.procurement_chain_institution(uuid, uuid) FROM public, anon, authenticated;

-- Save one list of one scope (default or a college). Empty list = remove it.
DROP FUNCTION IF EXISTS public.procurement_save_category_steps(uuid, jsonb, text);
-- institution-param-guard: allow Super Admin only — the body refuses anyone else via is_super_admin(), so any college id is legitimate
CREATE OR REPLACE FUNCTION public.procurement_save_category_steps(
  p_category_id uuid, p_steps jsonb, p_stage text DEFAULT 'request', p_institution_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  i int := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can change approval flows.' USING ERRCODE = '42501';
  END IF;
  IF p_stage NOT IN ('request', 'final') THEN RAISE EXCEPTION 'Unknown approval list %.', p_stage; END IF;
  IF NOT EXISTS (SELECT 1 FROM procurement_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF p_institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM institutions WHERE id = p_institution_id) THEN
    RAISE EXCEPTION 'College not found.';
  END IF;
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) > 10 THEN
    RAISE EXCEPTION 'A list can have up to 10 approvers.';
  END IF;
  DELETE FROM procurement_category_approval_steps
   WHERE category_id = p_category_id AND stage = p_stage
     AND institution_id IS NOT DISTINCT FROM p_institution_id;
  FOR v IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    i := i + 1;
    IF v->>'approver_kind' = 'role' AND NOT EXISTS (
         SELECT 1 FROM custom_roles WHERE role_key = v->>'role_key' AND coalesce(is_active, true)) THEN
      RAISE EXCEPTION 'Approver %: role "%" does not exist.', i, v->>'role_key';
    END IF;
    IF v->>'approver_kind' = 'user' AND NOT EXISTS (
         SELECT 1 FROM profiles WHERE id = (v->>'user_id')::uuid) THEN
      RAISE EXCEPTION 'Approver %: choose a person.', i;
    END IF;
    INSERT INTO procurement_category_approval_steps
      (category_id, institution_id, stage, step_order, label, approver_kind, role_key, same_college, user_id)
    VALUES (p_category_id, p_institution_id, p_stage, i, trim(v->>'label'), v->>'approver_kind',
            CASE WHEN v->>'approver_kind' = 'role' THEN v->>'role_key' END,
            coalesce((v->>'same_college')::boolean, true),
            CASE WHEN v->>'approver_kind' = 'user' THEN (v->>'user_id')::uuid END);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.procurement_save_category_steps(uuid, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_save_category_steps(uuid, jsonb, text, uuid) TO authenticated;

-- Readers: use the college's chain when it has one.
DO $$
DECLARE
  d text;
  d2 text;
BEGIN
  -- request approval built at submit
  d := pg_get_functiondef('public.fn_procurement_build_approval_chain()'::regprocedure);
  d2 := replace(d, 'category_id = NEW.category_id AND stage = ''request''',
    'category_id = NEW.category_id AND stage = ''request'' AND institution_id IS NOT DISTINCT FROM procurement_chain_institution(NEW.category_id, NEW.institution_id)');
  IF d2 = d THEN RAISE EXCEPTION 'fn_procurement_build_approval_chain: pattern not found'; END IF;
  EXECUTE d2;

  -- final approval built when the award is sent
  d := pg_get_functiondef('public.fn_procurement_build_final_chain()'::regprocedure);
  d2 := replace(d, 'category_id = v_req.category_id AND stage = ''final''',
    'category_id = v_req.category_id AND stage = ''final'' AND institution_id IS NOT DISTINCT FROM procurement_chain_institution(v_req.category_id, v_req.institution_id)');
  IF d2 = d THEN RAISE EXCEPTION 'fn_procurement_build_final_chain: pattern not found'; END IF;
  EXECUTE d2;

  -- preview shown to the requester before submitting
  d := pg_get_functiondef('public.procurement_preview_chain(uuid,uuid,uuid)'::regprocedure);
  d2 := replace(d, 's.category_id = p_category_id AND s.stage = ''request''',
    's.category_id = p_category_id AND s.stage = ''request'' AND s.institution_id IS NOT DISTINCT FROM procurement_chain_institution(p_category_id, p_institution_id)');
  IF d2 = d THEN RAISE EXCEPTION 'procurement_preview_chain: pattern not found'; END IF;
  EXECUTE d2;

  -- "Super Admin" fallback row in My approvals (no final list for this college)
  d := pg_get_functiondef('public.procurement_my_approvals()'::regprocedure);
  d2 := replace(d, 's.category_id = r.category_id AND s.stage = ''final''',
    's.category_id = r.category_id AND s.stage = ''final'' AND s.institution_id IS NOT DISTINCT FROM procurement_chain_institution(r.category_id, r.institution_id)');
  IF d2 = d THEN RAISE EXCEPTION 'procurement_my_approvals: pattern not found'; END IF;
  EXECUTE d2;
END $$;
