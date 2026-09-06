-- Migration: AI Assistant gap lookups — scoped read-only ai_rpc_* for uncovered domains
-- Date: 2026-07-12
-- Adds 5 per-user-scoped lookups (fees / hostel / HR / procurement / transport).
-- Each SECURITY DEFINER, pins auth.uid() (caller p_user_id/p_institution_id ignored
-- for non-supers = confused-deputy safe), REVOKEs anon. Applied live + leak-tested on
-- prod (Dental vs Allied Health = different own-only data; Dental user passing Allied
-- Health's id still got Dental). exam-marks + placement skipped (no data).

-- ===== ai_rpc_fees_revenue =====
CREATE OR REPLACE FUNCTION public.ai_rpc_fees_revenue(
  p_user_id uuid,
  p_institution_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result  JSONB;
  v_profile RECORD;
  v_super   BOOLEAN;
  v_inst_id UUID;   -- effective institution filter; NULL only for super-admin (= all)
BEGIN
  -- [authz-guard] pin identity to auth.uid() (confused-deputy fix; caller-supplied p_user_id is ignored)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', FALSE,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();

  SELECT institution_id, COALESCE(is_super_admin, FALSE) AS is_super_admin
    INTO v_profile
    FROM profiles WHERE id = p_user_id;
  v_super := COALESCE(v_profile.is_super_admin, FALSE);

  IF v_super THEN
    -- super-admin: may optionally narrow to one institution; NULL => all institutions
    v_inst_id := p_institution_id;
  ELSE
    -- everyone else: HARD-PINNED to own institution; caller-supplied p_institution_id is IGNORED
    v_inst_id := v_profile.institution_id;
  END IF;

  WITH scoped AS (
    SELECT b.item_category_id, b.final_amount, b.balance_amount, b.refunded_amount
    FROM billing_student_bills b
    WHERE (
            (v_super = TRUE  AND (v_inst_id IS NULL OR b.institution_id = v_inst_id))
         OR (v_super = FALSE AND b.institution_id = v_inst_id)   -- v_inst_id NULL => 0 rows (fail closed)
          )
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
  ),
  per_cat AS (
    SELECT COALESCE(c.category_name, 'Uncategorized') AS category,
           COALESCE(c.kind::text, 'unknown')          AS kind,
           COUNT(*)                                    AS bill_count,
           ROUND(SUM(s.final_amount), 2)               AS billed,
           ROUND(SUM(s.final_amount) - SUM(s.balance_amount), 2) AS collected,
           ROUND(SUM(s.balance_amount), 2)             AS outstanding,
           ROUND(SUM(s.refunded_amount), 2)            AS refunded
    FROM scoped s
    LEFT JOIN billing_categories c ON c.id = s.item_category_id
    GROUP BY 1, 2
  ),
  totals AS (
    SELECT COUNT(*)                                    AS bill_count,
           ROUND(SUM(final_amount), 2)                 AS billed,
           ROUND(SUM(final_amount) - SUM(balance_amount), 2) AS collected,
           ROUND(SUM(balance_amount), 2)               AS outstanding,
           ROUND(SUM(refunded_amount), 2)              AS refunded
    FROM scoped
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'scope',          CASE WHEN v_super AND v_inst_id IS NULL THEN 'all_institutions' ELSE 'institution' END,
      'institution_id', v_inst_id,
      'totals',         COALESCE((SELECT to_jsonb(t) FROM totals t), '{}'::jsonb),
      'by_category',    COALESCE((SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.billed DESC NULLS LAST)
                                  FROM per_cat pc), '[]'::jsonb)
    ),
    'metadata', jsonb_build_object('generated_at', now())
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_fees_revenue(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_fees_revenue(uuid, uuid, uuid) TO authenticated, service_role;;

-- ===== ai_rpc_hostel_occupancy =====
CREATE OR REPLACE FUNCTION public.ai_rpc_hostel_occupancy(
  p_user_id uuid DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile RECORD;
  v_inst_id UUID;      -- effective institution filter (super-admin only; NULL => all)
  v_blocks JSONB;
  v_summary JSONB;
BEGIN
  -- [authz-guard 2026-07-12] Pin identity to auth.uid(); ignore caller-supplied p_user_id
  -- (confused-deputy fix, mirrors ai_rpc_students_summary hardening).
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();

  SELECT institution_id, COALESCE(is_super_admin,false) AS is_super_admin
    INTO v_profile
  FROM profiles WHERE id = p_user_id;

  -- [authz-guard] A caller-supplied p_institution_id is ONLY honored for super-admins
  -- (who may drill into one institution). A non-super caller is HARD-pinned to their own
  -- profiles.institution_id -- p_institution_id is ignored -- so it can never be used to
  -- read another college's data (the "never a caller-supplied institution id" rule).
  IF v_profile.is_super_admin THEN
    v_inst_id := p_institution_id;             -- NULL => all institutions
  ELSE
    v_inst_id := v_profile.institution_id;     -- forced to own; caller param discarded
  END IF;

  -- Per-college identity for hostel data lives on hostel_allocations.institution_id
  -- (the resident's home college). Physical inventory (blocks/rooms/beds) is centrally
  -- owned and shared across colleges, so 'capacity' is the block's physical bed count
  -- (SUM hostel_rooms.capacity) and is NOT institution-scoped; 'occupied' IS scoped to the
  -- caller's institution -- a non-super caller never sees another college's residents.
  -- 'vacant' = capacity - occupied(shown); for a single institution this is an upper bound
  -- on availability (a shared block may also house other colleges' students, which this
  -- scope deliberately does not reveal). 'active' resident = check_out_date IS NULL,
  -- matching the platform's own v_hostel_room_occupancy view.
  WITH occ AS (
    SELECT a.block_id, COUNT(*)::int AS occupied
    FROM hostel_allocations a
    WHERE a.check_out_date IS NULL
      AND (
        (v_profile.is_super_admin AND (v_inst_id IS NULL OR a.institution_id = v_inst_id))
        OR
        (NOT v_profile.is_super_admin AND a.institution_id = v_profile.institution_id)
      )
    GROUP BY a.block_id
  ),
  cap AS (
    SELECT r.block_id, COALESCE(SUM(r.capacity),0)::int AS capacity
    FROM hostel_rooms r
    GROUP BY r.block_id
  ),
  per_block AS (
    SELECT b.id AS block_id, b.name AS block_name, b.code AS block_code,
           b.hostel_type::text AS hostel_type,
           COALESCE(c.capacity,0) AS capacity,
           o.occupied AS occupied,
           GREATEST(COALESCE(c.capacity,0) - o.occupied, 0) AS vacant
    FROM occ o
    JOIN hostel_blocks b ON b.id = o.block_id
    LEFT JOIN cap c ON c.block_id = b.id
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(pb) ORDER BY pb.block_name), '[]'::jsonb),
    jsonb_build_object(
      'blocks',   COUNT(*),
      'capacity', COALESCE(SUM(pb.capacity),0),
      'occupied', COALESCE(SUM(pb.occupied),0),
      'vacant',   COALESCE(SUM(pb.vacant),0)
    )
  INTO v_blocks, v_summary
  FROM per_block pb;

  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'scope', CASE WHEN v_profile.is_super_admin THEN 'all_institutions' ELSE 'own_institution' END,
      'institution_id', CASE WHEN v_profile.is_super_admin THEN v_inst_id ELSE v_profile.institution_id END,
      'summary', v_summary,
      'blocks', v_blocks
    ),
    'metadata', jsonb_build_object('returned_count', jsonb_array_length(v_blocks), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_hostel_occupancy(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_hostel_occupancy(uuid, uuid) TO authenticated, service_role;;

-- ===== ai_rpc_hr_staff =====
CREATE OR REPLACE FUNCTION public.ai_rpc_hr_staff(
  p_user_id uuid DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid; v_is_super boolean; v_own_inst uuid; v_allowed uuid[];
  v_headcount jsonb; v_by_department jsonb; v_by_designation jsonb; v_leave jsonb;
BEGIN
  -- [authz-guard] pin identity to auth.uid(); caller-supplied p_user_id is IGNORED (confused-deputy fix)
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  SELECT is_super_admin, institution_id INTO v_is_super, v_own_inst FROM profiles WHERE id = v_uid;
  IF COALESCE(v_is_super, false) THEN
    -- super-admin: all institutions; may OPTIONALLY narrow to one named institution
    IF p_institution_id IS NOT NULL THEN v_allowed := ARRAY[p_institution_id]; ELSE v_allowed := NULL; END IF;
  ELSE
    -- non-super: OWN institution + explicit user_institution_access grants ONLY.
    -- caller-supplied p_institution_id is NEVER trusted to widen scope.
    SELECT array_agg(DISTINCT iid) INTO v_allowed
    FROM (SELECT v_own_inst AS iid
          UNION
          SELECT institution_id FROM user_institution_access WHERE user_id = v_uid AND is_active = true) g
    WHERE iid IS NOT NULL;   -- guard: never permit NULL-institution rows into scope
    IF v_allowed IS NULL THEN v_allowed := ARRAY[]::uuid[]; END IF;  -- no institution -> empty scope, not all
  END IF;

  SELECT jsonb_build_object(
    'total_staff', count(*),
    'active_staff', count(*) FILTER (WHERE is_active),
    'inactive_staff', count(*) FILTER (WHERE is_active IS DISTINCT FROM true),
    'male', count(*) FILTER (WHERE lower(gender) = 'male'),
    'female', count(*) FILTER (WHERE lower(gender) = 'female'),
    'distinct_departments', count(DISTINCT department_id),
    'distinct_institutions', count(DISTINCT institution_id)
  ) INTO v_headcount
  FROM staff s WHERE (v_allowed IS NULL OR s.institution_id = ANY(v_allowed));

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'staff_count')::int DESC), '[]'::jsonb) INTO v_by_department
  FROM (SELECT jsonb_build_object('department_id', d.id, 'department_name', d.department_name, 'staff_count', t.c) AS x
        FROM (SELECT department_id, count(*) c FROM staff s
              WHERE (v_allowed IS NULL OR s.institution_id = ANY(v_allowed)) AND department_id IS NOT NULL
              GROUP BY department_id) t
        JOIN departments d ON d.id = t.department_id) q;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'staff_count')::int DESC), '[]'::jsonb) INTO v_by_designation
  FROM (SELECT jsonb_build_object('designation', desig, 'staff_count', c) AS x
        FROM (SELECT INITCAP(TRIM(designation)) desig, count(*) c FROM staff s
              WHERE (v_allowed IS NULL OR s.institution_id = ANY(v_allowed)) AND NULLIF(TRIM(designation), '') IS NOT NULL
              GROUP BY INITCAP(TRIM(designation))) t) q;

  SELECT jsonb_build_object(
    'source', 'hr_leave_balances',
    'employees_with_balances', count(DISTINCT b.employee_id),
    'total_entitled_days', COALESCE(round(sum(b.entitled), 2), 0),
    'total_used_days', COALESCE(round(sum(b.used), 2), 0),
    'total_remaining_days', COALESCE(round(sum(b.entitled - b.used + COALESCE(b.carried_forward,0)), 2), 0)
  ) INTO v_leave
  FROM hr_leave_balances b JOIN staff s ON s.id = b.employee_id
  WHERE (v_allowed IS NULL OR s.institution_id = ANY(v_allowed));

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'scope', CASE WHEN COALESCE(v_is_super,false)
                    THEN (CASE WHEN p_institution_id IS NULL THEN 'all_institutions' ELSE 'single_institution' END)
                    ELSE 'own_institution' END,
      'headcount', v_headcount,
      'by_department', v_by_department,
      'by_designation', v_by_designation,
      'leave_balances', v_leave),
    'metadata', jsonb_build_object('institution_count', CASE WHEN v_allowed IS NULL THEN NULL ELSE array_length(v_allowed,1) END),
    'actions_available', '[]'::jsonb);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_hr_staff(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_hr_staff(uuid, uuid) TO authenticated, service_role;;

-- ===== ai_rpc_procurement_assets =====
CREATE OR REPLACE FUNCTION public.ai_rpc_procurement_assets(
  p_user_id uuid,
  p_institution_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile  RECORD;
  v_is_super BOOLEAN;
  v_inst     UUID;
  v_result   JSONB;
BEGIN
  -- [authz-guard] pin identity to auth.uid() (confused-deputy fix; ignore caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();

  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_is_super := COALESCE(v_profile.is_super_admin, FALSE);

  -- super-admin may target one institution (or all when NULL); everyone else is HARD-pinned
  -- to their OWN institution_id -> a caller-supplied p_institution_id can NEVER widen scope.
  v_inst := CASE WHEN v_is_super THEN p_institution_id ELSE v_profile.institution_id END;

  SELECT jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'scope', CASE WHEN v_is_super AND v_inst IS NULL THEN 'all_institutions' ELSE 'institution' END,
      'institution_id', v_inst,
      'assets', jsonb_build_object(
        'total_assets',         (SELECT COUNT(*)                                  FROM resources r WHERE (v_inst IS NULL AND v_is_super) OR r.institution_id = v_inst),
        'total_current_value',  (SELECT COALESCE(SUM(r.current_value),0)          FROM resources r WHERE (v_inst IS NULL AND v_is_super) OR r.institution_id = v_inst),
        'total_stock_quantity', (SELECT COALESCE(SUM(r.current_stock_quantity),0) FROM resources r WHERE (v_inst IS NULL AND v_is_super) OR r.institution_id = v_inst)
      ),
      'inventory', jsonb_build_object(
        'stock_items',        (SELECT COUNT(*)                              FROM ims_stock_summary s WHERE (v_inst IS NULL AND v_is_super) OR s.institution_id = v_inst),
        'stock_total_value',  (SELECT COALESCE(SUM(s.total_value),0)        FROM ims_stock_summary s WHERE (v_inst IS NULL AND v_is_super) OR s.institution_id = v_inst),
        'available_quantity', (SELECT COALESCE(SUM(s.available_quantity),0) FROM ims_stock_summary s WHERE (v_inst IS NULL AND v_is_super) OR s.institution_id = v_inst)
      ),
      'procurement', jsonb_build_object(
        'purchase_orders',      (SELECT COUNT(*)                         FROM procurement_purchase_orders po WHERE (v_inst IS NULL AND v_is_super) OR po.institution_id = v_inst),
        'po_total_spend',       (SELECT COALESCE(SUM(po.total_amount),0) FROM procurement_purchase_orders po WHERE (v_inst IS NULL AND v_is_super) OR po.institution_id = v_inst),
        'goods_received_notes', (SELECT COUNT(*)                         FROM procurement_grn g              WHERE (v_inst IS NULL AND v_is_super) OR g.institution_id  = v_inst),
        'suppliers',            (SELECT COUNT(*)                         FROM ims_suppliers sup             WHERE (v_inst IS NULL AND v_is_super) OR sup.institution_id = v_inst)
      )
    ),
    'metadata', jsonb_build_object('returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_procurement_assets(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_procurement_assets(uuid, uuid) TO authenticated, service_role;;

-- ===== ai_rpc_transport =====
CREATE OR REPLACE FUNCTION public.ai_rpc_transport(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result JSONB;
  v_profile RECORD;
  v_is_super BOOLEAN;
  v_scope_inst UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignore caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();

  SELECT institution_id, COALESCE(is_super_admin,false) AS is_super_admin
    INTO v_profile
  FROM profiles WHERE id = p_user_id;

  v_is_super := COALESCE(v_profile.is_super_admin, false);
  -- Only super-admins may target another institution via p_institution_id (NULL = all).
  -- Non-super callers are HARD-PINNED to their own institution; caller param is ignored.
  v_scope_inst := CASE WHEN v_is_super THEN p_institution_id ELSE v_profile.institution_id END;

  WITH scoped AS (
    SELECT lp.transport_route_id, lp.bus_required, lp.transport_fee
    FROM learners_profiles lp
    WHERE (v_is_super AND v_scope_inst IS NULL) OR lp.institution_id = v_scope_inst
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE bus_required = TRUE)                                   AS bus_required_count,
      COUNT(*) FILTER (WHERE transport_route_id IS NOT NULL)                        AS allocated_count,
      COUNT(*) FILTER (WHERE bus_required = TRUE AND transport_route_id IS NULL)    AS unallocated_bus_required_count,
      COUNT(DISTINCT transport_route_id)                                           AS distinct_routes_used,
      COALESCE(SUM(transport_fee) FILTER (WHERE transport_route_id IS NOT NULL),0)  AS allocated_transport_fee_total
    FROM scoped
  ),
  route_rollup AS (
    SELECT s.transport_route_id, COUNT(*) AS allocated_learners
    FROM scoped s
    WHERE s.transport_route_id IS NOT NULL
    GROUP BY s.transport_route_id
  ),
  routes AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'route_id',           rr.transport_route_id,
               'route_number',       r.route_number,
               'route_name',         r.route_name,
               'allocated_learners', rr.allocated_learners,
               'route_capacity',     r.total_capacity,
               'fare',               r.fare,
               'vehicle_registration', v.registration_number,
               'vehicle_capacity',   v.capacity
             )
             ORDER BY rr.allocated_learners DESC
           ) AS route_list
    FROM route_rollup rr
    LEFT JOIN tms_route   r ON r.id = rr.transport_route_id
    LEFT JOIN tms_vehicle v ON v.id = r.vehicle_id
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'summary', row_to_json(s)::jsonb,
      'routes',  COALESCE(rt.route_list, '[]'::jsonb)
    ),
    'metadata', jsonb_build_object(
      'scope', CASE WHEN v_is_super AND v_scope_inst IS NULL THEN 'all_institutions' ELSE 'single_institution' END,
      'institution_id', v_scope_inst,
      'route_count', COALESCE(jsonb_array_length(rt.route_list),0)
    ),
    'actions_available', '[]'::jsonb
  )
  INTO v_result
  FROM summary s CROSS JOIN routes rt;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_transport(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_transport(uuid, uuid) TO authenticated, service_role;;
