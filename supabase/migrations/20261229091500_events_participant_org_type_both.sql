-- Allow 'both' as a participant organisation type.
--
-- Some events take external entrants from schools AND colleges. With only
-- 'school' / 'college' the organizer had to pick one, and entrants from the
-- other kind got the wrong control on the public registration form. 'both'
-- asks the entrant which they are, then shows the matching control
-- (school_master picker for a school, free text for a college).
--
-- Widening the CHECK only: every existing row is 'school' or 'college' and
-- stays valid; the default is unchanged.

alter table public.events
  drop constraint if exists events_participant_org_type_check;

alter table public.events
  add constraint events_participant_org_type_check
    check (participant_org_type in ('school', 'college', 'both'));

comment on column public.events.participant_org_type is
  'Kind of organisation external participants represent. school = label "School / club" + school_master directory picker; college = label "College" + free-text input; both = the entrant chooses school or college, then gets the matching control. Read by the public tournament registration form (app/p/tournament/[id]/register).';
