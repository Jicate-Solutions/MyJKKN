-- Grievance complaint-privacy rehearsal. Every assertion raises 'FAIL: …'.
-- Run by run-privacy.sh: stubs -> preseed -> #4079 -> 06_privacy_preseed ->
-- this PR's migration (twice) -> this file.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

CREATE FUNCTION t_ok(c boolean, m text) RETURNS void LANGUAGE plpgsql AS $$
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

-- ----------------------------------------------- 2. anonymous never stores the filer
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, raised_by_name, raised_by_email, raised_by_phone, is_anonymous, anonymous_token, sla_deadline)
VALUES
  ('d1000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'New anonymous', 'A new anonymous one', 'staff',
   'b0000000-0000-0000-0000-000000000003', 'Filer F', 'filer@jkkn.ac.in', '99999', true, 'anon_new_token_1111111111111111111111', now() + interval '3 days'),
  ('d1000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'Named one', 'Filed with a name', 'staff',
   'b0000000-0000-0000-0000-000000000003', 'Filer F', 'filer@jkkn.ac.in', NULL, false, NULL, now() + interval '3 days');

SELECT t_ok((SELECT raised_by_id IS NULL AND raised_by_name IS NULL AND raised_by_email IS NULL AND raised_by_phone IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'insert: an anonymous ticket is stored with no raised_by_* at all, whatever the writer sent');
SELECT t_ok((SELECT raised_by_id = 'b0000000-0000-0000-0000-000000000003' AND raised_by_name = 'Filer F'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000003'),
            'insert: a named ticket keeps its filer');

UPDATE grievance_tickets SET raised_by_id = 'b0000000-0000-0000-0000-000000000003', raised_by_name = 'Filer F'
 WHERE id = 'd1000000-0000-0000-0000-000000000002';
SELECT t_ok((SELECT raised_by_id IS NULL AND raised_by_name IS NULL FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'update: a filer cannot be written back onto an anonymous ticket');

-- ----------------------------------------------- 3. description: 3 characters, trimmed
INSERT INTO grievance_tickets (institution_id, ticket_number, category_id, subject, description, raised_by_type, sla_deadline)
VALUES ('11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001', 'Short', 'Fan', 'staff', now() + interval '1 day');
SELECT t_ok(true, 'a 3-character description is accepted');
DO $$ BEGIN
  INSERT INTO grievance_tickets (institution_id, ticket_number, category_id, subject, description, raised_by_type, sla_deadline)
  VALUES ('11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001', 'Too short', '  ab  ', 'staff', now());
  RAISE EXCEPTION 'FAIL: a 2-character (padded) description was accepted';
EXCEPTION WHEN check_violation THEN
  PERFORM t_ok(SQLERRM LIKE '%grievance_tickets_description_check%', 'the refusal still names grievance_tickets_description_check (the app maps it by name)');
END $$;
SELECT t_ok((SELECT convalidated FROM pg_constraint WHERE conname = 'grievance_tickets_description_check'),
            'the new description constraint validated against existing rows');

-- ----------------------------------------------- 4. a handler asks, under RLS
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000002');    -- Handler H (grievance.tickets.view + edit, College With ICC)
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
UPDATE grievance_tickets SET status = 'resolved', resolved_at = now(), resolution = 'Fixed'
 WHERE id = 'd1000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000003');
SELECT t_ok((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') ->> 'can_rate')::boolean, 'she can rate once resolved');
SELECT t_ok(NOT (fn_grievance_track_rate('anon_new_token_1111111111111111111111', 6, NULL) ->> 'success')::boolean, '6 stars is refused');
SELECT t_ok(NOT (fn_grievance_track_rate('anon_new_token_1111111111111111111111', 0, NULL) ->> 'success')::boolean, '0 stars is refused');
SELECT t_ok((fn_grievance_track_rate('anon_new_token_1111111111111111111111', 4, '  Took a while  ') ->> 'success')::boolean, '4 stars is accepted');
SELECT t_ok((fn_grievance_track_conversation('anon_new_token_1111111111111111111111') ->> 'satisfaction_rating')::int = 4,
            'her rating shows back to her');
SELECT as_user('b0000000-0000-0000-0000-000000000002');
SELECT t_ok((SELECT satisfaction_rating = 4 AND satisfaction_feedback = 'Took a while' AND raised_by_id IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000002'),
            'the handler sees the rating and note, and still no filer');
RESET ROLE;

-- ----------------------------------------------- 7. ICC-only, sent to the superior-route person
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, is_icc_only, assigned_to, metadata, sla_deadline)
VALUES
  ('d1000000-0000-0000-0000-000000000010', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000002',
   'ICC routed', 'No committee at this college', 'staff', 'b0000000-0000-0000-0000-000000000004', true,
   'b0000000-0000-0000-0000-000000000001', '{"routing":"icc_no_committee"}', now() + interval '3 days'),
  ('d1000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000002',
   'ICC plain', 'Assigned by hand', 'staff', 'b0000000-0000-0000-0000-000000000004', true,
   'b0000000-0000-0000-0000-000000000005', '{}', now() + interval '3 days'),
  ('d1000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000002',
   'ICC to JMD by hand', 'Assigned by hand', 'staff', 'b0000000-0000-0000-0000-000000000004', true,
   'b0000000-0000-0000-0000-000000000001', '{}', now() + interval '3 days');

SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000001');    -- the superior-route person, not an admin
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000010') = 1,
            'the person InstaSolver routed an ICC-only complaint to can open it');
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000012') = 0,
            'the same person cannot open an ICC-only complaint merely assigned to her by hand');
UPDATE grievance_tickets SET status = 'in_progress' WHERE id = 'd1000000-0000-0000-0000-000000000010';
SELECT as_user('b0000000-0000-0000-0000-000000000005');    -- a plain assignee of an ICC-only row
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000011') = 0,
            'a plain assignee of an ICC-only complaint still cannot open it (substrate v2 rule kept)');
RESET ROLE;
SELECT t_ok((SELECT status = 'in_progress' FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000010'),
            'the routed assignee could act on it');

-- ----------------------------------------------- 8. grants
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_conversation(text)', 'EXECUTE'), 'anon cannot execute the conversation');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_answer(text, text)', 'EXECUTE'), 'anon cannot execute the answer');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_rate(text, integer, text)', 'EXECUTE'), 'anon cannot execute the rating');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_ticket_by_token(text)', 'EXECUTE'), 'the raw token lookup is service-role only');
SELECT t_ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grievance_anonymous_messages'::regclass), 'RLS is on for the messages table');

SELECT 'GRIEVANCE PRIVACY SCENARIOS PASSED';
