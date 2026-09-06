-- Activate the pre-built "Solve for 100 Participants" privilege source.
-- Extends the canonical live-source pattern (mirrors _resolver_privilege_yuva_vertical_chairs):
-- a group with source_kind='sf100_participants' auto-syncs its members from the SF100 roster
-- (accepted team members of ACTIVE enrollments in ACTIVE programs), scoped to the GROUP's
-- institution → each college head manages/gets-notified-about only their own students.

create or replace view public._resolver_privilege_sf100_participants as
select distinct on (pg.id, p.learner_id)
  uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, (pg.id::text || ':' || p.learner_id::text)) as id,
  pg.id            as group_id,
  p.learner_id,
  'active'::text   as status,
  e.enrolled_at::date as start_date,
  null::date       as end_date,
  null::timestamptz as revoked_at,
  null::uuid       as revoked_by,
  null::text       as revoke_reason,
  null::text       as review_notes,
  'active'::text   as renewal_status,
  null::uuid       as created_by,
  e.enrolled_at    as created_at,
  e.updated_at     as updated_at,
  'sf100_participants'::text as source_kind
from public.privilege_groups pg
join public.sf100_enrollments   e   on e.status = 'active'::sf100_enrollment_status
join public.sf100_programs      prog on prog.id = e.program_id and prog.status = 'active'
join public.event_team_members  tm  on tm.registration_id = e.registration_id and tm.status = 'accepted'
join public.profiles            p   on p.id = tm.profile_id
                                    and p.learner_id is not null
                                    and p.institution_id = pg.institution_id
where pg.source_kind = 'sf100_participants'
  and ((pg.source_config ->> 'program_id') is null
       or e.program_id = (pg.source_config ->> 'program_id')::uuid)
order by pg.id, p.learner_id, e.enrolled_at desc nulls last;

-- Add the SF100 branch to the effective-membership union (append-only; existing branches unchanged).
create or replace view public.v_privilege_memberships_effective as
 select id,group_id,learner_id,status,start_date,end_date,revoked_at,revoked_by,revoke_reason,review_notes,renewal_status,created_by,created_at,updated_at,source_kind from public._resolver_privilege_manual
 union all
 select id,group_id,learner_id,status,start_date,end_date,revoked_at,revoked_by,revoke_reason,review_notes,renewal_status,created_by,created_at,updated_at,source_kind from public._resolver_privilege_lc_members
 union all
 select id,group_id,learner_id,status,start_date,end_date,revoked_at,revoked_by,revoke_reason,review_notes,renewal_status,created_by,created_at,updated_at,source_kind from public._resolver_privilege_yuva_vertical_chairs
 union all
 select id,group_id,learner_id,status,start_date,end_date,revoked_at,revoked_by,revoke_reason,review_notes,renewal_status,created_by,created_at,updated_at,source_kind from public._resolver_privilege_yuva_chapter_chairs
 union all
 select id,group_id,learner_id,status,start_date,end_date,revoked_at,revoked_by,revoke_reason,review_notes,renewal_status,created_by,created_at,updated_at,source_kind from public._resolver_privilege_sf100_participants;

-- Flip the source live.
update public.privilege_source_types
   set is_available = true, available_note = null, updated_at = now()
 where kind = 'sf100_participants';
