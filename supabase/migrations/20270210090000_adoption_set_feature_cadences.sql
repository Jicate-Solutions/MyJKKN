-- Adoption loop — tell the register how each feature should be judged.
--
-- #3912 (merged 2026-09-24) added feature_registry.cadence: 'weekly' | 'term' | 'event'.
-- It shipped the mechanism and left every row at the default 'weekly'. This sets the
-- rows that are not weekly by nature. It changes no data anybody sees except which
-- rule the loop applies when it calls a feature dead or sends a "why not" question.
--
-- WHY IT MATTERS. A weekly share is the wrong ruler for an action people only take when
-- the occasion arises. Judged weekly, it reads near zero forever and gets called dead,
-- and a "why have you not used it?" question goes to people who simply have not needed it.
--
-- 'term' — made at a term boundary, judged on the last completed term
--   (Director ruling, 2026-09-18 15:26: "judge seasonal features by term").
--     timetables.create, timetables.update, learners.bulk_promote
--
-- 'event' — used only when the occasion arises; never judged dead on a share, never asked
--   about (fn_adoption_ask_why refuses them; isDeadFeature skips them). Desk decision,
--   2026-09-23 08:45, when the first real dead list named bug_reports.submit at 0.2 %/week:
--   a low bug-report rate is health, not death.
--     bug_reports.submit            — you report a bug when you meet one
--     service_requests.raise        — you raise a request when you need something
--     users.assign_role             — an admin assigns a role when someone's job changes
--     campus_living.leave_apply     — a resident applies for leave when they are going home
--     campus_living.gate_pass_request — a resident asks for a gate pass when they are going out
--     cdc.declare_interest          — only while a campus drive is open
--     cdc.answer_willingness        — its pair: the same drive question, answered either way.
--                                     Left weekly, the pair would be judged on two different rulers.
--
-- DELIBERATELY NOT SET here, and why:
--   hr.attendance_month_close — monthly by nature, but its recording call is still held in #3967.
--   id_cards.print            — 13 print jobs ever across 9 colleges; whether that is "when
--                               needed" or "not adopted" is exactly the question the loop exists
--                               to ask, so it stays weekly.
--   learners.create_profile   — mislabelled (97 in 100 learners are created by spreadsheet
--                               upload, not this screen); its re-labelling is parked for the
--                               Director, and re-rulering a wrong label would hide the error.
--
-- Idempotent: each UPDATE only touches a row still at the default, so a value set by hand
-- in the meantime is never overwritten, and re-running changes nothing.

UPDATE public.feature_registry
   SET cadence = 'term', updated_at = now()
 WHERE feature_key IN ('timetables.create', 'timetables.update', 'learners.bulk_promote')
   AND cadence = 'weekly';

UPDATE public.feature_registry
   SET cadence = 'event', updated_at = now()
 WHERE feature_key IN (
         'bug_reports.submit',
         'service_requests.raise',
         'users.assign_role',
         'campus_living.leave_apply',
         'campus_living.gate_pass_request',
         'cdc.declare_interest',
         'cdc.answer_willingness'
       )
   AND cadence = 'weekly';
