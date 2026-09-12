-- Minimal stand-ins for the production objects hr_scope_gate depends on, so the
-- migration can be applied and exercised on a throwaway cluster. Each helper
-- reads a GUC, which is what lets one session impersonate different readers.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;

-- nullif() before the cast: an unset GUC reads as '' and ''::boolean throws
-- before coalesce() can see it.
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('test.super', true),'')::boolean, false) $$;

CREATE OR REPLACE FUNCTION public.fn_my_hr_organization_ids() RETURNS uuid[] LANGUAGE sql STABLE AS
  $$ SELECT coalesce(string_to_array(nullif(current_setting('test.orgs', true),''), ',')::uuid[], '{}'::uuid[]) $$;

CREATE OR REPLACE FUNCTION public.fn_my_staff_ids() RETURNS uuid[] LANGUAGE sql STABLE AS
  $$ SELECT coalesce(string_to_array(nullif(current_setting('test.staff', true),''), ',')::uuid[], '{}'::uuid[]) $$;

CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('test.allinst', true),'')::boolean, false)
       OR check_institution_id = ANY (coalesce(string_to_array(nullif(current_setting('test.insts', true),''), ',')::uuid[], '{}'::uuid[])) $$;

CREATE TABLE IF NOT EXISTS public.hr_organizations (id uuid PRIMARY KEY, institution_id uuid, included_in_hr boolean DEFAULT true);
CREATE TABLE IF NOT EXISTS public.staff (id uuid PRIMARY KEY, institution_id uuid);
CREATE TABLE IF NOT EXISTS public.hr_recruitment_candidates (id uuid PRIMARY KEY, submitted_by uuid);
CREATE TABLE IF NOT EXISTS public.hr_recruitment_candidate_packages (
  id uuid PRIMARY KEY, hr_organization_id uuid, candidate_id uuid, proposed_by uuid, approved_by uuid);
CREATE TABLE IF NOT EXISTS public.hr_staff_bank_accounts (id uuid PRIMARY KEY, staff_id uuid);
CREATE TABLE IF NOT EXISTS public.hr_attendance_periods (id uuid PRIMARY KEY, institution_id uuid);

-- Stands in for the permissive policies that exist in production. They grant on
-- a permission key alone, which is precisely the bug: no institution dimension.
ALTER TABLE public.hr_recruitment_candidate_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_recruitment_candidate_packages;
CREATE POLICY p_sel ON public.hr_recruitment_candidate_packages FOR SELECT USING (true);
ALTER TABLE public.hr_staff_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_staff_bank_accounts;
CREATE POLICY p_sel ON public.hr_staff_bank_accounts FOR SELECT USING (true);
ALTER TABLE public.hr_attendance_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_attendance_periods;
CREATE POLICY p_sel ON public.hr_attendance_periods FOR SELECT USING (true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN CREATE ROLE app_user LOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO app_user;

-- institution A and institution B, one row each per gated table
INSERT INTO hr_organizations VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',true),
 ('bbbbbbbb-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000002',true) ON CONFLICT DO NOTHING;
INSERT INTO staff VALUES
 ('50000000-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-00000000000b','22222222-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO hr_recruitment_candidates VALUES
 ('c0000000-0000-0000-0000-00000000000a', null),
 ('c0000000-0000-0000-0000-00000000000b', null) ON CONFLICT DO NOTHING;
INSERT INTO hr_recruitment_candidate_packages VALUES
 ('90000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000a',null,null),
 ('90000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','c0000000-0000-0000-0000-00000000000b',null,null) ON CONFLICT DO NOTHING;
INSERT INTO hr_staff_bank_accounts VALUES
 ('ba000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a'),
 ('ba000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000b') ON CONFLICT DO NOTHING;
INSERT INTO hr_attendance_periods VALUES
 ('90000000-1111-0000-0000-00000000000a','11111111-0000-0000-0000-000000000001'),
 ('90000000-1111-0000-0000-00000000000b','22222222-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sections 4-6 of the migration: interviews and scorecards, keyed through the
-- candidate rather than through an institution column of their own.
-- ---------------------------------------------------------------------------

-- The migration REVOKEs from `anon` and GRANTs to `authenticated`/`service_role`
-- by name. A bare cluster has none of them, and the migration would abort on the
-- GRANT — so the throwaway must model Supabase's role set, not just its tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')         THEN CREATE ROLE anon NOLOGIN;         END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
END $$;

-- app_user reads as a signed-in user does, so it inherits `authenticated` and
-- with it EXECUTE on the new definer helper — rather than being granted the
-- function directly, which would not prove the production grant is right.
GRANT authenticated TO app_user;

-- The candidate carries the institution; interviews and scorecards inherit it.
ALTER TABLE public.hr_recruitment_candidates ADD COLUMN IF NOT EXISTS institution_id uuid;
UPDATE public.hr_recruitment_candidates SET institution_id='11111111-0000-0000-0000-000000000001'
  WHERE id='c0000000-0000-0000-0000-00000000000a';
UPDATE public.hr_recruitment_candidates SET institution_id='22222222-0000-0000-0000-000000000002'
  WHERE id='c0000000-0000-0000-0000-00000000000b';

CREATE TABLE IF NOT EXISTS public.hr_recruitment_interviews (
  id uuid PRIMARY KEY, candidate_id uuid, panel_member_ids uuid[] DEFAULT '{}');
CREATE TABLE IF NOT EXISTS public.hr_recruitment_scorecards (
  id uuid PRIMARY KEY, candidate_id uuid, interviewer_id uuid);

-- Stand-ins for the production permissive policies: a permission key, no
-- institution dimension — the bug, reproduced.
ALTER TABLE public.hr_recruitment_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_recruitment_interviews;
CREATE POLICY p_sel ON public.hr_recruitment_interviews FOR SELECT USING (true);
ALTER TABLE public.hr_recruitment_scorecards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_recruitment_scorecards;
CREATE POLICY p_sel ON public.hr_recruitment_scorecards FOR SELECT USING (true);

-- GRANT SELECT ON ALL TABLES above ran before these existed; grant explicitly.
GRANT SELECT ON public.hr_recruitment_interviews, public.hr_recruitment_scorecards TO app_user;

-- Institution A's row has an empty panel; institution B's names eeee…01, who is
-- the reader used to prove the identity escape hatches still open.
INSERT INTO hr_recruitment_interviews VALUES
 ('11000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','{}'),
 ('11000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b',
  '{eeeeeeee-0000-0000-0000-000000000001}') ON CONFLICT DO NOTHING;
INSERT INTO hr_recruitment_scorecards VALUES
 ('55000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a',null),
 ('55000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b',
  'eeeeeeee-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Make the harness able to OBSERVE the property sections 5-6 actually claim.
--
-- Without this, hr_recruitment_candidates carries no RLS in the stub, so a
-- SECURITY DEFINER helper and a plain invoker-rights subquery behave
-- identically and the interview/scorecard assertions would pass for the wrong
-- reason. Production DOES put RLS on that table, and its SELECT policy demands
-- hr.recruitment.view on top of institution access — which is the whole reason
-- section 4 is SECURITY DEFINER.
--
-- Visible unless a test explicitly hides it, so the assertions written before
-- this policy existed are unaffected.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_recruitment_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_sel ON public.hr_recruitment_candidates;
CREATE POLICY p_sel ON public.hr_recruitment_candidates FOR SELECT
  USING (coalesce(nullif(current_setting('test.hide_candidates', true),''),'false') <> 'true');
GRANT SELECT ON public.hr_recruitment_candidates TO app_user;
