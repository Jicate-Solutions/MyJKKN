-- "This complaint is about the Joint MD" (Director rulings 9 Oct 2026 23:18
-- and 23:25). Runs after 10_escalation.sql on the same database and reuses its
-- people. Every assertion raises 'FAIL: …'.
--
-- Who is who here:
--   a…01  holds the JOINT MD's seat: 10_ seeds both instasolver.complaint.
--         superior_route_to and grievance.escalation.director_profile_id (level
--         3) to it, and it is a SUPER ADMIN — the hardest case: every
--         is_super_admin() shortcut is open to it.
--   a…0e  THE DIRECTOR (not a super admin): named only by the new policy.
--   a…0f  another super admin (a developer).
--   a…07  the learner who files; a…03 HOD ONE (D1); a…02 A PRINCIPAL.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

INSERT INTO profiles (id, email, full_name, role, is_super_admin, institution_id, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000000e', 'md.office@jkkn.ac.in', 'The Director', 'director', false, NULL, true),
  ('a0000000-0000-0000-0000-00000000000f', 'dev.one@jkkn.ac.in',   'Developer One', 'super_admin', true, NULL, true);

-- Runs as the rehearsal's superuser (row-level security does not apply), with
-- the given person as auth.uid(): what the patched My Desk grievance branch
-- would list for them. The query is cut out of the PATCHED REAL body.
CREATE FUNCTION t_desk_grievance_ids(p_uid uuid) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE v_q text; v_ids uuid[];
BEGIN
  SELECT substring(prosrc from 'grievance AS \((.*?)\n  \),') INTO v_q FROM pg_proc WHERE proname = 'fn_my_desk_waiting';
  IF v_q IS NULL THEN RAISE EXCEPTION 'FAIL: the grievance branch of fn_my_desk_waiting was not found'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  EXECUTE 'SELECT COALESCE(array_agg(item_id), ''{}'') FROM (' || replace(v_q, 'v_is_super', 'true') || ') s' INTO v_ids;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_ids;
END $$;

-- ------------------------------------------------ 0. seeds, seats, grants
SELECT t_ok((SELECT value FROM platform_policies WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id'
              AND scope_type = 'global') = to_jsonb(''::text),
            'the Director policy is seeded EMPTY when no verified director@ account exists (never copied from the Joint MD)');
SELECT t_ok(fn_grievance_joint_md_ids('10000000-0000-0000-0000-000000000001') = ARRAY['a0000000-0000-0000-0000-000000000001'::uuid],
            'the Joint MD''s seat in college A is a…01: ' || fn_grievance_joint_md_ids('10000000-0000-0000-0000-000000000001')::text);
SELECT t_ok(has_function_privilege('authenticated', f, 'EXECUTE'), 'signed-in users can run ' || f)
FROM unnest(ARRAY['fn_grievance_send_back_to_normal_path(uuid,text)',
                  'fn_grievance_caller_joint_md_scope()',
                  'fn_grievance_ticket_hidden_from_caller(uuid)']) AS f;
SELECT t_ok(NOT has_function_privilege('anon', 'fn_grievance_send_back_to_normal_path(uuid,text)', 'EXECUTE'), 'anon cannot send a complaint back');
SELECT t_ok(NOT has_function_privilege(r, f, 'EXECUTE'), r || ' cannot run ' || f)
FROM unnest(ARRAY['anon', 'authenticated']) AS r,
     unnest(ARRAY['fn_grievance_joint_md_ids(uuid)',
                  'fn_grievance_about_joint_md_target(grievance_tickets)',
                  'fn_grievance_initial_route(grievance_tickets)',
                  'fn_grievance_policy_profile_id(jsonb)',
                  'fn_grievance_about_joint_md_guard()']) AS f;

-- ------------------------------------------------ 1. Director not set: saved and HELD
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
INSERT INTO grievance_tickets (institution_id, category_id, department_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'J1-held', 'about the joint md, nobody set', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
-- an insert that names the Joint MD as handler is overridden
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md, assigned_to) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'J1b-held-named-jmd', 'about the joint md, insert named her', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true,
   'a0000000-0000-0000-0000-000000000001');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

SELECT t_ok((tk('J1-held')).assigned_to IS NULL, 'Director not set: the complaint is saved, unassigned');
SELECT t_ok((tk('J1-held')).metadata -> 'about_joint_md_hold' ->> 'reason' LIKE 'no_director_set%',
            'the hold says why: ' || COALESCE((tk('J1-held')).metadata::text, 'null'));
SELECT t_ok((tk('J1b-held-named-jmd')).assigned_to IS NULL, 'an insert that names the Joint MD is never left with her');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications WHERE (metadata ->> 'ticket_id')::uuid IN ((tk('J1-held')).id, (tk('J1b-held-named-jmd')).id)),
            'a held complaint notifies nobody');

-- ------------------------------------------------ 2. Director set: routed to the Director
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-00000000000e'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J2-director', 'about the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md, is_icc_only) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'J2b-icc-and-jmd', 'harassment by the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true, true);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md, metadata) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'J2c-superior-and-jmd', 'my superior is the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true,
   '{"source":"instasolver","about_superior":true}');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

SELECT t_ok((tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-00000000000e', 'about the Joint MD -> the Director');
SELECT t_ok((tk('J2-director')).metadata -> 'auto_route' ->> 'level' = '3' AND (tk('J2-director')).metadata -> 'auto_route' ->> 'role' = 'the_director',
            'recorded as the top level, the Director: ' || ((tk('J2-director')).metadata -> 'auto_route')::text);
SELECT t_ok((tk('J2-director')).escalation_level = 0, 'routing on create is not an escalation');
SELECT t_ok((tk('J2b-icc-and-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e', 'ICC-only AND about the Joint MD -> still the Director (the tick wins)');
SELECT t_ok((tk('J2c-superior-and-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e', 'about my superior AND about the Joint MD -> the Director');
SELECT t_ok(EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                    WHERE un.user_id = 'a0000000-0000-0000-0000-00000000000e' AND n.category = 'grievance:assigned'
                      AND (n.metadata ->> 'ticket_id')::uuid = (tk('J2-director')).id), 'the Director is told');

-- the Director policy can never name the Joint MD
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active) VALUES
  ('grievance.escalation.about_joint_md_profile_id', 'institution', '10000000-0000-0000-0000-000000000001',
   to_jsonb('a0000000-0000-0000-0000-000000000001'::text), 'string', true);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J3-policy-names-jmd', 'about the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
DELETE FROM platform_policies WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'institution';
SELECT t_ok((tk('J3-policy-names-jmd')).assigned_to IS NULL
            AND (tk('J3-policy-names-jmd')).metadata -> 'about_joint_md_hold' ->> 'reason' = 'director_policy_names_the_joint_md',
            'a Director policy that names the Joint MD counts as unset: held, ' || COALESCE((tk('J3-policy-names-jmd')).metadata::text, 'null'));

-- a comment and a history line on a hidden ticket (for section 3)
INSERT INTO grievance_comments (ticket_id, author_id, author_name, author_type, content)
  SELECT id, 'a0000000-0000-0000-0000-00000000000e', 'The Director', 'staff', 'looking into it' FROM grievance_tickets WHERE subject = 'J2-director';
INSERT INTO grievance_history (ticket_id, action, new_value, performed_by)
  SELECT id, 'status_change', 'in_progress', 'a0000000-0000-0000-0000-00000000000e' FROM grievance_tickets WHERE subject = 'J2-director';

-- ------------------------------------------------ 3. what the Joint MD can see: nothing
SELECT count(*) AS visible_to_jmd FROM grievance_tickets WHERE NOT about_joint_md \gset
SELECT count(*) AS ticked_now FROM grievance_tickets WHERE about_joint_md \gset
SELECT t_ok(:ticked_now = 6, 'six complaints about the Joint MD exist: ' || :ticked_now);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(cardinality(fn_grievance_caller_joint_md_scope()) > 0, 'the Joint MD knows her own seat (and only that)');
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = 0, 'Joint MD (a super admin): 0 rows about the Joint MD');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject LIKE 'J%'), 'Joint MD: not one J-ticket by any route');
SELECT t_ok((SELECT count(*) FROM grievance_tickets) = :visible_to_jmd, 'Joint MD: her total count leaves them out (sees ' || (SELECT count(*) FROM grievance_tickets) || ', expected ' || :visible_to_jmd || ')');
SELECT t_ok((SELECT count(*) FROM grievance_comments) = 0, 'Joint MD: 0 comments of a complaint about her');
SELECT t_ok((SELECT count(*) FROM grievance_history) = 0, 'Joint MD: 0 history lines of a complaint about her');
WITH u AS (UPDATE grievance_tickets SET status = 'in_progress' WHERE about_joint_md RETURNING 1)
SELECT t_ok((SELECT count(*) FROM u) = 0, 'Joint MD: cannot change one either');
SELECT t_ok(NOT fn_grievance_ticket_hidden_from_caller('00000000-0000-0000-0000-000000000000'), 'the hidden-check answers false for a ticket that does not exist');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- another super admin
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = :ticked_now, 'another super admin sees all of them, held ones included');
SELECT t_ok(cardinality(fn_grievance_caller_joint_md_scope()) = 0, 'a super admin who is not the Joint MD has no seat');
SELECT t_ok((SELECT count(*) FROM grievance_comments) = 1, 'another super admin still sees the comment');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director (not a super admin)
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'J2-director'), 'the Director sees the complaint given to him');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = :ticked_now, 'the filer still sees her own complaints');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

-- My Desk (SECURITY DEFINER, skips row-level security): the real body, patched
SELECT t_ok((SELECT prosrc LIKE '%fn_grievance_caller_joint_md_scope%' FROM pg_proc WHERE proname = 'fn_my_desk_waiting'),
            'the real fn_my_desk_waiting body was patched in place');
SELECT t_ok(NOT (t_desk_grievance_ids('a0000000-0000-0000-0000-000000000001') && ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id]),
            'My Desk: no held complaint about the Joint MD on the Joint MD''s desk');
SELECT t_ok(t_desk_grievance_ids('a0000000-0000-0000-0000-00000000000f') @> ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id],
            'My Desk: every held one IS on another super admin''s desk');
SELECT t_ok(t_desk_grievance_ids('a0000000-0000-0000-0000-000000000001') && ARRAY[(tk('E2-not-yet-due')).id],
            'My Desk: the Joint MD still sees ordinary unassigned complaints');

-- ------------------------------------------------ 4. two rules no write may break
DO $$ BEGIN
  UPDATE grievance_tickets SET assigned_to = 'a0000000-0000-0000-0000-000000000001' WHERE subject = 'J2-director';
  RAISE EXCEPTION 'FAIL: a complaint about the Joint MD was given to the Joint MD';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  UPDATE grievance_tickets SET about_joint_md = false WHERE subject = 'J2-director';
  RAISE EXCEPTION 'FAIL: the tick was cleared without the send-back action';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
DO $$ BEGIN
  UPDATE grievance_tickets SET about_joint_md = false WHERE subject = 'J1-held';
  RAISE EXCEPTION 'FAIL: a super admin cleared the tick by editing the row';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok((tk('J2-director')).about_joint_md AND (tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-00000000000e', 'J2 unchanged by the refused writes');

-- ------------------------------------------------ 5. escalation never reaches the Joint MD
UPDATE grievance_tickets SET sla_deadline = now() - interval '1 day' WHERE subject IN ('J1-held', 'J2-director', 'J2c-superior-and-jmd');
CREATE TEMP TABLE jrun1 AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((tk('J1-held')).escalation_level = 3 AND (tk('J1-held')).assigned_to = 'a0000000-0000-0000-0000-00000000000e',
            'an overdue held complaint escalates straight to the Director once he is set: ' || (tk('J1-held')).metadata::text);
SELECT t_ok((tk('J1-held')).metadata -> 'escalations' -> 0 -> 'skipped' -> 0 ->> 'reason' = 'about_joint_md_skips_hod', 'the HOD level was skipped for the tick');
SELECT t_ok((tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-00000000000e' AND (tk('J2-director')).escalation_level = 0,
            'already with the Director: stays there (at the ceiling)');
SELECT t_ok(EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM jrun1)) e
                    WHERE e ->> 'ticket' = (tk('J2-director')).ticket_number AND e ->> 'outcome' = 'at_ceiling'),
            'the run reports it at the ceiling');
-- Director unset again: a new overdue complaint is blocked, never moved to the Joint MD
UPDATE platform_policies SET value = to_jsonb(''::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J4-held-overdue', 'about the joint md, overdue', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', true);
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('J4-held-overdue')).assigned_to IS NULL AND (tk('J4-held-overdue')).escalation_level = 0,
            'no Director set and overdue: NOT moved (never to the Joint MD)');
SELECT t_ok((tk('J4-held-overdue')).metadata -> 'escalation_blocked' -> 'skipped' -> -1 ->> 'reason' LIKE 'no_director_set%',
            'the block names the missing Director: ' || COALESCE((tk('J4-held-overdue')).metadata::text, 'null'));
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-00000000000e'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';

-- the dashboard work item: the unassigned fallback is the OLDEST super admin = the Joint MD here
SELECT fn_generate_unresolved_issue_items();
SELECT t_ok(NOT EXISTS (SELECT 1 FROM stub_work_items w JOIN grievance_tickets t ON t.id = (w.metadata ->> 'grievance_id')::uuid
                        WHERE t.about_joint_md AND w.target = 'a0000000-0000-0000-0000-000000000001'),
            'no work item about a complaint about the Joint MD goes to the Joint MD');
SELECT t_ok(EXISTS (SELECT 1 FROM stub_work_items WHERE target = 'a0000000-0000-0000-0000-00000000000e'
                    AND (metadata ->> 'grievance_id')::uuid = (tk('J2-director')).id),
            'the Director gets the work item for the overdue one he holds');

-- the counts (SECURITY DEFINER readers, patched in place): complaints about the Joint MD are left out
SELECT count(*) AS overdue_plain FROM grievance_tickets WHERE NOT about_joint_md
   AND status NOT IN ('resolved', 'closed', 'cancelled') AND sla_deadline < now()
   AND institution_id = '10000000-0000-0000-0000-000000000001' \gset
SELECT count(*) AS overdue_ticked FROM grievance_tickets WHERE about_joint_md
   AND status NOT IN ('resolved', 'closed', 'cancelled') AND sla_deadline < now()
   AND institution_id = '10000000-0000-0000-0000-000000000001' \gset
SELECT t_ok(:overdue_ticked >= 3, 'there ARE overdue complaints about the Joint MD to leave out: ' || :overdue_ticked);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
SELECT t_ok((fn_dashboard_metrics('10000000-0000-0000-0000-000000000001') ->> 'escalations_open')::int = :overdue_plain,
            'dashboard count (as the Joint MD) leaves them out: ' || (fn_dashboard_metrics('10000000-0000-0000-0000-000000000001') ->> 'escalations_open'));
SELECT t_ok((fn_compute_ohs_for_institution('10000000-0000-0000-0000-000000000001') ->> 'escalations_open')::int = :overdue_plain,
            'leaderboard (OHS) count leaves them out');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);   -- HOD ONE, department D1 (J1 is in D1)
SELECT t_ok((fn_hod_metrics() ->> 'open_grievances')::int
            = (SELECT count(*) FROM grievance_tickets WHERE department_id = '20000000-0000-0000-0000-000000000001'
                 AND NOT about_joint_md AND status NOT IN ('resolved', 'closed')), 'HOD count leaves them out');
SELECT t_ok((fn_compute_dhs_for_user('a0000000-0000-0000-0000-000000000003') ->> 'grievances_total')::int
            = (SELECT count(*) FROM grievance_tickets WHERE department_id = '20000000-0000-0000-0000-000000000001'
                 AND NOT about_joint_md AND created_at >= current_date - 30), 'department score count leaves them out');
SELECT set_config('request.jwt.claim.sub', '', false);

-- ------------------------------------------------ 6. "send back to the normal path"
-- ids read here, as the superuser: most callers below cannot see the row.
SELECT id AS j1 FROM grievance_tickets WHERE subject = 'J1-held' \gset
SELECT id AS j1b FROM grievance_tickets WHERE subject = 'J1b-held-named-jmd' \gset
SELECT id AS j2 FROM grievance_tickets WHERE subject = 'J2-director' \gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);   -- the Joint MD (super admin)
SELECT t_ok((fn_grievance_send_back_to_normal_path(:'j2') ->> 'success')::boolean IS FALSE,
            'the Joint MD cannot send it back, super admin or not');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer
SELECT t_ok((fn_grievance_send_back_to_normal_path(:'j2') ->> 'success')::boolean IS FALSE, 'the filer cannot');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);   -- an ordinary member of staff
SELECT t_ok(fn_grievance_send_back_to_normal_path(:'j2') ->> 'error'
            = fn_grievance_send_back_to_normal_path('00000000-0000-0000-0000-000000000000') ->> 'error',
            '"not yours" and "does not exist" are the same answer');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
CREATE TEMP TABLE sb1 AS SELECT fn_grievance_send_back_to_normal_path(:'j2', 'ticked by mistake') r;
SELECT t_ok((SELECT (r ->> 'success')::boolean FROM sb1), 'the Director sends it back: ' || (SELECT r::text FROM sb1));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok(NOT (tk('J2-director')).about_joint_md, 'the tick is cleared');
SELECT t_ok((tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-000000000002' AND (tk('J2-director')).metadata -> 'auto_route' ->> 'level' = '2',
            'routed the normal way (admin category, no admin -> the Principal): ' || ((tk('J2-director')).metadata -> 'auto_route')::text);
SELECT t_ok((tk('J2-director')).escalation_level = 0 AND (tk('J2-director')).escalation_deadline IS NULL, 'its escalation restarts from there');
SELECT t_ok((tk('J2-director')).metadata -> 'about_joint_md_sent_back' ->> 'by' = 'a0000000-0000-0000-0000-00000000000e'
            AND (tk('J2-director')).metadata -> 'about_joint_md_sent_back' ->> 'note' = 'ticked by mistake', 'who did it is on the ticket');
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_history WHERE ticket_id = (tk('J2-director')).id AND action = 'about_joint_md_sent_back'
                    AND performed_by = 'a0000000-0000-0000-0000-00000000000e'), 'and in grievance_history');
SELECT t_ok(EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                    WHERE un.user_id = 'a0000000-0000-0000-0000-000000000002' AND (n.metadata ->> 'ticket_id')::uuid = (tk('J2-director')).id),
            'the new handler is told');
-- now an ordinary complaint: the Joint MD may see it, and it escalates like any other (level 3 = the Joint MD)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'J2-director'), 'sent back: the Joint MD can see it now');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('J2-director')).escalation_level = 3 AND (tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-000000000001',
            'sent back and overdue: Principal -> level 3, the Joint MD, like any other complaint');
-- a super admin may send one back too; a second send-back has nothing to do
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok((fn_grievance_send_back_to_normal_path(:'j1b') ->> 'success')::boolean, 'a super admin can send one back');
SELECT t_ok(fn_grievance_send_back_to_normal_path(:'j2') ->> 'error' LIKE '%not marked as about the Joint MD%', 'sending back twice is refused in words');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT t_ok(fn_grievance_send_back_to_normal_path(:'j1') ->> 'error' = 'You are not signed in.', 'signed out: refused');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', false);
SELECT t_ok((tk('J1b-held-named-jmd')).assigned_to = 'a0000000-0000-0000-0000-000000000003', 'J1b sent back: the HOD category goes to HOD ONE');

-- ------------------------------------------------ 7. across everything: never the Joint MD while ticked
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE about_joint_md AND assigned_to = 'a0000000-0000-0000-0000-000000000001'),
            'no ticked complaint is with the Joint MD');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                        WHERE un.user_id = 'a0000000-0000-0000-0000-000000000001'
                          AND (n.metadata ->> 'ticket_id')::uuid IN (SELECT id FROM grievance_tickets WHERE about_joint_md)),
            'the Joint MD was never told about a complaint that is still about her');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets t, jsonb_array_elements(COALESCE(t.metadata -> 'escalations', '[]')) e
                        WHERE t.about_joint_md AND e ->> 'to' = 'a0000000-0000-0000-0000-000000000001'),
            'no escalation step of a ticked complaint ever pointed at the Joint MD');

SELECT 'ABOUT THE JOINT MD SCENARIOS PASSED' AS result;
