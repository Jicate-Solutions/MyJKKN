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
DO $$
DECLARE v_before integer;
BEGIN
  SELECT count(*) INTO v_before FROM grievance_history WHERE ticket_id = 'd1000000-0000-0000-0000-000000000002';
  PERFORM t_ok((fn_grievance_track_rate('anon_new_token_1111111111111111111111', 4, '  Took a while  ') ->> 'success')::boolean,
               '4 stars is accepted');
  PERFORM t_ok((SELECT count(*) FROM grievance_history WHERE ticket_id = 'd1000000-0000-0000-0000-000000000002') = v_before + 1,
               'rating: the stand-in history trigger fired on the rating UPDATE');
  PERFORM t_ok(NOT EXISTS (SELECT 1 FROM grievance_history WHERE performed_by = 'b0000000-0000-0000-0000-000000000003'),
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
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000012') = 1,
            'an ICC-only complaint assigned with no routing stamp (as SLA escalation assigns) opens for its assignee');
UPDATE grievance_tickets SET status = 'in_progress' WHERE id = 'd1000000-0000-0000-0000-000000000010';
SELECT as_user('b0000000-0000-0000-0000-000000000005');    -- a plain assignee of an ICC-only row (e.g. the ICC chair)
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000011') = 1,
            'the assignee of an ICC-only complaint can open it (substrate v2 demotion reversed for the assignee)');
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id IN ('d1000000-0000-0000-0000-000000000010',
                                                                 'd1000000-0000-0000-0000-000000000012')) = 0,
            'an ICC-only complaint assigned to somebody else stays closed to her');
DO $$ BEGIN
  UPDATE grievance_tickets SET assigned_to = 'b0000000-0000-0000-0000-000000000004'
   WHERE id = 'd1000000-0000-0000-0000-000000000011';
  RAISE EXCEPTION 'FAIL: the assignee handed an ICC-only complaint on through the assignee policy';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT as_user('b0000000-0000-0000-0000-000000000003');    -- Filer F: not the assignee, not the raiser, not icc_member
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE is_icc_only) = 0,
            'somebody who is not the assignee, not the raiser and not on the committee opens no ICC-only complaint');
RESET ROLE;
SELECT t_ok((SELECT status = 'in_progress' FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000010'),
            'the routed assignee could act on it');

-- The routed-assignee UPDATE policy next to substrate v2's grievance_tickets_update
-- and raiser guard (both in 00_stubs.sql, as production has them).
SELECT t_ok((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.grievance_tickets'::regclass
               AND polname IN ('grievance_tickets_update', 'grievance_tickets_update_icc_routed_assignee')) = 2,
            'rehearsal: v2''s UPDATE policy and the routed-assignee UPDATE policy are both present');
SELECT t_ok((SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.grievance_tickets'::regclass
               AND tgname = 'trg_grievance_raiser_update_guard') = 1,
            'rehearsal: the raiser guard is present');
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000004');    -- Other O: the RAISER of d…011 (open), not icc_member
DO $$ BEGIN
  UPDATE grievance_tickets SET is_icc_only = false WHERE id = 'd1000000-0000-0000-0000-000000000011';
  RAISE EXCEPTION 'FAIL: the raiser took her own complaint off ICC-only';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  UPDATE grievance_tickets SET assigned_to = 'b0000000-0000-0000-0000-000000000004' WHERE id = 'd1000000-0000-0000-0000-000000000011';
  RAISE EXCEPTION 'FAIL: the raiser reassigned her own ICC-only complaint';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
-- Postgres ORs the WITH CHECK clauses of permissive UPDATE policies, so the
-- assignee policy's own pin does not hold by itself: v2's arms
-- (is_icc_only = false AND assigned_to = auth.uid()), (is_icc_only = false AND
-- edit permission) and (raised_by_id = auth.uid()) would each admit the new
-- row. Section 8's column guard refuses all three. (With section 8 removed,
-- each of these three UPDATEs succeeds — that is the reviewers' claim, proven.)
SELECT as_user('b0000000-0000-0000-0000-000000000005');    -- Plain Assignee of d…011
DO $$ BEGIN
  UPDATE grievance_tickets SET is_icc_only = false WHERE id = 'd1000000-0000-0000-0000-000000000011';
  RAISE EXCEPTION 'FAIL: the ICC-only assignee took the complaint off ICC-only (keeping herself as assignee)';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  UPDATE grievance_tickets SET raised_by_id = 'b0000000-0000-0000-0000-000000000005' WHERE id = 'd1000000-0000-0000-0000-000000000011';
  RAISE EXCEPTION 'FAIL: the ICC-only assignee made herself the raiser of a named complaint';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, is_icc_only, assigned_to, sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000014', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'ICC to a handler', 'Assigned by hand to someone holding edit', 'staff', 'b0000000-0000-0000-0000-000000000004', true,
   'b0000000-0000-0000-0000-000000000002', now() + interval '3 days');
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000002');    -- Handler H: assignee of d…014, holds grievance.tickets.edit
DO $$ BEGIN
  UPDATE grievance_tickets SET is_icc_only = false, assigned_to = 'b0000000-0000-0000-0000-000000000003'
   WHERE id = 'd1000000-0000-0000-0000-000000000014';
  RAISE EXCEPTION 'FAIL: an assignee holding edit took an ICC-only complaint off ICC-only and handed it on';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
UPDATE grievance_tickets SET status = 'in_progress' WHERE id = 'd1000000-0000-0000-0000-000000000014';
RESET ROLE;
SELECT t_ok((SELECT is_icc_only AND assigned_to = 'b0000000-0000-0000-0000-000000000002' AND status = 'in_progress'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000014'),
            'the guard leaves the assignee working the complaint (status moved), and nothing else changed');
SELECT t_ok((SELECT is_icc_only AND raised_by_id = 'b0000000-0000-0000-0000-000000000004'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000011'),
            'd…011 is still ICC-only and still names its raiser');

-- ----------------------------------------------- 8. is there a committee member who can read it?
INSERT INTO custom_roles (role_key, role_name) VALUES ('icc_member', 'ICC member');
INSERT INTO profiles (id, email, full_name, role, is_active, institution_id) VALUES
  ('b0000000-0000-0000-0000-000000000006', 'icc.gone@jkkn.ac.in', 'Left ICC', 'staff', false, '11000000-0000-0000-0000-000000000002');
INSERT INTO user_roles (user_id, role_id) SELECT 'b0000000-0000-0000-0000-000000000006', id FROM custom_roles WHERE role_key = 'icc_member';
SELECT t_ok(NOT fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000002'),
            'reader check: an inactive icc_member is nobody');
SELECT t_ok(NOT fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000001'),
            'reader check: no icc_member at a college = no reader');
INSERT INTO user_roles (user_id, role_id) SELECT 'b0000000-0000-0000-0000-000000000004', id FROM custom_roles WHERE role_key = 'icc_member';
SELECT t_ok(fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000001'),
            'reader check: an active icc_member of that college is a reader');
SELECT t_ok(NOT fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004'),
            'reader check: the filer herself does not count');
SELECT t_ok(NOT fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000002'),
            'reader check: an icc_member of ANOTHER college is not a reader here');
INSERT INTO user_institution_access (user_id, institution_id) VALUES
  ('b0000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000002');
SELECT t_ok(fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000002'),
            'reader check: an icc_member with an active access grant to the college is a reader');
UPDATE user_institution_access SET is_active = false WHERE user_id = 'b0000000-0000-0000-0000-000000000004';
SELECT t_ok(NOT fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000002'),
            'reader check: a revoked access grant does not count');
-- the committee branch of the SELECT policy agrees: the college-1 icc_member reads college 1's ICC rows
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  is_icc_only, sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000013', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
   'ICC for the committee', 'Left for the committee', 'staff', true, now() + interval '3 days');
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000004');
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000013') = 1,
            'the reader the check counted can open the unassigned ICC-only complaint');
RESET ROLE;

-- ----------------------------------------------- 10. one ICC rule for every door
-- The fixture list below is ALSO read by __tests__/grievance/icc-rule-parity.test.ts,
-- which checks isIccOnlyCategory gives the same answers. Keep the markers.
-- icc-rule-fixtures:begin
CREATE TEMP TABLE icc_rule_fixtures (name text, expected boolean);
INSERT INTO icc_rule_fixtures VALUES
  ('Sexual Harassment (ICC)', true),
  ('Sexual harassment', true),
  ('Harassment', true),
  ('Ragging', true),
  ('Anti-ragging', true),
  ('ICC complaint', true),
  ('Complaint to the icc', true),
  ('Other', false),
  ('Accident', false),
  ('Account access', false),
  ('ICCU equipment', false),
  ('Hostel mess', false),
  ('Academic', false),
  ('', false);
-- icc-rule-fixtures:end
SELECT t_ok(NOT EXISTS (SELECT 1 FROM icc_rule_fixtures
                         WHERE fn_grievance_is_icc_only_category(name) IS DISTINCT FROM expected),
            'fn_grievance_is_icc_only_category answers every fixture name as expected');
SELECT t_ok(fn_grievance_is_icc_only_category(NULL) = false, 'a missing category name is not ICC-only');

-- The route-on-create trigger must fire before #4079's, or a HOD is assigned first.
SELECT t_ok((SELECT array_agg(tgname::text ORDER BY tgname COLLATE "C") FROM pg_trigger
              WHERE tgrelid = 'public.grievance_tickets'::regclass AND NOT tgisinternal
                AND tgname IN ('trg_grievance_icc_route_on_create', 'trg_grievance_route_on_create'))
            = ARRAY['trg_grievance_icc_route_on_create', 'trg_grievance_route_on_create'],
            'the ICC trigger fires before route-on-create');

INSERT INTO grievance_categories (id, institution_id, name, default_sla_hours, default_assignee_role) VALUES
  ('c1000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000001', 'Ragging', 24, 'hod'),
  ('c1000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000002', 'Ragging', 24, 'hod');
-- College 1 has a reader (Other O, icc_member, from section 8). College 2 has none
-- (the icc_member there is inactive and the grant was revoked).
-- The Joint MD (b…001) is the superior-route person; 05_preseed's policy names
-- a profile this rehearsal does not have, so it starts out "unusable".
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000003');    -- Filer F, filing named, as the /accreditation form does
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, filed_by, is_icc_only, sla_deadline)
VALUES
  ('d1000000-0000-0000-0000-000000000020', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000011',
   'Ragging at college 1', 'Seniors in the hostel', 'staff', 'b0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000003', false, now() + interval '1 day'),
  ('d1000000-0000-0000-0000-000000000021', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000012',
   'Ragging at college 2', 'No policy yet', 'staff', 'b0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000003', false, now() + interval '1 day');
RESET ROLE;
SELECT t_ok((SELECT is_icc_only AND assigned_to IS NULL
                    AND metadata -> 'auto_route' ->> 'reason' = 'icc_only_not_auto_routed'
                    AND NOT (metadata ? 'icc_no_committee')
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000020'),
            'a Ragging complaint the form sent as NOT ICC-only is ICC-only, left for the committee that can read it, and route-on-create saw it as ICC-only (no HOD)');
SELECT t_ok((SELECT is_icc_only AND assigned_to IS NULL AND (metadata ->> 'route_pending_policy') = 'true'
                    AND (metadata ->> 'icc_no_committee') = 'true'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000021'),
            'no reader and an unusable superior-route profile: unassigned, stamped route_pending_policy (fail closed)');

UPDATE platform_policies SET value = to_jsonb('b0000000-0000-0000-0000-000000000001'::text)
 WHERE policy_key = 'instasolver.complaint.superior_route_to';
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000003');
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  is_anonymous, anonymous_token, filed_by, sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000022', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000012',
   'Anonymous ragging, college 2', 'Nobody on the committee here', 'staff', true,
   'anon_icc_route_token_22222222222222222', 'b0000000-0000-0000-0000-000000000003', now() + interval '1 day');
SELECT as_user('b0000000-0000-0000-0000-000000000004');    -- Other O: the ONLY reader at college 1, filing himself
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000023', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000011',
   'Ragging, the only reader files', 'He must not be its only reader', 'staff', 'b0000000-0000-0000-0000-000000000004',
   now() + interval '1 day');
SELECT as_user('b0000000-0000-0000-0000-000000000001');    -- the superior-route person opens both
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id IN ('d1000000-0000-0000-0000-000000000022',
                                                                 'd1000000-0000-0000-0000-000000000023')) = 2,
            'the superior-route person can open the ICC-only complaints the database sent her');
SELECT as_user('b0000000-0000-0000-0000-000000000002');    -- Handler H at college 1, holds grievance.tickets.view
SELECT t_ok((SELECT count(*) FROM grievance_tickets WHERE id IN ('d1000000-0000-0000-0000-000000000020',
                                                                 'd1000000-0000-0000-0000-000000000023')) = 0,
            'an ordinary handler at the college cannot open a Ragging complaint any more');
RESET ROLE;
SELECT t_ok((SELECT is_icc_only AND assigned_to = 'b0000000-0000-0000-0000-000000000001'
                    AND metadata ->> 'routing' = 'icc_no_committee' AND raised_by_id IS NULL AND filed_by IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000022'),
            'anonymous Ragging with no reader goes to the superior-route person, and still stores no filer');
SELECT t_ok((SELECT is_icc_only AND assigned_to = 'b0000000-0000-0000-0000-000000000001'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000023'),
            'the filer does not count as the reader of his own complaint');

-- Doors that decide for themselves are left alone: a row that already has an
-- assignee, or that InstaSolver stamped icc_no_committee (its own route_pending_policy).
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  metadata, sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000024', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000012',
   'InstaSolver pending', 'Its own decision', 'staff', '{"icc_no_committee": true, "route_pending_policy": true}',
   now() + interval '1 day');
SELECT t_ok((SELECT is_icc_only AND assigned_to IS NULL
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000024'),
            'a row InstaSolver already decided (icc_no_committee) is marked ICC-only but not re-routed');
INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  sla_deadline)
VALUES ('d1000000-0000-0000-0000-000000000025', '11000000-0000-0000-0000-000000000002', 'x', 'c1000000-0000-0000-0000-000000000002',
   'Old category name', 'Harassment by its seeded name', 'staff', now() + interval '1 day');
SELECT t_ok((SELECT is_icc_only FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000025'),
            'the seeded "Sexual Harassment (ICC)" type is ICC-only whatever the writer sent');
SELECT t_ok((SELECT NOT is_icc_only FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000003'),
            'an ordinary type stays an ordinary complaint');

-- The routing half never loses a complaint: with the reader check throwing,
-- the row is still saved, ICC-only, and sent on as if nobody could read it.
DO $do$
DECLARE v_def text := pg_get_functiondef('public.fn_grievance_icc_reader_exists(uuid, uuid)'::regprocedure);
BEGIN
  EXECUTE $f$CREATE OR REPLACE FUNCTION public.fn_grievance_icc_reader_exists(p_institution_id uuid, p_exclude uuid DEFAULT NULL)
    RETURNS boolean LANGUAGE plpgsql AS $b$ BEGIN RAISE EXCEPTION 'stand-in: reader check broken'; END $b$ $f$;
  INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
    sla_deadline)
  VALUES ('d1000000-0000-0000-0000-000000000026', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000011',
     'Reader check broken', 'Must still be saved', 'staff', now() + interval '1 day');
  EXECUTE v_def;
END $do$;
SELECT t_ok((SELECT is_icc_only AND assigned_to = 'b0000000-0000-0000-0000-000000000001'
                    AND (metadata ->> 'icc_committee_check_failed') = 'true'
               FROM grievance_tickets WHERE id = 'd1000000-0000-0000-0000-000000000026'),
            'a failing reader check does not lose the complaint: saved, ICC-only, sent to the superior-route person');
SELECT t_ok(fn_grievance_icc_reader_exists('11000000-0000-0000-0000-000000000001'),
            'rehearsal: the real reader check is back after the stand-in');

-- Who MAY still reassign an ICC-only complaint: the committee, an admin, the service role.
SET ROLE authenticated;
SELECT as_user('b0000000-0000-0000-0000-000000000004');    -- Other O: icc_member with access to college 1
UPDATE grievance_tickets SET assigned_to = 'b0000000-0000-0000-0000-000000000004' WHERE id = 'd1000000-0000-0000-0000-000000000014';
RESET ROLE;
SELECT t_ok((SELECT assigned_to = 'b0000000-0000-0000-0000-000000000004' FROM grievance_tickets
              WHERE id = 'd1000000-0000-0000-0000-000000000014'),
            'the college''s committee member can reassign an ICC-only complaint');
SELECT as_user(NULL);                                       -- no request identity: the service role / escalation run
UPDATE grievance_tickets SET assigned_to = 'b0000000-0000-0000-0000-000000000001' WHERE id = 'd1000000-0000-0000-0000-000000000014';
SELECT t_ok((SELECT assigned_to = 'b0000000-0000-0000-0000-000000000001' FROM grievance_tickets
              WHERE id = 'd1000000-0000-0000-0000-000000000014'),
            'the service role (SLA escalation) can still reassign an ICC-only complaint');

-- ----------------------------------------------- 9. grants
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_conversation(text)', 'EXECUTE'), 'anon cannot execute the conversation');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_answer(text, text)', 'EXECUTE'), 'anon cannot execute the answer');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_track_rate(text, integer, text)', 'EXECUTE'), 'anon cannot execute the rating');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_ticket_by_token(text)', 'EXECUTE'), 'the raw token lookup is service-role only');
SELECT t_ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grievance_anonymous_messages'::regclass), 'RLS is on for the messages table');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_icc_reader_exists(uuid, uuid)', 'EXECUTE'), 'the reader check is service-role only');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_icc_reader_exists(uuid, uuid)', 'EXECUTE'), 'anon cannot execute the reader check');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_icc_route_on_create()', 'EXECUTE'), 'the ICC route trigger function is not callable');
SELECT t_ok(NOT has_function_privilege('authenticated', 'public.fn_grievance_icc_column_guard()', 'EXECUTE'), 'the ICC column guard function is not callable');
SELECT t_ok(NOT has_function_privilege('anon', 'public.fn_grievance_is_icc_only_category(text)', 'EXECUTE'), 'anon cannot execute the ICC rule');

SELECT 'GRIEVANCE PRIVACY SCENARIOS PASSED';
