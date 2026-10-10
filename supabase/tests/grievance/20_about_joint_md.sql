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
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);   -- NULL = nobody signed in
  EXECUTE 'SELECT COALESCE(array_agg(item_id), ''{}'') FROM (' || replace(v_q, 'v_is_super', 'true') || ') s' INTO v_ids;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_ids;
END $$;

-- Confidential notices and work items name no ticket (round 6): they are
-- found by the hashed key the database gives them.
CREATE FUNCTION t_conf_notice(p_key text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'grievance-confidential:' || md5(p_key) $$;
CREATE FUNCTION t_conf_item(p_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'grievance_confidential:' || md5('grievance_ticket:' || p_id::text || ':' || CURRENT_DATE::text) $$;

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
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications WHERE idempotency_key IN (t_conf_notice('grievance-assigned:' || (tk('J1-held')).id),
                                                                       t_conf_notice('grievance-assigned:' || (tk('J1b-held-named-jmd')).id)))
            AND NOT EXISTS (SELECT 1 FROM notifications WHERE metadata ->> 'confidential' = 'true'),
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
                      AND n.idempotency_key = t_conf_notice('grievance-assigned:' || (tk('J2-director')).id)
                      AND n.metadata ->> 'confidential' = 'true'), 'the Director is told, confidentially');

-- the Director policy can never name the Joint MD: with the college row AND
-- the global row both naming her, nobody is usable — held
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, is_active) VALUES
  ('grievance.escalation.about_joint_md_profile_id', 'institution', '10000000-0000-0000-0000-000000000001',
   to_jsonb('a0000000-0000-0000-0000-000000000001'::text), 'string', true);
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-000000000001'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J3-policy-names-jmd', 'about the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-00000000000e'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
SELECT t_ok((tk('J3-policy-names-jmd')).assigned_to IS NULL
            AND (tk('J3-policy-names-jmd')).metadata -> 'about_joint_md_hold' ->> 'reason' = 'director_policy_names_the_joint_md',
            'a Director policy that names the Joint MD counts as unset: held, ' || COALESCE((tk('J3-policy-names-jmd')).metadata::text, 'null'));
-- round 5 (ii): a COLLEGE row naming the Joint MD is ignored when the global
-- Director can take it — routed to him, not held
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'J3b-college-row-names-jmd', 'about the joint md', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days', true);
SELECT t_ok((tk('J3b-college-row-names-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e',
            'a college row naming the Joint MD falls through to the global Director: '
            || COALESCE(((tk('J3b-college-row-names-jmd')).metadata -> 'auto_route')::text, 'null'));
SELECT t_ok(fn_grievance_director_for('10000000-0000-0000-0000-000000000001') = 'a0000000-0000-0000-0000-00000000000e',
            'the one resolver says so too (hiding, send-back and routing share it)');
DELETE FROM platform_policies WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'institution';

-- a comment and a history line on a hidden ticket (for section 3)
INSERT INTO grievance_comments (ticket_id, author_id, author_name, author_type, content)
  SELECT id, 'a0000000-0000-0000-0000-00000000000e', 'The Director', 'staff', 'looking into it' FROM grievance_tickets WHERE subject = 'J2-director';
INSERT INTO grievance_history (ticket_id, action, new_value, performed_by)
  SELECT id, 'status_change', 'in_progress', 'a0000000-0000-0000-0000-00000000000e' FROM grievance_tickets WHERE subject = 'J2-director';

-- ------------------------------------------------ 3. what the Joint MD can see: nothing
SELECT count(*) AS visible_to_jmd FROM grievance_tickets WHERE NOT about_joint_md \gset
SELECT count(*) AS ticked_now FROM grievance_tickets WHERE about_joint_md \gset
SELECT t_ok(:ticked_now = 7, 'seven complaints about the Joint MD exist: ' || :ticked_now);
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
SELECT t_ok((SELECT prosrc LIKE '%fn_grievance_jmd_hidden_for%' FROM pg_proc WHERE proname = 'fn_my_desk_waiting'),
            'the real fn_my_desk_waiting body was patched in place');
SELECT t_ok(NOT (t_desk_grievance_ids('a0000000-0000-0000-0000-000000000001') && ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id]),
            'My Desk: no held complaint about the Joint MD on the Joint MD''s desk');
-- THE SWITCH (round 3; recommended option, the default): left out for everyone but the Director
SELECT t_ok(fn_grievance_jmd_hide_from_everyone(), 'the switch is seeded to the recommended option: hidden from everyone');
-- Round 4 (H1): the configured Director ALWAYS has the held ones on his desk
SELECT t_ok(t_desk_grievance_ids('a0000000-0000-0000-0000-00000000000e') @> ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id],
            'My Desk, recommended option: every held complaint about the Joint MD IS on the Director''s desk');
SELECT t_ok(NOT (t_desk_grievance_ids('a0000000-0000-0000-0000-00000000000f') && ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id]),
            'My Desk, recommended option: not on another super admin''s desk either');
-- the other option: one row flips every patched reader
UPDATE platform_policies SET value = 'false' WHERE policy_key = 'grievance.about_joint_md.hide_from_everyone' AND scope_type = 'global';
SELECT t_ok(t_desk_grievance_ids('a0000000-0000-0000-0000-00000000000f') @> ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id],
            'My Desk, other option: every held one IS on another super admin''s desk');
SELECT t_ok(t_desk_grievance_ids('a0000000-0000-0000-0000-00000000000e') @> ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id],
            'My Desk, other option: and on the Director''s');
SELECT t_ok(NOT (t_desk_grievance_ids(NULL) && ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id]),
            'My Desk, other option: nobody signed in = hidden (fail closed)');
SELECT t_ok(NOT (t_desk_grievance_ids('a0000000-0000-0000-0000-000000000001') && ARRAY[(tk('J1-held')).id, (tk('J1b-held-named-jmd')).id, (tk('J3-policy-names-jmd')).id]),
            'My Desk, other option: still never on the Joint MD''s');
UPDATE platform_policies SET value = 'true' WHERE policy_key = 'grievance.about_joint_md.hide_from_everyone' AND scope_type = 'global';
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
-- round 6 (LOW 7): a held one goes to the Director as soon as one resolves,
-- whatever its deadline: handed over (never via HOD or Principal), not escalated
SELECT t_ok((tk('J1-held')).assigned_to = 'a0000000-0000-0000-0000-00000000000e'
            AND (tk('J1-held')).metadata -> 'auto_route' ->> 'role' = 'the_director'
            AND NOT ((tk('J1-held')).metadata ? 'about_joint_md_hold'),
            'a held complaint goes to the Director once he is set: ' || (tk('J1-held')).metadata::text);
SELECT t_ok((tk('J1b-held-named-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e'
            AND (tk('J1b-held-named-jmd')).sla_deadline > now(),
            'so does one that is not overdue yet');
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
-- Round 3 (M3): no count of held complaints in the answer, anywhere; only
-- whether the routing is CONFIGURED — a fact about the setting, not tickets.
SELECT t_ok((SELECT NOT (r ? 'held_for_director') AND r::text NOT LIKE '%held%' FROM jrun2), 'the run''s answer carries no held count');
SELECT t_ok((SELECT (r ->> 'about_joint_md_routing_configured')::boolean IS FALSE FROM jrun2),
            'Director setting empty: routing reported as not configured');
SELECT t_ok((tk('J4-held-overdue')).assigned_to IS NULL AND (tk('J4-held-overdue')).escalation_level = 0,
            'no Director set and overdue: NOT moved (never to the Joint MD)');
SELECT t_ok((tk('J4-held-overdue')).metadata -> 'escalation_blocked' -> 'skipped' -> -1 ->> 'reason' LIKE 'no_director_set%',
            'the block names the missing Director: ' || COALESCE((tk('J4-held-overdue')).metadata::text, 'null'));
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-00000000000e'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';

SELECT t_ok((SELECT (fn_grievance_escalation_tick(true) ->> 'about_joint_md_routing_configured')::boolean),
            'Director set: routing reported as configured');

-- the dashboard work item: the unassigned fallback is the OLDEST super admin = the Joint MD here
SELECT fn_generate_unresolved_issue_items();
SELECT t_ok(NOT EXISTS (SELECT 1 FROM stub_work_items w
                        WHERE w.metadata ->> 'confidential' = 'true' AND w.target = 'a0000000-0000-0000-0000-000000000001'),
            'no work item about a complaint about the Joint MD goes to the Joint MD');
SELECT t_ok(EXISTS (SELECT 1 FROM stub_work_items WHERE target = 'a0000000-0000-0000-0000-00000000000e'
                    AND key = t_conf_item((tk('J2-director')).id) AND metadata ->> 'confidential' = 'true'),
            'the Director gets the (confidential) work item for the overdue one he holds');
-- round 3: a HELD one (nobody holds it) is a work item for nobody, not for
-- whichever super admin is oldest — here made someone other than the Joint MD
BEGIN;
UPDATE profiles SET created_at = '2000-01-01' WHERE id = 'a0000000-0000-0000-0000-00000000000f';
DELETE FROM stub_work_items;
SELECT fn_generate_unresolved_issue_items();
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_tickets WHERE about_joint_md AND assigned_to IS NULL AND sla_deadline < now()),
            'setup: an overdue complaint about the Joint MD is held');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM stub_work_items w JOIN grievance_tickets t ON w.key = t_conf_item(t.id)
                        WHERE t.about_joint_md AND t.assigned_to IS NULL)
            AND NOT EXISTS (SELECT 1 FROM stub_work_items w WHERE w.metadata ->> 'confidential' = 'true'
                              AND w.target = 'a0000000-0000-0000-0000-00000000000f'),
            'a held complaint about the Joint MD becomes nobody''s work item (not the oldest super admin''s)');
SELECT t_ok(EXISTS (SELECT 1 FROM stub_work_items WHERE target = 'a0000000-0000-0000-0000-00000000000f'),
            'while ordinary unassigned ones still go to that super admin');
ROLLBACK;

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
-- round 6 (LOW 5): the Joint MD may read this ticket now, so it keeps no
-- trace of its time as a complaint about her — a neutral history line only
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_history WHERE ticket_id = (tk('J2-director')).id AND action = 'routing_corrected'
                    AND new_value = 'Routing corrected by the Director' AND old_value IS NULL
                    AND performed_by = 'a0000000-0000-0000-0000-00000000000e'), 'grievance_history says only "Routing corrected by the Director"');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_history WHERE ticket_id = (tk('J2-director')).id
                        AND (coalesce(old_value, '') || coalesce(new_value, '') ILIKE '%joint md%'
                             OR coalesce(new_value, '') LIKE '%ticked by mistake%')),
            'no history line of it names the Joint MD or carries the note');
SELECT t_ok(NOT ((tk('J2-director')).metadata ?| ARRAY['about_joint_md_sent_back', 'about_joint_md_hold', 'escalations', 'escalation_blocked'])
            AND (tk('J2-director')).metadata::text NOT ILIKE '%joint_md%' AND (tk('J2-director')).metadata::text NOT ILIKE '%the_director%'
            AND (tk('J2-director')).metadata::text NOT LIKE '%ticked by mistake%',
            'and its metadata keeps nothing from then: ' || (tk('J2-director')).metadata::text);
SELECT t_ok(EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                    WHERE un.user_id = 'a0000000-0000-0000-0000-000000000002' AND (n.metadata ->> 'ticket_id')::uuid = (tk('J2-director')).id),
            'the new handler is told');
-- M6: a fresh deadline, computed the way a new ticket's is
SELECT t_ok((tk('J2-director')).sla_deadline > now()
            AND (tk('J2-director')).sla_deadline = calculate_grievance_sla_deadline('10000000-0000-0000-0000-000000000001',
                  (tk('J2-director')).sla_hours, (tk('J2-director')).assigned_at)
            AND (tk('J2-director')).sla_breached_at IS NULL,
            'a fresh SLA from calculate_grievance_sla_deadline (' || (tk('J2-director')).sla_hours || ' h): ' || (tk('J2-director')).sla_deadline::text);
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

-- ------------------------------------------------ 6b. round 3: counts, SLA stats, evidence, never down
-- get_grievance_sla_stats: production's LIVE body (00_stubs.sql), patched in
-- place like the other readers, and obeying the switch.
SELECT t_ok((SELECT (length(prosrc) - length(replace(prosrc, 'public.grievance_tickets AS __jmd', ''))) / length('public.grievance_tickets AS __jmd')
             FROM pg_proc WHERE proname = 'get_grievance_sla_stats') = 10,
            'all ten subqueries of the live get_grievance_sla_stats are wrapped');
SELECT t_ok((SELECT w.wrapped = 0 AND w.already = 10 FROM pg_proc p, fn_grievance_jmd_wrap_reads(p.prosrc, 'switch') w
             WHERE p.proname = 'get_grievance_sla_stats'), 'and the rewriter finds nothing left to wrap');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM fn_grievance_jmd_reader_gate() WHERE object LIKE 'get_grievance_sla_stats%'),
            'the reader gate passes it');
-- ratings, so the two averages have something to leave out: a ticked one rated 1, an ordinary one rated 5
UPDATE grievance_tickets SET satisfaction_rating = 1 WHERE subject = 'J2c-superior-and-jmd';
UPDATE grievance_tickets SET satisfaction_rating = 5 WHERE subject = 'E1-unassigned';
SELECT count(*) FILTER (WHERE NOT about_joint_md AND status = 'open') AS plain_open,
       count(*) FILTER (WHERE status = 'open') AS all_open,
       count(*) FILTER (WHERE NOT about_joint_md AND status NOT IN ('resolved', 'closed') AND sla_status = 'breached') AS plain_breached,
       count(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND sla_status = 'breached') AS all_breached,
       COALESCE(avg(satisfaction_rating) FILTER (WHERE NOT about_joint_md), 0) AS plain_sat,
       COALESCE(avg(satisfaction_rating), 0) AS all_sat
  FROM grievance_tickets WHERE institution_id = '10000000-0000-0000-0000-000000000001' \gset
SELECT t_ok(:all_open > :plain_open AND :all_breached > :plain_breached AND :all_sat <> :plain_sat,
            'college A has open, breached and rated complaints about the Joint MD to leave out: open '
            || :plain_open || '/' || :all_open || ', breached ' || :plain_breached || '/' || :all_breached);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- a super admin, not the Joint MD
CREATE TEMP TABLE sla_on AS SELECT get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb AS j;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
SELECT t_ok((get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb ->> 'total_open')::int = :all_open,
            'recommended option: the Director''s own SLA counts DO include them');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);
SELECT t_ok((SELECT (j ->> 'total_open')::int = :plain_open AND (j ->> 'sla_breached')::int = :plain_breached
                    AND (j ->> 'avg_satisfaction')::numeric = :plain_sat FROM sla_on),
            'SLA stats, recommended option: total_open, sla_breached and avg_satisfaction leave them out for everyone: '
            || (SELECT j::text FROM sla_on));
UPDATE platform_policies SET value = 'false' WHERE policy_key = 'grievance.about_joint_md.hide_from_everyone' AND scope_type = 'global';
CREATE TEMP TABLE sla_off AS SELECT get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb AS j;
SELECT t_ok((SELECT (j ->> 'total_open')::int = :all_open AND (j ->> 'sla_breached')::int = :all_breached
                    AND (j ->> 'avg_satisfaction')::numeric = :all_sat FROM sla_off),
            'SLA stats, other option: another super admin counts them: ' || (SELECT j::text FROM sla_off));
SELECT t_ok((fn_dashboard_metrics('10000000-0000-0000-0000-000000000001') ->> 'escalations_open')::int
            > (SELECT count(*) FROM grievance_tickets WHERE NOT about_joint_md AND status NOT IN ('resolved', 'closed', 'cancelled')
                 AND sla_deadline < now() AND institution_id = '10000000-0000-0000-0000-000000000001'),
            'dashboard, other option: another super admin counts them too (one switch for every reader)');
-- Round 4 (M3): fail closed — nobody signed in, or a stored score
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT t_ok((fn_dashboard_metrics('10000000-0000-0000-0000-000000000001') ->> 'escalations_open')::int
            = (SELECT count(*) FROM grievance_tickets WHERE NOT about_joint_md AND status NOT IN ('resolved', 'closed', 'cancelled')
                 AND sla_deadline < now() AND institution_id = '10000000-0000-0000-0000-000000000001'),
            'other option, nobody signed in: left out (fail closed)');
SELECT t_ok((get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb ->> 'total_open')::int = :plain_open,
            'other option, nobody signed in: SLA stats leave them out too');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);
SELECT t_ok((fn_compute_ohs_for_institution('10000000-0000-0000-0000-000000000001') ->> 'escalations_open')::int
            = (SELECT count(*) FROM grievance_tickets WHERE NOT about_joint_md AND status NOT IN ('resolved', 'closed', 'cancelled')
                 AND sla_deadline IS NOT NULL AND sla_deadline < now() AND institution_id = '10000000-0000-0000-0000-000000000001'),
            'other option: a stored leaderboard score leaves them out even for a signed-in super admin');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);   -- the Joint MD
SELECT t_ok((get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb ->> 'total_open')::int = :plain_open
            AND (get_grievance_sla_stats('10000000-0000-0000-0000-000000000001')::jsonb ->> 'sla_breached')::int = :plain_breached,
            'SLA stats, other option: never the Joint MD');
UPDATE platform_policies SET value = 'true' WHERE policy_key = 'grievance.about_joint_md.hide_from_everyone' AND scope_type = 'global';
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE grievance_tickets SET satisfaction_rating = NULL WHERE subject IN ('J2c-superior-and-jmd', 'E1-unassigned');

-- NAAC / UGC evidence on resolve
SELECT t_ok((SELECT prosrc LIKE '%about_joint_md%' FROM pg_proc WHERE proname = 'emit_grievance_evidence'),
            'emit_grievance_evidence was patched in place');
UPDATE grievance_tickets SET status = 'resolved', resolved_at = now() WHERE subject = 'J2b-icc-and-jmd';
SELECT t_ok(NOT EXISTS (SELECT 1 FROM quality_evidence_mappings WHERE source_id = (tk('J2b-icc-and-jmd')).id),
            'a resolved complaint about the Joint MD leaves no NAAC / UGC evidence');
UPDATE grievance_tickets SET status = 'resolved', resolved_at = now() WHERE subject = 'E2-not-yet-due';
SELECT t_ok((SELECT count(*) FROM quality_evidence_mappings WHERE source_id = (tk('E2-not-yet-due')).id) = 2,
            'an ordinary resolved complaint still does (NAAC 7.7.1 + UGC)');

-- M5: never down the chain. Routed to the HOD, moved BY HAND to the Principal,
-- then overdue: it goes up to level 3, never back down to the HOD.
INSERT INTO grievance_tickets (institution_id, category_id, department_id, subject, description, raised_by_id, sla_deadline) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'M5-hand-moved', 'routed to the HOD, then given to the Principal', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days');
SELECT t_ok((tk('M5-hand-moved')).assigned_to = 'a0000000-0000-0000-0000-000000000003'
            AND (tk('M5-hand-moved')).metadata -> 'auto_route' ->> 'level' = '1', 'setup: routed to HOD ONE');
UPDATE grievance_tickets SET assigned_to = 'a0000000-0000-0000-0000-000000000002', sla_deadline = now() - interval '1 hour'
 WHERE subject = 'M5-hand-moved';
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('M5-hand-moved')).escalation_level = 3 AND (tk('M5-hand-moved')).assigned_to = 'a0000000-0000-0000-0000-000000000001',
            'hand-moved to the Principal, then overdue: up to level 3, not back to the HOD: '
            || COALESCE(((tk('M5-hand-moved')).metadata -> 'escalations')::text, 'null'));
SELECT t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((tk('M5-hand-moved')).metadata -> 'escalations') e
                        WHERE e ->> 'to' = 'a0000000-0000-0000-0000-000000000003'), 'no step pointed back at the HOD');

-- ------------------------------------------------ 6c. one bad row never stops the run (round 4, M5)
-- A trigger refuses some writes to some tickets, the way a legacy row failing
-- a NOT VALID check would. The run must stamp and escalate everything else,
-- record each failure on its ticket, count it in `failed`, and list no detail
-- of a complaint about the Joint MD. Rolled back.
BEGIN;
CREATE FUNCTION t_boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subject = 'M5b-boom' AND NEW.escalation_level IS DISTINCT FROM OLD.escalation_level THEN
    RAISE EXCEPTION 'boom: this ticket refuses to move';
  END IF;
  IF NEW.subject = 'M5b-boom-all' THEN
    RAISE EXCEPTION 'boom: this ticket refuses every write';
  END IF;
  IF NEW.subject = 'M5b-boom-jmd' AND NEW.sla_breached_at IS DISTINCT FROM OLD.sla_breached_at THEN
    RAISE EXCEPTION 'boom: this ticket refuses its breach stamp';
  END IF;
  RETURN NEW;
END $$;
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'M5b-ok',       'an ordinary overdue one', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'M5b-boom',     'cannot be moved',         'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'M5b-boom-all', 'cannot be written',       'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'M5b-boom-jmd', 'about the joint md, cannot be written', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', true);
CREATE TRIGGER t_boom BEFORE UPDATE ON grievance_tickets FOR EACH ROW EXECUTE FUNCTION t_boom();
CREATE TEMP TABLE m5run AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'success')::boolean FROM m5run), 'the run completes despite the bad rows: ' || (SELECT r::text FROM m5run));
SELECT t_ok((tk('M5b-ok')).sla_breached_at IS NOT NULL AND (tk('M5b-ok')).escalation_level = 3,
            'the ordinary one is still stamped and escalated');
SELECT t_ok((tk('M5b-boom')).sla_breached_at IS NOT NULL AND (tk('M5b-boom')).escalation_level = 0
            AND (tk('M5b-boom')).metadata -> 'escalation_error' ->> 'step' = 'escalation'
            AND (tk('M5b-boom')).metadata -> 'escalation_error' ->> 'error' LIKE 'boom%',
            'the one that refused to move is stamped, left where it was, and the failure is on it: '
            || COALESCE(((tk('M5b-boom')).metadata -> 'escalation_error')::text, 'null'));
SELECT t_ok((tk('M5b-boom-all')).sla_breached_at IS NULL, 'a ticket that refuses every write is skipped, not the whole stamp');
-- round 5 (M1): a complaint about the Joint MD that fails is NOT counted —
-- the failure is written only on its own ticket
SELECT t_ok((SELECT (r ->> 'failed')::int FROM m5run) = 3,
            'failed counts only the ordinary failures: ' || (SELECT r ->> 'failed' FROM m5run) || ' (move, stamp + move)');
SELECT t_ok((tk('M5b-boom-jmd')).metadata -> 'escalation_error' ->> 'step' = 'breach_stamp',
            'the failure of the complaint about the Joint MD is on its own ticket: '
            || COALESCE(((tk('M5b-boom-jmd')).metadata -> 'escalation_error')::text, 'null'));
SELECT t_ok(EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM m5run)) e
                    WHERE e ->> 'ticket' = (tk('M5b-boom')).ticket_number AND e ->> 'outcome' = 'failed' AND e ->> 'error' LIKE 'boom%'),
            'an ordinary failure is listed with its error');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM m5run)) e
                        WHERE e ->> 'ticket' = (tk('M5b-boom-jmd')).ticket_number)
            AND (SELECT r::text FROM m5run) NOT LIKE '%M5b-boom-jmd%',
            'the complaint about the Joint MD that failed is not listed, and no detail of it is in the answer');
ROLLBACK;

-- ------------------------------------------------ 6d. round 5: notices, forged routing, a Director who leaves, moving colleges
-- M5 (round 5) + H1 (round 6): a notice or work item about a complaint about
-- the Joint MD is CONFIDENTIAL: a generic line, a link to the complaints list,
-- and nothing that names the ticket (no id, number, subject, description,
-- level, breach or emergency flag — not in the url, targeting, metadata,
-- action_config or the dedupe key).
SELECT fn_generate_unresolved_issue_items();
SELECT t_ok((SELECT count(*) FROM notifications WHERE metadata ->> 'confidential' = 'true' AND kind = 'announcement') > 0
            AND (SELECT count(*) FROM notifications WHERE action_config ->> 'confidential' = 'true' AND kind = 'work_item') > 0,
            'setup: there are confidential notices and work items (the Director''s)');
SELECT t_ok(NOT EXISTS (
  SELECT 1 FROM notifications n, grievance_tickets t
  WHERE (n.metadata ->> 'confidential' = 'true' OR n.action_config ->> 'confidential' = 'true')
    AND t.about_joint_md
    AND (n.title <> 'A confidential complaint needs your review'
         OR n.url IS DISTINCT FROM NULL AND n.url <> '/accreditation/naac/grievance'
         OR position(t.id::text IN coalesce(n.url, '') || n.targeting::text || coalesce(n.metadata::text, '')
                                   || coalesce(n.action_config::text, '') || coalesce(n.idempotency_key, '')) > 0
         OR position(t.ticket_number IN n.title || n.body || coalesce(n.metadata::text, '') || coalesce(n.action_config::text, '')) > 0
         OR position(t.subject IN n.title || n.body) > 0
         OR position(left(t.description, 40) IN n.body) > 0
         OR coalesce(n.action_config, '{}'::jsonb) ?| ARRAY['grievance_id', 'escalation_level', 'sla_breached', 'is_emergency', 'ticket_number']
         OR coalesce(n.metadata, '{}'::jsonb) ?| ARRAY['ticket_id', 'ticket_number', 'level']
         OR n.targeting ? 'ticket_id')),
  'every confidential notice and work item is generic and names no ticket anywhere');
SELECT t_ok((SELECT count(*) FROM notifications WHERE metadata ->> 'confidential' = 'true' AND url = '/accreditation/naac/grievance') > 0,
            'the notice links to the complaints list, where the Director''s own access shows it');

-- H1 (round 6): as the Joint MD — a super admin, so the existing policies let
-- her read, update and delete every notification — no confidential row is
-- visible or changeable; the Director sees and can mark his; ordinary rows
-- behave as before for super admins and recipients.
SELECT count(*) AS conf_n FROM notifications WHERE metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true' \gset
SELECT count(*) AS conf_un FROM user_notifications un JOIN notifications n ON n.id = un.notification_id
 WHERE n.metadata ->> 'confidential' = 'true' OR n.action_config ->> 'confidential' = 'true' \gset
SELECT count(*) AS plain_n FROM notifications WHERE NOT (coalesce(metadata ->> 'confidential', '') = 'true' OR coalesce(action_config ->> 'confidential', '') = 'true') \gset
SELECT count(*) AS dir_conf FROM user_notifications un JOIN notifications n ON n.id = un.notification_id
 WHERE un.user_id = 'a0000000-0000-0000-0000-00000000000e' AND (n.metadata ->> 'confidential' = 'true' OR n.action_config ->> 'confidential' = 'true') \gset
SELECT t_ok(:conf_n > 0 AND :conf_un > 0 AND :dir_conf > 0, 'setup: confidential rows exist, some of them the Director''s');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.role', 'authenticated', false);   -- the Joint MD (a super admin)
SELECT t_ok((SELECT count(*) FROM notifications WHERE metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true') = 0,
            'Joint MD: 0 confidential notifications');
SELECT t_ok((SELECT count(*) FROM notifications) = :plain_n, 'Joint MD: she still sees every other notification (' || :plain_n || ')');
SELECT t_ok((SELECT count(*) FROM user_notifications un
             WHERE fn_notification_is_confidential(un.notification_id)) = 0, 'Joint MD: 0 confidential user_notifications');
WITH u AS (UPDATE notifications SET title = 'x' WHERE id IN (SELECT id FROM notifications) AND metadata ->> 'confidential' = 'true' RETURNING 1)
SELECT t_ok((SELECT count(*) FROM u) = 0, 'Joint MD: updates 0 confidential notifications');
DO $$
DECLARE n int;
BEGIN
  UPDATE user_notifications SET read_at = now() WHERE fn_notification_is_confidential(notification_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the Joint MD marked % confidential notices read', n; END IF;
  DELETE FROM user_notifications WHERE fn_notification_is_confidential(notification_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the Joint MD deleted % confidential user_notifications', n; END IF;
  DELETE FROM notifications WHERE metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the Joint MD deleted % confidential notifications', n; END IF;
END $$;
-- ordinary rows: a super admin still manages them (the /notifications/admin flow)
WITH u AS (UPDATE notifications SET priority = priority
           WHERE NOT (coalesce(metadata ->> 'confidential', '') = 'true' OR coalesce(action_config ->> 'confidential', '') = 'true')
           RETURNING 1)
SELECT t_ok((SELECT count(*) FROM u) = :plain_n, 'a super admin still updates every ordinary notification');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
SELECT t_ok((SELECT count(*) FROM user_notifications un JOIN notifications n ON n.id = un.notification_id
             WHERE un.user_id = 'a0000000-0000-0000-0000-00000000000e'
               AND (n.metadata ->> 'confidential' = 'true' OR n.action_config ->> 'confidential' = 'true')) = :dir_conf,
            'the Director reads all his confidential notices and work items (' || :dir_conf || ')');
WITH u AS (UPDATE user_notifications SET read_at = now() WHERE user_id = 'a0000000-0000-0000-0000-00000000000e' RETURNING 1)
SELECT t_ok((SELECT count(*) FROM u) >= :dir_conf, 'and can mark them read');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);   -- an ordinary recipient (the Principal)
SELECT t_ok((SELECT count(*) FROM user_notifications WHERE user_id = 'a0000000-0000-0000-0000-000000000002') > 0
            AND NOT EXISTS (SELECT 1 FROM user_notifications WHERE user_id <> 'a0000000-0000-0000-0000-000000000002'),
            'an ordinary recipient still reads her own notices (and only those)');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok((SELECT count(*) FROM notifications WHERE metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true') = :conf_n,
            'nothing the Joint MD tried removed a confidential row');

-- M4: routing metadata comes from the database only
INSERT INTO grievance_tickets (institution_id, category_id, department_id, subject, description, raised_by_id, assigned_to, sla_deadline, metadata) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'M4-forged', 'a forged route', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', now() - interval '1 hour',
   '{"source":"browser","auto_route":{"assigned_to":"a0000000-0000-0000-0000-000000000003","level":3},"escalations":[{"level":3}]}');
SELECT t_ok(NOT ((tk('M4-forged')).metadata ? 'auto_route') AND NOT ((tk('M4-forged')).metadata ? 'escalations')
            AND (tk('M4-forged')).metadata ->> 'source' = 'browser',
            'a client-supplied auto_route / escalations is dropped on insert, the rest kept: ' || (tk('M4-forged')).metadata::text);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications WHERE (metadata ->> 'ticket_id')::uuid = (tk('M4-forged')).id),
            'and fires no "it is yours" notice');
UPDATE grievance_tickets SET metadata = metadata || '{"auto_route":{"assigned_to":"a0000000-0000-0000-0000-000000000003","level":3},"about_joint_md_hold":{"reason":"x"}}'
 WHERE subject = 'M4-forged';
SELECT t_ok(NOT ((tk('M4-forged')).metadata ? 'auto_route') AND NOT ((tk('M4-forged')).metadata ? 'about_joint_md_hold'),
            'a forged UPDATE of those keys is ignored too');
SELECT fn_grievance_escalation_tick(false);
SELECT t_ok((tk('M4-forged')).escalation_level = 2 AND (tk('M4-forged')).assigned_to = 'a0000000-0000-0000-0000-000000000002',
            'so the hourly run escalates it normally (HOD -> Principal), not "at the ceiling": level '
            || (tk('M4-forged')).escalation_level);

-- (i) a complaint about the Joint MD stays in its college unless the Director moves it
DO $$ BEGIN
  UPDATE grievance_tickets SET institution_id = '10000000-0000-0000-0000-000000000002' WHERE subject = 'J2c-superior-and-jmd';
  RAISE EXCEPTION 'FAIL: a complaint about the Joint MD was moved to another college by the database owner';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
DO $$ BEGIN
  UPDATE grievance_tickets SET institution_id = '10000000-0000-0000-0000-000000000002' WHERE subject = 'J2c-superior-and-jmd';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: setup — the super admin cannot reach J2c'; END IF;
  RAISE EXCEPTION 'FAIL: a super admin moved a complaint about the Joint MD to another college';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
UPDATE grievance_tickets SET institution_id = '10000000-0000-0000-0000-000000000002' WHERE subject = 'J2c-superior-and-jmd';
RESET ROLE;
SELECT t_ok((tk('J2c-superior-and-jmd')).institution_id = '10000000-0000-0000-0000-000000000002', 'the Director may move it');
ROLLBACK;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

-- M3: the Director is deactivated. His complaints never go to the Joint MD;
-- the run says only that routing is not configured; a new Director gets them.
BEGIN;
UPDATE profiles SET is_active = false WHERE id = 'a0000000-0000-0000-0000-00000000000e';
UPDATE grievance_tickets SET sla_deadline = now() - interval '1 hour' WHERE subject = 'J2c-superior-and-jmd';
CREATE TEMP TABLE m3a AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'about_joint_md_routing_configured')::boolean IS FALSE FROM m3a),
            'Director deactivated: routing reported as not configured');
SELECT t_ok((tk('J2c-superior-and-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e'
            AND (tk('J2c-superior-and-jmd')).metadata -> 'escalation_blocked' ->> 'reason' = 'holder_cannot_act',
            'his complaint is not moved (never to the Joint MD); the block is on the ticket');
SELECT t_ok((SELECT r::text FROM m3a) NOT LIKE '%' || (tk('J2c-superior-and-jmd')).ticket_number || '%',
            'and nothing about it is in the run''s answer');
INSERT INTO profiles (id, email, full_name, role, is_super_admin, institution_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000010', 'second.director@jkkn.ac.in', 'The Second Director', 'director', false, NULL, true);
UPDATE platform_policies SET value = to_jsonb('a0000000-0000-0000-0000-000000000010'::text)
 WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id' AND scope_type = 'global';
CREATE TEMP TABLE m3b AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok((SELECT (r ->> 'about_joint_md_routing_configured')::boolean FROM m3b), 'a new Director set: configured again');
SELECT t_ok((tk('J2c-superior-and-jmd')).assigned_to = 'a0000000-0000-0000-0000-000000000010',
            'the complaint goes to the new Director: ' || COALESCE(((tk('J2c-superior-and-jmd')).metadata -> 'escalations' -> -1)::text, 'null'));
SELECT t_ok(EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                    WHERE un.user_id = 'a0000000-0000-0000-0000-000000000010'
                      AND n.idempotency_key = t_conf_notice('grievance-rerouted:' || (tk('J2c-superior-and-jmd')).id || ':a0000000-0000-0000-0000-000000000010')
                      AND n.title = 'A confidential complaint needs your review'),
            'who is told, generically');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE about_joint_md AND assigned_to = 'a0000000-0000-0000-0000-000000000001'),
            'no complaint about the Joint MD went to her');
ROLLBACK;

-- ------------------------------------------------ 6e. round 6: no count through policy_gate_observations
-- Production's fn_get_policy_bool counts every read in policy_gate_observations,
-- which super admins read. The hourly run reads its switch without recording,
-- so that count cannot follow how many tickets (complaints about the Joint MD
-- included) are overdue. Rolled back.
BEGIN;
DELETE FROM policy_gate_observations;
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, sla_deadline, about_joint_md) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'OBS-1', 'overdue', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', false),
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'OBS-2', 'overdue, about the joint md', 'a0000000-0000-0000-0000-000000000007', now() - interval '1 hour', true);
SELECT fn_grievance_escalation_tick(false);
SELECT fn_grievance_escalation_tick(true);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM policy_gate_observations WHERE policy_key LIKE 'grievance.%'),
            'the hourly run records no policy read, so no observation counts tickets: '
            || COALESCE((SELECT string_agg(policy_key || '=' || eval_count, ', ') FROM policy_gate_observations), 'none'));
ROLLBACK;

-- ------------------------------------------------ 7. across everything: never the Joint MD while ticked
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE about_joint_md AND assigned_to = 'a0000000-0000-0000-0000-000000000001'),
            'no ticked complaint is with the Joint MD');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                        WHERE un.user_id = 'a0000000-0000-0000-0000-000000000001'
                          AND (n.metadata ->> 'confidential' = 'true' OR n.action_config ->> 'confidential' = 'true'
                               OR (n.metadata ->> 'ticket_id')::uuid IN (SELECT id FROM grievance_tickets WHERE about_joint_md))),
            'the Joint MD was never told about a complaint that is still about her');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets t, jsonb_array_elements(COALESCE(t.metadata -> 'escalations', '[]')) e
                        WHERE t.about_joint_md AND e ->> 'to' = 'a0000000-0000-0000-0000-000000000001'),
            'no escalation step of a ticked complaint ever pointed at the Joint MD');

SELECT 'ABOUT THE JOINT MD SCENARIOS PASSED' AS result;
