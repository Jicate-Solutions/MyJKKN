-- Grievance routing + escalation rehearsal. Every assertion raises 'FAIL: …'.
-- Run by run.sh on a fresh database: stubs -> preseed -> migration -> this file.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

CREATE FUNCTION t_ok(c boolean, m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF c IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', m; END IF; END $$;
GRANT EXECUTE ON FUNCTION t_ok(boolean, text) TO authenticated;
CREATE FUNCTION tk(p_subject text) RETURNS public.grievance_tickets LANGUAGE sql AS $$
  SELECT * FROM public.grievance_tickets WHERE subject = p_subject $$;

-- ---------------------------------------------------------------- people
INSERT INTO institutions (id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'College A'),
  ('10000000-0000-0000-0000-000000000002', 'College B (Self)');
INSERT INTO profiles (id, email, full_name, role, is_super_admin, institution_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'director@jkkn.ac.in',       'The Director',   'super_admin', true,  NULL, true),
  ('a0000000-0000-0000-0000-000000000002', 'aprincipal@jkkn.ac.in',     'A PRINCIPAL',    'principal',   false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000003', 'hod.one@jkkn.ac.in',        'HOD ONE',        'hod',         false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000004', 'hod.two.a@jkkn.ac.in',      'HOD TWO A',      'hod',         false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000005', 'hod.two.b@jkkn.ac.in',      'HOD TWO B',      'hod',         false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000006', 'testprincipal@jkkn.ac.in',  'TEST PRINCIPAL', 'principal',   false, '10000000-0000-0000-0000-000000000002', true),
  ('a0000000-0000-0000-0000-000000000007', 'l1@jkkn.ac.in',             'Learner One',    'student',     false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000008', 'l2@jkkn.ac.in',             'Learner Two',    'student',     false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000009', 'l3@jkkn.ac.in',             'Learner Three',  'student',     false, '10000000-0000-0000-0000-000000000002', true),
  ('a0000000-0000-0000-0000-00000000000a', 'icc.chair@jkkn.ac.in',      'ICC CHAIR',      'staff',       false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-00000000000b', 'gone@jkkn.ac.in',           'Left Last Year', 'staff',       false, '10000000-0000-0000-0000-000000000002', false),
  ('a0000000-0000-0000-0000-00000000000c', 'staff.x@jkkn.ac.in',        'STAFF X',        'staff',       false, '10000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-00000000000d', 'test33@jkkn.ac.in',         'BOOBALAN A',     'hod',         false, '10000000-0000-0000-0000-000000000002', true);
INSERT INTO departments (id, institution_id, department_name, head_of_department_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'D1 (designated head)', 'a0000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'D2 (two HODs, none designated)', NULL),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'D3 (only a test HOD)', NULL);
UPDATE profiles SET department_id = '20000000-0000-0000-0000-000000000001' WHERE id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007');
UPDATE profiles SET department_id = '20000000-0000-0000-0000-000000000002' WHERE id IN ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000008');
UPDATE profiles SET department_id = '20000000-0000-0000-0000-000000000003' WHERE id IN ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000d');
-- production: hod and principal roles do NOT carry grievance.tickets.view
INSERT INTO custom_roles (role_key, role_name, permissions) VALUES
  ('hod', 'HOD', '{"grievance.tickets.view": false, "accreditation.view": true}'),
  ('principal', 'Principal', '{"grievance.tickets.view": false, "accreditation.view": true}');
INSERT INTO accreditation_committees (institution_id, committee_name, committee_type, chair_user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ICC College A', 'icc', 'a0000000-0000-0000-0000-00000000000a');
INSERT INTO grievance_categories (id, institution_id, name, default_assignee_role) VALUES
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Academic', 'hod'),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Infrastructure', 'admin'),
  ('c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Conduct', 'principal'),
  ('c0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Other', 'admin');

-- ------------------------------------------------ 0. seeds + the test rule
SELECT t_ok((SELECT value #>> '{}' FROM platform_policies WHERE policy_key = 'grievance.escalation.director_profile_id')
            = 'a0000000-0000-0000-0000-000000000001', 'director level seeded from instasolver.complaint.superior_route_to');
SELECT t_ok((SELECT count(*) FROM platform_policies WHERE policy_key LIKE 'grievance.escalation.level%_hours') = 3, 'three level-hour policies seeded');
SELECT t_ok(fn_grievance_is_placeholder_profile('TEST PRINCIPAL', 'testprincipal@jkkn.ac.in'), 'TEST PRINCIPAL is a test profile');
SELECT t_ok(fn_grievance_is_placeholder_profile('BOOBALAN A', 'test33@jkkn.ac.in'), 'a real-looking name on a test33@ address is a test profile');
SELECT t_ok(fn_grievance_is_placeholder_profile('Fresh Test Admin', 'fresh-admin-1@test.local'), '*.local is a test profile');
SELECT t_ok(fn_grievance_is_placeholder_profile('TESTING STAFF', 'aioral@jkkn.ac.in'), 'a test name on an ordinary address is a test profile');
SELECT t_ok(fn_grievance_is_placeholder_profile('Somebody', 'fresh-admin-2@jkkn.local'), 'a .local address alone marks a test profile');
SELECT t_ok(NOT fn_grievance_is_placeholder_profile('VIMALA V', 'nursingprincipal@jkkn.ac.in'), 'a real principal is not a test profile');
SELECT t_ok(NOT fn_grievance_is_placeholder_profile('Isvarya Lakshmi, Joint Managing Director', 'isvarya@jkkn.ac.in'), 'the Joint MD is not a test profile');
SELECT t_ok(NOT fn_grievance_is_placeholder_profile('Protestant Chaplain', 'chaplain@jkkn.ac.in'), '"test" inside a word is not a test profile');

-- ------------------------------------------------ 1. routing on create
-- Filed through the session client as the learner, like the app does:
-- the trigger must still read departments/profiles, and its EXECUTE grant is revoked.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-hod-category',   'the lab is locked every day', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'R-admin-category', 'the hostel tap has broken', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'R-principal-category', 'a conduct matter to report', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days');
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, is_anonymous, anonymous_token) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-anonymous', 'nobody should know my name', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true, 'tok-r1');
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, is_icc_only) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-icc', 'a harassment complaint', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, metadata) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-about-superior', 'a complaint about my own HOD', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days',
   '{"source":"instasolver","about_superior":true,"route_pending_policy":true}');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

SELECT t_ok((tk('R-hod-category')).assigned_to = 'a0000000-0000-0000-0000-000000000003', 'hod category -> the designated HOD');
SELECT t_ok((tk('R-hod-category')).metadata -> 'auto_route' ->> 'level' = '1', 'hod routing records chain level 1');
SELECT t_ok((tk('R-hod-category')).escalation_level = 0, 'routing on create is not an escalation');
SELECT t_ok((tk('R-admin-category')).assigned_to = 'a0000000-0000-0000-0000-000000000002', 'admin category with no admin -> the Principal');
SELECT t_ok((tk('R-admin-category')).metadata -> 'auto_route' -> 'skipped' -> 0 ->> 'reason' = 'no_usable_admin', 'the empty admin level is recorded');
SELECT t_ok((tk('R-principal-category')).assigned_to = 'a0000000-0000-0000-0000-000000000002', 'principal category -> the Principal');
SELECT t_ok((tk('R-anonymous')).assigned_to IS NULL, 'an anonymous ticket is not routed to a HOD on create');
SELECT t_ok((tk('R-anonymous')).metadata -> 'auto_route' ->> 'reason' = 'anonymous_not_auto_routed', 'why the anonymous ticket was not routed is recorded');
SELECT t_ok((tk('R-icc')).assigned_to IS NULL, 'an ICC-only ticket is not routed to a HOD on create');
SELECT t_ok((tk('R-about-superior')).assigned_to IS NULL, 'a complaint about my superior is not routed to the HOD on create');
SELECT t_ok((SELECT count(*) FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
             WHERE n.category = 'grievance:assigned') = 3, 'exactly the three routed tickets produced a notice');
SELECT t_ok((SELECT n.url FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
             WHERE un.user_id = 'a0000000-0000-0000-0000-000000000003' AND n.category = 'grievance:assigned')
            = '/accreditation/naac/grievance/' || (tk('R-hod-category')).id, 'the HOD''s notice links to the real ticket page');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications WHERE body ILIKE '%Learner One%'), 'no notice carries the filer''s name');

-- a ticket raised by the HOD himself skips him; a ticket already assigned is left alone
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-raised-by-hod', 'my own department issue', 'a0000000-0000-0000-0000-000000000003', now() + interval '3 days');
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, assigned_to) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'R-preassigned', 'already has an owner', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', 'a0000000-0000-0000-0000-00000000000c');
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline) VALUES
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'R-college-b', 'only a test principal here', 'a0000000-0000-0000-0000-000000000009', now() + interval '3 days');
SELECT t_ok((tk('R-raised-by-hod')).assigned_to = 'a0000000-0000-0000-0000-000000000002', 'a HOD''s own complaint is never routed back to him');
SELECT t_ok((tk('R-preassigned')).assigned_to = 'a0000000-0000-0000-0000-00000000000c'
            AND NOT ((tk('R-preassigned')).metadata ? 'auto_route'), 'an insert that names an assignee is left alone');
SELECT t_ok((tk('R-college-b')).assigned_to IS NULL, 'TEST PRINCIPAL is never given a complaint');
SELECT t_ok((tk('R-college-b')).metadata::text LIKE '%no_usable_principal (1 found: test, inactive or the filer)%', 'the test principal is named as the reason');

-- ------------------------------------------------ 2. escalation fixture
-- Tickets as they sit on production today: created before this migration,
-- unassigned, SLA passed a day ago.
ALTER TABLE grievance_tickets DISABLE TRIGGER trg_grievance_route_on_create;
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, status, resolved_at, withdrawn_at, is_anonymous, anonymous_token, is_icc_only, assigned_to, metadata) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'E1-unassigned',      'breached, nobody owns it', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'open', NULL, NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'E2-not-yet-due',     'deadline tomorrow',        'a0000000-0000-0000-0000-000000000007', now() + interval '1 day', 'open', NULL, NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'E3-resolved',        'fixed already',            'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'resolved', now(), NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'E4-anonymous',       'no name on it',            'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'open', NULL, NULL, true, 'tok-e4', false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'E5-icc',             'harassment',               'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'open', NULL, NULL, false, NULL, true, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'E5b-icc-no-committee', 'harassment, no ICC here', 'a0000000-0000-0000-0000-000000000009', now() - interval '1 day', 'open', NULL, NULL, false, NULL, true, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'E6-raised-by-hod',   'the HOD raised this',      'a0000000-0000-0000-0000-000000000003', now() - interval '1 day', 'in_progress', NULL, NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'E7-two-hods',        'department with two HODs', 'a0000000-0000-0000-0000-000000000008', now() - interval '1 day', 'open', NULL, NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'E8-nobody-anywhere', 'test HOD, test principal', 'a0000000-0000-0000-0000-000000000009', now() - interval '1 day', 'open', NULL, NULL, false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'E9-about-superior',  'about my own HOD',         'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'open', NULL, NULL, false, NULL, false, 'a0000000-0000-0000-0000-000000000001', '{"routing":"superior_bypass"}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'E10-withdrawn',      'withdrawn by the filer',   'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'open', NULL, now(), false, NULL, false, NULL, '{}'),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'E11-closed',         'closed',                   'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', 'closed', NULL, NULL, false, NULL, false, NULL, '{}');
ALTER TABLE grievance_tickets ENABLE TRIGGER trg_grievance_route_on_create;
-- College B's Director level points at somebody who has left: level 3 is empty there.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active) VALUES
  ('grievance.escalation.director_profile_id', 'institution', '10000000-0000-0000-0000-000000000002', to_jsonb('a0000000-0000-0000-0000-00000000000b'::text), 'string', true);
-- E5b sits in college B too, so it must ALSO come out empty (no ICC committee, Director level = a departed person).

-- ------------------------------------------------ 3. who may start the run
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
  BEGIN
    PERFORM fn_grievance_escalation_tick(false);
    RAISE EXCEPTION 'FAIL: a signed-in HOD started the escalation run';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT t_ok(NOT has_function_privilege('authenticated', 'fn_grievance_escalation_tick(boolean)', 'EXECUTE'), 'authenticated cannot run the tick');
SELECT t_ok(NOT has_function_privilege('anon', 'fn_grievance_escalation_tick(boolean)', 'EXECUTE'), 'anon cannot run the tick');
SELECT t_ok(has_function_privilege('service_role', 'fn_grievance_escalation_tick(boolean)', 'EXECUTE'), 'the scheduler (service role) can run the tick');
SELECT t_ok(NOT has_function_privilege(r, f, 'EXECUTE'), r || ' cannot run ' || f)
FROM unnest(ARRAY['anon', 'authenticated']) AS r,
     unnest(ARRAY['fn_grievance_level_target(grievance_tickets,integer)',
                  'fn_grievance_notify(grievance_tickets,uuid,text,integer,timestamptz,text)',
                  'fn_grievance_profile_unusable(uuid,uuid[])',
                  'fn_grievance_is_placeholder_profile(text,text)',
                  'fn_grievance_sensitive_reason(grievance_tickets)',
                  'fn_grievance_route_on_create()',
                  'fn_grievance_notify_on_create()',
                  'fn_generate_unresolved_issue_items()']) AS f;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  PERFORM fn_grievance_escalation_tick(true);
  RAISE EXCEPTION 'FAIL: the authenticated role executed the tick';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ------------------------------------------------ 4. dry run writes nothing
CREATE TEMP TABLE before_dry AS SELECT md5(string_agg(t::text, '|' ORDER BY id)) h FROM grievance_tickets t;
CREATE TEMP TABLE dry AS SELECT fn_grievance_escalation_tick(true) r;
SELECT t_ok((SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM grievance_tickets t) = (SELECT h FROM before_dry), 'a dry run changes no ticket');
SELECT t_ok((SELECT count(*) FROM notifications WHERE category = 'grievance:escalated') = 0, 'a dry run sends no notice');
-- Round 3 (M5, never down): E9 is already with the Joint MD (the I8 route
-- gave it to her on filing), so it sits at the ceiling — 5 escalations, not 6.
SELECT t_ok((SELECT (r ->> 'dry_run')::boolean AND (r ->> 'escalated')::int = 5 AND (r ->> 'skipped_no_target')::int = 2
             AND (r ->> 'at_ceiling')::int = 1 AND (r ->> 'breached_stamped')::int = 8 FROM dry), 'the dry run reports what it would do: ' || (SELECT r::text FROM dry));

-- ------------------------------------------------ 5. switch off
UPDATE platform_policies SET value = 'false' WHERE policy_key = 'grievance.escalation.enabled' AND scope_type = 'global';
CREATE TEMP TABLE off_run AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'escalated')::int = 0 AND (r ->> 'switched_off')::int = 8 FROM off_run), 'switched off: nothing escalates ' || (SELECT r::text FROM off_run));
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE escalation_level > 0 OR escalated_at IS NOT NULL) = 0, 'switched off: no ticket moved');
SELECT t_ok((SELECT count(*) FROM notifications WHERE category = 'grievance:escalated') = 0, 'switched off: no notice');
SELECT t_ok((tk('E1-unassigned')).sla_breached_at IS NOT NULL, 'switched off: overdue tickets are still marked breached');
UPDATE platform_policies SET value = 'true' WHERE policy_key = 'grievance.escalation.enabled' AND scope_type = 'global';

-- ------------------------------------------------ 6. the first real run
-- One notice fails to save (E7's): the escalation itself and every other notice must still land.
CREATE FUNCTION t_break_one_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title LIKE 'Overdue%' AND (NEW.metadata ->> 'ticket_id')::uuid = (SELECT id FROM grievance_tickets WHERE subject = 'E7-two-hods') THEN
    RAISE EXCEPTION 'simulated notice failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_break_one_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION t_break_one_notice();
CREATE TEMP TABLE run1 AS SELECT fn_grievance_escalation_tick(false) r;
DROP TRIGGER t_break_one_notice ON notifications;
SELECT t_ok((SELECT (r ->> 'escalated')::int = 5 AND (r ->> 'notified')::int = 4 AND (r ->> 'notify_failed')::int = 1
             AND (r ->> 'skipped_no_target')::int = 2 AND (r ->> 'breached_stamped')::int = 0 FROM run1), 'run 1 counters ' || (SELECT r::text FROM run1));
SELECT t_ok((tk('E7-two-hods')).escalation_level = 2, 'a failed notice does not undo the escalation');
SELECT t_ok((tk('E7-two-hods')).metadata -> 'escalations' -> -1 ->> 'notify_error' LIKE '%simulated notice failure%', 'the failed notice is recorded on the ticket');

SELECT t_ok((tk('E1-unassigned')).escalation_level = 1 AND (tk('E1-unassigned')).assigned_to = 'a0000000-0000-0000-0000-000000000003',
            'breached unassigned ticket 0 -> 1, assigned to the HOD');
SELECT t_ok((tk('E1-unassigned')).escalation_deadline BETWEEN now() + interval '47 hours' AND now() + interval '49 hours',
            'level 1 gets its own 48-hour deadline');
SELECT t_ok((tk('E1-unassigned')).escalated_at IS NOT NULL, 'when it moved up is stamped');
SELECT t_ok((tk('E1-unassigned')).sla_deadline < now(), 'the original SLA deadline is kept');
SELECT t_ok(EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                    WHERE un.user_id = 'a0000000-0000-0000-0000-000000000003' AND n.category = 'grievance:escalated'
                      AND n.url = '/accreditation/naac/grievance/' || (tk('E1-unassigned')).id), 'the HOD is notified with the ticket link');
SELECT t_ok((tk('E2-not-yet-due')).escalation_level = 0 AND (tk('E2-not-yet-due')).assigned_to IS NULL, 'not yet overdue: stays at 0');
SELECT t_ok((tk('E3-resolved')).escalation_level = 0, 'a resolved ticket never escalates');
SELECT t_ok((tk('E10-withdrawn')).escalation_level = 0 AND (tk('E11-closed')).escalation_level = 0, 'withdrawn and closed tickets never escalate');
SELECT t_ok((tk('E4-anonymous')).escalation_level = 3 AND (tk('E4-anonymous')).assigned_to = 'a0000000-0000-0000-0000-000000000001',
            'an anonymous ticket goes straight to the Director level');
SELECT t_ok((tk('E5-icc')).escalation_level = 3 AND (tk('E5-icc')).assigned_to = 'a0000000-0000-0000-0000-00000000000a',
            'an ICC-only ticket goes to the college''s ICC chair');
SELECT t_ok((tk('E6-raised-by-hod')).escalation_level = 2 AND (tk('E6-raised-by-hod')).assigned_to = 'a0000000-0000-0000-0000-000000000002',
            'the HOD who raised it is skipped: straight to the Principal');
SELECT t_ok((tk('E6-raised-by-hod')).metadata -> 'escalations' -> 0 -> 'skipped' -> 0 ->> 'reason' = 'department_head_filed_this_ticket; no_usable_hod (1 found: test, inactive or the filer)',
            'why the HOD level was skipped is recorded: ' || ((tk('E6-raised-by-hod')).metadata -> 'escalations')::text);
SELECT t_ok((tk('E7-two-hods')).escalation_level = 2 AND (tk('E7-two-hods')).metadata::text LIKE '%more_than_one_hod:2%',
            'two HODs and none designated: the level is skipped, not guessed');
-- Round 3 (M5): the I8 route had already given E9 to level 3's person, the
-- Joint MD. It is not "moved up" to the person who already holds it (that sent
-- her a misleading "has moved up to you" notice), and never down to the HOD.
SELECT t_ok((tk('E9-about-superior')).escalation_level = 0 AND (tk('E9-about-superior')).assigned_to = 'a0000000-0000-0000-0000-000000000001'
            AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.category = 'grievance:escalated' AND (n.metadata ->> 'ticket_id')::uuid = (tk('E9-about-superior')).id),
            'a complaint about my superior already with level 3 stays there: never to the HOD or Principal, no second notice');
SELECT t_ok((tk('E8-nobody-anywhere')).escalation_level = 0 AND (tk('E8-nobody-anywhere')).assigned_to IS NULL,
            'nobody usable anywhere: the ticket is not moved');
SELECT t_ok((tk('E8-nobody-anywhere')).metadata -> 'escalation_blocked' ->> 'from_level' = '0', 'the blocked reason is recorded on the ticket');
SELECT t_ok((tk('E8-nobody-anywhere')).metadata::text LIKE '%director_inactive%', 'the departed Director-level person is named as the reason');
SELECT t_ok((tk('E5b-icc-no-committee')).escalation_level = 0 AND (tk('E5b-icc-no-committee')).metadata::text LIKE '%director_inactive%',
            'an ICC ticket with no ICC chair and no usable Director level stays put, recorded');
-- the safety rules, across everything this run did
SELECT t_ok(NOT EXISTS (
  SELECT 1 FROM grievance_tickets t
  WHERE (t.is_icc_only OR t.is_anonymous OR t.metadata ->> 'routing' = 'superior_bypass')
    AND t.assigned_to IN (SELECT id FROM profiles WHERE role IN ('hod', 'principal'))), 'no ICC/anonymous/about-superior ticket is with a HOD or Principal');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                        JOIN profiles p ON p.id = un.user_id
                        WHERE p.role IN ('hod', 'principal') AND (n.metadata ->> 'ticket_id')::uuid IN
                          (SELECT id FROM grievance_tickets WHERE is_icc_only OR is_anonymous OR metadata ->> 'routing' = 'superior_bypass')),
            'no HOD or Principal was ever told about an ICC/anonymous/about-superior ticket');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE assigned_to = raised_by_id), 'no ticket is with the person who raised it');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets t JOIN profiles p ON p.id = t.assigned_to
                        WHERE fn_grievance_is_placeholder_profile(p.full_name, p.email) OR NOT p.is_active), 'no ticket is with a test or departed profile');

-- ------------------------------------------------ 7. real roles: who can see what
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);   -- HOD ONE
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'E1-unassigned'), 'HOD sees the ticket escalated to him');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject IN ('E4-anonymous', 'E5-icc', 'R-anonymous', 'R-icc', 'E9-about-superior', 'R-about-superior')),
            'HOD cannot see ICC, anonymous or about-superior tickets');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);   -- A PRINCIPAL
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE subject IN ('E6-raised-by-hod', 'E7-two-hods')) = 2, 'the Principal sees the two tickets escalated to her');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject IN ('E4-anonymous', 'E5-icc', 'R-anonymous', 'R-icc', 'E9-about-superior', 'R-about-superior')),
            'the Principal cannot see ICC, anonymous or about-superior tickets');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'E1-unassigned'), 'the Principal does not see the HOD''s ticket (not hers yet)');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);   -- the ICC chair (role staff)
-- KNOWN GAP, recorded in the PR, not fixed here: production's select policy lets an
-- ICC-only ticket's assignee see it only if they hold the icc_member role (which
-- does not exist yet) or are an admin. Today no college has an ICC committee.
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'E5-icc'), 'known gap: an ICC chair without icc_member cannot open the ICC ticket assigned to him');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'E4-anonymous'), 'the filer still sees her own anonymous ticket');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ------------------------------------------------ 8. idempotent: nothing twice
CREATE TEMP TABLE blocked_at AS SELECT (tk('E8-nobody-anywhere')).metadata -> 'escalation_blocked' ->> 'at' a;
CREATE TEMP TABLE run2 AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'escalated')::int = 0 AND (r ->> 'skipped_no_target')::int = 2 FROM run2), 'run 2 moves nothing, still counts the blocked tickets ' || (SELECT r::text FROM run2));
SELECT t_ok((SELECT count(*) FROM notifications WHERE category = 'grievance:escalated') = 4, 'run 2 sends no second notice (4: E9 is at the ceiling since round 3)');
SELECT t_ok((tk('E8-nobody-anywhere')).metadata -> 'escalation_blocked' ->> 'at' = (SELECT a FROM blocked_at), 'the blocked reason is written once, not every hour');

-- ------------------------------------------------ 9. the chain, one level per breach, ceiling 3
UPDATE grievance_tickets SET escalation_deadline = now() - interval '1 minute' WHERE subject = 'E1-unassigned';
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('E1-unassigned')).escalation_level = 2 AND (tk('E1-unassigned')).assigned_to = 'a0000000-0000-0000-0000-000000000002', 'next breach: 1 -> 2, the Principal');
SELECT t_ok(jsonb_array_length((tk('E1-unassigned')).metadata -> 'escalations') = 2, 'each step is logged on the ticket');
UPDATE grievance_tickets SET escalation_deadline = now() - interval '1 minute' WHERE subject = 'E1-unassigned';
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('E1-unassigned')).escalation_level = 3 AND (tk('E1-unassigned')).assigned_to = 'a0000000-0000-0000-0000-000000000001', 'next breach: 2 -> 3, the Director level');
SELECT t_ok((tk('E1-unassigned')).escalation_deadline BETWEEN now() + interval '71 hours' AND now() + interval '73 hours', 'level 3 gets its 72-hour deadline');
UPDATE grievance_tickets SET escalation_deadline = now() - interval '1 minute' WHERE subject IN ('E1-unassigned', 'E4-anonymous');
CREATE TEMP TABLE run_ceiling AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((tk('E1-unassigned')).escalation_level = 3, 'level 3 is the ceiling');
-- 3 since round 3: E1, E4, and E9 (already with level 3's person since it was filed)
SELECT t_ok((SELECT (r ->> 'at_ceiling')::int = 3 AND (r ->> 'escalated')::int = 0 FROM run_ceiling), 'the run counts tickets at the ceiling ' || (SELECT r::text FROM run_ceiling));
SELECT t_ok((SELECT count(*) FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
             WHERE n.category = 'grievance:escalated' AND (n.metadata ->> 'ticket_id')::uuid = (tk('E1-unassigned')).id) = 3, 'one notice per step, three in all');

-- a college switched off on its own
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active) VALUES
  ('grievance.escalation.enabled', 'institution', '10000000-0000-0000-0000-000000000001', 'false', 'boolean', true);
UPDATE grievance_tickets SET escalation_deadline = now() - interval '1 minute' WHERE subject = 'E6-raised-by-hod';
CREATE TEMP TABLE run_scope AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((tk('E6-raised-by-hod')).escalation_level = 2, 'a college switched off keeps its tickets where they are');
DELETE FROM platform_policies WHERE policy_key = 'grievance.escalation.enabled' AND scope_type = 'institution';

-- ------------------------------------------------ 10. the unresolved-issue work item link
SELECT fn_generate_unresolved_issue_items();
SELECT t_ok((SELECT count(*) FROM stub_work_items) > 0, 'work items were generated');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM stub_work_items WHERE metadata ->> 'url' NOT LIKE '/accreditation/naac/grievance/%'), 'every work item links to /accreditation/naac/grievance/<id>');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM stub_work_items WHERE metadata ->> 'url' LIKE '/grievances/%'), 'no work item links to the dead /grievances/<id>');

SELECT 'GRIEVANCE ESCALATION SCENARIOS PASSED' AS result;
