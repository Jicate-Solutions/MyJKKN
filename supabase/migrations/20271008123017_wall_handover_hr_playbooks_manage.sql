-- =====================================================================
-- Handover walls: playbook management stays with HR (Director 8 Oct)
-- =====================================================================
-- Created: 2026-10-08.
--
-- Director ruling, 8 Oct 05:30: a Director handover must NOT be able to hand
-- over hr.harness.playbooks.manage — the key that accepts, declines and retires
-- the HR duty playbook lines every team member reads. #4229 (20271007161139)
-- shipped the key; it matched no clause, so it was HANDABLE by `ELSE false`
-- and specs/director-desk/handover-key-classification.json recorded it so.
--
-- The ONLY change against 20270710090000_wall_handover_safe_split.sql is ONE
-- key added to the WALL 5 IN list (and the comma on the line before it). The
-- rest of the body is that file's text byte for byte. Exact key only:
-- hr.harness.desks.view and every other hr.harness.* key stay handable.
-- Narrows only: no key moves from walled to handable.
--
-- DRIFT GUARD (first statement below). Production could not be read when this
-- file was written. So the file checks for itself at apply time: if the live
-- body of fn_handover_key_is_blocked is not byte-identical to main's
-- 20270710090000 body (md5 of prosrc = 93a506a1025f359d22363b281e9f0e05), it RAISES before replacing
-- anything. The operator's apply wraps the file in one transaction, so a
-- mismatch changes nothing — someone must look at what moved first.
--
-- Grants restated unchanged (REVOKE anon, PUBLIC; GRANT authenticated,
-- service_role). No BEGIN/COMMIT: the operator's apply wraps it.
-- =====================================================================

DO $drift$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_handover_key_is_blocked'
     AND pg_get_function_identity_arguments(p.oid) = 'p_key text';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'fn_handover_key_is_blocked(text) is missing; refusing to create it from this file';
  END IF;
  -- Already this file's body (a re-run): nothing to guard.
  IF v_md5 = '7aec4b7b670f785d3068ea2633c7b916' THEN
    RETURN;
  END IF;
  IF v_md5 <> '93a506a1025f359d22363b281e9f0e05' THEN
    RAISE EXCEPTION 'fn_handover_key_is_blocked drifted from main (live md5 %, expected 93a506a1025f359d22363b281e9f0e05 from 20270710090000). Nothing was changed.', v_md5;
  END IF;
END
$drift$;

CREATE OR REPLACE FUNCTION public.fn_handover_key_is_blocked(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_key IS NULL OR p_key = '' THEN true

    -- ---- WALL 1a: SENTINELS — values that are not permissions at all -------
    -- lib/navigation/permission-filter.ts does not treat every MENU_PERMISSIONS
    -- value as a key to look up. Three of them are SENTINELS the filter reads
    -- structurally, and handing one over does not delegate a page — it flips a
    -- branch in the filter.
    --
    --   `super_admin`  gates FOURTEEN routes (/admin/ai-models — AI provider
    --                  selection and spend caps, /admin/loops, /admin/learner-notes,
    --                  /admin/page-metadata, /admin/proof-disputes, /ai-query/admin,
    --                  /admin/id-cards/policy and seven /internships/policy/* pages).
    --                  The filter's final line was a bare
    --                  `return !!permissions[permission]`, so ONE handover of the
    --                  ID-card printing policy page stored the key `super_admin`
    --                  and opened all fourteen. It is not a permission; it is the
    --                  word "super admin" used as a route marker.
    --   `view_dashboard` / `view_profile`
    --                  are returned true unconditionally by the filter for every
    --                  authenticated user. Handing them over grants nothing and
    --                  would only produce a handover that looks live and does
    --                  nothing — the silent-no-op shape this spec forbids.
    --
    -- Walled, not special-cased downstream, so the refusal happens at grant time
    -- with a message naming the key. The client filter refuses them a second
    -- time (lib/navigation/permission-filter.ts) — one layer is not enough for a
    -- value that means "bypass".
    WHEN p_key IN ('super_admin', 'view_dashboard', 'view_profile') THEN true

    -- ---- WALL 1: access control ------------------------------------------
    -- The escape hatch, and the only wall whose breach OUTLIVES the handover.
    -- Anyone handed one of these could give themselves a role — and that role
    -- survives the handover being revoked or expiring, defeating decision 4
    -- entirely. `users.%` and `settings.%` are whole namespaces here rather than
    -- a list of keys: `users.create`/`users.edit` reach the user-management
    -- screens where roles are assigned, and one new key under either prefix
    -- would otherwise reopen the hole. `director.handover.%` is walled ON
    -- PURPOSE: without it, the first thing handed over could be the power to
    -- hand things over, and the master key propagates in spite of decision 5.
    WHEN p_key = 'roles'             OR p_key LIKE 'roles.%'             THEN true
    WHEN p_key = 'users'             OR p_key LIKE 'users.%'             THEN true
    WHEN p_key = 'settings'          OR p_key LIKE 'settings.%'          THEN true
    WHEN p_key = 'permissions'       OR p_key LIKE 'permissions.%'       THEN true
    WHEN p_key = 'director.handover' OR p_key LIKE 'director.handover.%' THEN true
    -- Anything whose NAME says it writes a role assignment or a profile role,
    -- wherever it lives in the tree. Catches e.g. `<module>.user_roles.manage`
    -- or `<module>.role.assign` shipped by a module that never read this file.
    WHEN p_key LIKE '%user_roles%'                                       THEN true
    WHEN p_key LIKE '%.role.assign'  OR p_key LIKE '%.role.grant'        THEN true
    WHEN p_key LIKE '%.roles.assign' OR p_key LIKE '%.roles.grant'       THEN true
    WHEN p_key LIKE '%.impersonate'  OR p_key LIKE '%impersonation%'     THEN true

    -- ---- WALL 1b: keys that AUTHORISE A ROLE WRITE ------------------------
    -- Wall 1 above is keyed on the NAME of the permission, and a name is not
    -- what makes a key dangerous. `organizations.leadership.manage` is named
    -- after its module; what it actually does is DELETE the sitting Principal's
    -- user_roles row and INSERT the receiver's with is_primary = true, firing
    -- sync_primary_role_trigger, which writes profiles.role = 'principal'. On
    -- day 8 the handover expires. The user_roles row and profiles.role DO NOT.
    -- The receiver is permanently Principal and the real Principal has been
    -- stripped — decision 4 broken at the root, by a key that passed every
    -- name-shaped wall above.
    --
    -- This list is NOT hand-written and NOT a guess. It is derived from the SQL
    -- by __tests__/director-desk/role-write-sweep.test.ts, which reads every
    -- function definition in supabase/, keeps the SECURITY DEFINER ones whose
    -- body writes user_roles / custom_roles / profiles.role /
    -- profiles.is_super_admin / user_institution_access, resolves the
    -- user_has_permission('...') keys that authorise them (following one level
    -- of `can-manage` helper), and FAILS if any such key is not walled here.
    -- The result is recorded as a maintained artifact in
    -- specs/director-desk/role-writing-functions.json.
    --
    -- The 2026-08-05 sweep found three authorising keys (two more on 2026-09-14, below):
    --   organizations.leadership.manage -> fn_set_college_leadership
    --   admission.counselors.create     -> assign_counselor_role   (the
    --       `counselor` role is institution_scope='all' — a handover of one
    --       college's counselor page would mint a permanent CLUSTER-WIDE role)
    --   staff.create                    -> mirror_staff_role_to_user_roles
    --       (already walled by wall 2 below; left there, and asserted by the
    --       sweep, so removing it from wall 2 fails this gate too)
    -- Every other role-writing function is a trigger or is gated on a role_key
    -- rather than a permission key, and so is unreachable from a handover.
    WHEN p_key = 'organizations.leadership'
      OR p_key LIKE 'organizations.leadership.%'                          THEN true
    WHEN p_key = 'admission.counselors.create'                            THEN true
    -- added 2026-09-14 — the sweep (role-write-sweep.test.ts) found two more
    -- after the audit and course-events modules landed:
    --   audit.external_auditor.manage -> fn_extend_institution_access,
    --       revoke_all_user_institution_access  (writes user_institution_access:
    --       a handover could extend or strip a person's institution access, and
    --       that row outlives the handover)
    --   courses.applications.decide   -> fn_course_approve_application (approving
    --       an application mints the participant's role; the role outlives the
    --       handover)
    WHEN p_key = 'audit.external_auditor.manage'                          THEN true
    WHEN p_key = 'courses.applications.decide'                            THEN true

    -- ---- WALL 2: salary and team-member files ----------------------------
    -- Pay, contracts, disciplinary records, personal files.
    -- NOT walled: routine hr.leave.apply/approve/view, hr.attendance.%,
    -- hr.dashboard.%, hr.policies.% — approving a colleague's leave is ordinary
    -- delegated work, not a personnel file. Flagged in SPEC.md for correction.
    WHEN p_key = 'hr.payroll'              OR p_key LIKE 'hr.payroll.%'              THEN true
    WHEN p_key = 'hr.employees'            OR p_key LIKE 'hr.employees.%'            THEN true
    WHEN p_key = 'hr.documents'            OR p_key LIKE 'hr.documents.%'            THEN true
    WHEN p_key = 'hr.performance_reviews'  OR p_key LIKE 'hr.performance_reviews.%'  THEN true
    WHEN p_key = 'hr.promotion.case'       OR p_key LIKE 'hr.promotion.case.%'       THEN true
    WHEN p_key = 'hr.counseling'           OR p_key LIKE 'hr.counseling.%'           THEN true
    WHEN p_key = 'hr.grievance'            OR p_key LIKE 'hr.grievance.%'            THEN true
    WHEN p_key = 'hr.memos'                OR p_key LIKE 'hr.memos.%'                THEN true
    WHEN p_key = 'hr.recruitment.packages' OR p_key LIKE 'hr.recruitment.packages.%' THEN true
    WHEN p_key = 'hr.leave.encashment'     OR p_key LIKE 'hr.leave.encashment.%'     THEN true
    WHEN p_key IN ('staff.create','staff.edit','staff.delete','staff.status_update','staff.role.change')
                                                 THEN true

    -- ---- WALL 3: exam marks and results ----------------------------------
    -- Both spellings. Seeing every learner's marks is itself the sensitive act,
    -- so this wall blocks reads as well as writes.
    WHEN p_key = 'academic.internal-marks'   OR p_key LIKE 'academic.internal-marks.%'   THEN true
    WHEN p_key = 'academic.internal_marks'   OR p_key LIKE 'academic.internal_marks.%'   THEN true
    WHEN p_key = 'academic.course-grades'    OR p_key LIKE 'academic.course-grades.%'    THEN true
    WHEN p_key = 'academic.exam_eligibility' OR p_key LIKE 'academic.exam_eligibility.%' THEN true
    WHEN p_key = 'lti.grade_sync'            OR p_key LIKE 'lti.grade_sync.%'            THEN true

    -- ---- WALL 4: money MOVEMENT (reports stay handable) -------------------
    -- Read-shaped billing keys are released first, then everything else in the
    -- money namespace is walled. Order matters: the exemption must precede the
    -- block or the reports get caught too. `admission_fees` uses the SAME
    -- exemption shape as billing — an earlier revision exempted only the exact
    -- key `admission_fees.read`, which walled `admission_fees.view` and
    -- `admission_fees.export`: reports, which decision 3 keeps handable.
    WHEN p_key LIKE 'billing.%'
     AND (p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export'
          OR p_key LIKE 'billing.analytics.%' OR p_key LIKE 'billing.coverage.%')
                                                 THEN false
    WHEN p_key LIKE 'admission_fees.%'
     AND (p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export')
                                                 THEN false
    -- No dot in these two patterns, so they already match the bare prefix key.
    WHEN p_key LIKE 'billing%'                   THEN true
    WHEN p_key LIKE 'admission_fees%'            THEN true
    -- Money that moves OUTSIDE the billing/admission_fees namespaces.
    --
    -- The four originally listed here were found by eye and were not enough. This
    -- list is the output of a mechanical sweep of all 1,393 keys in
    -- lib/constants/permissions.ts reading the LABEL, not the key prefix —
    -- matching pay/payment/payout/disburse/refund/waive/reconcile/settle/collect/
    -- write-off/adjust/invoice/receipt/charge/fee and excluding read-shaped labels
    -- (view/read/export/report/analytics/dashboard/list/history/audit).
    -- It returned 13; only 4 were walled. The 9 additions are marked below.
    --
    -- Prefix walls could never have caught these: the key is named after its
    -- MODULE (campus_living, ims, learners, procurement) while the money-ness
    -- lives only in the label. That is the same shape as the role-write keys in
    -- wall 1b — a wall keyed on names cannot see what a permission DOES.
    WHEN p_key IN (
                   -- originally walled
                   'campus_living.deposits.refund',      -- Refund Deposit
                   'campus_living.fees.refund',          -- Refund Fee
                   'ims.sales.refund',                   -- Refund / Void Sales
                   'dashboard.queue.approve.waiver',     -- Approve fee waivers from queue
                   -- added 2026-08-05 by the label sweep
                   'campus_living.fees.waive',           -- Waive Fee (forgives money owed)
                   'campus_living.fees.config',          -- Configure Fee Structure (sets what is owed)
                   'campus_living.maintenance.approve_payment', -- Approve Vendor Payment
                   'campus_living.mess.caterers.pay',    -- Process Caterer Payment
                   'campus_living.mess.billing.reconcile', -- Reconcile Mess Billing
                   'campus_living.parent_portal.pay_fee',-- Parent Portal — Pay Fee
                   'learners.finance.edit',              -- Edit Finance Details (Fee Structure)
                   'ims.stock.adjust',                   -- Adjust Stock (Write-off, Correction)
                   'procurement.grn_create'              -- Goods Receipt Notes — creates a payable
                  )                              THEN true

    -- ---- WALL 5: added 2026-10-01 (Director's "safe split", W12 tab 30 Sep) --
    -- Keys that change how a module works for everyone, or approve a learner's
    -- exit, stay with their owner during a handover. The read/apply keys of the
    -- same modules (learners.leave_types.view, learners.leave_onduty.apply_bulk,
    -- events.edit) are deliberately left handable.
    WHEN p_key IN (
                   'learners.leave_types.manage',          -- define leave types and their approval flows
                   'ims.settings.pos_devices.manage',      -- register / retire point-of-sale devices
                   'admission.consultants.commissions.configure', -- set consultant commission rates (money)
                   -- 1 Oct vacate settings (Director 2 Oct: "Approvals can, settings can't")
                   'campus_living.damage_types.manage',    -- damage types and their fines (money)
                   'campus_living.vacate_checklist.manage', -- the vacate checklist every hosteller follows
                   -- 8 Oct (Director, 05:30): who decides how an HR duty is done stays with HR
                   'hr.harness.playbooks.manage'           -- accept / decline / retire HR playbook lines
                  )                              THEN true

    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) TO authenticated, service_role;

DO $assert$
BEGIN
  IF NOT public.fn_handover_key_is_blocked('hr.harness.playbooks.manage') THEN
    RAISE EXCEPTION 'hr.harness.playbooks.manage is still handable';
  END IF;
  IF NOT public.fn_handover_key_is_blocked('learners.leave_types.manage')
     OR NOT public.fn_handover_key_is_blocked('campus_living.vacate_checklist.manage')
     OR NOT public.fn_handover_key_is_blocked('staff.role.change') THEN
    RAISE EXCEPTION 'an earlier wall was lost';
  END IF;
  IF public.fn_handover_key_is_blocked('hr.harness.desks.view')
     OR public.fn_handover_key_is_blocked('learners.leave_types.view')
     OR public.fn_handover_key_is_blocked('events.edit')
     OR public.fn_handover_key_is_blocked('campus_living.vacate_requests.approve_principal') THEN
    RAISE EXCEPTION 'a key the Director kept handable became walled';
  END IF;
  IF has_function_privilege('anon', 'public.fn_handover_key_is_blocked(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_handover_key_is_blocked';
  END IF;
END
$assert$;
