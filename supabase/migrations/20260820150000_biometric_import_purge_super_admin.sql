-- HR Attendance — super-admin-only purge of one imported biometric month.
--
-- WHY THIS EXISTS
-- ---------------
-- Re-importing the same month overwrites cleanly (the upsert is keyed on
-- employee_id,work_date), but there is no way to UNDO an import: a file loaded
-- against the wrong machine, or a month imported before the shift timings were
-- configured, leaves rows that no subsequent import touches, because the next
-- file simply does not contain those (employee, date) pairs.
--
-- THE DELETION UNIT IS (MACHINE, MONTH), NOT (STAFF INSTITUTION, MONTH)
-- ---------------------------------------------------------------------
-- Keyed on biometric_institution_id — the institution whose MACHINE produced
-- the file — never on institution_id, which is the staff member's own college.
-- The two genuinely differ: as of 2026-08-20 the Main Office machine's July
-- 2026 import holds 1,255 rows for 41 staff spread across SIX institutions.
-- Keying on institution_id would leave five colleges' rows behind on an "undo
-- Main Office July" and would delete Main Office staff whose punches came off a
-- different machine. The file is the unit of import, so the file is the unit of
-- undo.
--
-- source = 'biometric' is checked on every statement. Attendance entered by a
-- human, or arriving from any future source, is never in scope no matter what
-- biometric_institution_id happens to be set on the row.
--
-- CHILDREN: DETACHED, NOT DESTROYED
-- ----------------------------------
-- Two FKs point at hr_attendance_records(id), both ON DELETE NO ACTION, so a
-- plain DELETE raises 23503 the moment either table has a row:
--   hr_attendance_regularizations.attendance_record_id
--   hr_attendance_audit_log.attendance_record_id
-- Both columns are NULLABLE and both tables carry their own employee_id and
-- date, so the purge NULLs the pointer instead of deleting the child. That is
-- deliberate and is not laziness about the FK:
--   * a regularization is a STAFF MEMBER's request to correct a day. Undoing an
--     administrator's bad import must not silently destroy someone else's
--     pending request; it survives, unlinked, and a re-import gives it an
--     anchor again.
--   * an audit log that disappears when the audited row is deleted is not an
--     audit log.
-- Both tables are empty today (0 rows), which is exactly why this is worth
-- getting right now rather than after the first 23503 in production.
--
-- Exceptions ARE deleted. hr_attendance_exceptions has no source column and no
-- biometric_institution_id; the import stamps the machine into
-- raw_payload->>'machine_institution_id', which is the only handle there is.
-- Rows are matched on that plus exception_type='biometric_unresolved', so an
-- exception raised by anything else is out of scope.
--
-- NOT CHECKED (yet): hr_payroll_periods. It has institution_id, period_month,
-- status and locked_at, but zero rows and no FK to attendance, so any "is
-- payroll locked for this month" guard written today would be a guess about
-- semantics that do not exist yet. Add it here when payroll goes live.
--
-- ACCESS: super admin only, enforced INSIDE each function. SECURITY DEFINER
-- bypasses RLS, so the in-function guard is the real gate. Note that the
-- existing hr_attendance_records_delete policy is deliberately left alone: it
-- already permits is_admin() + hr.attendance.override for single-row
-- corrections, which is a different and legitimate act from wiping a month.

-- ---------------------------------------------------------------------------
-- 1. What has been imported. Drives the picker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_biometric_import_batches()
RETURNS TABLE (
  machine_institution_id  uuid,
  machine_name            text,
  machine_code            text,
  month_start             date,
  record_count            bigint,
  staff_count             bigint,
  staff_institution_count bigint,
  reconciled_count        bigint,
  regularization_count    bigint,
  exception_count         bigint,
  open_exception_count    bigint,
  first_work_date         date,
  last_work_date          date,
  last_imported_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may manage biometric imports'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH recs AS (
    SELECT r.biometric_institution_id                          AS mid,
           date_trunc('month', r.work_date)::date              AS m,
           count(*)::bigint                                    AS n,
           count(DISTINCT r.employee_id)::bigint               AS staff,
           count(DISTINCT r.institution_id)::bigint            AS insts,
           count(*) FILTER (WHERE r.reconciled_by IS NOT NULL)::bigint AS reconciled,
           min(r.work_date)                                    AS d0,
           max(r.work_date)                                    AS d1,
           max(r.updated_at)                                   AS imported
      FROM public.hr_attendance_records r
     WHERE r.source = 'biometric'
       AND r.biometric_institution_id IS NOT NULL
     GROUP BY 1, 2
  ),
  regs AS (
    SELECT r.biometric_institution_id             AS mid,
           date_trunc('month', r.work_date)::date AS m,
           count(*)::bigint                       AS n
      FROM public.hr_attendance_regularizations g
      JOIN public.hr_attendance_records r ON r.id = g.attendance_record_id
     WHERE r.source = 'biometric'
       AND r.biometric_institution_id IS NOT NULL
     GROUP BY 1, 2
  ),
  excs AS (
    -- The uuid cast is guarded: one malformed payload would otherwise take the
    -- whole listing down with 22P02.
    SELECT (e.raw_payload ->> 'machine_institution_id')::uuid   AS mid,
           date_trunc('month', e.exception_date)::date          AS m,
           count(*)::bigint                                     AS n,
           count(*) FILTER (WHERE e.resolution_status = 'open')::bigint AS open_n
      FROM public.hr_attendance_exceptions e
     WHERE e.exception_type = 'biometric_unresolved'
       AND e.raw_payload ->> 'machine_institution_id'
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     GROUP BY 1, 2
  )
  SELECT recs.mid,
         i.name::text,
         i.counselling_code::text,
         recs.m,
         recs.n,
         recs.staff,
         recs.insts,
         recs.reconciled,
         COALESCE(regs.n, 0)::bigint,
         COALESCE(excs.n, 0)::bigint,
         COALESCE(excs.open_n, 0)::bigint,
         recs.d0,
         recs.d1,
         recs.imported
    FROM recs
    LEFT JOIN regs ON regs.mid = recs.mid AND regs.m = recs.m
    LEFT JOIN excs ON excs.mid = recs.mid AND excs.m = recs.m
    LEFT JOIN public.institutions i ON i.id = recs.mid
   ORDER BY recs.m DESC, i.name;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Blast-radius preview. Read this before offering the confirm.
-- ---------------------------------------------------------------------------
-- Counted inside a SECURITY DEFINER function for the same reason as the course
-- cascade: the child tables are RLS-gated, so a client-side count would report
-- "nothing will be lost" to anyone who cannot see the rows.
CREATE OR REPLACE FUNCTION public.fn_biometric_import_purge_preview(
  p_machine_id uuid,
  p_month      date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_from date;
  v_to   date;
  v_name text;
  v_out  jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may delete an imported biometric month'
      USING ERRCODE = '42501';
  END IF;

  IF p_machine_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'Machine institution and month are both required'
      USING ERRCODE = '22023';
  END IF;

  v_from := date_trunc('month', p_month)::date;
  v_to   := (v_from + interval '1 month')::date;  -- exclusive

  SELECT i.name::text INTO v_name FROM public.institutions i WHERE i.id = p_machine_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Institution not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'machine_name', v_name,
    'month_start',  v_from,
    'month_label',  to_char(v_from, 'FMMonth YYYY'),

    'records', (SELECT count(*) FROM public.hr_attendance_records r
                 WHERE r.source = 'biometric'
                   AND r.biometric_institution_id = p_machine_id
                   AND r.work_date >= v_from AND r.work_date < v_to),

    'staff', (SELECT count(DISTINCT r.employee_id) FROM public.hr_attendance_records r
               WHERE r.source = 'biometric'
                 AND r.biometric_institution_id = p_machine_id
                 AND r.work_date >= v_from AND r.work_date < v_to),

    -- One machine routinely serves several colleges; say how many are affected
    -- so "delete Main Office July" is not mistaken for a Main-Office-only act.
    'staff_institutions', (SELECT count(DISTINCT r.institution_id)
                             FROM public.hr_attendance_records r
                            WHERE r.source = 'biometric'
                              AND r.biometric_institution_id = p_machine_id
                              AND r.work_date >= v_from AND r.work_date < v_to),

    'by_status', (SELECT COALESCE(jsonb_object_agg(t.code, x.n), '{}'::jsonb)
                    FROM (SELECT r.status_type_id AS sid, count(*) AS n
                            FROM public.hr_attendance_records r
                           WHERE r.source = 'biometric'
                             AND r.biometric_institution_id = p_machine_id
                             AND r.work_date >= v_from AND r.work_date < v_to
                           GROUP BY 1) x
                    JOIN public.hr_attendance_status_types t ON t.id = x.sid),

    -- Human work. Not a blocker, but the confirm should say it out loud.
    'reconciled_records', (SELECT count(*) FROM public.hr_attendance_records r
                            WHERE r.source = 'biometric'
                              AND r.biometric_institution_id = p_machine_id
                              AND r.work_date >= v_from AND r.work_date < v_to
                              AND r.reconciled_by IS NOT NULL),

    'regularizations_unlinked', (SELECT count(*)
                                   FROM public.hr_attendance_regularizations g
                                   JOIN public.hr_attendance_records r ON r.id = g.attendance_record_id
                                  WHERE r.source = 'biometric'
                                    AND r.biometric_institution_id = p_machine_id
                                    AND r.work_date >= v_from AND r.work_date < v_to),

    'audit_rows_unlinked', (SELECT count(*)
                              FROM public.hr_attendance_audit_log a
                              JOIN public.hr_attendance_records r ON r.id = a.attendance_record_id
                             WHERE r.source = 'biometric'
                               AND r.biometric_institution_id = p_machine_id
                               AND r.work_date >= v_from AND r.work_date < v_to),

    'exceptions', (SELECT count(*) FROM public.hr_attendance_exceptions e
                    WHERE e.exception_type = 'biometric_unresolved'
                      AND e.exception_date >= v_from AND e.exception_date < v_to
                      AND e.raw_payload ->> 'machine_institution_id' = p_machine_id::text),

    'resolved_exceptions', (SELECT count(*) FROM public.hr_attendance_exceptions e
                             WHERE e.exception_type = 'biometric_unresolved'
                               AND e.exception_date >= v_from AND e.exception_date < v_to
                               AND e.raw_payload ->> 'machine_institution_id' = p_machine_id::text
                               AND e.resolution_status IS DISTINCT FROM 'open')
  ) INTO v_out;

  RETURN v_out;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The purge itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_biometric_import_purge(
  p_machine_id uuid,
  p_month      date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_from    date;
  v_to      date;
  v_name    text;
  v_records bigint := 0;
  v_regs    bigint := 0;
  v_audit   bigint := 0;
  v_excs    bigint := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may delete an imported biometric month'
      USING ERRCODE = '42501';
  END IF;

  IF p_machine_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'Machine institution and month are both required'
      USING ERRCODE = '22023';
  END IF;

  v_from := date_trunc('month', p_month)::date;
  v_to   := (v_from + interval '1 month')::date;

  SELECT i.name::text INTO v_name FROM public.institutions i WHERE i.id = p_machine_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Institution not found' USING ERRCODE = 'P0002';
  END IF;

  -- Order matters. (a) and (b) clear the two NO ACTION FKs that would otherwise
  -- make (c) raise 23503; both run BEFORE the delete, so the subquery still
  -- resolves the rows about to go.

  -- (a) A staff member's correction request outlives the import it was filed
  --     against. Detach, never delete.
  WITH upd AS (
    UPDATE public.hr_attendance_regularizations g
       SET attendance_record_id = NULL,
           updated_at = now()
     WHERE g.attendance_record_id IN (
             SELECT r.id FROM public.hr_attendance_records r
              WHERE r.source = 'biometric'
                AND r.biometric_institution_id = p_machine_id
                AND r.work_date >= v_from AND r.work_date < v_to)
    RETURNING 1
  ) SELECT count(*) INTO v_regs FROM upd;

  -- (b) Same for the audit trail — it keeps its own employee_id, actor and
  --     before/after states, so it stays readable without the row it describes.
  WITH upd AS (
    UPDATE public.hr_attendance_audit_log a
       SET attendance_record_id = NULL
     WHERE a.attendance_record_id IN (
             SELECT r.id FROM public.hr_attendance_records r
              WHERE r.source = 'biometric'
                AND r.biometric_institution_id = p_machine_id
                AND r.work_date >= v_from AND r.work_date < v_to)
    RETURNING 1
  ) SELECT count(*) INTO v_audit FROM upd;

  -- (c) The attendance itself.
  WITH del AS (
    DELETE FROM public.hr_attendance_records r
     WHERE r.source = 'biometric'
       AND r.biometric_institution_id = p_machine_id
       AND r.work_date >= v_from AND r.work_date < v_to
    RETURNING 1
  ) SELECT count(*) INTO v_records FROM del;

  -- (d) The unresolved-day exceptions raised by the same import.
  WITH del AS (
    DELETE FROM public.hr_attendance_exceptions e
     WHERE e.exception_type = 'biometric_unresolved'
       AND e.exception_date >= v_from AND e.exception_date < v_to
       AND e.raw_payload ->> 'machine_institution_id' = p_machine_id::text
    RETURNING 1
  ) SELECT count(*) INTO v_excs FROM del;

  RETURN jsonb_build_object(
    'machine_name', v_name,
    'month_start',  v_from,
    'month_label',  to_char(v_from, 'FMMonth YYYY'),
    'deleted', jsonb_build_object(
      'records',    v_records,
      'exceptions', v_excs
    ),
    'unlinked', jsonb_build_object(
      'regularizations', v_regs,
      'audit_rows',      v_audit
    )
  );
END;
$fn$;

-- CREATE OR REPLACE resets EXECUTE to PUBLIC, so re-state every grant rather
-- than assuming the previous ones carried over.
REVOKE ALL ON FUNCTION public.fn_biometric_import_batches()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_biometric_import_purge_preview(uuid, date)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_biometric_import_purge(uuid, date)                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_biometric_import_batches()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_biometric_import_purge_preview(uuid, date)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_biometric_import_purge(uuid, date)             TO authenticated;

COMMENT ON FUNCTION public.fn_biometric_import_batches() IS
  'Super-admin only. Every imported biometric month, grouped by the MACHINE institution that produced the file.';
COMMENT ON FUNCTION public.fn_biometric_import_purge_preview(uuid, date) IS
  'Super-admin only. Counts everything purging one (machine, month) import would remove or detach. Read before confirming.';
COMMENT ON FUNCTION public.fn_biometric_import_purge(uuid, date) IS
  'Super-admin only. Deletes one imported biometric month for one machine, detaching regularizations and audit rows first. Returns a receipt.';
