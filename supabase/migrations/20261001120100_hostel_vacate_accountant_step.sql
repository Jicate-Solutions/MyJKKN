-- ============================================================================
-- Hostel vacate: Accounts approval step, Mess clearance step removed
-- ============================================================================
-- draft -> [submit] -> pending_dues (auto bill check) -> pending_accountant
--       -> pending_principal -> pending_warden (checklist + room inspection)
--       -> pending_cao -> pending_fine (only when damage_total > 0) -> completed
--
-- Mess clearance is no longer a step. Its enum value / permission key / approval
-- rows stay so history keeps rendering; fn_cl_vacate_advance still moves a
-- stranded pending_mess row on to the CAO.
--
-- Builds on 20261001110000_hostel_vacate_approval_chain_damage_fine.sql — only
-- the functions whose body changes are redefined here.
-- ============================================================================

-- ─── 0. Backup of the role grants this migration edits ─────────────────────
CREATE TABLE IF NOT EXISTS public.bak_vacate_accountant_role_grants_20261001 AS
SELECT id, role_key, permissions, now() AS backed_up_at
FROM public.custom_roles
WHERE role_key = 'accounts';
ALTER TABLE public.bak_vacate_accountant_role_grants_20261001 ENABLE ROW LEVEL SECURITY;

-- ─── 1. Approval log accepts the new step ──────────────────────────────────
ALTER TABLE public.hostel_vacate_approvals DROP CONSTRAINT IF EXISTS hostel_vacate_approvals_step_check;
ALTER TABLE public.hostel_vacate_approvals
  ADD CONSTRAINT hostel_vacate_approvals_step_check
  CHECK (step IN ('bills', 'accountant', 'principal', 'warden', 'mess', 'cao', 'fine'));

-- ─── 2. One open request per allocation — includes the new status ──────────
DROP INDEX IF EXISTS public.hvr_one_open_per_allocation;
CREATE UNIQUE INDEX hvr_one_open_per_allocation
  ON public.hostel_vacate_requests (allocation_id)
  WHERE status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved',
                   'pending_accountant', 'pending_principal', 'pending_mess', 'pending_cao', 'pending_fine');

-- ─── 3. Helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._cl_vacate_step_perm(p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_status
    WHEN 'pending_accountant' THEN 'campus_living.vacate_requests.approve_accountant'
    WHEN 'pending_principal'  THEN 'campus_living.vacate_requests.approve_principal'
    WHEN 'pending_warden'     THEN 'campus_living.vacate_requests.approve_warden'
    WHEN 'pending_mess'       THEN 'campus_living.vacate_requests.approve_mess'
    WHEN 'pending_cao'        THEN 'campus_living.vacate_requests.approve_cao'
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_step_perm(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_step_perm(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._cl_vacate_step_name(p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_status
    WHEN 'pending_accountant' THEN 'accountant'
    WHEN 'pending_principal'  THEN 'principal'
    WHEN 'pending_warden'     THEN 'warden'
    WHEN 'pending_mess'       THEN 'mess'
    WHEN 'pending_cao'        THEN 'cao'
    WHEN 'pending_fine'       THEN 'fine'
    WHEN 'pending_dues'       THEN 'bills'
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_step_name(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_step_name(text) TO authenticated, service_role;

-- Step 1 -> 2 when every hostel/mess bill is settled. Used by recheck + trigger.
CREATE OR REPLACE FUNCTION public._cl_vacate_advance_from_dues(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r     public.hostel_vacate_requests%ROWTYPE;
  v_out numeric;
BEGIN
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending_dues' THEN
    RETURN false;
  END IF;
  v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;
  IF v_out > 0 THEN
    RETURN false;
  END IF;
  UPDATE public.hostel_vacate_requests
     SET status = 'pending_accountant', updated_at = now()
   WHERE id = r.id;
  PERFORM public._cl_vacate_log(r.id, 'bills', 'system', NULL, 'All hostel and mess bills are cleared');
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_advance_from_dues(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_advance_from_dues(uuid) TO service_role;

-- ─── 4. Submit: bills cleared -> straight to Accounts ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_submit(p_request_id uuid)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_vacate_requests;
  v_out numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin() OR r.submitted_by_id = v_uid) THEN
    RAISE EXCEPTION 'Only the person who raised this request can submit it' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'Request is not a draft (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  IF r.reason_type = 'medical' AND NOT EXISTS (
    SELECT 1 FROM public.hostel_vacate_documents d
     WHERE d.vacate_request_id = r.id AND d.document_type = 'medical_certificate'
  ) THEN
    RAISE EXCEPTION 'Medical-reason vacates require a medical certificate before submit'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.hostel_clearance_items
    (vacate_request_id, item_key, item_label, is_required, sort_order, checklist_item_id)
  SELECT r.id, 'chk_' || replace(m.id::text, '-', ''), m.item_label, m.is_required, m.sort_order, m.id
    FROM public.hostel_vacate_checklist_items m
   WHERE m.is_active
     AND (m.applies_to_reasons IS NULL OR r.reason_type = ANY (m.applies_to_reasons))
  ON CONFLICT (vacate_request_id, item_key) DO NOTHING;

  -- Step 1: automatic bill check. Cleared -> straight to Accounts.
  v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;

  UPDATE public.hostel_vacate_requests
     SET status = CASE WHEN v_out > 0 THEN 'pending_dues' ELSE 'pending_accountant' END::public.vacate_request_status_enum,
         warden_last_action_at = now(),
         updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  PERFORM public._cl_vacate_log(
    r.id, 'bills', 'system', NULL,
    CASE WHEN v_out > 0
         THEN 'Submitted — outstanding hostel/mess bills: ' || v_out::text
         ELSE 'Submitted — all hostel and mess bills are cleared' END);

  -- Hold the bed while the request is open (still occupied, not reallocatable).
  UPDATE public.hostel_allocations
     SET status = 'pending_vacate', updated_at = now()
   WHERE id = r.allocation_id AND status = 'active';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) TO authenticated, service_role;

-- ─── 5. Create: duplicate-open check knows the new status ──────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_create(
  p_allocation_id  uuid,
  p_reason_type    public.vacate_reason_enum,
  p_reason_text    text,
  p_requested_date date,
  p_medical_notes  text DEFAULT NULL
)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  a           public.hostel_allocations%ROWTYPE;
  v_on_behalf boolean;
  v_type      public.hostel_resident_type_enum;
  v_row       public.hostel_vacate_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.hostel_allocations WHERE id = p_allocation_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active allocation can be vacated (current status: %)', a.status
      USING ERRCODE = 'P0001';
  END IF;

  v_on_behalf := a.learner_id IS DISTINCT FROM v_uid;

  IF v_on_behalf THEN
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR (public.user_has_permission('campus_living.vacate_requests.submit_on_behalf')
                AND public.fn_cl_vacate_scope_ok(a.institution_id, a.id))) THEN
      RAISE EXCEPTION 'Not authorized to raise a vacate request for this resident'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.is_super_admin() OR public.is_admin()
             OR public.user_has_permission('campus_living.vacate_requests.submit')) THEN
    RAISE EXCEPTION 'Not authorized to submit a vacate request' USING ERRCODE = '42501';
  END IF;

  IF p_reason_text IS NULL OR char_length(btrim(p_reason_text)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;
  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'Requested vacate date is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hostel_vacate_requests x
     WHERE x.allocation_id = a.id
       AND x.status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved',
                        'pending_accountant', 'pending_principal', 'pending_mess', 'pending_cao', 'pending_fine')
  ) THEN
    RAISE EXCEPTION 'An open vacate request already exists for this allocation' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE((SELECT resident_type FROM public.hostel_residents WHERE id = a.resident_id), 'learner')
    INTO v_type;

  INSERT INTO public.hostel_vacate_requests (
    institution_id, allocation_id, resident_id, learner_id, resident_type,
    reason_type, reason_text, requested_vacate_date,
    is_permanent, is_scheduled, has_medical_grounds, medical_notes,
    status, submitted_by_id, submitted_on_behalf_of_id
  ) VALUES (
    a.institution_id, a.id, a.resident_id, a.learner_id, v_type,
    p_reason_type, btrim(p_reason_text), p_requested_date,
    p_reason_type <> 'semester_end',
    p_reason_type IN ('graduation', 'semester_end', 'transfer'),
    p_reason_type = 'medical',
    CASE WHEN p_reason_type = 'medical' THEN NULLIF(btrim(COALESCE(p_medical_notes, '')), '') END,
    'draft', v_uid,
    CASE WHEN v_on_behalf THEN a.learner_id END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_create(uuid, public.vacate_reason_enum, text, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_create(uuid, public.vacate_reason_enum, text, date, text) TO authenticated, service_role;

-- ─── 6. Approve — one RPC, dispatches on the current step ──────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_advance(
  p_request_id uuid,
  p_remarks    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  r          public.hostel_vacate_requests%ROWTYPE;
  v_perm     text;
  v_step     text;
  v_pending  integer;
  v_out      numeric;
  v_fine     uuid;
  v_final    jsonb;
  v_next     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  v_perm := public._cl_vacate_step_perm(r.status::text);
  v_step := public._cl_vacate_step_name(r.status::text);
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'Request is not waiting for an approval (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission(v_perm)
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to approve this step (%)', v_step USING ERRCODE = '42501';
  END IF;

  IF r.status = 'pending_accountant' THEN
    -- The bills must still be clear at the moment Accounts signs off.
    v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;
    IF v_out > 0 THEN
      RAISE EXCEPTION 'Unpaid hostel bills: % outstanding. Clear them before approving.', v_out
        USING ERRCODE = 'P0001';
    END IF;
    v_next := 'pending_principal';

  ELSIF r.status = 'pending_principal' THEN
    v_next := 'pending_warden';

  ELSIF r.status = 'pending_warden' THEN
    SELECT COUNT(*) INTO v_pending
      FROM public.hostel_clearance_items
     WHERE vacate_request_id = r.id AND is_required AND NOT is_cleared;
    IF v_pending > 0 THEN
      RAISE EXCEPTION '% required checklist item(s) are not cleared yet', v_pending USING ERRCODE = 'P0001';
    END IF;
    IF NOT r.room_inspected THEN
      RAISE EXCEPTION 'Record the room inspection (damages, or "No damage") before approving'
        USING ERRCODE = 'P0001';
    END IF;
    v_next := 'pending_cao';

  ELSIF r.status = 'pending_mess' THEN
    -- Retired step: only a row stranded here before the change lands on it.
    v_next := 'pending_cao';

  ELSE -- pending_cao
    v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;
    IF v_out > 0 THEN
      RAISE EXCEPTION 'Unpaid hostel bills: % outstanding. Clear them before approving.', v_out
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM public._cl_vacate_log(r.id, v_step, 'approved', v_uid, p_remarks);

  IF r.status <> 'pending_cao' THEN
    UPDATE public.hostel_vacate_requests
       SET status = v_next::public.vacate_request_status_enum,
           warden_last_action_at = now(), updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', true, 'request_id', r.id, 'status', v_next);
  END IF;

  -- CAO: final approval.
  UPDATE public.hostel_vacate_requests
     SET approved_by = v_uid, approved_at = now(),
         approval_remarks = NULLIF(btrim(COALESCE(p_remarks, '')), ''),
         updated_at = now()
   WHERE id = r.id;

  IF COALESCE(r.damage_total, 0) > 0 THEN
    v_fine := public._cl_vacate_create_fine_bill(r.id, v_uid);
    UPDATE public.hostel_vacate_requests
       SET status = 'pending_fine', updated_at = now()
     WHERE id = r.id;
    PERFORM public._cl_vacate_log(r.id, 'fine', 'system', NULL,
      'Fine bill raised for room damage: ' || r.damage_total::text);
    RETURN jsonb_build_object('success', true, 'request_id', r.id, 'status', 'pending_fine',
                              'fine_bill_id', v_fine, 'fine_amount', r.damage_total);
  END IF;

  v_final := public._cl_vacate_finalize(r.id);
  RETURN v_final || jsonb_build_object('status', 'completed');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_advance(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_advance(uuid, text) TO authenticated, service_role;

-- ─── 7. Cancel: the new status can be cancelled too ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_cancel(p_request_id uuid, p_reason text)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  r      public.hostel_vacate_requests%ROWTYPE;
  v_perm text;
  v_row  public.hostel_vacate_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  v_perm := public._cl_vacate_step_perm(r.status::text);
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR r.submitted_by_id = v_uid OR r.learner_id = v_uid
          OR ((public.user_has_permission('campus_living.vacate_requests.cancel')
               OR (v_perm IS NOT NULL AND public.user_has_permission(v_perm)))
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to cancel this vacate request' USING ERRCODE = '42501';
  END IF;
  -- pending_fine is past the point of no return: the CAO already approved and a
  -- bill exists. Accounts cancels that bill through its own flow instead.
  IF r.status NOT IN ('draft', 'pending_dues', 'pending_accountant', 'pending_principal', 'pending_warden',
                      'pending_mess', 'pending_cao') THEN
    RAISE EXCEPTION 'Cannot cancel a request in status %', r.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status = 'cancelled', cancelled_reason = btrim(p_reason),
         completed_at = now(), updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  IF r.status <> 'draft' THEN
    PERFORM public._cl_vacate_log(r.id, COALESCE(public._cl_vacate_step_name(r.status::text), 'bills'),
                                  'cancelled', v_uid, p_reason);
  END IF;

  UPDATE public.hostel_allocations
     SET status = 'active', updated_at = now()
   WHERE id = r.allocation_id AND status = 'pending_vacate';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) TO authenticated, service_role;

-- ─── 8. Permission grants (merge with ||, never replace) ───────────────────
DO $$
DECLARE
  v_hit int;
BEGIN
  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'campus_living.vacate_requests.view',               true,
           'campus_living.vacate_requests.approve_accountant', true),
         updated_at = now()
   WHERE role_key = 'accounts';
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN RAISE WARNING 'role accounts not found; approve_accountant not granted'; END IF;
END $$;

COMMENT ON FUNCTION public.fn_cl_vacate_advance(uuid, text) IS
  'Approve the step a vacate request is at (accountant -> principal -> warden -> CAO). Permission per step + scope checked in the DB. Accountant and CAO steps re-check hostel/mess bills; warden step needs required checklist ticked and the room inspection recorded; CAO raises ONE fine bill (pending_fine) when damages exist, else completes.';
