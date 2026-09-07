-- Per-institution attendance report rules.
--
-- The eligibility threshold, the condonation band and whether On Duty counts as
-- attended were hard-coded constants in the report layer (75 / 65 / included).
-- They are institution policy, not engineering constants: a college under one
-- university's ordinances condones from 65%, another from 70%, and some count OD
-- toward attendance while others do not.
--
-- One row per institution. Reports fall back to the built-in defaults when an
-- institution has no row, so this migration changes nobody's numbers on the day
-- it lands - a row only exists once somebody sets one.
--
-- RLS follows the calendar_feed_settings idiom already used for
-- institution-scoped configuration on this project: read for anyone who can see
-- attendance reports in that institution, write for admins only. Deliberately no
-- new permission key - unapplied grant migrations have silently broken gating
-- here before, and an admin-only write needs no new key to work.

create table if not exists public.attendance_report_settings (
	id                    uuid primary key default gen_random_uuid(),
	institution_id        uuid not null unique
	                        references public.institutions(id) on delete cascade,

	-- Percentage at or above which a learner is eligible.
	attendance_threshold  numeric(5, 2) not null default 75
	                        check (attendance_threshold >= 0 and attendance_threshold <= 100),

	-- At or above this but below the threshold means condonation is possible;
	-- below it the learner is not eligible at all.
	condonation_floor     numeric(5, 2) not null default 65
	                        check (condonation_floor >= 0 and condonation_floor <= 100),

	-- Whether On Duty / Leave hours count as attended in the adjusted percentage.
	include_od            boolean not null default true,
	include_leave         boolean not null default false,

	notes                 text,
	created_at            timestamptz not null default now(),
	updated_at            timestamptz not null default now(),
	updated_by            uuid references public.profiles(id) on delete set null,

	-- A condonation floor above the threshold would make the band meaningless and
	-- silently mislabel learners, so the database refuses it outright.
	constraint attendance_report_settings_band
		check (condonation_floor <= attendance_threshold)
);

comment on table public.attendance_report_settings is
	'Per-institution attendance report rules: eligibility threshold, condonation floor and whether OD/Leave count as attended. Absent row = built-in defaults (75 / 65 / OD included).';

create or replace function public.attendance_report_settings_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
	new.updated_at := now();
	return new;
end;
$fn$;

drop trigger if exists trg_attendance_report_settings_updated_at
	on public.attendance_report_settings;
create trigger trg_attendance_report_settings_updated_at
	before update on public.attendance_report_settings
	for each row execute function public.attendance_report_settings_touch_updated_at();

alter table public.attendance_report_settings enable row level security;

drop policy if exists attendance_report_settings_select on public.attendance_report_settings;
create policy attendance_report_settings_select
	on public.attendance_report_settings
	for select
	using (
		(select public.is_super_admin())
		or (select public.is_admin())
		or (
			(select public.user_has_permission('academic.attendance.reports.view'))
			and public.role_has_institution_access(institution_id)
		)
	);

-- Write stays with admins. These values decide who sits an examination, so the
-- audience that can change them is deliberately narrower than the one that can
-- read a report.
drop policy if exists attendance_report_settings_write on public.attendance_report_settings;
create policy attendance_report_settings_write
	on public.attendance_report_settings
	for all
	using (
		(select public.is_super_admin())
		or ((select public.is_admin()) and public.role_has_institution_access(institution_id))
	)
	with check (
		(select public.is_super_admin())
		or ((select public.is_admin()) and public.role_has_institution_access(institution_id))
	);

create index if not exists idx_attendance_report_settings_institution
	on public.attendance_report_settings (institution_id);

grant select, insert, update, delete on public.attendance_report_settings to authenticated;
