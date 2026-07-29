-- SF100 — stall grace window + one-time reset of the 18 unfairly-escalated teams
-- Date: 2026-07-20
--
-- WHY: The stall engine went live 2026-07-15 (PR #2103) and correctly escalated
-- every team on check-in silence. But the participant check-in WRITE-PATH WAS DEAD
-- until 2026-07-13 (fixed by PR #2030) — the form was permanently disabled, so no
-- team COULD check in. sf100_check_ins has 0 rows, program-wide. The engine therefore
-- counted ~3 months of broken-feature time against all 18 teams and escalated them
-- active -> warning (07-16) -> probation (07-17). That is a rollout-catch-up artifact,
-- not real disengagement.
--
-- WHAT: (1) add an explicit, auditable grace window the engine honours (spec §11C
-- admin extension / §14D bulk pause), and (2) reset the 18 teams to 'active' with the
-- grace running to 2026-08-17 (4 weeks) so they get a fair window now that check-in
-- works and the new notification bell + weekly reminders will nudge them.
--
-- DELIBERATELY NOT setting last_check_in_at = now(): that would fabricate a check-in
-- that never happened (admin table would read "Last CI: today" for teams that have
-- never checked in) AND would suppress the weekly reminder for a week — the exact
-- nudge we want firing. last_check_in_at stays truthfully NULL; only escalation pauses.

begin;

-- 1. The grace column. Nullable; NULL = no grace = normal escalation.
alter table public.sf100_enrollments
  add column if not exists stall_grace_until timestamptz;

comment on column public.sf100_enrollments.stall_grace_until is
  'While now() < this timestamp, runStallCheck SKIPS stall escalation for this enrollment '
  '(weekly reminders still fire). Admin grace per spec §11C/§14D — e.g. after a period when '
  'the check-in path was broken. NULL = no grace.';

-- 2. One-time reset of the teams escalated during the broken-write-path window.
update public.sf100_enrollments
   set status            = 'active',
       status_changed_at = now(),
       status_reason     = 'Grace reset 2026-07-20: warning/probation accrued while the '
                           'participant check-in write-path was broken (dead until 2026-07-13, '
                           'PR #2030; 0 check-ins existed program-wide). Stall escalation paused '
                           'until 2026-08-17 to give a fair window.',
       warning_sent_at   = null,
       probation_sent_at = null,
       stall_grace_until = timestamptz '2026-08-17 00:00:00+05:30',
       updated_at        = now()
 where program_id = '39534aee-32c2-455a-b2e0-0a1afe942c7b'
   and status in ('warning', 'probation');

commit;
