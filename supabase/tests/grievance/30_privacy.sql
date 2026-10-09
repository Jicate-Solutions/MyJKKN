-- Grievance complaint-privacy rehearsal. Every assertion raises 'FAIL: …'.
-- Run by run.sh: stubs -> preseed -> #4079 -> 06_privacy_preseed ->
-- 20271010030000 (twice) -> 10_, 20_ -> this file. Carried from PR #4156's
-- 20_privacy.sql: sections 1, 2, 4, 5, 6 and the grants. Its sections 3
-- (description minimum), 7, 8 and 10 (harassment-committee routing) are not carried.
-- Section 11 is new: the Joint MD still sees nothing of a complaint about
-- her, anonymous or not, questions included.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION t_ok(c boolean, m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF c IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', m; END IF; END $$;
GRANT EXECUTE ON FUNCTION t_ok(boolean, text) TO authenticated, anon;

-- Who is acting. auth.uid() / auth.role() in the stubs read these settings.
CREATE FUNCTION as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p::text, ''), false),
         set_config('request.jwt.claim.role', CASE WHEN p IS NULL THEN '' ELSE 'authenticated' END, false) $$;
GRANT EXECUTE ON FUNCTION as_user(uuid) TO authenticated, anon;

-- ----------------------------------------------- 1. the backfill scrubbed history
SELECT t_ok((SELECT raised_by_id IS NULL FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000001'),
            'backfill: a legacy anonymous ticket no longer carries its filer id');
SELECT t_ok((SELECT author_id IS NULL AND author_name = 'Anonymous filer' FROM grievance_comments
              WHERE ticket_id = 'd1000000-0000-0000-0000-000000000001' AND content = 'More detail from me'),
            'backfill: the filer''s own comment on her anonymous ticket is de-named');
SELECT t_ok((SELECT author_id = 'b0000000-0000-0000-0000-000000000002' AND author_name = 'Handler H' FROM grievance_comments
              WHERE content = 'Looking into it'),
            'backfill: a handler''s comment on the same ticket is left alone');
SELECT t_ok((SELECT filed_by IS NULL AND raised_by_id IS NULL FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000005'),
            'backfill: a legacy /accreditation anonymous ticket no longer carries filed_by');
SELECT t_ok((SELECT author_id IS NULL AND author_name = 'Anonymous filer' FROM grievance_comments
              WHERE content = 'Adding a date, from the form filer'),
            'backfill: a comment the filed_by filer wrote on her anonymous ticket is de-named');
SELECT t_ok((SELECT author_id = 'b0000000-0000-0000-0000-000000000002' AND author_name = 'Handler H' FROM grievance_comments
              WHERE content = 'Handler on the accreditation one'),
            'backfill: a handler''s comment on the /accreditation ticket is left alone');
SELECT t_ok((SELECT count(*) FROM grievance_history WHERE performed_by = 'b0000000-0000-0000-0000-000000000003') = 0,
            'backfill: grievance_history rows the filer performed on her anonymous tickets (raised_by_id or filed_by) are de-named');
SELECT t_ok((SELECT count(*) FROM grievance_history WHERE ticket_id IN ('d1000000-0000-0000-0000-000000000001',
                                                                     'd1000000-0000-0000-0000-000000000005')
                                                   AND action = 'created' AND performed_by IS NULL) = 2,
            'backfill: the de-named history rows are kept, only the actor is removed');
SELECT t_ok((SELECT performed_by = 'b0000000-0000-0000-0000-000000000002' FROM grievance_history WHERE action = 'commented'),
            'backfill: a handler''s history row on the same ticket is left alone');
SELECT t_ok((SELECT count(*) FROM grievance_history WHERE ticket_id IN ('d1000000-0000-0000-0000-000000000001',
                                                                     'd1000000-0000-0000-0000-000000000005')
                                                   AND action IN ('raised_by_id', 'raised_by_name', 'raised_by_email', 'filed_by')) = 4,
            'backfill: the stand-in history trigger logged the scrub''s own field changes (so the next check is not vacuous)');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM grievance_history
                         WHERE ticket_id IN ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005')
                           AND (   strpos(lower(coalesce(old_value, '') || ' ' || coalesce(new_value, '')), 'b0000000-0000-0000-0000-000000000003') > 0
                                OR strpos(lower(coalesce(old_value, '') || ' ' || coalesce(new_value, '')), 'filer f') > 0
                                OR strpos(lower(coalesce(old_value, '') || ' ' || coalesce(new_value, '')), 'filer_f@jkkn.ac.in') > 0)),
            'backfill: no grievance_history old_value / new_value on her anonymous tickets carries the filer''s id, name or email');
SELECT t_ok((SELECT old_value = 'open' AND new_value = 'in_progress' FROM grievance_history WHERE action = 'status changed'),
            'backfill: a handler''s field-level history values that do not name the filer are kept');

-- ----------------------------------------------- 2. anonymous never stores the filer
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, raised_by_name, raised_by_email, raised_by_phone, filed_by, is_anonymous, anonymous_token, sla_deadline)
VALUES
  ('d1000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'New anonymous', 'A new anonymous one', 'staff',
   'b0000000-0000-0000-0000-000000000003', 'Filer F', 'filer@jkkn.ac.in', '99999', 'b0000000-0000-0000-0000-000000000003',
   true, 'anon_new_token_1111111111111111111111', now() + interval '3 days'),
  ('d1000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'Named one', 'Filed with a name', 'staff',
   'b0000000-0000-0000-0000-000000000003', 'Filer F', 'filer@jkkn.ac.in', NULL, 'b0000000-0000-0000-0000-000000000003',
   false, NULL, now() + interval '3 days');

SELECT t_ok((SELECT raised_by_id IS NULL AND raised_by_name IS NULL AND raised_by_email IS NULL AND raised_by_phone IS NULL
                    AND filed_by IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'insert: an anonymous ticket is stored with no raised_by_* and no filed_by, whatever the writer sent');
SELECT t_ok((SELECT raised_by_id = 'b0000000-0000-0000-0000-000000000003' AND raised_by_name = 'Filer F'
                    AND filed_by = 'b0000000-0000-0000-0000-000000000003'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000003'),
            'insert: a named ticket keeps its filer and filed_by');

UPDATE grievance_tickets SET raised_by_id = 'b0000000-0000-0000-0000-000000000003', raised_by_name = 'Filer F',
       filed_by = 'b0000000-0000-0000-0000-000000000003'
 WHERE id = 'd1000000-0000-0000-0000-000000000002';
SELECT t_ok((SELECT raised_by_id IS NULL AND raised_by_name IS NULL AND filed_by IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'update: a filer (raised_by_* or filed_by) cannot be written back onto an anonymous ticket');
SELECT t_ok((SELECT max(tgname COLLATE "C") FROM pg_trigger
              WHERE tgrelid = 'public.grievance_tickets'::regclass AND NOT tgisinternal
                AND (tgtype & 2) = 2) = 'zzz_grievance_scrub_anonymous_filer',
            'the scrub is the last BEFORE trigger on grievance_tickets by name');

-- ----------------------------------------------- 4. a handler asks, under RLS
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000002');    -- Handler H (grievance.tickets.view + edit, College P)
SELECT t_ok((SELECT raised_by_id IS NULL FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'handler read: the anonymous ticket is visible and carries no filer');
INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
VALUES ('d1000000-0000-0000-0000-000000000002', 'question', 'Which block was this in?', 'b0000000-0000-0000-0000-000000000002');
SELECT t_ok((SELECT count(*) FROM grievance_anonymous_messages WHERE ticket_id = 'd1000000-0000-0000-0000-000000000002') = 1,
            'handler: asked a question and can read it back');
DO $$ BEGIN
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES ('d1000000-0000-0000-0000-000000000002', 'answer', 'Pretending to be the filer', NULL);
  RAISE EXCEPTION 'FAIL: a handler wrote an answer directly';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES ('d1000000-0000-0000-0000-000000000002', 'question', 'In someone else''s name', 'b0000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'FAIL: a handler asked in someone else''s name';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES ('d1000000-0000-0000-0000-000000000003', 'question', 'On a named ticket', 'b0000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'FAIL: a question was posted on a ticket that is not anonymous';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

SELECT as_user('b0000000-0000-0000-0000-000000000004');    -- Other O: no permission, not the assignee
SELECT t_ok((SELECT count(*) FROM grievance_anonymous_messages) = 0, 'someone who cannot read the ticket cannot read its questions');
DO $$ BEGIN
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES ('d1000000-0000-0000-0000-000000000002', 'question', 'Nosy', 'b0000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'FAIL: someone who cannot read the ticket asked on it';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- ----------------------------------------------- 5. the filer, by her code only
SELECT as_user('b0000000-0000-0000-0000-000000000003');    -- the filer, signed in
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002') = 0,
            'the filer cannot find her anonymous ticket by who she is');
SELECT t_ok(fn_grievance_track_conversation('anon_wrong_token_0000000000000000000') IS NULL, 'a wrong code finds nothing');
SELECT t_ok(jsonb_array_length(fn_grievance_track_conversation('anon_new_token_1111111111111111111111') -> 'messages') = 1,
            'the filer sees the question with her code');
SELECT t_ok(NOT ((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') -> 'messages' -> 0) ? 'author_id'),
            'the conversation never carries an author id');
SELECT t_ok((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') ->> 'can_answer')::boolean, 'she can answer');
SELECT t_ok((fn_grievance_track_answer('anon_new_token_1111111111111111111111', '  Block C, second floor  ') ->> 'success')::boolean,
            'the filer answers with her code');
SELECT t_ok(NOT (fn_grievance_track_answer('anon_new_token_1111111111111111111111', '   ') ->> 'success')::boolean, 'an empty answer is refused');
SELECT t_ok(NOT (fn_grievance_track_answer('anon_legacy_token_000000000000000000', 'Unasked') ->> 'success')::boolean,
            'no answer before anybody has asked');
SELECT t_ok(NOT (fn_grievance_track_answer('anon_wrong_token_0000000000000000000', 'x') ->> 'success')::boolean, 'a wrong code cannot answer');
SELECT t_ok(NOT (fn_grievance_track_rate('anon_new_token_1111111111111111111111', 5, 'Great') ->> 'success')::boolean,
            'no rating before it is resolved');
DO $$ BEGIN
  PERFORM fn_grievance_ticket_by_token('anon_new_token_1111111111111111111111');
  RAISE EXCEPTION 'FAIL: a signed-in person called the raw token lookup';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

SELECT as_user(NULL);
SELECT t_ok(fn_grievance_track_conversation('anon_new_token_1111111111111111111111') IS NULL, 'no session, no conversation');
RESET ROLE;

SELECT t_ok((SELECT author_id IS NULL AND body = 'Block C, second floor' FROM grievance_anonymous_messages WHERE direction = 'answer'),
            'the stored answer has no author and is trimmed');

SET ROLE anon;
DO $$ BEGIN
  PERFORM fn_grievance_track_conversation('anon_new_token_1111111111111111111111');
  RAISE EXCEPTION 'FAIL: the anon role called the tracking conversation';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM fn_grievance_track_answer('anon_new_token_1111111111111111111111', 'x');
  RAISE EXCEPTION 'FAIL: the anon role answered';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM fn_grievance_track_rate('anon_new_token_1111111111111111111111', 5, NULL);
  RAISE EXCEPTION 'FAIL: the anon role rated';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM 1 FROM grievance_anonymous_messages;
  RAISE EXCEPTION 'FAIL: the anon role read the messages table';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- the handler sees the answer on the ticket
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000002');
SELECT t_ok((SELECT count(*) FROM grievance_anonymous_messages WHERE ticket_id = 'd1000000-0000-0000-0000-000000000002' AND direction = 'answer') = 1,
            'the handler sees the answer on the ticket');
RESET ROLE;

-- ----------------------------------------------- 6. rating once resolved
-- grievance_history has production's row-level security in this rehearsal
-- (00_stubs.sql), which hides the filer's own anonymous ticket from her; these
-- counters are owned by the superuser so the checks below see every row.
CREATE FUNCTION t_history_rows(p_ticket uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM grievance_history WHERE ticket_id = p_ticket $$;
CREATE FUNCTION t_history_by(p_actor uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM grievance_history WHERE performed_by = p_actor $$;
GRANT EXECUTE ON FUNCTION t_history_rows(uuid), t_history_by(uuid) TO authenticated;
UPDATE grievance_tickets SET status = 'resolved', resolved_at = now(), resolution = 'Fixed'
 WHERE id = 'd1000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000003');
SELECT t_ok((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') ->> 'can_rate')::boolean, 'she can rate once resolved');
SELECT t_ok(NOT (fn_grievance_track_rate('anon_new_token_1111111111111111111111', 6, NULL) ->> 'success')::boolean, '6 stars is refused');
SELECT t_ok(NOT (fn_grievance_track_rate('anon_new_token_1111111111111111111111', 0, NULL) ->> 'success')::boolean, '0 stars is refused');
DO $$
DECLARE v_before integer;
BEGIN
  v_before := t_history_rows('d1000000-0000-0000-0000-000000000002');
  PERFORM t_ok((fn_grievance_track_rate('anon_new_token_1111111111111111111111', 4, '  Took a while  ') ->> 'success')::boolean,
               '4 stars is accepted');
  PERFORM t_ok(t_history_rows('d1000000-0000-0000-0000-000000000002') = v_before + 1,
               'rating: the stand-in history trigger fired on the rating UPDATE');
  PERFORM t_ok(t_history_by('b0000000-0000-0000-0000-000000000003') = 0,
               'rating: a trigger recording auth.uid() does not write the anonymous filer onto her ticket''s history');
  PERFORM t_ok(auth.uid() = 'b0000000-0000-0000-0000-000000000003', 'rating: the caller''s identity is restored after the UPDATE');
END $$;
SELECT t_ok((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') ->> 'satisfaction_rating')::int = 4,
            'her rating shows back to her');
SELECT as_user('b0000000-0000-0000-0000-000000000002');
SELECT t_ok((SELECT satisfaction_rating = 4 AND satisfaction_feedback = 'Took a while' AND raised_by_id IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'the handler sees the rating and note, and still no filer');
RESET ROLE;

-- ----------------------------------------------- 9. grants
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_conversation(text)', 'EXECUTE'), 'anon cannot execute the conversation');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_answer(text, text)', 'EXECUTE'), 'anon cannot execute the answer');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_rate(text, integer, text)', 'EXECUTE'), 'anon cannot execute the rating');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_ticket_by_token(text)', 'EXECUTE'), 'the raw token lookup is service-role only');
SELECT t_ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grievance_anonymous_messages'::regclass), 'RLS is on for the messages table');

-- ----------------------------------------------- 11. the Joint MD still sees nothing (ruling 9 Oct 2026)
-- An ANONYMOUS complaint about the Joint MD, filed by the learner of
-- 10_escalation.sql in college A; the Director (a…0e, named by
-- grievance.escalation.about_joint_md_profile_id since 20_) holds it and asks
-- the filer a question. a…01 holds the Joint MD's seat and is a super admin.
SET ROLE authenticated;
SELECT as_user('a0000000-0000-0000-0000-000000000007');
INSERT INTO grievance_tickets (institution_id, category_id, subject, description, raised_by_type, raised_by_id,
  sla_deadline, about_joint_md, is_anonymous, anonymous_token) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'P-anon-about-jmd',
   'anonymous, about the joint md', 'learner', 'a0000000-0000-0000-0000-000000000007', now() + interval '3 days',
   true, true, 'anon_jmd_token_222222222222222222222222');
RESET ROLE;
SELECT id AS pj FROM grievance_tickets WHERE subject = 'P-anon-about-jmd' \gset
SELECT t_ok((SELECT raised_by_id IS NULL AND filed_by IS NULL AND assigned_to = 'a0000000-0000-0000-0000-00000000000e'
               FROM grievance_tickets WHERE id = :'pj'),
            'anonymous AND about the Joint MD: no filer stored, and it is with the Director');

SET ROLE authenticated;
SELECT as_user('a0000000-0000-0000-0000-00000000000e');   -- the Director asks
INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
VALUES (:'pj', 'question', 'When did this happen?', 'a0000000-0000-0000-0000-00000000000e');
SELECT t_ok((SELECT count(*) FROM grievance_anonymous_messages WHERE ticket_id = :'pj') = 1, 'the Director asked and reads it back');

SELECT as_user('a0000000-0000-0000-0000-000000000001');   -- the Joint MD (super admin)
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE about_joint_md) = 0, 'Joint MD: still 0 rows about her');
SELECT t_ok((SELECT count(*) FROM grievance_anonymous_messages WHERE ticket_id = :'pj') = 0, 'Joint MD: 0 questions or answers on it');
SELECT set_config('t.pj', :'pj', false);
DO $$ BEGIN
  -- even with the ticket's id in hand
  INSERT INTO grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES (current_setting('t.pj')::uuid, 'question', 'Who filed this?', 'a0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'FAIL: the Joint MD asked a question on a complaint about her';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT as_user('a0000000-0000-0000-0000-000000000007');   -- the filer: by her code only
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE subject = 'P-anon-about-jmd') = 0,
            'the filer cannot find it by who she is');
SELECT t_ok(jsonb_array_length(fn_grievance_track_conversation('anon_jmd_token_222222222222222222222222') -> 'messages') = 1,
            'with her code she sees the Director''s question');
SELECT t_ok((fn_grievance_track_answer('anon_jmd_token_222222222222222222222222', 'Last Monday') ->> 'success')::boolean,
            'and answers it, nameless');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
SELECT t_ok((SELECT author_id IS NULL FROM grievance_anonymous_messages WHERE ticket_id = :'pj' AND direction = 'answer'),
            'her answer carries no author');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM notifications n JOIN user_notifications un ON un.notification_id = n.id
                        WHERE un.user_id = 'a0000000-0000-0000-0000-000000000001' AND (n.metadata ->> 'ticket_id')::uuid = :'pj'),
            'the Joint MD was never told about it');

SELECT 'GRIEVANCE PRIVACY SCENARIOS PASSED';
