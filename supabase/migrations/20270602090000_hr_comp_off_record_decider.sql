-- BUG-006231 (2026-09-30) — "DONT KNOW WHO GIVES THE COMMENTS".
--
-- A comp-off claim's decision never recorded who made it: decideClaim writes
-- status, approved_at and rejection_reason, never approved_by. All 57 decided
-- rows live (46 approved, 11 rejected; read 2026-09-30) have approved_by NULL,
-- so a claimant who is refused cannot tell who refused them.
--
-- 1. trg_hcoc_stamp_decider — the database, not the browser, records the
--    decider. On pending -> approved/rejected it sets approved_by = auth.uid(),
--    overriding anything the client sent. On every other update by a signed-in
--    caller approved_by is pinned to its old value: hcoc_update lets an
--    approver PATCH the column directly, which would otherwise make it
--    forgeable after the fact. A revoke (approved -> rejected) keeps its own
--    stamp, revoked_by, from trg_hcoc_revoke_gate.
--    auth.uid() IS NULL (service role, the nightly auto-reject run by pg_cron)
--    is left alone — there is no person to name, and the auto-reject's reason
--    already says what happened.
--
-- 2. hr_comp_off_balance — the claimant's only read of their claims — returns
--    decided_by_name, so the Compensatory Off tab can say "Rejected by <name>".
--    The body is the live one (pg_get_functiondef, read 2026-09-30, identical
--    to 20260911160000_hr_comp_off_claim_work_location.sql) with ONE added
--    column and a LEFT JOIN to profiles. profiles is readable by every
--    signed-in user (profiles_select_policy: auth.uid() IS NOT NULL), so naming
--    the decider widens nothing. CREATE OR REPLACE keeps the function's grants.
--    The decider of a revoked claim is the person who revoked it (revoked_by),
--    not the one who first approved it.
--    Its EXECUTE is also locked to signed-in callers here (check-secdef-anon-
--    revoke requires it of any SECURITY DEFINER function a migration defines).
--    Live it is PUBLIC/anon-executable today (proacl read 2026-09-30); the only
--    caller is CompOffService.getBalance from the signed-in Time Off pages, and
--    anon got nothing from it anyway (fn_my_staff_ids() is empty without a
--    user). The anon-exposure-functions.json "approved" entry becomes stale —
--    informational only; delete it once this is live.

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_stamp_decider()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    NEW.approved_by := v_uid;
  ELSE
    NEW.approved_by := OLD.approved_by;
  END IF;
  RETURN NEW;
END
$function$;

-- A trigger function is never called directly. EXECUTE is checked when a
-- trigger is CREATED, not when it fires, so revoking it breaks nothing.
REVOKE EXECUTE ON FUNCTION public.hr_trig_comp_off_stamp_decider() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hcoc_stamp_decider ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_stamp_decider
  BEFORE UPDATE ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_stamp_decider();

CREATE OR REPLACE FUNCTION public.hr_comp_off_balance(p_employee_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_emps uuid[];
  v_out  jsonb;
BEGIN
  IF p_employee_id IS NULL THEN
    v_emps := public.fn_my_staff_ids();
  ELSE
    IF p_employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
       OR public.is_super_admin() THEN
      v_emps := ARRAY[p_employee_id];
    ELSIF public.user_has_permission('hr.leave.approve')
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        JOIN public.hr_organizations o ON o.institution_id = s.institution_id
        WHERE s.id = p_employee_id
          AND o.id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
      ) THEN
      v_emps := ARRAY[p_employee_id];
    ELSE
      RAISE EXCEPTION 'Not authorized to read this compensatory off ledger';
    END IF;
  END IF;

  IF v_emps IS NULL OR array_length(v_emps, 1) IS NULL THEN
    RETURN jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'earned',    COALESCE(sum(credit_days) FILTER (WHERE status IN ('approved','consumed')), 0),
    'available', COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on >= CURRENT_DATE), 0),
    'expired',   COALESCE(sum(credit_days) FILTER (WHERE status = 'approved' AND expires_on <  CURRENT_DATE), 0),
    'consumed',  COALESCE(sum(credit_days) FILTER (WHERE status = 'consumed'), 0),
    'pending',   COALESCE(sum(credit_days) FILTER (WHERE status = 'pending'), 0),
    'credits', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.worked_date DESC)
      FROM (
        SELECT c.id, c.worked_date, c.expires_on, c.credit_days, c.status, c.source,
               c.notes, c.rejection_reason, c.work_location, c.work_place,
               CASE WHEN c.status = 'approved' AND c.expires_on < CURRENT_DATE
                    THEN 'expired' ELSE c.status END AS effective_status,
               GREATEST(0, c.expires_on - CURRENT_DATE) AS days_until_expiry,
               CASE WHEN c.status = 'pending' THEN NULL
                    ELSE NULLIF(btrim(d.full_name), '') END AS decided_by_name
        FROM public.hr_comp_off_credits c
        LEFT JOIN public.profiles d ON d.id = COALESCE(c.revoked_by, c.approved_by)
        WHERE c.employee_id = ANY(v_emps)
      ) x
    ), '[]'::jsonb)
  )
  INTO v_out
  FROM public.hr_comp_off_credits
  WHERE employee_id = ANY(v_emps);

  RETURN COALESCE(v_out, jsonb_build_object('earned',0,'available',0,'expired',0,'consumed',0,'pending',0,'credits','[]'::jsonb));
END $function$;

REVOKE EXECUTE ON FUNCTION public.hr_comp_off_balance(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_comp_off_balance(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.hr_comp_off_credits'::regclass
      AND tgname = 'trg_hcoc_stamp_decider' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_hcoc_stamp_decider missing on hr_comp_off_credits';
  END IF;

  IF has_function_privilege('authenticated', 'public.hr_trig_comp_off_stamp_decider()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_trig_comp_off_stamp_decider()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_trig_comp_off_stamp_decider must not be executable by anon/authenticated';
  END IF;

  IF has_function_privilege('anon', 'public.hr_comp_off_balance(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.hr_comp_off_balance(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_comp_off_balance must be executable by authenticated only';
  END IF;

  IF pg_get_functiondef('public.hr_comp_off_balance(uuid)'::regprocedure) NOT LIKE '%decided_by_name%' THEN
    RAISE EXCEPTION 'hr_comp_off_balance does not return decided_by_name';
  END IF;
END $$;
