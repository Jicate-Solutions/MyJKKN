-- Updated: 2026-09-07 - Per-learner attendance history for the marking screen.
--
-- WHY
-- ---
-- The Senior Learner marking a register can see today's roster and nothing else.
-- There is no way, from that screen, to answer "which days did this learner
-- actually come, and which days was he absent". /academic/attendance/history is
-- the UNMARKED-REGISTER history (which registers nobody filled in) and answers a
-- different question; the learner-side card shipped in PR #1985 shows feedback
-- confirmations, not present/absent. Nothing on main returns a per-learner
-- present/absent series, so this function is new.
--
-- THE THREE STATES — THE WHOLE POINT OF THIS FUNCTION
-- ---------------------------------------------------
-- A date is one of THREE things for a learner, never two:
--
--   1. the register was filled in and this learner was recorded  -> Present /
--      Absent / OnDuty (the status string the marker actually saved);
--   2. the register was filled in but this learner has NO entry in it -> the
--      learner is UNMARKED for that day. This is NOT absence. It is the marker
--      not having recorded them (a roster that loaded short, a subdivided group
--      the learner was not in, a learner added to the section afterwards);
--   3. no register exists for the section that day at all -> the function
--      returns NO ROW, and the caller renders "no class recorded".
--
-- Conflating (2) with Absent is this platform's signature attendance error --
-- the attendance dashboard once reported "60 present + 16 absent" out of 462
-- learners when the other 386 had simply never been marked. This function
-- therefore returns `lah_status = NULL` for case (2) and emits nothing at all
-- for case (3), so a caller CANNOT accidentally render an unmarked day as an
-- absent one: it has to decide what NULL means, in the open.
--
-- SHAPE OF THE DATA IT READS
-- --------------------------
-- One `student_attendance` row is one register: a section on a date, with
-- `attendance_data` a JSONB object keyed by timetable slot id ->
--   { period_name, start_time, end_time, course_name, ...,
--     students: [ { student_id, section_id, status, marked_at }, ... ] }
--
-- A SUBDIVIDED (practical / combined) slot additionally carries
-- `groups: [ { ..., students: [...] } ]`. Since 2026-07-25 the save path also
-- mirrors the union of the group rosters into the top-level `students` array,
-- and every reader in this repo (fn_attendance_slot_students,
-- slotStudents() in attendance-report-service) PREFERS a non-empty top-level
-- array over flattening `groups[]`. This function follows the same rule, so it
-- reads older rows written before that mirror existed AND newer ones, and can
-- never double-count a learner who appears in both places.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- --------------------------------
-- No rollup, no percentage, no "day is Present" verdict. It returns one row per
-- (date x period the section has a register for), with this learner's status or
-- NULL. The day-level rollup and the percentage live in
-- lib/utils/academic/learner-attendance-history.ts, where they are covered by
-- unit tests -- a rule about which days count toward a percentage is exactly the
-- kind of thing that must be testable without a database.
--
-- SCOPE. Registers filed under `student_attendance.section_id = p_section_id`.
-- A multi-section / combined slot files ONE register row under ONE section, so a
-- learner marked inside a sibling section's register is not returned here. That
-- is the section-scoped reading the marking screen asks for; a cross-section
-- history would be a different function with a different denominator.
--
-- Adds NO permission key. Reuses academic.attendance.mark / .view, which every
-- account that can reach the marking screen already holds.

CREATE OR REPLACE FUNCTION public.fn_learner_attendance_history(
  p_learner_id uuid,
  p_section_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  -- Output names are prefixed `lah_` on purpose. An unprefixed output name that
  -- also exists as a column in the body resolves ambiguously at RUNTIME (42702)
  -- and kills every call, which no CI gate here would catch.
  lah_attendance_date date,
  lah_period_key      text,
  lah_period_name     text,
  lah_start_time      text,
  lah_end_time        text,
  lah_course_name     text,
  lah_status          text,
  lah_marked_at       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to read attendance history'
      USING ERRCODE = '42501';
  END IF;

  IF p_learner_id IS NULL OR p_section_id IS NULL
     OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'fn_learner_attendance_history requires a learner, a section and a date range'
      USING ERRCODE = '22023';
  END IF;

  SELECT sc.institution_id INTO v_institution_id
  FROM public.sections sc
  WHERE sc.id = p_section_id;

  IF v_institution_id IS NULL THEN
    -- Says which of the two it is, rather than returning an empty list that
    -- reads as "this learner has never attended" (CLAUDE.md rule #27).
    RAISE EXCEPTION 'Section not found, so its attendance history cannot be read'
      USING ERRCODE = 'P0002';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the read gate is entirely this block.
  -- Permission keys, never hardcoded role names.
  IF NOT (
    (
      is_super_admin()
      OR is_admin()
      OR user_has_permission('academic.attendance.mark')
      OR user_has_permission('academic.attendance.view')
    )
    AND role_has_institution_access(v_institution_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to read attendance history for this section'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH registers AS (
    SELECT sa.attendance_date, sa.attendance_data
    FROM public.student_attendance sa
    WHERE sa.section_id = p_section_id
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= p_to
  ),
  period_rows AS (
    SELECT
      r.attendance_date AS reg_date,
      pd.key            AS reg_period_key,
      pd.value          AS reg_period
    FROM registers r
    CROSS JOIN LATERAL jsonb_each(r.attendance_data) AS pd(key, value)
    WHERE jsonb_typeof(pd.value) = 'object'
  ),
  period_entries AS (
    SELECT
      p.reg_date,
      p.reg_period_key,
      p.reg_period,
      CASE
        -- Preferred: the top-level roster, including the subdivision mirror.
        WHEN jsonb_typeof(p.reg_period -> 'students') = 'array'
             AND jsonb_array_length(p.reg_period -> 'students') > 0
          THEN p.reg_period -> 'students'
        -- Fallback for rows written before the mirror existed: flatten groups[].
        WHEN jsonb_typeof(p.reg_period -> 'groups') = 'array'
          THEN COALESCE(
            (
              SELECT jsonb_agg(grp_entry.value)
              FROM jsonb_array_elements(p.reg_period -> 'groups') AS grp(value)
              CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(grp.value -> 'students') = 'array'
                    THEN grp.value -> 'students'
                  ELSE '[]'::jsonb
                END
              ) AS grp_entry(value)
            ),
            '[]'::jsonb
          )
        ELSE '[]'::jsonb
      END AS reg_entries
    FROM period_rows p
  )
  SELECT
    pe.reg_date,
    pe.reg_period_key::text,
    -- Every text-ish output is cast explicitly. A varchar where the declared
    -- output is text raises 42804 and discards the WHOLE result set.
    NULLIF(pe.reg_period ->> 'period_name', '')::text,
    NULLIF(pe.reg_period ->> 'start_time', '')::text,
    NULLIF(pe.reg_period ->> 'end_time', '')::text,
    NULLIF(pe.reg_period ->> 'course_name', '')::text,
    learner_entry.entry_status::text,
    learner_entry.entry_marked_at::text
  FROM period_entries pe
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(se.value ->> 'status', '')    AS entry_status,
      NULLIF(se.value ->> 'marked_at', '') AS entry_marked_at
    FROM jsonb_array_elements(pe.reg_entries) AS se(value)
    WHERE se.value ->> 'student_id' = p_learner_id::text
    -- A learner can appear twice only in a malformed combined slot; take the
    -- most recently marked entry rather than an arbitrary one.
    ORDER BY (se.value ->> 'marked_at') DESC NULLS LAST
    LIMIT 1
  ) AS learner_entry ON TRUE
  ORDER BY pe.reg_date DESC, pe.reg_period_key ASC;
END;
$$;

-- Supabase's default `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon` gives anon a direct EXECUTE grant on every newly created
-- function, separate from PUBLIC, so a bare REVOKE FROM PUBLIC is not enough.
REVOKE EXECUTE ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) IS
'Per-learner attendance history for one section over a date range, read from the marking screen. One row per (date x period the section has a register for). lah_status is the saved status string (Present / Absent / OnDuty) when this learner was recorded, and NULL when the register exists but holds no entry for this learner -- NULL means UNMARKED, never Absent. A date with no register at all returns no row. No rollup and no percentage: those live in lib/utils/academic/learner-attendance-history.ts so they can be unit tested. Section-scoped: a multi-section slot files one register under one section, so a learner marked in a sibling section is not returned. Adds no permission key -- gated on academic.attendance.mark / .view plus role_has_institution_access on the section institution.';
