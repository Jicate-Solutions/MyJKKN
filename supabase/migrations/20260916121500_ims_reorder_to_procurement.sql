-- IMS -> Procurement bulk reorder.
--
-- Two SECURITY DEFINER functions, plus a read policy so a requester can always see
-- the purchase requests they raised.
--
-- Why SECURITY DEFINER instead of widening RLS: procurement_purchase_requests is
-- guarded by role_has_institution_access(), which reads profiles.institution_id and
-- user_institution_access. IMS store admins get their store through
-- ims_user_store_grants, and every such grant today is cross-institution — so the
-- store admin was offered "Send to Procurement" and then refused by RLS.
-- role_has_institution_access() backs ~782 policies; teaching it about store grants
-- would open HR/billing/learner data to every store admin. These functions open one
-- path only.
--
-- DELIBERATE: the request's institution comes from the STORE, not from the caller's
-- profile. A store admin payrolled at another institution raises requests for the
-- store they run. Do not "fix" this back to the caller's institution.

-- ---------------------------------------------------------------------------
-- Shared access rule: the caller works at the store's institution, or holds an
-- active grant on this exact store. Admins pass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ims_can_access_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT is_super_admin()
      OR is_admin()
      OR EXISTS (
           SELECT 1
             FROM ims_stores s
             JOIN profiles p ON p.id = (SELECT auth.uid())
            WHERE s.id = p_store_id
              AND p.institution_id = s.institution_id
         )
      OR EXISTS (
           SELECT 1
             FROM ims_user_store_grants g
            WHERE g.user_id = (SELECT auth.uid())
              AND g.store_id = p_store_id
              AND g.is_active
         );
$$;

-- ---------------------------------------------------------------------------
-- The reorder list: every active item in the store's assortment that needs
-- attention. Driven from ims_store_items (the assortment), so an item with no
-- stock row reads as 0 on hand instead of disappearing.
--
-- status:
--   unset_reorder_level  reorder_level is null/0 — would never alert otherwise
--   out_of_stock         on_hand <= 0
--   low_stock            0 < on_hand <= reorder_level
--
-- suggested_quantity tops the item up to max_stock_level; when max is not above
-- the reorder level (misconfigured), it tops up to 2x the reorder level instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ims_store_reorder_list(p_store_id uuid)
RETURNS TABLE (
  item_id             uuid,
  item_code           text,
  item_name           text,
  category_name       text,
  unit_id             uuid,
  unit_abbreviation   text,
  on_hand             numeric,
  reorder_level       integer,
  max_stock_level     integer,
  status              text,
  suggested_quantity  numeric,
  open_request_id     uuid,
  open_request_number text,
  open_request_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inst uuid;
BEGIN
  SELECT s.institution_id INTO v_inst FROM ims_stores s WHERE s.id = p_store_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT ims_can_access_store(p_store_id) THEN
    RAISE EXCEPTION 'You do not have access to this store' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH stock AS (
    SELECT ss.item_id,
           sum(coalesce(ss.available_quantity, ss.current_quantity, 0)) AS qty
      FROM ims_stock_summary ss
     WHERE ss.store_id = p_store_id
     GROUP BY ss.item_id
  ),
  base AS (
    SELECT i.id,
           i.code,
           i.name,
           c.name                        AS cat,
           i.base_unit_id,
           u.abbreviation                AS unit_abbr,
           coalesce(st.qty, 0)           AS qty,
           coalesce(i.reorder_level, 0)  AS rl,
           coalesce(i.max_stock_level, 0) AS ml
      FROM ims_store_items si
      JOIN ims_items i            ON i.id = si.item_id AND i.is_active
      LEFT JOIN ims_item_categories c ON c.id = i.category_id
      LEFT JOIN ims_units u       ON u.id = i.base_unit_id
      LEFT JOIN stock st          ON st.item_id = i.id
     WHERE si.store_id = p_store_id
       AND si.is_active
  )
  SELECT b.id,
         b.code,
         b.name,
         b.cat,
         b.base_unit_id,
         b.unit_abbr,
         b.qty,
         b.rl,
         b.ml,
         CASE
           WHEN b.rl <= 0  THEN 'unset_reorder_level'
           WHEN b.qty <= 0 THEN 'out_of_stock'
           ELSE 'low_stock'
         END,
         CASE
           WHEN b.rl <= 0 THEN NULL
           ELSE greatest(
                  (CASE WHEN b.ml > b.rl THEN b.ml ELSE b.rl * 2 END) - greatest(b.qty, 0),
                  1)
         END,
         o.id,
         o.request_number,
         o.status
    FROM base b
    LEFT JOIN LATERAL (
      SELECT r.id, r.request_number, r.status
        FROM procurement_purchase_request_items ri
        JOIN procurement_purchase_requests r ON r.id = ri.request_id
       WHERE ri.domain_item_id = b.id
         AND r.domain = 'ims'
         AND r.status IN ('draft', 'submitted', 'approved')
         AND (r.store_id = p_store_id
              OR (r.store_id IS NULL AND r.institution_id = v_inst))
       ORDER BY r.created_at DESC
       LIMIT 1
    ) o ON true
   WHERE b.rl <= 0 OR b.qty <= b.rl
   ORDER BY
     CASE WHEN b.rl <= 0 THEN 2 WHEN b.qty <= 0 THEN 0 ELSE 1 END,
     b.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Raise one purchase request from a reorder selection.
--
-- p_items: [{ "item_id": uuid, "quantity": number }, ...]
-- Everything else on the line (name, unit, on-hand, reorder level) is read from
-- the database here, not trusted from the client, so the snapshot the approver
-- sees is the real stock position at the moment of raising.
--
-- p_submit = true files it straight to the approver ('submitted');
-- false leaves a 'draft' for the requester to review.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ims_create_reorder_request(
  p_store_id uuid,
  p_items    jsonb,
  p_notes    text    DEFAULT NULL,
  p_submit   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_inst    uuid;
  v_store   text;
  v_day     date := (now() AT TIME ZONE 'utc')::date;  -- same day basis as the app's PR numbers
  v_seq     integer;
  v_number  text;
  v_req_id  uuid;
  v_n_in    integer;
  v_n_ok    integer;
  v_bad     text;
BEGIN
  -- Authorization comes first; nothing is read or written for an unauthorized caller.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to raise a purchase request' USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.name INTO v_inst, v_store
    FROM ims_stores s
   WHERE s.id = p_store_id AND s.is_active;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Store not found or inactive' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT ims_can_access_store(p_store_id) THEN
    RAISE EXCEPTION 'You do not have access to %', v_store USING ERRCODE = '42501';
  END IF;

  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('procurement.request_create')) THEN
    RAISE EXCEPTION 'Raising a purchase request requires the procurement.request_create permission'
      USING ERRCODE = '42501';
  END IF;

  -- Validate the selection.
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Select at least one item' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'A single request can hold at most 500 items' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  CREATE TEMP TABLE _reorder_sel ON COMMIT DROP AS
  SELECT (e->>'item_id')::uuid  AS item_id,
         (e->>'quantity')::numeric AS qty
    FROM jsonb_array_elements(p_items) e;

  IF EXISTS (SELECT 1 FROM _reorder_sel WHERE item_id IS NULL OR qty IS NULL OR qty <= 0) THEN
    RAISE EXCEPTION 'Every line needs an item and a quantity greater than zero'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT count(*), count(DISTINCT item_id) INTO v_n_in, v_n_ok FROM _reorder_sel;
  IF v_n_in <> v_n_ok THEN
    RAISE EXCEPTION 'The same item appears more than once' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT string_agg(coalesce(i.name, sel.item_id::text), ', ') INTO v_bad
    FROM _reorder_sel sel
    LEFT JOIN ims_store_items si ON si.item_id = sel.item_id AND si.store_id = p_store_id AND si.is_active
    LEFT JOIN ims_items i        ON i.id = sel.item_id AND i.is_active
   WHERE si.id IS NULL OR i.id IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not carried by %: %', v_store, v_bad USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Number and insert.
  v_seq    := procurement_next_number(v_inst, 'PR', v_day);
  v_number := 'PR-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 5, '0');

  INSERT INTO procurement_purchase_requests (
    institution_id, store_id, request_number, domain, request_type,
    status, requested_by, submitted_at, notes
  ) VALUES (
    v_inst, p_store_id, v_number, 'ims', 'restock',
    CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    v_uid,
    CASE WHEN p_submit THEN now() END,
    nullif(btrim(p_notes), '')
  )
  RETURNING id INTO v_req_id;

  INSERT INTO procurement_purchase_request_items (
    request_id, domain_item_id, item_name, required_quantity,
    unit_id, unit_label, current_stock, reorder_level
  )
  SELECT v_req_id,
         i.id,
         i.name,
         sel.qty,
         i.base_unit_id,
         u.abbreviation,
         coalesce((SELECT sum(coalesce(ss.available_quantity, ss.current_quantity, 0))
                     FROM ims_stock_summary ss
                    WHERE ss.item_id = i.id AND ss.store_id = p_store_id), 0),
         i.reorder_level
    FROM _reorder_sel sel
    JOIN ims_items i     ON i.id = sel.item_id
    LEFT JOIN ims_units u ON u.id = i.base_unit_id
   ORDER BY i.name;

  RETURN jsonb_build_object(
    'id',             v_req_id,
    'request_number', v_number,
    'status',         CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    'item_count',     v_n_in
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ims_can_access_store(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ims_store_reorder_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ims_create_reorder_request(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ims_can_access_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ims_store_reorder_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ims_create_reorder_request(uuid, jsonb, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- A requester can always read what they raised. Without this, a cross-institution
-- store admin creates a request and is then told it does not exist. SELECT only:
-- status changes still go through the institution-scoped policy and the approval
-- guard trigger.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ppr_requester_read ON public.procurement_purchase_requests;
CREATE POLICY ppr_requester_read
  ON public.procurement_purchase_requests
  FOR SELECT TO authenticated
  USING (requested_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS ppri_requester_read ON public.procurement_purchase_request_items;
CREATE POLICY ppri_requester_read
  ON public.procurement_purchase_request_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_purchase_requests r
     WHERE r.id = procurement_purchase_request_items.request_id
       AND r.requested_by = (SELECT auth.uid())
  ));
