-- 2026-06-22 — BUG-004201: training attendance auto-pickup (Model A).
-- Training programmes run DURING normal timetabled class periods (Director-confirmed),
-- so a learner's training attendance = their academic attendance over the programme's
-- [start_date, end_date] window. This avoids a separate marking workflow.
--
-- Decisions LOCKED (Director 2026-06-22):
--  - Model A: reuse existing student_attendance within the training window.
--  - Mirror the class register EXACTLY — if the learner was absent in the class
--    period the training ran in, they are absent from training. No per-training
--    override in v1.
--  - A learner with NO attendance records in the window → NULL %, not a misleading 0%.
--
-- Note on the data model: student_attendance stores per-student marks NESTED in a
-- jsonb (attendance_data: { <period> : { students: [ {status, student_id} ] } }),
-- NOT as per-student rows. So the computation unnests that jsonb. The nested
-- student_id is learners_profiles.id (verified 100% on a recent sample), matching
-- cdc_training_enrollments.learner_id.

-- 1. Provenance columns (additive, nullable, back-compat).
ALTER TABLE public.cdc_training_enrollments
  ADD COLUMN IF NOT EXISTS attendance_source text;        -- 'manual' | 'auto_window'
ALTER TABLE public.cdc_training_enrollments
  ADD COLUMN IF NOT EXISTS attendance_synced_at timestamptz;
ALTER TABLE public.cdc_training_enrollments
  ADD COLUMN IF NOT EXISTS attendance_basis jsonb DEFAULT '{}'::jsonb;  -- {records_total, records_present, window_*}

COMMENT ON COLUMN public.cdc_training_enrollments.attendance_source IS
  'BUG-004201: how attendance_pct was set — manual entry vs auto-computed from student_attendance over the programme date window.';

-- 2. Sync RPC: compute each enrolled learner's present/total from student_attendance
--    over the programme window and write attendance_pct + provenance. Returns a summary.
--    SECURITY DEFINER (reads student_attendance + writes enrollments across RLS).
--    Callable ONLY by the gated service-role route — see grants below.
CREATE OR REPLACE FUNCTION public.fn_cdc_training_attendance_sync(p_programme_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end   date;
  v_synced     int := 0;
  v_no_records int := 0;
BEGIN
  SELECT start_date, end_date INTO v_start, v_end
  FROM public.cdc_training_programmes WHERE id = p_programme_id;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_window');
  END IF;

  WITH marks AS (
    -- One row per (learner, marked period) within the window. Mirrors the class register.
    SELECT (stu->>'student_id')::uuid AS sid, (stu->>'status') AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period(key, val)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(period.val->'students', '[]'::jsonb)) AS stu
    WHERE sa.attendance_date BETWEEN v_start AND v_end
      AND sa.attendance_data IS NOT NULL
      AND sa.attendance_data <> '{}'::jsonb
  ),
  agg AS (
    SELECT e.id AS enrollment_id,
           count(m.sid)                              AS total,
           count(*) FILTER (WHERE m.status = 'Present') AS present
    FROM public.cdc_training_enrollments e
    LEFT JOIN marks m ON m.sid = e.learner_id
    WHERE e.programme_id = p_programme_id
    GROUP BY e.id
  ),
  upd AS (
    UPDATE public.cdc_training_enrollments e
    SET attendance_pct = CASE WHEN a.total > 0
                              THEN round(100.0 * a.present / a.total, 2) ELSE NULL END,
        attendance_source = 'auto_window',
        attendance_synced_at = now(),
        attendance_basis = jsonb_build_object(
          'records_total', a.total, 'records_present', a.present,
          'window_start', v_start, 'window_end', v_end, 'computed_at', now()
        ),
        updated_at = now()
    FROM agg a
    WHERE e.id = a.enrollment_id
    RETURNING (a.total > 0) AS had_records
  )
  SELECT count(*) FILTER (WHERE had_records),
         count(*) FILTER (WHERE NOT had_records)
    INTO v_synced, v_no_records
  FROM upd;

  RETURN jsonb_build_object(
    'ok', true, 'synced', v_synced, 'no_records', v_no_records,
    'window_start', v_start, 'window_end', v_end
  );
END;
$$;

-- Callable ONLY by the permission-gated service-role route (it bypasses RLS to read
-- attendance + write enrollments). NOT granted to authenticated/anon, so no logged-in
-- client can invoke it directly and skip the route's cdc.training.edit gate.
REVOKE EXECUTE ON FUNCTION public.fn_cdc_training_attendance_sync(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_training_attendance_sync(uuid) TO service_role;
