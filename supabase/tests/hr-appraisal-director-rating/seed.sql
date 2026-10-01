-- People: D (on the Director list, super admin), S (super admin, NOT on the
-- list), A (admin), H (head of department A1), F (the person appraised, in
-- A1), N (signed in, no role, no staff row).
INSERT INTO public.institutions VALUES ('00000000-0000-0000-0000-0000000000a1', 'College A');
INSERT INTO public.profiles (id, full_name, role, is_super_admin, institution_id) VALUES
  ('00000000-0000-0000-0000-000000010001', 'Director D',    'super_admin', true,  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010006', 'Super admin S', 'super_admin', true,  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010007', 'Admin A',       'admin',       false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010005', 'HOD H',         'hod',         false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010011', 'Member F',      'faculty',     false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000010009', 'Nobody N',      NULL,          false, NULL);
INSERT INTO public.departments VALUES ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-0000000000a1', 'Department A1', '00000000-0000-0000-0000-000000010005');
INSERT INTO public.staff (id, profile_id, institution_id, department_id) VALUES
  ('00000000-0000-0000-0000-000000020011', '00000000-0000-0000-0000-000000010011', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1'),
  ('00000000-0000-0000-0000-000000020005', '00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d0a1');
INSERT INTO public.hr_performance_review_cycles VALUES ('00000000-0000-0000-0000-0000000c0001', 'open', NULL);
-- The Director list (#4121) holds D only; written with no JWT, as the SQL console would.
UPDATE public.platform_policies SET value = jsonb_build_array('00000000-0000-0000-0000-000000010001'), is_active = true
 WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global' AND scope_id IS NULL;
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, is_active)
SELECT 'platform.the_director_profile_ids', 'global', NULL, jsonb_build_array('00000000-0000-0000-0000-000000010001'), true
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids');
-- F's appraisal, at the Director's step, with the committee's ratings.
INSERT INTO public.hr_performance_reviews (id, cycle_id, staff_id, self_appraisal_jsonb, supervisor_review_jsonb, sedc_review_jsonb, status,
  self_submitted_at, supervisor_reviewed_at, sedc_reviewed_at)
VALUES ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000020011',
  '{"ratings":{"teaching":"meets","research":"meets","service":"meets","collegiality":"meets"}}',
  '{"ratings":{"teaching":"meets","research":"meets","service":"meets","collegiality":"meets"}}',
  '{"ratings":{"teaching":"meets","research":"exceeds","service":"meets","collegiality":"meets"}}',
  'sedc_reviewed', now(), now(), now());
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated;
CREATE FUNCTION t.login(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN p IS NULL THEN '' ELSE json_build_object('sub', p, 'role', 'authenticated')::text END, false)
$$;
CREATE FUNCTION t.try(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM; END $$;
CREATE FUNCTION t.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN RAISE NOTICE '%', CASE WHEN p_ok IS TRUE THEN 'PASS ' ELSE 'FAIL ' END || p_name
  || CASE WHEN p_ok IS TRUE OR p_detail IS NULL THEN '' ELSE '  [' || p_detail || ']' END; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated;
