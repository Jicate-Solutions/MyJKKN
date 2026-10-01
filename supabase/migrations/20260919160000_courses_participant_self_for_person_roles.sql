-- Let a JKKN person find their own course. Grants courses.participant.self to
-- every role.
--
-- /my-courses is the participant portal: the enrolment, the instalment bills,
-- the receipts. Approval has reused an existing staff or learner identity since
-- 20260919120400, so a team member or learner can legitimately hold a course
-- enrolment — but the key that fronts that page was held by exactly two roles,
-- course_coordinator and course_participant. Everybody else (faculty, student,
-- hod, cao, ...) had it false, so the page had no sidebar entry for the very
-- people the reuse behaviour was built for. Typing the URL was the only way in.
--
-- SAFE TO GRANT WIDELY, and this was checked rather than assumed:
--   * The key gates NO RLS policy. Zero policies on any table reference it —
--     verified against pg_policy before writing this.
--   * /my-courses is self-scoped by the data, not by the key:
--     course_enrollments_select, course_bills_select and
--     course_bill_payments_select all fall back to profile_id = auth.uid() or an
--     enrolment EXISTS on it. A person with no enrolment sees an empty page.
--   * It is a nav/label key only — lib/constants/permissions.ts describes it as
--     the one key the Course Participant role holds.
--
-- So this widens discovery, not data. Role Management remains the switch: any
-- role that should not see the entry can have it turned off there, which is a
-- live value rather than a deployment.
--
-- `permissions || jsonb_build_object(...)` rather than a `?` key test: a key can
-- be PRESENT and false, and `permissions ? 'key'` reads that as granted.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('courses.participant.self', true)
 WHERE coalesce((permissions -> 'courses.participant.self')::text, 'false') <> 'true';
