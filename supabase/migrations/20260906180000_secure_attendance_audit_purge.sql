-- ============================================================================
-- fn_purge_attendance_audit_log WAS CALLABLE BY ANY LOGGED-IN USER (2026-09-06)
--
-- Found while extending the HR institution gate. This is a bigger problem than
-- the gate itself, so it is fixed on its own rather than folded in.
--
-- WHAT WAS WRONG. The function is SECURITY DEFINER — it runs with the owner's
-- rights — and it permanently DELETEs rows from hr_attendance_audit_log for
-- EVERY institution. As shipped it had:
--
--   * EXECUTE granted to `authenticated`, i.e. every logged-in account across
--     all 104 roles — student, driver, guest included;
--   * NO authorization check of any kind in its body;
--   * NO `SET search_path`, which on a SECURITY DEFINER function is a
--     privilege-escalation vector in its own right.
--
-- So any authenticated caller could destroy attendance audit history platform
-- wide, irreversibly. Nothing in the application calls it and no pg_cron job
-- schedules it — it is dormant maintenance code, which is likely why the gap
-- went unnoticed.
--
-- WHAT IS FIXED: an explicit authorization check, a pinned search_path,
-- schema-qualified table references, and EXECUTE reduced to service_role.
--
-- WHY EXCLUDED INSTITUTIONS ARE STILL PURGED — a deliberate exception to the
-- rest of this sweep. Everywhere else the institution gate prevents EXPOSURE.
-- Here, skipping an excluded institution would prevent CLEANUP: its audit log
-- would grow for ever and never age out, and re-including it years later would
-- hand you the whole backlog at once. Retention is a compliance and storage
-- obligation that does not pause because an institution left the HR module, and
-- the per-institution retention config on hr_organizations stays valid either
-- way. Purging continues for all institutions, on purpose.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_purge_attendance_audit_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total INT := 0;
  v_org RECORD;
  v_deleted INT;
  v_years INT;
  v_policy_default INT;
BEGIN
  -- The check that was missing. auth.role() reads the JWT, so it reports the
  -- CALLER rather than the definer; current_user would be the owner here and
  -- would pass for everyone.
  IF NOT (public.is_super_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION
      'Purging the attendance audit log is restricted to super administrators and scheduled jobs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_policy_default := public.fn_get_policy_int('hr.attendance.audit.retention_years', 7, NULL);

  -- Every institution, including any excluded from the HR module. See the
  -- header: retention must not stop just because an institution is hidden.
  FOR v_org IN
    SELECT institution_id, MIN(audit_retention_years) AS years
    FROM public.hr_organizations
    WHERE institution_id IS NOT NULL
    GROUP BY institution_id
  LOOP
    v_years := COALESCE(
      public.fn_get_policy_int('hr.attendance.audit.retention_years', NULL, v_org.institution_id),
      v_org.years,
      v_policy_default,
      7
    );

    DELETE FROM public.hr_attendance_audit_log
      WHERE institution_id = v_org.institution_id
        AND created_at < NOW() - (v_years || ' years')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
  END LOOP;

  RETURN v_total;
END;
$function$;

COMMENT ON FUNCTION public.fn_purge_attendance_audit_log() IS
  'Deletes attendance audit rows past each institution''s retention window. Super-admin or service_role only. Purges EVERY institution, including those excluded from the HR module — retention is a compliance obligation, not a visibility one.';

-- A destructive maintenance function has no business being reachable by a
-- logged-in end user. authenticated is removed; service_role keeps it for
-- scheduled runs, and a super admin reaches it through the body check above.
REVOKE ALL ON FUNCTION public.fn_purge_attendance_audit_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purge_attendance_audit_log() TO service_role;
