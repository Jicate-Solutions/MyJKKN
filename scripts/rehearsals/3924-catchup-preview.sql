-- ============================================================================
-- 3924-catchup-preview.sql        READ ONLY. Changes nothing. Writes nothing.
--
-- 🛑 NOT RUN by the lane. The desk runs the preview, the Director reads the
--    names, and only then, on his word, the apply
--    (scripts/rehearsals/3924-catchup-apply.sql).
--
-- WHY THIS EXISTS. The Director ruled on 2026-09-19 04:58 that PAST PRESENT
-- MARKS COUNT, ONCE: when the first-present rule is switched on, any
-- reserved/admitted learner who already carries a Present mark should become
-- active — but HE SEES THE LIST OF NAMES FIRST. So no bulk UPDATE ships in any
-- migration. This file produces exactly that list; the apply file activates
-- exactly that list.
--
-- THE SET IS DEFINED ONCE. The `present_marks` / `first_present` /
-- `catchup_set` CTE below appears three times in this file and once in the
-- apply file, and all four copies are character-for-character identical. If you
-- edit one, edit all of them — a `diff` of any two must come back empty.
--
-- 🔒 THE LIST IS FROZEN, NOT RECOMPUTED (repair round 2). Present marks land
-- every day, so a list read on Monday is not the list a script would compute on
-- Tuesday. Section 3 below therefore ends with an APPROVED-SET TOKEN — the ids,
-- the count and an md5 of the sorted ids — which is pasted into
-- `3924-catchup-apply.sql`. That file refuses to run without it, refuses if it
-- does not check out, activates only ids that are on the token AND still
-- eligible, and REPORTS rather than activates anyone who became eligible after
-- this preview was taken.
--
-- ELIGIBILITY MATCHES THE TRIGGER, not a fresh opinion of it:
--   · the Present token is matched case-insensitively (production holds one
--     lowercase `absent`, so a case-sensitive compare would miss a writer)
--   · `student_id` must look like a uuid — it is `learners_profiles.id`, never
--     `profiles.id`
--   · eligibility is an ALLOWLIST OF TWO, `reserved` and `admitted`. Anyone
--     already `active`, or `graduated`, `alumni`, `exited`, `inactive`,
--     `rejected`, `waitlisted`, `withdrawal_pending`, `enquiry`,
--     `enquiry_submitted`, `account`, `pending`, `approved` is NOT in this set
--     and is not touched by the apply.
--
-- ⚠️ The learners listed here reach `active` WITHOUT clearing the ~30% / 60%
--    fee thresholds in `admission_statuses`. The last recorded paid % is shown
--    so that is a decision rather than a discovery — see the column note below.
--
-- Run it as a plain read. It opens no transaction and needs none.
-- ============================================================================


-- ── 1. THE NAMES ────────────────────────────────────────────────────────────
-- One row per learner the catch-up would activate, ordered by institution then
-- name, which is the order the Director reads.

WITH present_marks AS (
  SELECT
    (s.rec ->> 'student_id')::uuid AS learner_id,
    sa.id                          AS student_attendance_id,
    sa.attendance_date             AS attendance_date,
    sa.section_id                  AS section_id,
    sa.timetable_id                AS timetable_id,
    sa.institution_id              AS institution_id,
    sa.marked_by                   AS marked_by,
    sa.created_at                  AS marked_at
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
              THEN sa.attendance_data ELSE '{}'::jsonb END) AS per(period_key, period_val)
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students' ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
first_present AS (
  SELECT DISTINCT ON (pm.learner_id)
         pm.learner_id, pm.student_attendance_id, pm.attendance_date,
         pm.section_id, pm.timetable_id, pm.institution_id, pm.marked_by, pm.marked_at
  FROM present_marks pm
  ORDER BY pm.learner_id, pm.attendance_date ASC, pm.marked_at ASC, pm.student_attendance_id ASC
),
catchup_set AS (
  SELECT fp.learner_id, fp.student_attendance_id, fp.attendance_date,
         fp.section_id, fp.timetable_id, fp.institution_id, fp.marked_by,
         lp.lifecycle_status::text AS current_status
  FROM first_present fp
  JOIN public.learners_profiles lp ON lp.id = fp.learner_id
  WHERE lp.lifecycle_status::text IN ('reserved', 'admitted')
)
SELECT
  COALESCE(i.name, '(no institution)')                              AS institution,
  btrim(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')) AS learner_name,
  COALESCE(lp.register_number, lp.roll_number, lp.application_id, '—') AS register_or_roll,
  COALESCE(pr.program_name, '—')                                    AS program,
  cs.current_status                                                 AS status_today,
  cs.attendance_date                                                AS first_present_on,
  COALESCE(mk.full_name, mk.email, cs.marked_by::text, '—')         AS marked_by,
  -- Fee position, cheapest honest answer available. learners_profiles carries no
  -- paid-percentage column; the only recorded figure is the snapshot the status
  -- ladder took the last time it moved this learner. It may be STALE, and NULL
  -- means it was never recorded — not "paid nothing".
  fee.paid_pct_at_change                                            AS last_recorded_paid_pct,
  fee.changed_at                                                    AS paid_pct_recorded_at,
  cs.learner_id,
  cs.student_attendance_id
FROM catchup_set cs
JOIN public.learners_profiles lp ON lp.id = cs.learner_id
LEFT JOIN public.institutions  i  ON i.id  = lp.institution_id
LEFT JOIN public.programs      pr ON pr.id = lp.program_id
LEFT JOIN public.profiles      mk ON mk.id = cs.marked_by
LEFT JOIN LATERAL (
  SELECT h.paid_pct_at_change, h.changed_at
  FROM public.learners_profile_status_history h
  WHERE h.learner_id = cs.learner_id
    AND h.paid_pct_at_change IS NOT NULL
  ORDER BY h.changed_at DESC
  LIMIT 1
) fee ON true
ORDER BY institution, learner_name;


-- ── 2. THE COUNT PER INSTITUTION ────────────────────────────────────────────
-- The same set, totalled. If these numbers and the list above disagree, the two
-- CTEs have drifted and neither should be trusted.

WITH present_marks AS (
  SELECT
    (s.rec ->> 'student_id')::uuid AS learner_id,
    sa.id                          AS student_attendance_id,
    sa.attendance_date             AS attendance_date,
    sa.section_id                  AS section_id,
    sa.timetable_id                AS timetable_id,
    sa.institution_id              AS institution_id,
    sa.marked_by                   AS marked_by,
    sa.created_at                  AS marked_at
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
              THEN sa.attendance_data ELSE '{}'::jsonb END) AS per(period_key, period_val)
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students' ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
first_present AS (
  SELECT DISTINCT ON (pm.learner_id)
         pm.learner_id, pm.student_attendance_id, pm.attendance_date,
         pm.section_id, pm.timetable_id, pm.institution_id, pm.marked_by, pm.marked_at
  FROM present_marks pm
  ORDER BY pm.learner_id, pm.attendance_date ASC, pm.marked_at ASC, pm.student_attendance_id ASC
),
catchup_set AS (
  SELECT fp.learner_id, fp.student_attendance_id, fp.attendance_date,
         fp.section_id, fp.timetable_id, fp.institution_id, fp.marked_by,
         lp.lifecycle_status::text AS current_status
  FROM first_present fp
  JOIN public.learners_profiles lp ON lp.id = fp.learner_id
  WHERE lp.lifecycle_status::text IN ('reserved', 'admitted')
)
SELECT
  COALESCE(i.name, '(no institution)')                                   AS institution,
  count(*)                                                               AS would_activate,
  count(*) FILTER (WHERE cs.current_status = 'reserved')                 AS from_reserved,
  count(*) FILTER (WHERE cs.current_status = 'admitted')                 AS from_admitted,
  min(cs.attendance_date)                                                AS earliest_first_present,
  max(cs.attendance_date)                                                AS latest_first_present
FROM catchup_set cs
JOIN public.learners_profiles lp ON lp.id = cs.learner_id
LEFT JOIN public.institutions  i  ON i.id = lp.institution_id
GROUP BY ROLLUP (COALESCE(i.name, '(no institution)'))
ORDER BY institution NULLS LAST;
-- The NULL institution row produced by ROLLUP is the GRAND TOTAL.


-- ── 3. THE APPROVED-SET TOKEN — PASTE THIS INTO THE APPLY SCRIPT ────────────
--
-- The list above is what the Director reads. This is the same list in the one
-- form a script can check: the learner ids, sorted and comma-joined, with a
-- count and an md5 of exactly that sorted text.
--
-- 🔒 WHY. Present marks land every day. If the apply script recomputed its own
-- set when it ran, it could activate learners he never saw — the list would
-- have moved under the approval. So `3924-catchup-apply.sql` takes these three
-- values, refuses to run without them, refuses if they do not check out, and
-- activates only ids that are on THIS list AND still eligible. Anyone who
-- becomes eligible after this moment is reported by the apply and left alone.
--
-- Copy all three values into the marked block at the top of
-- `scripts/rehearsals/3924-catchup-apply.sql`. If the Director wants a shorter
-- list than the one above, re-run the preview against a narrowed set rather
-- than hand-editing the ids — a hand-edited list fails the checksum, which is
-- exactly what it is for.
--
-- A zero count / NULL md5 means nobody is eligible; there is nothing to apply.

WITH present_marks AS (
  SELECT
    (s.rec ->> 'student_id')::uuid AS learner_id,
    sa.id                          AS student_attendance_id,
    sa.attendance_date             AS attendance_date,
    sa.section_id                  AS section_id,
    sa.timetable_id                AS timetable_id,
    sa.institution_id              AS institution_id,
    sa.marked_by                   AS marked_by,
    sa.created_at                  AS marked_at
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
              THEN sa.attendance_data ELSE '{}'::jsonb END) AS per(period_key, period_val)
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students' ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
first_present AS (
  SELECT DISTINCT ON (pm.learner_id)
         pm.learner_id, pm.student_attendance_id, pm.attendance_date,
         pm.section_id, pm.timetable_id, pm.institution_id, pm.marked_by, pm.marked_at
  FROM present_marks pm
  ORDER BY pm.learner_id, pm.attendance_date ASC, pm.marked_at ASC, pm.student_attendance_id ASC
),
catchup_set AS (
  SELECT fp.learner_id, fp.student_attendance_id, fp.attendance_date,
         fp.section_id, fp.timetable_id, fp.institution_id, fp.marked_by,
         lp.lifecycle_status::text AS current_status
  FROM first_present fp
  JOIN public.learners_profiles lp ON lp.id = fp.learner_id
  WHERE lp.lifecycle_status::text IN ('reserved', 'admitted')
)
SELECT
  'PASTE THIS INTO THE APPLY SCRIPT'                           AS label,
  count(*)::integer                                            AS approved_count,
  md5(string_agg(learner_id::text, ',' ORDER BY learner_id))   AS approved_md5,
  string_agg(learner_id::text, ',' ORDER BY learner_id)        AS approved_ids
FROM catchup_set;
