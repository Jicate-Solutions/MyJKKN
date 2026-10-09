-- ai-academic-context-stub-schema.sql — OFF PRODUCTION ONLY (throwaway PostgreSQL 16).
-- Minimal stubs for ai_rpc_academic_context + four college shapes (dates relative to
-- current_date so the fixture never ages). Load order: this file, the LIVE body
-- (pg_get_functiondef of public.ai_rpc_academic_context(uuid)), then
-- ai-academic-context-rehearsal.sql (control: FAIL), then migration 20270421090000,
-- then the rehearsal again (PASS).
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
END $roles$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table public.profiles(id uuid primary key, institution_id uuid, is_super_admin boolean);
create table public.academic_years(id uuid primary key default gen_random_uuid(), institution_id uuid, academic_year_name text, start_date date, end_date date, is_active boolean);
create function public.role_has_institution_access(uuid) returns boolean language sql stable as $$ select false $$;
insert into profiles values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',false),('00000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002',false),('00000000-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-000000000003',false),('00000000-0000-0000-0000-00000000000d','dddddddd-0000-0000-0000-000000000004',false),('00000000-0000-0000-0000-00000000000e','eeeeeeee-0000-0000-0000-000000000005',false);
-- A: like Engineering: 2022-23..2027-28 all active
insert into academic_years(institution_id,academic_year_name,start_date,end_date,is_active)
select 'aaaaaaaa-0000-0000-0000-000000000001', y||'-'||(y+1), make_date(y,6,1), make_date(y+1,3,31), true from generate_series(2022,2027) y;
-- B: today falls in a gap: one year ended before today, next starts after today
insert into academic_years(institution_id,academic_year_name,start_date,end_date,is_active) values
 ('bbbbbbbb-0000-0000-0000-000000000002','past', current_date-200, current_date-20, true),
 ('bbbbbbbb-0000-0000-0000-000000000002','next', current_date+20, current_date+300, true),
 ('bbbbbbbb-0000-0000-0000-000000000002','older', current_date-600, current_date-400, true);
-- C: only an upcoming year, plus an INACTIVE current one
insert into academic_years(institution_id,academic_year_name,start_date,end_date,is_active) values
 ('cccccccc-0000-0000-0000-000000000003','soon', current_date+10, current_date+300, true),
 ('cccccccc-0000-0000-0000-000000000003','inactive-current', current_date-10, current_date+100, false),
 ('cccccccc-0000-0000-0000-000000000003','later', current_date+400, current_date+700, true);
-- D: an active '… Additional 2' shadow row shares the current year's start_date and is
--    stored FIRST, so without a tie-break LIMIT 1 can return it.
insert into academic_years(id,institution_id,academic_year_name,start_date,end_date,is_active) values
 ('0d000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Current Additional 2', current_date-30, current_date+200, true),
 ('0d000000-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000004','Current', current_date-30, current_date+200, true);
-- E: two plain rows share a start_date; the tie breaks on name ('B-year' stored first).
insert into academic_years(id,institution_id,academic_year_name,start_date,end_date,is_active) values
 ('0e000000-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000005','B-year', current_date-30, current_date+200, true),
 ('0e000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000005','A-year', current_date-30, current_date+200, true);
