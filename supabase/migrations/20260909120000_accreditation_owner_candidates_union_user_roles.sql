-- ============================================================================
-- fn_accreditation_owner_candidates — who an IQAC coordinator may name as an
-- accreditation owner.
--
-- Both owner desks (/accreditation/manage/owners and
-- /accreditation/naac/narratives/owners) built their picker from
-- `profiles.role IN ('principal','hod','faculty','accreditation_officer')`
-- alone. Roles on this platform live in TWO places: the legacy scalar
-- profiles.role and the multi-role user_roles → custom_roles.role_key pair that
-- user_has_permission() itself unions. Reading only the first hides 84 people
-- who hold hod / faculty / principal in user_roles under some other primary
-- role — the reported case being KRISHNAN R (krishnan@jkkn.ac.in, JKKN College
-- of Pharmacy), whose profiles.role is 'digital_coordinator' while user_roles
-- carries HOD. He was invisible to the picker on the very campus he leads.
--
-- The union cannot be done in the browser: user_roles' SELECT policies let a
-- caller read only their OWN rows unless they hold is_admin/roles.edit, so a
-- coordinator's client-side join would return exactly themselves. Hence this
-- SECURITY DEFINER function, gated on the same permissions the pages are gated
-- on, and no wider — it returns names and emails, so an ungated function would
-- be a staff directory for anyone with a session.
--
-- Also excluded here and not before: deactivated and login-disabled accounts.
-- An assignment is PENDING until the named person accepts it, and someone who
-- cannot sign in can never accept, so offering them was offering a dead end
-- (134 of the 576 in the pool).
--
-- 'accreditation_officer' is kept in the list even though production has zero
-- of them today; it is the role literally named for this job, and dropping it
-- would silently break the day somebody is given it.
-- ============================================================================

create or replace function public.fn_accreditation_owner_candidates()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  institution_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- Same gate as the pages: .view opens the desk, .manage assigns others.
  -- Told in words, never as an empty list, so "nobody is eligible" and "you may
  -- not ask" can never look the same.
  if not (
    user_has_permission('accreditation.naac.narrative.view')
    or user_has_permission('accreditation.naac.narrative.manage')
  ) then
    raise exception 'Not permitted to list accreditation owner candidates'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name::text,
    p.email::text,
    p.role::text,
    p.institution_id
  from profiles p
  where coalesce(p.is_active, true)
    and not coalesce(p.is_login_disabled, false)
    and (
      p.role::text in ('principal', 'hod', 'faculty', 'accreditation_officer')
      or exists (
        select 1
        from user_roles ur
        join custom_roles cr on cr.id = ur.role_id
        where ur.user_id = p.id
          and cr.role_key::text in (
            'principal', 'hod', 'faculty', 'accreditation_officer'
          )
      )
    )
  order by p.full_name asc;
end;
$$;

comment on function public.fn_accreditation_owner_candidates() is
  'Accreditation owner picker pool: profiles.role UNION user_roles/custom_roles.role_key, active accounts only. Gated on accreditation.naac.narrative.view|manage.';

-- A DROP+CREATE loses the ACL, and a function nobody may execute fails exactly
-- like the bug it fixes. Granted explicitly, every time.
revoke all on function public.fn_accreditation_owner_candidates() from public;
grant execute on function public.fn_accreditation_owner_candidates() to authenticated;
