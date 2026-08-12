-- =====================================================================
-- Point each institution's leave flow at an approver who actually exists
-- =====================================================================
-- The 14 seeded flows all carried approver_role='hr_approver', a documented
-- placeholder meaning "any permitted approver" (types/hr-leave-types.ts:249).
-- That fell through to the permission branch of hla_update, and only
-- ceo/coo/hr_admin/hr_manager/hr_head/managing_director hold that permission
-- -- 8 of 14 institutions had zero such person, so 312 applications sat
-- pending with nobody able to act.
--
-- Now that fn_is_designated_leave_approver() authorizes the person a chain
-- names, pointing each flow at a real role is what unblocks them. No
-- permission grants: a Principal gains approval rights only for applications
-- routed to them, only at their own institution.
--
-- Role is chosen from who actually EXISTS at each institution, not from a
-- hardcoded list, so this stays correct as staffing changes:
--   principal  where the institution has one   (10 institutions)
--   hod        where it has HODs but no principal (Allied Health: 13 HODs, 0 principals)
--   unchanged  where it has neither -- Jicate (13 staff), Education (2),
--              Incubation (0). Those keep the sentinel and remain
--              super-admin-only until somebody is appointed. Left visible
--              rather than papered over.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Repoint the institution catch-all flows.
-- ---------------------------------------------------------------------
WITH choice AS (
  SELECT
    o.id AS org_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.custom_roles r ON r.id = ur.role_id
        JOIN public.profiles p ON p.id = ur.user_id
        WHERE r.role_key = 'principal' AND r.is_active
          AND p.institution_id = o.institution_id
      ) THEN 'principal'
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.custom_roles r ON r.id = ur.role_id
        JOIN public.profiles p ON p.id = ur.user_id
        WHERE r.role_key = 'hod' AND r.is_active
          AND p.institution_id = o.institution_id
      ) THEN 'hod'
      ELSE NULL
    END AS role_key
  FROM public.hr_organizations o
)
UPDATE public.hr_approval_flows f
   SET steps = jsonb_set(f.steps, '{0,approver_role}', to_jsonb(c.role_key)),
       flow_name = 'Staff Leave — ' || initcap(c.role_key) || ' approves (institution default)',
       updated_at = now()
  FROM choice c
 WHERE c.org_id = f.hr_organization_id
   AND f.flow_for = 'leave_approval'
   AND f.is_active
   AND f.valid_until IS NULL
   AND c.role_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Re-stamp the pending backlog.
--
-- approval_chain is a FROZEN snapshot taken at submission, so editing a flow
-- does not reach applications already in flight -- deliberate, it keeps the
-- audit trail honest. The backlog therefore has to be re-stamped explicitly.
--
-- Only status='pending' at current_step=0: an application already part-way
-- through a multi-step chain must keep the chain it was judged against.
-- Shape mirrors LeaveService.buildApprovalChain() exactly (step_order,
-- approver_role, approver_user_id, status, escalate_after_hours) -- a
-- different shape here would save cleanly and then match nobody.
-- ---------------------------------------------------------------------
UPDATE public.hr_leave_applications a
   SET approval_chain = (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'step_order',           COALESCE((s->>'chain_order')::int, 1),
                    'approver_role',        COALESCE(s->>'approver_role', 'hr_approver'),
                    'approver_user_id',     s->'approver_user_id',
                    'status',               'pending',
                    'escalate_after_hours', COALESCE(
                                              (s->>'escalate_after_hours')::int,
                                              f.escalate_after_hours, 48)
                  )
                  ORDER BY COALESCE((s->>'chain_order')::int, 1)
                )
         FROM jsonb_array_elements(f.steps) s
       ),
       updated_at = now()
  FROM public.hr_approval_flows f
 WHERE f.hr_organization_id = a.hr_organization_id
   AND f.flow_for = 'leave_approval'
   AND f.is_active
   AND f.valid_until IS NULL
   AND f.conditions = '{}'::jsonb
   AND a.status = 'pending'
   AND a.current_step = 0;

-- ---------------------------------------------------------------------
-- 3. Post-conditions. Raise rather than commit something wrong.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sentinel_flows integer;
  v_unroutable     integer;
  v_bad_shape      integer;
BEGIN
  -- Flows still on the sentinel must be exactly the institutions with no
  -- principal and no HOD. Any other count means the CASE mis-selected.
  SELECT count(*) INTO v_sentinel_flows
    FROM public.hr_approval_flows f
   WHERE f.flow_for = 'leave_approval' AND f.is_active
     AND f.steps->0->>'approver_role' = 'hr_approver';

  IF v_sentinel_flows <> 3 THEN
    RAISE EXCEPTION
      'Expected 3 flows left on the sentinel (Jicate, Education, Incubation), got %',
      v_sentinel_flows;
  END IF;

  -- Every re-stamped chain must carry the five keys the gate trigger and UI read.
  SELECT count(*) INTO v_bad_shape
    FROM public.hr_leave_applications a
   WHERE a.status = 'pending'
     AND NOT (a.approval_chain->0 ?& array['step_order','approver_role','status','escalate_after_hours']);

  IF v_bad_shape <> 0 THEN
    RAISE EXCEPTION 'Re-stamped chains missing required keys: % rows', v_bad_shape;
  END IF;

  -- Report (do not fail on) applications still unroutable: their institution
  -- has nobody to appoint.
  SELECT count(*) INTO v_unroutable
    FROM public.hr_leave_applications a
   WHERE a.status = 'pending'
     AND a.approval_chain->0->>'approver_role' = 'hr_approver';

  RAISE NOTICE 'Pending applications still unroutable (no principal/HOD at their institution): %',
    v_unroutable;
END $$;

COMMIT;
