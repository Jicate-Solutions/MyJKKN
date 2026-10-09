-- #4316 (anonymous means anonymous; tracking code) together with #4079's
-- "about the Joint MD" rules as of deep review round 2. An ANONYMOUS
-- complaint about the Joint MD must stay hidden from her, and nothing #4079
-- does to it — routing, the hourly run (M6 / M4), the Director-only
-- send-back (M3, with its fresh SLA, M6), the patched readers — may put the
-- filer back on the row or show her to anybody. Runs after 10_-30_ (their
-- people, the Director policy set to a…0e, t_sb from 20_). Every assertion
-- raises 'FAIL: …'.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

-- ------------------------------------------------ 1. filed anonymously AND about the Joint MD
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false),
       set_config('request.jwt.claim.role', 'authenticated', false);
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_id, raised_by_name, raised_by_email,
                               filed_by, sla_deadline, about_joint_md, is_anonymous, anonymous_token) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'P1-anon-about-jmd', 'anonymous, about the joint md',
   'a0000000-0000-0000-0000-000000000007', 'A Learner', 'learner@x', 'a0000000-0000-0000-0000-000000000007',
   now() - interval '1 day', true, true, 'anon_p1_jmd_token_0000000000000000');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT id AS p1 FROM grievance_tickets WHERE subject = 'P1-anon-about-jmd' \gset

SELECT t_ok((tk('P1-anon-about-jmd')).raised_by_id IS NULL AND (tk('P1-anon-about-jmd')).raised_by_name IS NULL
            AND (tk('P1-anon-about-jmd')).raised_by_email IS NULL AND (tk('P1-anon-about-jmd')).filed_by IS NULL,
            'filed: no filer stored on the row');
SELECT t_ok((tk('P1-anon-about-jmd')).assigned_to = 'a0000000-0000-0000-0000-00000000000e',
            'routed to the Director (routing ran before the filer was scrubbed, so it could still exclude her)');

-- ------------------------------------------------ 2. hidden from the Joint MD, ticket and conversation
INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES (:'p1', 'question', 'Which day did this happen?', 'a0000000-0000-0000-0000-00000000000e');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false),   -- the Joint MD
       set_config('request.jwt.claim.role', 'authenticated', false);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_tickets WHERE id = :'p1'), 'the Joint MD cannot read it');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_anonymous_messages WHERE ticket_id = :'p1'), 'nor its questions to the filer');
DO $$ BEGIN
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
    SELECT id, 'question', 'who are you?', 'a0000000-0000-0000-0000-000000000001'
    FROM grievance_tickets WHERE subject = 'P1-anon-about-jmd';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: the Joint MD questioned the filer of a complaint about her'; END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
SELECT t_ok(EXISTS (SELECT 1 FROM grievance_anonymous_messages WHERE ticket_id = :'p1'), 'the Director sees his question');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);   -- the filer, by her code
SELECT t_ok(jsonb_array_length(fn_grievance_track_conversation('anon_p1_jmd_token_0000000000000000') -> 'messages') = 1,
            'the filer follows it by her code');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);

-- ------------------------------------------------ 3. the hourly run (M6 / M4) and the patched readers
CREATE TEMP TABLE prun AS SELECT fn_grievance_escalation_tick(false) r;
SELECT t_ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT r -> 'tickets' FROM prun)) e
                        WHERE e ->> 'ticket' = (tk('P1-anon-about-jmd')).ticket_number),
            'not in the run''s ticket list');
SELECT t_ok((tk('P1-anon-about-jmd')).raised_by_id IS NULL AND (tk('P1-anon-about-jmd')).filed_by IS NULL
            AND (tk('P1-anon-about-jmd')).sla_breached_at IS NOT NULL,
            'stamped breached by the run, still no filer on the row');
SELECT t_ok((SELECT prosrc LIKE '%fn_grievance_caller_joint_md_scope%' AND prosrc NOT LIKE '%raised_by%'
             FROM pg_proc WHERE proname = 'fn_my_desk_waiting'),
            'the patched My Desk reader names no filer column');

-- ------------------------------------------------ 4. send-back (M3): Director only, filer stays hidden, fresh SLA
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- a super admin
SELECT t_ok(t_sb(:'p1') LIKE '42501:%', 'a super admin cannot send it back');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);   -- the Director
SELECT t_ok(t_sb(:'p1', 'not about the Joint MD after all') LIKE 'ok:%"success": true%', 'the Director can');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok(NOT (tk('P1-anon-about-jmd')).about_joint_md AND (tk('P1-anon-about-jmd')).is_anonymous,
            'sent back: no longer about the Joint MD, still anonymous');
SELECT t_ok((tk('P1-anon-about-jmd')).raised_by_id IS NULL AND (tk('P1-anon-about-jmd')).raised_by_name IS NULL
            AND (tk('P1-anon-about-jmd')).raised_by_email IS NULL AND (tk('P1-anon-about-jmd')).filed_by IS NULL,
            'sent back: still no filer on the row');
SELECT t_ok(NOT ((tk('P1-anon-about-jmd')).metadata::text LIKE '%a0000000-0000-0000-0000-000000000007%'),
            'nor in its metadata (the send-back record names the Director, not the filer)');
SELECT t_ok((tk('P1-anon-about-jmd')).sla_deadline > now() AND (tk('P1-anon-about-jmd')).sla_breached_at IS NULL,
            'sent back with a fresh SLA');
SELECT t_ok(fn_grievance_ticket_by_token('anon_p1_jmd_token_0000000000000000') = :'p1', 'her tracking code still finds it');

SELECT 'PRIVACY WITH THE JOINT MD SCENARIOS PASSED' AS result;
