-- SF100 participant write-path enablement + team-ownership enforcement
-- WHY: INSERT on sf100_check_ins/paid_users/customer_interviews/pivots was
-- service_role-ONLY, so participant writes (which run as the authenticated user
-- via withAuth->runWithClient(auth.supabase)) were RLS-denied (42501). This adds
-- authenticated INSERT policies that pin the actor column to auth.uid() AND
-- require the caller to be an ACCEPTED member of the enrollment's team.
-- Additive: existing *_insert_service_role policies remain for admin/server paths.
--
-- The membership predicate is the SAME canonical ownership gate used by
-- public.fn_my_sf100_goal (event_team_members JOIN sf100_enrollments,
-- status='accepted') -- extended, not reinvented.

create or replace function public.sf100_can_write_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.is_admin()
    or exists (
      select 1
        from public.event_team_members tm
        join public.sf100_enrollments e on e.registration_id = tm.registration_id
       where e.id = p_enrollment_id
         and tm.profile_id = auth.uid()
         and tm.status = 'accepted'
    );
$$;
revoke execute on function public.sf100_can_write_enrollment(uuid) from anon, public;
grant  execute on function public.sf100_can_write_enrollment(uuid) to authenticated;

drop policy if exists sf100_check_ins_insert_member on public.sf100_check_ins;
create policy sf100_check_ins_insert_member on public.sf100_check_ins
  for insert to authenticated
  with check (submitted_by = auth.uid() and public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_paid_users_insert_member on public.sf100_paid_users;
create policy sf100_paid_users_insert_member on public.sf100_paid_users
  for insert to authenticated
  with check (reported_by = auth.uid() and public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_customer_interviews_insert_member on public.sf100_customer_interviews;
create policy sf100_customer_interviews_insert_member on public.sf100_customer_interviews
  for insert to authenticated
  with check (conducted_by = auth.uid() and public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_pivots_insert_member on public.sf100_pivots;
create policy sf100_pivots_insert_member on public.sf100_pivots
  for insert to authenticated
  with check (logged_by = auth.uid() and public.sf100_can_write_enrollment(enrollment_id));
