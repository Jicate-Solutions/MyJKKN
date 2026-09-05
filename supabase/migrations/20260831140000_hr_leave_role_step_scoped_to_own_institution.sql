-- ============================================================================
-- A role-based approval step is OWN-INSTITUTION only
-- 2026-08-31 (follows 20260831130000_hr_leave_designated_approver_reaches_queue)
-- ----------------------------------------------------------------------------
-- fn_leave_step_admits' role branch tested fn_my_hr_organization_ids(), which
-- goes through role_has_institution_access() -- and that returns TRUE as soon as
-- ANY role the user holds has institution_scope='all', plus a legacy
-- profiles.role fallback. Institution scope is therefore the UNION over a
-- person's roles, so a role with nothing to do with leave silently widens leave
-- approval.
--
-- MEASURED 2026-08-31. 12 of 95 HODs and 2 of 14 Principals hold a stray
-- staff_counselor / admission_counselor / health_supervisor / admission /
-- nif_coordinator role. Every one of them would have seen and approved ALL 14
-- institutions' requests routed to their rung. After this they see 1 (2 where a
-- CAS sibling exists).
--
-- NEW RULE. Group-wide reach on a ROLE step is earned by the hr.leave.approve
-- key -- hr_head, hr_admin, hr_manager, ceo, coo, managing_director -- or by
-- being a super admin. That resolves to 10 super admins + HR Head (2) + CEO +
-- COO on live data. Anyone admitted merely by HOLDING THE STEP'S ROLE is
-- confined to institutions they actually belong to.
--
-- THE PINNED BRANCH IS DELIBERATELY UNCHANGED. Naming a specific person is an
-- explicit act and a pinned approver has always been reachable across
-- institutions; see the pinned-approver-exempt-from-org-scope note. This changes
-- ROLE routing only.
-- ============================================================================

-- Institutions a designated approver genuinely belongs to.
--
-- Deliberately NOT role_has_institution_access(): this omits its two
-- institution_scope='all' shortcuts and keeps only the three memberships that
-- are real -- own staff institution, CAS sibling (same counselling_code, 14
-- institutions carry one), and an explicit user_institution_access grant (109
-- active, 14 held by ladder holders), which is an administrator widening someone
-- on purpose rather than a side effect of an unrelated role.
CREATE OR REPLACE FUNCTION public.fn_my_designated_hr_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH own AS (
    SELECT s.institution_id AS id
    FROM public.staff s
    WHERE s.profile_id = auth.uid() AND s.is_active
  )
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  WHERE o.institution_id IN (SELECT id FROM own)
     OR o.institution_id IN (
          SELECT sib.id
          FROM public.institutions sib
          JOIN public.institutions mine ON mine.counselling_code = sib.counselling_code
          WHERE mine.counselling_code IS NOT NULL
            AND mine.id IN (SELECT id FROM own)
        )
     OR o.institution_id IN (
          SELECT uia.institution_id
          FROM public.user_institution_access uia
          WHERE uia.user_id = auth.uid() AND uia.is_active
        );
$function$;

CREATE OR REPLACE FUNCTION public.fn_leave_step_admits(
  p_step jsonb,
  p_uid uuid,
  p_hr_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fn_leave_step_approvers(p_step) e
    WHERE p_uid IS NOT NULL
      AND (
        -- Pinned: an explicit naming, reachable from any institution.
        e.approver_user_id = p_uid
        OR (
          e.approver_role IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p_uid
              AND cr.role_key = e.approver_role
              AND cr.is_active
          )
          AND (
            -- Cheap tests first; the array builds are only reached for a caller
            -- who is neither a super admin nor an HR-level approver.
            public.is_super_admin()
            OR (
              public.user_has_permission('hr.leave.approve')
              AND p_hr_organization_id = ANY (
                    COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
            )
            OR p_hr_organization_id = ANY (
                 COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]))
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_my_designated_hr_org_ids() FROM anon;
