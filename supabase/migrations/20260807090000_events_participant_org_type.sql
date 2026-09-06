-- Per-tournament participant organisation type.
--
-- The public tournament registration form asks an EXTERNAL registrant which
-- institution they represent. That control was hardcoded to schools: the label
-- read "School / club" and the input was the SchoolDirectoryPicker backed by
-- school_master. Correct for the SCHOOL ZONAL tournaments, wrong for
-- inter-college events -- visiting colleges are absent from a school directory,
-- so every entrant had to fall back to "My school / club isn't listed" and type
-- it by hand, losing the linked institution_school_id.
--
-- 'school' is the default so every existing tournament keeps today's behaviour
-- byte-for-byte; an organizer opts a single event into 'college' from the
-- tournament edit dialog.

alter table public.events
  add column if not exists participant_org_type text not null default 'school';

alter table public.events
  drop constraint if exists events_participant_org_type_check;

alter table public.events
  add constraint events_participant_org_type_check
    check (participant_org_type in ('school', 'college'));

comment on column public.events.participant_org_type is
  'Kind of organisation external participants represent. school = label "School / club" + school_master directory picker; college = label "College" + free-text input. Read by the public tournament registration form (app/p/tournament/[id]/register).';
