-- fn_my_fee_payment_notice(): the signed-in learner's own 48-hour Transport
-- Maintenance Fee payment notice, for the MyJKKN countdown banner.
--
-- tms_fee_payment_notice has RLS on and no policies (TMS reads it with the
-- service role), so MyJKKN reads it through this caller-scoped SECURITY DEFINER
-- function instead of opening the table. It mirrors TMS-ADMIN's
-- lib/fees/payment-notice/learner-notice.ts so both portals show the same thing:
--   * learner rows = profiles.learner_id, plus learners_profiles.profile_id
--   * current transport year only; a running notice wins over a fined one
--   * a fined notice drops off 7 days after its deadline
--   * amount = the raised fine, or (running) the learner's stop rate — the
--     same figure the sweep will charge
-- Returns NULL when there is nothing to show.

create or replace function public.fn_my_fee_payment_notice()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_year uuid;
  v_notice record;
  v_amount numeric := 0;
  v_urgent int := 6;
begin
  if v_uid is null then
    return null;
  end if;

  select ty.id into v_year
  from public.tms_transport_year ty
  where ty.is_current
  limit 1;
  if v_year is null then
    return null;
  end if;

  select n.person_id, n.status, n.expires_at, n.fine_id, lp.transport_stop_id
    into v_notice
  from public.tms_fee_payment_notice n
  join public.learners_profiles lp on lp.id = n.person_id
  where n.transport_year_id = v_year
    and n.status in ('running', 'fined')
    and (
      lp.profile_id = v_uid
      or lp.id = (select p.learner_id from public.profiles p where p.id = v_uid)
    )
  order by (n.status = 'running') desc, n.expires_at asc
  limit 1;

  if not found then
    return null;
  end if;

  if v_notice.status = 'fined' and v_notice.expires_at < now() - interval '7 days' then
    return null;
  end if;

  if v_notice.status = 'fined' and v_notice.fine_id is not null then
    select f.fine_amount into v_amount from public.tms_fee_fine f where f.id = v_notice.fine_id;
  elsif v_notice.transport_stop_id is not null then
    select r.fine_amount into v_amount
    from public.tms_fine_stop_rate r
    where r.transport_year_id = v_year and r.stop_id = v_notice.transport_stop_id;
  end if;

  -- Same validation as parseFeeNoticeConfig(): an int in [0, 167], else 6.
  select case
           when (s.settings_data->>'reminder_hours_before') ~ '^\d+$'
                and (s.settings_data->>'reminder_hours_before')::int between 0 and 167
           then (s.settings_data->>'reminder_hours_before')::int
           else 6
         end
    into v_urgent
  from public.admin_settings s
  where s.setting_type = 'fee_payment_notice'
  order by s.updated_at desc
  limit 1;

  return jsonb_build_object(
    'status', v_notice.status,
    'expires_at', v_notice.expires_at,
    'amount', coalesce(v_amount, 0),
    'urgent_hours', coalesce(v_urgent, 6),
    'server_now', now()
  );
end;
$$;

-- ci:allow-secdef-authenticated self-scoped: the function reads auth.uid() itself, takes no
-- arguments, and returns only the caller's own notice (their learners_profiles rows via
-- profiles.learner_id / learners_profiles.profile_id), or NULL. Every signed-in learner
-- needs it for the MyJKKN countdown banner; nobody can read another learner's notice.
revoke all on function public.fn_my_fee_payment_notice() from public, anon;
grant execute on function public.fn_my_fee_payment_notice() to authenticated;

comment on function public.fn_my_fee_payment_notice() is
  'Caller''s own 48-hour fee payment notice (status, expires_at, amount, urgent_hours, server_now) for the MyJKKN countdown banner; NULL when none.';
