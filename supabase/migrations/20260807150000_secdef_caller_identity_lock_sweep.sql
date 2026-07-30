-- Updated: 2026-07-28 - Lock SECURITY DEFINER functions that trust a caller-supplied identity
--
-- WHY
-- A SECURITY DEFINER function that takes a caller-supplied identity parameter
-- (p_user_id / p_learner_id / p_staff_id / p_actor / …) and never checks it
-- against auth.uid() is an IDOR: it runs as the OWNER, so RLS on the underlying
-- tables provides no protection whatsoever. The caller simply names whoever they
-- want to be. That exact shape was live on fn_calendar_items_for_user for five
-- weeks (#2528).
--
-- A sweep of pg_proc on 2026-07-28 found 75 such functions still reachable.
-- This migration closes the subset that can be closed by ACL alone — the ones
-- NO application code calls, so removing the grant cannot change behaviour.
-- Reachability was PROVEN, not inferred: calling
--   POST /rest/v1/rpc/fn_user_is_hod_of_department
-- with only the public anon key returned HTTP 200, while the already-locked
-- fn_calendar_items_for_user returned HTTP 401 on the same probe.
--
-- WHAT IS **NOT** IN THIS MIGRATION
-- The remaining functions ARE called by application code, and several of them
-- legitimately act on somebody else (an administrator removing an induction
-- coordinator names that coordinator's id — that is not an IDOR, that is the
-- feature). Those need a per-function auth.uid()/permission guard, decided one
-- at a time. A blanket revoke there would break working screens, so it is
-- deliberately left out rather than bundled in here.

-- ---------------------------------------------------------------------------
-- GROUP A — used INSIDE RLS policies: revoke anon, KEEP authenticated
-- ---------------------------------------------------------------------------
-- These two are called from policy expressions, which are evaluated with the
-- querying user's privileges. Removing authenticated's EXECUTE would make every
-- signed-in read of the guarded table fail outright, so only anon is revoked.
--   _user_owns_lead_via_counselor_id -> admission_leads (SELECT, UPDATE)
--   fn_user_is_hod_of_department     -> wa_byow_connection_health (SELECT),
--                                       wa_personal_connections  (INSERT)
-- Revoking anon is behaviour-neutral: wa_* policies are TO authenticated, and
-- an anon read of admission_leads already fails 401 inside the same policy on
-- user_has_permission. Verified on production 2026-07-28.

REVOKE EXECUTE ON FUNCTION public._user_owns_lead_via_counselor_id(p_uid uuid, p_counselor_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._user_owns_lead_via_counselor_id(p_uid uuid, p_counselor_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_user_is_hod_of_department(p_user_id uuid, p_department_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_user_is_hod_of_department(p_user_id uuid, p_department_id uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- GROUP B — zero callers anywhere in the app: revoke anon AND authenticated
-- ---------------------------------------------------------------------------
-- Each was grepped across app/, lib/, hooks/, components/ and scripts/ for
-- rpc('<name>') and has no caller. None appears in any RLS policy. Any
-- remaining internal use is from other SECURITY DEFINER functions or triggers,
-- which execute as the owner and are unaffected by these grants.
--
-- The sharpest of these: ims_create_push_transfer was reachable by ANON and
-- writes — it creates a stock transfer and takes p_actor as an argument, so an
-- unauthenticated caller could move inventory attributed to anyone. create_api_key
-- would mint an API key for an arbitrary p_user_id. upsert_user_app_session
-- writes session data for an arbitrary p_user_id.

REVOKE EXECUTE ON FUNCTION public.campus_living_generate_hostel_year_bills(p_hostel_year_id uuid, p_learner_ids uuid[], p_dry_run boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.campus_living_generate_hostel_year_bills(p_hostel_year_id uuid, p_learner_ids uuid[], p_dry_run boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_ai_solution_clearance(p_learner_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_ai_solution_clearance(p_learner_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_api_key(p_user_id uuid, p_name character varying, p_scopes text[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_api_key(p_user_id uuid, p_name character varying, p_scopes text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_emit_drive_email_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_emit_drive_email_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_emit_drive_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_emit_drive_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_emit_placement_auto_decline_notification(p_declined_placement_id uuid, p_accepted_placement_id uuid, p_actor uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_emit_placement_auto_decline_notification(p_declined_placement_id uuid, p_accepted_placement_id uuid, p_actor uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_emit_placement_notification(p_placement_id uuid, p_to_state text, p_actor uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_emit_placement_notification(p_placement_id uuid, p_to_state text, p_actor uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_fp_generate_revision_plan(p_student_id uuid, p_exam_definition_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_generate_revision_plan(p_student_id uuid, p_exam_definition_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(p_learner_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(p_learner_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.hr_resolve_sto_limits(p_leave_type_id uuid, p_staff_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_resolve_sto_limits(p_leave_type_id uuid, p_staff_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ims_create_push_transfer(p_warehouse_store_id uuid, p_dest_store_id uuid, p_actor uuid, p_purpose text, p_lines jsonb, p_dispatch_now boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_create_push_transfer(p_warehouse_store_id uuid, p_dest_store_id uuid, p_actor uuid, p_purpose text, p_lines jsonb, p_dispatch_now boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ims_log_supply_event(p_event_type text, p_request_id uuid, p_shipment_id uuid, p_actor_id uuid, p_summary text, p_metadata jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_log_supply_event(p_event_type text, p_request_id uuid, p_shipment_id uuid, p_actor_id uuid, p_summary text, p_metadata jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ai_bulk_action_count(p_user_id uuid, p_count integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_ai_bulk_action_count(p_user_id uuid, p_count integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_student_billing_summary(p_student_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.refresh_student_billing_summary(p_student_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tms_staff_boarding_eligibility(p_profile_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_user_app_session(p_user_id uuid, p_app_id character varying, p_session_data jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_user_app_session(p_user_id uuid, p_app_id character varying, p_session_data jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- Regression guard — assert the exact end state, fail loudly otherwise
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE r record; v_bad text := '';
BEGIN
  -- Joined to pg_proc by name so every OVERLOAD is checked, and so the
  -- privilege test uses the oid form (the text form cannot parse argument
  -- names, only types).
  FOR r IN
    SELECT t.fname, t.keep_authenticated, p.oid,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_e,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_e
      FROM (VALUES
    ('_user_owns_lead_via_counselor_id', true),
    ('fn_user_is_hod_of_department', true),
    ('campus_living_generate_hostel_year_bills', false),
    ('check_ai_solution_clearance', false),
    ('create_api_key', false),
    ('fn_cdc_emit_drive_email_notification', false),
    ('fn_cdc_emit_drive_notification', false),
    ('fn_cdc_emit_placement_auto_decline_notification', false),
    ('fn_cdc_emit_placement_notification', false),
    ('fn_fp_generate_revision_plan', false),
    ('fn_learner_academic_payment_progress', false),
    ('hr_resolve_sto_limits', false),
    ('ims_create_push_transfer', false),
    ('ims_log_supply_event', false),
    ('increment_ai_bulk_action_count', false),
    ('refresh_student_billing_summary', false),
    ('tms_staff_boarding_eligibility', false),
    ('upsert_user_app_session', false)
           ) AS t(fname, keep_authenticated)
      JOIN pg_proc      p ON p.proname = t.fname
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  LOOP
    IF r.anon_e THEN
      v_bad := v_bad || format(E'\n  %s is still EXECUTE-able by anon', r.fname);
    END IF;
    IF r.authed_e <> r.keep_authenticated THEN
      v_bad := v_bad || format(E'\n  %s authenticated EXECUTE is %s, expected %s',
                               r.fname, r.authed_e, r.keep_authenticated);
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'SECDEF caller-identity lock sweep did not reach the expected state:%', v_bad;
  END IF;
END
$guard$;
