-- People for the salary revision rehearsal. Loaded AFTER the migration, except
-- the roles, which run.sh loads BEFORE it so the migration's own grant of the
-- ask keys to principal / hod / hr_head is what the probe exercises.
--
--   College A: principal PA (in department A1), HOD HA (A1), the Director D,
--              the HR head H, team members F1 (A1), F2 (A2), F4 (A1), F6 (A2),
--              and X (A1) whose employment category is outside HR.
--   College B: principal PB, team members F3 and F5 (B1).
-- Ids: users 0000000100NN, staff 0000000200NN.

INSERT INTO public.institutions VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'College A'),
  ('00000000-0000-0000-0000-0000000000b2', 'College B');
INSERT INTO public.departments VALUES
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-0000000000a1', 'Department A1'),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-0000000000a1', 'Department A2'),
  ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-0000000000b2', 'Department B1');
INSERT INTO public.employment_categories VALUES
  ('00000000-0000-0000-0000-000000000c01', true),
  ('00000000-0000-0000-0000-000000000c02', false);
INSERT INTO public.hr_organizations VALUES
  ('00000000-0000-0000-0000-000000000ea1', '00000000-0000-0000-0000-0000000000a1', 'College A'),
  ('00000000-0000-0000-0000-000000000eb2', '00000000-0000-0000-0000-0000000000b2', 'College B');

INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  ('00000000-0000-0000-0000-000000010001', 'Director D',    'super_admin', true,  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010002', 'HR head H',     'hr_head',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010003', 'Principal PA',  'principal',   false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010004', 'Principal PB',  'principal',   false, '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000010005', 'HOD HA',        'hod',         false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010011', 'Member F1',     'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010012', 'Member F2',     'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010013', 'Member F3',     'faculty',     false, '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000010014', 'Member F4',     'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010015', 'Member F5',     'faculty',     false, '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000010016', 'Member F6',     'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010017', 'Outside HR X',  'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  -- 30 Sep: a super admin who is NOT on the Director list, and one more A1 member.
  ('00000000-0000-0000-0000-000000010006', 'Super admin S', 'super_admin', true,  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010018', 'Member F7',     'faculty',     false, '00000000-0000-0000-0000-0000000000a1');

-- Multi-role lane too: every user also has their role through user_roles.
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, cr.id FROM public.profiles p JOIN public.custom_roles cr ON cr.role_key = p.role
 WHERE p.role <> 'super_admin';

INSERT INTO public.staff (id, profile_id, institution_id, department_id, category_id,
                          first_name, last_name, staff_id, designation, date_of_joining) VALUES
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-0000000000a1', NULL, '00000000-0000-0000-0000-000000000c01', 'Director', 'D', 'D01', 'Director', '2010-06-01'),
  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-0000000000a1', NULL, '00000000-0000-0000-0000-000000000c01', 'HR head', 'H', 'H02', 'HR Head', '2015-06-01'),
  ('00000000-0000-0000-0000-000000020003', '00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Principal', 'PA', 'P03', 'Principal', '2012-06-01'),
  ('00000000-0000-0000-0000-000000020004', '00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-0000000000b2', NULL, '00000000-0000-0000-0000-000000000c01', 'Principal', 'PB', 'P04', 'Principal', '2013-06-01'),
  ('00000000-0000-0000-0000-000000020005', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'HOD', 'HA', 'H05', 'Head of Department', '2016-06-01'),
  ('00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-000000010011', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F1', 'F11', 'Assistant Professor', '2020-06-01'),
  ('00000000-0000-0000-0000-000000020012', '00000000-0000-0000-0000-000000010012', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-000000000c01', 'Member', 'F2', 'F12', 'Assistant Professor', '2021-06-01'),
  ('00000000-0000-0000-0000-000000020013', '00000000-0000-0000-0000-000000010013', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F3', 'F13', 'Assistant Professor', '2019-06-01'),
  ('00000000-0000-0000-0000-000000020014', '00000000-0000-0000-0000-000000010014', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F4', 'F14', 'Assistant Professor', '2022-06-01'),
  ('00000000-0000-0000-0000-000000020015', '00000000-0000-0000-0000-000000010015', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F5', 'F15', 'Assistant Professor', '2018-06-01'),
  ('00000000-0000-0000-0000-000000020016', '00000000-0000-0000-0000-000000010016', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-000000000c01', 'Member', 'F6', 'F16', 'Assistant Professor', '2017-06-01'),
  ('00000000-0000-0000-0000-000000020017', '00000000-0000-0000-0000-000000010017', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c02', 'Outside', 'X', 'X17', 'Driver', '2017-06-01'),
  ('00000000-0000-0000-0000-000000020018', '00000000-0000-0000-0000-000000010018', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000c01', 'Member', 'F7', 'F18', 'Assistant Professor', '2023-06-01');

-- 30 Sep: the Director list (#4121) holds D only. Written with no JWT, as the
-- SQL console would; #4121's own seed found no Director account here.
UPDATE public.platform_policies
   SET value = jsonb_build_array('00000000-0000-0000-0000-000000010001'), is_active = true
 WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global' AND scope_id IS NULL;
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, is_active)
SELECT 'platform.the_director_profile_ids', 'global', NULL, jsonb_build_array('00000000-0000-0000-0000-000000010001'), true
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids');

-- Everybody's pay in force from 1 April 2026. F1 also has an older row it
-- replaced, so the in-force read walks a real chain.
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from,
                                      eligible_for_pf, epf_amount, allowance_amount, allowance_label, superseded_by)
VALUES
  ('00000000-0000-0000-0000-000000030110', '00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-000000000ea1', 45000, '2025-04-01', true, 1800, 0, NULL, NULL);
INSERT INTO public.hr_staff_salaries (staff_id, hr_organization_id, monthly_gross, effective_from,
                                      eligible_for_pf, epf_amount, allowance_amount, allowance_label)
SELECT s.id,
       CASE s.institution_id WHEN '00000000-0000-0000-0000-0000000000a1' THEN '00000000-0000-0000-0000-000000000ea1'::uuid
                             ELSE '00000000-0000-0000-0000-000000000eb2'::uuid END,
       CASE s.staff_id WHEN 'D01' THEN 200000 WHEN 'H02' THEN 90000 WHEN 'P03' THEN 120000 WHEN 'P04' THEN 118000
                       WHEN 'H05' THEN 80000 WHEN 'F11' THEN 48000 WHEN 'F12' THEN 40000 WHEN 'F13' THEN 50000
                       WHEN 'F14' THEN 52000 WHEN 'F15' THEN 60000 WHEN 'F16' THEN 35000 ELSE 20000 END,
       '2026-04-01', s.staff_id = 'F11', CASE WHEN s.staff_id = 'F11' THEN 1800 ELSE 0 END,
       CASE WHEN s.staff_id = 'F11' THEN 2500 ELSE 0 END,
       CASE WHEN s.staff_id = 'F11' THEN 'Conveyance' END
  FROM public.staff s
 WHERE s.staff_id <> 'F11';
-- F1's current row replaces the 2025 one (supersede, as fn_hr_set_staff_salary does).
BEGIN;
UPDATE public.hr_staff_salaries SET superseded_by = '00000000-0000-0000-0000-000000030111'
 WHERE id = '00000000-0000-0000-0000-000000030110';
INSERT INTO public.hr_staff_salaries (id, staff_id, hr_organization_id, monthly_gross, effective_from,
                                      eligible_for_pf, epf_amount, allowance_amount, allowance_label)
VALUES ('00000000-0000-0000-0000-000000030111', '00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-000000000ea1',
        48000, '2026-04-01', true, 1800, 2500, 'Conveyance');
COMMIT;

-- Probe helpers. SECURITY INVOKER: they run as whoever the probe has SET ROLE to.
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated;
CREATE FUNCTION t.login(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN p IS NULL THEN '' ELSE json_build_object('sub', p)::text END, false)
$$;
CREATE FUNCTION t.try(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;
-- 1 Oct 2026: the same, but the message, so a probe can tell WHICH rule refused.
CREATE FUNCTION t.msg(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM; END $$;
CREATE FUNCTION t.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%', CASE WHEN p_ok IS TRUE THEN 'PASS ' ELSE 'FAIL ' END || p_name
                    || CASE WHEN p_ok IS TRUE OR p_detail IS NULL THEN '' ELSE '  [' || p_detail || ']' END;
END $$;
-- 1 Oct 2026: the decider yes/no is service_role-only (no screen asks it);
-- the probe asks it as the owner, with the caller's JWT still in place.
-- plpgsql, so the seed also loads on a database without 20271003101503 yet.
CREATE FUNCTION t.is_decider() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN public.fn_hr_salary_revision_is_list_member_raise_decider(); END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated;
