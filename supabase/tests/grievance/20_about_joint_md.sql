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
SELECT array_agg(id)::text AS jids FROM grievance_tickets WHERE about_joint_md \gset
SELECT t_ok(:ticked_now = 6, 'six complaints about the Joint MD exist: ' || :ticked_now);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(cardinality(fn_grievance_caller_joint_md_scope()) > 0, 'the Joint MD knows her own seat (and only that)');
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = 0, 'Joint MD (a super admin): 0 rows about the Joint MD');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE subject LIKE 'J%'), 'Joint MD: not one J-ticket by any route');
SELECT t_ok((SELECT count(*) FROM grievance_tickets) = :visible_to_jmd, 'Joint MD: her total count leaves them out (sees ' || (SELECT count(*) FROM grievance_tickets) || ', expected ' || :visible_to_jmd || ')');
SELECT t_ok((SELECT count(*) FROM grievance_comments WHERE ticket_id = ANY (:'jids'::uuid[])) = 0, 'Joint MD: 0 comments of a complaint about her');
SELECT t_ok((SELECT count(*) FROM grievance_history WHERE ticket_id = ANY (:'jids'::uuid[])) = 0, 'Joint MD: 0 history lines of a complaint about her');
WITH u AS (UPDATE grievance_tickets SET status = 'in_progress' WHERE about_joint_md RETURNING 1)
SELECT t_ok((SELECT count(*) FROM u) = 0, 'Joint MD: cannot change one either');
SELECT t_ok(NOT fn_grievance_ticket_hidden_from_caller('00000000-0000-0000-0000-000000000000'), 'the hidden-check answers false for a ticket that does not exist');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- another super admin
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = :ticked_now, 'another super admin sees all of them, held ones included');
SELECT t_ok(cardinality(fn_grievance_caller_joint_md_scope()) = 0, 'a super admin who is not the Joint MD has no seat');
SELECT t_ok((SELECT count(*) FROM grievance_comments WHERE ticket_id = ANY (:'jids'::uuid[])) = 1, 'another super admin still sees the comment');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director (not a super admin)
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'J2-director'), 'the Director sees the complaint given to him');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = :ticked_now, 'the filer still sees her own complaints');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

-- ------------------------------------------------ 3b. signed out (anon): exactly as before the PR (M5)
-- The three restrictive policies are TO authenticated: anon cannot run the
-- two helpers they call, so without it an anonymous read that used to return
-- no rows failed with "permission denied for function". (Supabase grants anon
-- SELECT on public tables; the stubs only did so for grievance_tickets, and
-- the existing policies read these others.)
SELECT t_ok((SELECT count(*) FROM pg_policy
              WHERE polname IN ('grievance_tickets_hide_about_joint_md', 'grievance_comments_hide_about_joint_md',
                                'grievance_history_hide_about_joint_md')
                AND polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]) = 3,
            'the three hiding policies apply to signed-in users only');
GRANT SELECT ON grievance_comments, grievance_history, user_roles, custom_roles, profiles TO anon;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false);
SELECT (SELECT count(*) FROM grievance_tickets) AS anon_t, (SELECT count(*) FROM grievance_comments) AS anon_c,
       (SELECT count(*) FROM grievance_history) AS anon_h \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', false);
SELECT t_ok(:anon_t = 0 AND :anon_c = 0 AND :anon_h = 0,
            'anon reads tickets, comments and history without an error and sees nothing, as before');

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

-- ------------------------------------------------ 4b. its handler LATER takes a Joint MD seat (H1)
-- Rule (b) is checked only when a write changes the handler, the college or
-- the tick. Before, every write to such a row raised 42501 — including the
-- hourly breach stamp, which stopped the run for every college. Rolled back.
BEGIN;
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active) VALUES
  ('grievance.escalation.director_profile_id', 'institution', '10000000-0000-0000-0000-000000000001',
   to_jsonb('a0000000-0000-0000-0000-00000000000e'::text), 'string', true);
SELECT t_ok('a0000000-0000-0000-0000-00000000000e'::uuid = ANY (fn_grievance_joint_md_ids('10000000-0000-0000-0000-000000000001')),
            'setup: J2''s handler now holds a Joint MD seat in college A');
UPDATE grievance_tickets SET status = 'in_progress' WHERE subject = 'J2-director';
SELECT t_ok((tk('J2-director')).status = 'in_progress', 'an edit that does not change the handler still goes through');
UPDATE grievance_tickets SET sla_breached_at = NULL, sla_deadline = now() - interval '1 hour' WHERE subject = 'J2-director';
CREATE TEMP TABLE h1run AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'success')::boolean FROM h1run), 'the hourly run still completes: ' || (SELECT r::text FROM h1run));
SELECT t_ok((tk('J2-director')).sla_breached_at IS NOT NULL, 'and stamps that ticket breached');
DO $$ BEGIN
  UPDATE grievance_tickets SET assigned_to = 'a0000000-0000-0000-0000-000000000001' WHERE subject = 'J2-director';
  RAISE EXCEPTION 'FAIL: rule (b) no longer refuses giving it to the Joint MD';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;
SELECT t_ok((tk('J2-director')).status = 'open' AND (tk('J2-director')).sla_breached_at IS NULL, 'the H1 rehearsal left nothing behind');

-- ------------------------------------------------ 4c. the tick is set only when a complaint is filed (H2)
-- Otherwise a HOD or Principal handling a complaint about THEMSELVES could
-- tick it, hide it from the Joint MD and every count, and keep it.
DO $$ BEGIN
  UPDATE grievance_tickets SET about_joint_md = true WHERE subject = 'E2-not-yet-due';
  RAISE EXCEPTION 'FAIL: the tick was set on an existing complaint (database owner)';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
DO $$ BEGIN
  UPDATE grievance_tickets SET about_joint_md = true WHERE subject = 'E2-not-yet-due';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: setup — the super admin cannot reach E2 at all'; END IF;
  RAISE EXCEPTION 'FAIL: a super admin set the tick on an existing complaint';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer, ticket still open
DO $$ BEGIN
  UPDATE grievance_tickets SET about_joint_md = true WHERE subject = 'E2-not-yet-due';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: setup — the filer cannot reach E2 at all'; END IF;
  RAISE EXCEPTION 'FAIL: the filer set the tick after filing';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok(NOT (tk('E2-not-yet-due')).about_joint_md, 'E2 is still not ticked');

-- ------------------------------------------------ 5. escalation never reaches the Joint MD
UPDATE grievance_tickets SET sla_deadline = now() - interval '1 day' WHERE subject IN ('J1-held', 'J2-director', 'J2c-superior-and-jmd');
-- what the run will stamp: complaints about the Joint MD and the rest
SELECT count(*) FILTER (WHERE NOT about_joint_md) AS plain_due, count(*) FILTER (WHERE about_joint_md) AS ticked_due
  FROM grievance_tickets
 WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened') AND resolved_at IS NULL AND withdrawn_at IS NULL
   AND sla_breached_at IS NULL AND sla_deadline < now() \gset
CREATE TEMP TABLE jrun1 AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((tk('J1-held')).escalation_level = 3 AND (tk('J1-held')).assigned_to = 'a0000000-0000-0000-0000-00000000000e',
            'an overdue held complaint escalates straight to the Director once he is set: ' || (tk('J1-held')).metadata::text);
SELECT t_ok((tk('J1-held')).metadata -> 'escalations' -> 0 -> 'skipped' -> 0 ->> 'reason' = 'about_joint_md_skips_hod', 'the HOD level was skipped for the tick');
SELECT t_ok((tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-00000000000e' AND (tk('J2-director')).escalation_level = 0,
            'already with the Director: stays there (at the ceiling)');
-- M6: the run's answer (the cron's status line and logs, which the Joint MD
-- can read as a super admin) carries no number and no row for them.
SELECT t_ok(:ticked_due >= 3, 'this run had complaints about the Joint MD to stamp: ' || :ticked_due);
SELECT t_ok((tk('J1-held')).sla_breached_at IS NOT NULL AND (tk('J2-director')).sla_breached_at IS NOT NULL
            AND (tk('J2c-superior-and-jmd')).sla_breached_at IS NOT NULL, 'they ARE stamped breached');
SELECT t_ok((SELECT (r ->> 'breached_stamped')::int FROM jrun1) = :plain_due,
            'breached_stamped counts only the other complaints: ' || (SELECT r ->> 'breached_stamped' FROM jrun1) || ' vs ' || :plain_due);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM jrun1)) e
                        JOIN grievance_tickets t ON t.ticket_number = e ->> 'ticket'
                        WHERE t.about_joint_md),
            'no complaint about the Joint MD is in the run''s ticket list (J1 escalated, J2 at the ceiling)');
SELECT t_ok((SELECT (r ->> 'escalated')::int = (SELECT count(*) FROM jsonb_array_elements(r -> 'tickets') e WHERE e ->> 'outcome' = 'escalated')
                AND (r ->> 'at_ceiling')::int = (SELECT count(*) FROM jsonb_array_elements(r -> 'tickets') e WHERE e ->> 'outcome' = 'at_ceiling')
                AND (r ->> 'skipped_no_target')::int = (SELECT count(*) FROM jsonb_array_elements(r -> 'tickets') e WHERE e ->> 'outcome' = 'no_target')
             FROM jrun1),
            'every counter matches the listed rows, so none of them counts a complaint about the Joint MD: ' || (SELECT r::text FROM jrun1));
-- Director unset again: a new overdue complaint is blocked, never moved to the Joint MD
UPDATE platform_policies SET value = to_jsonb(''::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J4-held-overdue', 'about the joint md, overdue', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 day', true);
CREATE TEMP TABLE jrun2 AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM jrun2)) e WHERE e ->> 'ticket' = (tk('J4-held-overdue')).ticket_number)
            AND (SELECT (r ->> 'skipped_no_target')::int = (SELECT count(*) FROM jsonb_array_elements(r -> 'tickets') e WHERE e ->> 'outcome' = 'no_target') FROM jrun2),
            'a blocked complaint about the Joint MD is neither listed nor counted as skipped_no_target: ' || (SELECT r::text FROM jrun2));
-- M4 (round 2): held with nobody handling them = counted every hour, as a bare number
SELECT count(*) AS held_now FROM grievance_tickets
 WHERE about_joint_md AND assigned_to IS NULL AND status IN ('open', 'in_progress', 'pending_info', 'reopened')
   AND resolved_at IS NULL AND withdrawn_at IS NULL \gset
SELECT t_ok(:held_now >= 1 AND (SELECT (r ->> 'held_for_director')::int FROM jrun2) = :held_now,
            'the run counts the complaints held for want of a Director: ' || (SELECT r ->> 'held_for_director' FROM jrun2) || ' of ' || :held_now);
CREATE TEMP TABLE jrun2b AS SELECT fn_grievance_escalation_tick(true) r;
SELECT t_ok((SELECT (r ->> 'held_for_director')::int FROM jrun2b) = :held_now, 'and again the next hour (dry run too)');
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
-- Only the Director named by grievance.escalation.about_joint_md_profile_id
-- (round 2, M3): not a super admin, not the database owner; unset = nobody.
-- Every refusal is the same 42501. t_sb answers 'ok:<result>' or
-- '<sqlstate>:<message>'.
CREATE FUNCTION t_sb(p uuid, p_note text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'ok:' || fn_grievance_send_back_to_normal_path(p, p_note)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ':' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION t_sb(uuid, text) TO authenticated;
-- ids read here, as the superuser: most callers below cannot see the row.
SELECT id AS j1 FROM grievance_tickets WHERE subject = 'J1-held' \gset
SELECT id AS j1b FROM grievance_tickets WHERE subject = 'J1b-held-named-jmd' \gset
SELECT id AS j2 FROM grievance_tickets WHERE subject = 'J2-director' \gset
SELECT t_ok((tk('J2-director')).sla_deadline < now(), 'J2''s original deadline has passed (it was held past it)');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);   -- the Joint MD (super admin)
SELECT t_ok(t_sb(:'j2') LIKE '42501:%', 'the Joint MD cannot send it back: ' || t_sb(:'j2'));
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- another super admin, not the Director
SELECT t_ok(t_sb(:'j2') LIKE '42501:%', 'a super admin who is not the Director gets 42501: ' || t_sb(:'j2'));
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer
SELECT t_ok(t_sb(:'j2') LIKE '42501:%', 'the filer cannot');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);   -- an ordinary member of staff
SELECT t_ok(t_sb(:'j2') = t_sb('00000000-0000-0000-0000-000000000000'),
            '"not yours" and "does not exist" are the same answer: ' || t_sb(:'j2'));
RESET ROLE;
-- the database owner, acting as that super admin: still no
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);
SELECT t_ok(t_sb(:'j2') LIKE '42501:%', 'the database owner gets no shortcut either');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT t_ok(t_sb(:'j2') LIKE 'ok:%' AND t_sb(:'j2') LIKE '%not signed in%' AND t_sb(:'j2') LIKE '%"success": false%',
            'with nobody signed in: refused');
-- the setting empty: nobody, not even the person who WAS the Director
UPDATE platform_policies SET value = to_jsonb(''::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);
SELECT t_ok(t_sb(:'j2') LIKE '42501:%', 'Director setting empty: nobody can send it back');
RESET ROLE;
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-00000000000e'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
SELECT t_ok((tk('J2-director')).about_joint_md, 'every refusal left J2 ticked');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
CREATE TEMP TABLE sb1 AS SELECT t_sb(:'j2', 'ticked by mistake') r;
SELECT t_ok((SELECT r LIKE 'ok:%"success": true%' FROM sb1), 'the Director sends it back: ' || (SELECT r FROM sb1));
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
-- M6: a fresh deadline, computed the way a new ticket's is
SELECT t_ok((tk('J2-director')).sla_deadline > now()
            AND (tk('J2-director')).sla_deadline = calculate_grievance_sla_deadline('10000000-0000-0000-0000-000000000001',
                  (tk('J2-director')).sla_hours, ((tk('J2-director')).metadata -> 'about_joint_md_sent_back' ->> 'at')::timestamptz)
            AND (tk('J2-director')).sla_breached_at IS NULL,
            'a fresh SLA from calculate_grievance_sla_deadline (' || (tk('J2-director')).sla_hours || ' h): ' || (tk('J2-director')).sla_deadline::text);
SELECT t_ok((tk('J2-director')).metadata -> 'about_joint_md_sent_back' ->> 'previous_sla_deadline' IS NOT NULL,
            'the old deadline is kept on the ticket');
CREATE TEMP TABLE sbrun AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((tk('J2-director')).escalation_level = 0 AND (tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-000000000002',
            'the next hourly run does NOT escalate it: the Principal has the full SLA');
-- now an ordinary complaint: the Joint MD may see it, and it escalates like any other (level 3 = the Joint MD)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE subject = 'J2-director'), 'sent back: the Joint MD can see it now');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
UPDATE grievance_tickets SET sla_deadline = now() - interval '1 hour' WHERE subject = 'J2-director';
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('J2-director')).escalation_level = 3 AND (tk('J2-director')).assigned_to = 'a0000000-0000-0000-0000-000000000001',
            'sent back and later overdue: Principal -> level 3, the Joint MD, like any other complaint');
-- J1b: a super admin cannot; the Director can; a second send-back has nothing to do
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(t_sb(:'j1b') LIKE '42501:%', 'a super admin cannot send J1b back');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);
SELECT t_ok(t_sb(:'j1b') LIKE 'ok:%"success": true%', 'the Director can');
SELECT t_ok(t_sb(:'j2') LIKE '%not marked as about the Joint MD%', 'sending back twice is refused in words');
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
