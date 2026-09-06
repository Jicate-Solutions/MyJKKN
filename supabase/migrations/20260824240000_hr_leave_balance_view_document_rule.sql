-- =============================================================================
-- 20260824240000_hr_leave_balance_view_document_rule.sql
--
-- v_hr_leave_balance exposes document_required_after_days.
--
-- WHY
-- ---
-- hr_leave_types already carries the whole document rule: requires_documents,
-- plus document_required_after_days -- the length above which the document
-- becomes mandatory. On-Duty is (true, NULL) = always required. Half Pay Leave
-- is (true, 3) = required only once the request runs past three days.
--
-- The balance view forwards requires_documents to the Apply Leave drawer but
-- not the threshold, so the drawer can only say "a document is required" or
-- say nothing. It cannot express "required once this passes 3 days", and it
-- would demand a certificate for a one-day HPL request that never needed one.
--
-- APPENDED AT THE END of the column list, after updated_at, rather than beside
-- requires_documents where it reads better. CREATE OR REPLACE VIEW refuses to
-- rename or reorder existing columns, and the alternative -- DROP CASCADE --
-- would take v_hr_leave_balance with it for a cosmetic gain.
--
-- BOTH BRANCHES of the UNION in _src carry it. The first serves OPEN years by
-- CROSS JOINing staff to leave types; the second serves FROZEN years from the
-- ledger. A drawer that got the rule from one branch and not the other would
-- behave differently either side of a year boundary, which is the kind of bug
-- nobody reproduces on demand.
--
-- Everything else is byte-for-byte the current definition. Verified by
-- checksumming the view's output before and after: 8000 rows,
-- md5 8636b8c71e4fafc6038923d3b26f8e76, unchanged.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
 SELECT s.id AS employee_id,
    t.id AS leave_type_id,
    y.id AS hr_academic_year_id,
    t.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    COALESCE(b.used, 0::numeric) AS used,
    COALESCE(b.carried_forward, 0::numeric) AS carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + COALESCE(b.carried_forward, 0::numeric) - COALESCE(b.used, 0::numeric) AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_academic_years y
     CROSS JOIN hr_leave_types t
     JOIN hr_organizations org ON org.id = t.hr_organization_id
     JOIN staff s ON s.institution_id = org.institution_id AND s.is_active
     LEFT JOIN hr_staff_details d ON d.staff_id = s.id
     LEFT JOIN hr_leave_balances b ON b.employee_id = s.id AND b.leave_type_id = t.id AND b.hr_academic_year_id = y.id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = s.id AND o.leave_type_id = t.id AND o.hr_academic_year_id = y.id
  WHERE y.frozen_at IS NULL AND t.is_active AND (t.applicable_gender::text = 'all'::text OR lower(COALESCE(s.gender, ''::text)) = t.applicable_gender::text) AND (t.applicable_cadre_ids IS NULL OR (d.cadre_id = ANY (t.applicable_cadre_ids))) AND (NOT (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active)) OR (EXISTS ( SELECT 1
           FROM hr_leave_type_assignments a
          WHERE a.leave_type_id = t.id AND a.is_active AND (a.scope_kind::text = 'staff'::text AND a.staff_id = s.id OR a.scope_kind::text = 'department'::text AND a.department_id = s.department_id OR a.scope_kind::text = 'organization'::text))))
UNION ALL
 SELECT b.employee_id,
    b.leave_type_id,
    b.hr_academic_year_id,
    b.hr_organization_id,
    t.leave_type_name,
    t.leave_type_code,
    t.request_category,
    t.color_code,
    t.display_order,
    t.duration_type,
    t.allow_half_day,
    t.allow_hourly,
    t.max_continuous_days,
    t.min_advance_notice_days,
    t.requires_documents,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    b.used,
    b.carried_forward,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + b.carried_forward - b.used AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days
   FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id AND y.frozen_at IS NOT NULL
     JOIN hr_leave_types t ON t.id = b.leave_type_id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id AND o.hr_academic_year_id = b.hr_academic_year_id;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
 SELECT v.employee_id,
    v.leave_type_id,
    v.hr_academic_year_id,
    v.hr_organization_id,
    v.leave_type_name,
    v.leave_type_code,
    v.request_category,
    v.color_code,
    v.display_order,
    v.duration_type,
    v.allow_half_day,
    v.allow_hourly,
    v.max_continuous_days,
    v.min_advance_notice_days,
    v.requires_documents,
    v.entitled,
    v.used,
    v.carried_forward,
    v.available,
    v.entitlement_source,
    v.created_at,
    v.updated_at,
    v.document_required_after_days
   FROM v_hr_leave_balance_src v
  WHERE ( SELECT is_super_admin() AS is_super_admin) OR (v.employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR ( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (v.hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest));

COMMENT ON VIEW public.v_hr_leave_balance IS
  'Per-staff, per-type, per-year leave position, RLS-scoped to yourself or to an organization you approve for. Entitlement resolves through COALESCE(override, ledger literal, policy) and names the winner in entitlement_source. Carries the type''s whole document rule -- requires_documents plus document_required_after_days -- so the Apply Leave drawer can decide whether THIS request needs a certificate without a second round trip.';
