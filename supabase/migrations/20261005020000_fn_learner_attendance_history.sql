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
-- Whether an OnDuty day counts toward the attendance percentage is NOT decided
-- here. This function only returns saved status strings. The rollup that turns
-- them into a day state and a percentage -- including Director ruling
-- 2026-09-07 that OnDuty reads as ATTENDED -- lives in
-- lib/utils/academic/learner-attendance-history.ts, under unit test.
--
-- RESTRUCTURED 2026-09-07 -- LEARNER-FIRST, NOT SECTION-FIRST (Director ruling)
-- -------------------------------------------------------------------------
-- The original version of this function read ONE register at a time, scoped to
-- `student_attendance.section_id = p_section_id`. That is wrong whenever the
-- register the learner was actually marked in was filed under a DIFFERENT,
-- sibling section -- a combined class or a practical batch. mark/page.tsx saves
-- attendance against whichever section
-- `lib/utils/academic/attendance-section-scope.ts#resolveAttendanceSaveScope`
-- resolves (practical_batch > context_section > url_param > slot_sections >
-- roster, roster LAST), while this dialog was resolving `p_section_id`
-- roster-first. On a practical or combined slot those two can disagree, and the
-- learner's own real attendance entry -- filed under the OTHER section --
-- was invisible: the dialog showed "no register" for a day the learner WAS
-- marked on.
--
-- The fix is NOT to guess the "right" section id. It is to stop gating
-- attendance on a section at all:
--
--   * ATTENDED / ABSENT / ON-DUTY rows come from EVERY register in the date
--     range, in this learner's OWN institution, where this learner has an
--     entry inside `attendance_data` -- regardless of which section_id the
--     register is filed under. No `WHERE sa.section_id = p_section_id` gates
--     this half at all.
--   * The "no register marked for this learner" rows still need a section for
--     context (which timetable to say "nothing was recorded against"), so
--     `p_section_id` is kept, but ONLY as that context: registers filed under
--     `p_section_id` in range where this learner has NO entry.
--   * Every attended/unmarked row now also carries `lah_section_id` /
--     `lah_section_name`, so a combined-class day reads as "Section B, Applied
--     Physics" instead of appearing unexplained.
--
-- SECURITY SIDE EFFECT OF GOING LEARNER-FIRST
-- --------------------------------------------
-- The original authorization check derived `v_institution_id` from
-- `sections WHERE id = p_section_id` -- i.e. from the SECTION, not the learner.
-- That means the guard below (`role_has_institution_access(v_institution_id)`)
-- verified the caller could reach *that section's* institution, never that the
-- caller could reach the *learner's own* institution. A caller who supplied a
-- p_section_id from an institution they legitimately have access to, paired
-- with a p_learner_id from a DIFFERENT institution, was never actually blocked
-- by that check -- it just happened not to matter in practice, because a
-- learner from another institution is not usually recorded in that section's
-- registers. Restructuring learner-first requires deriving the institution
-- from the learner in the first place (`students.institution_id`), which
-- closes that gap as a side effect rather than as a separate fix: the guard
-- now grounds on the same institution the data actually belongs to.
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
-- array over flattening `groups[]`. This function follows the same rule for
-- BOTH halves of the read (attended and unmarked), so it reads older rows
-- written before that mirror existed AND newer ones, and can never
-- double-count a learner who appears in both places.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- --------------------------------
-- No rollup, no percentage, no "day is Present" verdict. It returns one row per
-- (date x period a register exists for that mentions this learner OR is filed
-- under the context section), with this learner's status or NULL. The
-- day-level rollup and the percentage live in
-- lib/utils/academic/learner-attendance-history.ts, where they are covered by
-- unit tests -- a rule about which days count toward a percentage is exactly the
-- kind of thing that must be testable without a database.
--
-- PERFORMANCE
-- -----------
-- The attended half scans every `student_attendance` row for the learner's OWN
-- institution within the mandatory `[p_from, p_to]` range -- it is bounded by
-- institution AND date, never unbounded. Before paying for the per-period
-- `jsonb_each` / `jsonb_array_elements` unnest, it prefilters on
-- `attendance_data::text LIKE '%' || p_learner_id::text || '%'`: a plain text
-- search over the whole JSONB payload that can only ever OVER-select (the exact
-- `student_id` match in the LATERAL join below is what actually decides
-- inclusion), and is far cheaper than unnesting every period of every register
-- that doesn't mention this learner at all. This migration also adds
-- `idx_student_attendance_institution_date` (institution_id, attendance_date
-- DESC) -- there was previously no index leading with institution_id at all,
-- only `idx_student_attendance_date` (date alone) and several section-scoped
-- ones, so an institution-wide date-range scan had nothing better than a full
-- table scan to fall back on. The unmarked half is unchanged in cost from the
-- original: still scoped to one section via `idx_student_attendance_section_date`.
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
  lah_section_id      uuid,
  lah_section_name    text,
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

  -- Grounded on the LEARNER's own institution, not the section's -- see the
  -- "SECURITY SIDE EFFECT" note above the CREATE FUNCTION statement.
  SELECT s.institution_id INTO v_institution_id
  FROM public.students s
  WHERE s.id = p_learner_id;

  IF v_institution_id IS NULL THEN
    -- Says which of the two it is, rather than returning an empty list that
    -- reads as "this learner has never attended" (CLAUDE.md rule #27).
    RAISE EXCEPTION 'Learner not found, so their attendance history cannot be read'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sections sc WHERE sc.id = p_section_id) THEN
    RAISE EXCEPTION 'Section not found, so its attendance context cannot be read'
      USING ERRCODE = 'P0002';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the read gate is entirely this block.
  -- Permission keys, never hardcoded role names. Same shape as the original:
  -- auth.uid() check above, then role-or-permission, then institution scope --
  -- now grounded on the learner's institution (v_institution_id above).
  IF NOT (
    (
      is_super_admin()
      OR is_admin()
      OR user_has_permission('academic.attendance.mark')
      OR user_has_permission('academic.attendance.view')
    )
    AND role_has_institution_access(v_institution_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to read attendance history for this learner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH
  -- ==========================================================================
  -- ATTENDED / ABSENT / ON-DUTY -- every register in the learner's own
  -- institution and date range that has an entry for this learner, no matter
  -- which section it is filed under.
  -- ==========================================================================
  attended_registers AS (
    SELECT
      sa.attendance_date AS reg_date,
      sa.section_id      AS reg_section_id,
      sa.attendance_data
    FROM public.student_attendance sa
    WHERE sa.institution_id = v_institution_id
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= p_to
      -- Coarse prefilter before the per-period unnest below -- see PERFORMANCE.
      AND sa.attendance_data::text LIKE ('%' || p_learner_id::text || '%')
  ),
  attended_period_rows AS (
    SELECT
      r.reg_date,
      r.reg_section_id,
      pd.key   AS reg_period_key,
      pd.value AS reg_period
    FROM attended_registers r
    CROSS JOIN LATERAL jsonb_each(r.attendance_data) AS pd(key, value)
    WHERE jsonb_typeof(pd.value) = 'object'
  ),
  attended_period_entries AS (
    SELECT
      p.reg_date,
      p.reg_section_id,
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
    FROM attended_period_rows p
  ),
  attended_rows AS (
    SELECT
      pe.reg_date                                        AS lah_attendance_date,
      pe.reg_period_key::text                             AS lah_period_key,
      -- Every text-ish output is cast explicitly. A varchar where the declared
      -- output is text raises 42804 and discards the WHOLE result set.
      NULLIF(pe.reg_period ->> 'period_name', '')::text   AS lah_period_name,
      NULLIF(pe.reg_period ->> 'start_time', '')::text    AS lah_start_time,
      NULLIF(pe.reg_period ->> 'end_time', '')::text      AS lah_end_time,
      NULLIF(pe.reg_period ->> 'course_name', '')::text   AS lah_course_name,
      pe.reg_section_id                                    AS lah_section_id,
      sec_attended.section_name::text                      AS lah_section_name,
      learner_entry.entry_status::text                     AS lah_status,
      learner_entry.entry_marked_at::text                  AS lah_marked_at
    FROM attended_period_entries pe
    -- JOIN, not LEFT JOIN: this half only ever emits rows where the learner
    -- actually has an entry. The "no entry" case is the other half, below.
    JOIN LATERAL (
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
    LEFT JOIN public.sections sec_attended ON sec_attended.id = pe.reg_section_id
  ),
  -- ==========================================================================
  -- "No register marked for this learner" -- section-scoped context, exactly
  -- as before: registers filed under p_section_id where this learner has NO
  -- entry. A day already covered by attended_rows never lands here too, since
  -- that requires the learner to have an entry, which this half excludes.
  -- ==========================================================================
  context_registers AS (
    SELECT
      sa.attendance_date AS reg_date,
      sa.section_id      AS reg_section_id,
      sa.attendance_data
    FROM public.student_attendance sa
    WHERE sa.section_id = p_section_id
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= p_to
  ),
  context_period_rows AS (
    SELECT
      r.reg_date,
      r.reg_section_id,
      pd.key   AS reg_period_key,
      pd.value AS reg_period
    FROM context_registers r
    CROSS JOIN LATERAL jsonb_each(r.attendance_data) AS pd(key, value)
    WHERE jsonb_typeof(pd.value) = 'object'
  ),
  context_period_entries AS (
    SELECT
      p.reg_date,
      p.reg_section_id,
      p.reg_period_key,
      p.reg_period,
      CASE
        WHEN jsonb_typeof(p.reg_period -> 'students') = 'array'
             AND jsonb_array_length(p.reg_period -> 'students') > 0
          THEN p.reg_period -> 'students'
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
    FROM context_period_rows p
  ),
  context_section AS (
    SELECT sc.section_name FROM public.sections sc WHERE sc.id = p_section_id
  ),
  unmarked_rows AS (
    SELECT
      pe2.reg_date                                        AS lah_attendance_date,
      pe2.reg_period_key::text                             AS lah_period_key,
      NULLIF(pe2.reg_period ->> 'period_name', '')::text   AS lah_period_name,
      NULLIF(pe2.reg_period ->> 'start_time', '')::text    AS lah_start_time,
      NULLIF(pe2.reg_period ->> 'end_time', '')::text      AS lah_end_time,
      NULLIF(pe2.reg_period ->> 'course_name', '')::text   AS lah_course_name,
      p_section_id                                          AS lah_section_id,
      cs.section_name::text                                 AS lah_section_name,
      NULL::text                                             AS lah_status,
      NULL::text                                             AS lah_marked_at
    FROM context_period_entries pe2
    CROSS JOIN context_section cs
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(pe2.reg_entries) AS se2(value)
      WHERE se2.value ->> 'student_id' = p_learner_id::text
    )
  )
  SELECT * FROM attended_rows
  UNION ALL
  SELECT * FROM unmarked_rows
  ORDER BY lah_attendance_date DESC, lah_period_key ASC;
END;
$$;

-- Supabase's default `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon` gives anon a direct EXECUTE grant on every newly created
-- function, separate from PUBLIC, so a bare REVOKE FROM PUBLIC is not enough.
REVOKE EXECUTE ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.fn_learner_attendance_history(uuid, uuid, date, date) IS
'Learner-first per-learner attendance history over a date range, read from the marking screen. Attended/absent/on-duty rows come from EVERY register in the learner''s own institution where this learner has an entry in attendance_data, regardless of which section filed it (fixes: a combined/practical register filed under a sibling section used to be invisible). p_section_id is context ONLY, for the "no register marked for this learner" rows: registers filed under that section in range where the learner has no entry. lah_status is the saved status string (Present / Absent / OnDuty) when recorded, NULL when unmarked-for-this-learner -- NULL never means Absent. A date with no register at all returns no row. lah_section_id/lah_section_name identify which section each row came from. No rollup and no percentage: those live in lib/utils/academic/learner-attendance-history.ts so they can be unit tested, including the 2026-09-07 ruling that OnDuty counts as attended. Adds no permission key -- gated on academic.attendance.mark / .view plus role_has_institution_access on the LEARNER''s own institution (students.institution_id), not the section''s.';

-- Added 2026-09-07 for the learner-first read above. There was previously no
-- index leading with institution_id on this table at all -- only
-- idx_student_attendance_date (date alone) and several section-scoped ones --
-- so an institution-wide, date-bounded scan had nothing better than a full
-- table scan to narrow on. institution_id first still lets a plain
-- (institution_id) prefix of this index serve other institution-scoped reads.
CREATE INDEX IF NOT EXISTS idx_student_attendance_institution_date
  ON public.student_attendance (institution_id, attendance_date DESC);
