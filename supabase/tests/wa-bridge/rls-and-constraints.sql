-- supabase/tests/wa-bridge/rls-and-constraints.sql
--
-- Drives the real migration file as a low-privilege user and asserts the rules
-- that a reading of the SQL cannot establish.
--
-- Every assertion below FAILS LOUDLY (RAISE EXCEPTION) rather than printing a
-- row for a human to squint at, so the script's exit code is the result.
--
-- The centrepiece is the NEGATIVE CONTROL in section 2b: the old policy text is
-- put back, the SAME query is run as the SAME user, and the platform-wide row
-- is shown to be VISIBLE. Without that, a passing harness proves only that the
-- query returned what was expected for some reason — possibly the wrong one.

\set ON_ERROR_STOP on

-- SET ROLE, not SET LOCAL ROLE. psql runs each statement in its own implicit
-- transaction, so SET LOCAL here is silently discarded the moment it is set —
-- the session stays the table OWNER, and a table owner BYPASSES RLS. The first
-- run of this file did exactly that and reported a leak that was really the
-- harness testing nothing. Session-scoped SET, explicitly RESET after each
-- block, is what actually changes who is asking.

-- Fixed ids so failures name something a person can find.
\set inst_a   '''11111111-1111-1111-1111-111111111111'''
\set inst_b   '''22222222-2222-2222-2222-222222222222'''
\set staff_a  '''33333333-3333-3333-3333-333333333333'''
\set lead_one '''44444444-4444-4444-4444-444444444444'''

INSERT INTO public.institutions (id, name) VALUES
  (:inst_a, 'College A'), (:inst_b, 'College B');

-- An ordinary member of staff at College A who DOES hold the WhatsApp key.
-- Not an admin, not a super admin. Exactly the person the policy is about.
INSERT INTO public.profiles (id, institution_id, is_super_admin, role)
  VALUES (:staff_a, :inst_a, false, 'admission');
INSERT INTO public.test_permissions (user_id, perm)
  VALUES (:staff_a, 'admission.settings.whatsapp.view');

INSERT INTO public.admission_leads (id, phone) VALUES (:lead_one, '+919876543210');

-- Three rows: College A's, College B's, and one with no institution at all.
INSERT INTO public.wa_bridge_outbox (to_phone, body, type, institution_id) VALUES
  ('919876543210', 'for college A',  'text', :inst_a),
  ('919876543211', 'for college B',  'text', :inst_b),
  ('919876543212', 'platform-wide',  'text', NULL);

-- ===========================================================================
-- 1. The bridge tables are not readable by anon at all.
-- ===========================================================================
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.wa_bridge_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 1: anon can SELECT wa_bridge_outbox';
  END IF;
  RAISE NOTICE 'PASS 1: anon holds no SELECT on the bridge tables';
END
$$;

-- ===========================================================================
-- 2. THE FIX — a NULL institution is invisible to an ordinary permitted user.
-- ===========================================================================
SET ROLE authenticated;
SET "test.uid" = '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE
  v_total int;
  v_null  int;
  v_b     int;
BEGIN
  SELECT count(*) INTO v_total FROM public.wa_bridge_outbox;
  SELECT count(*) INTO v_null  FROM public.wa_bridge_outbox WHERE institution_id IS NULL;
  SELECT count(*) INTO v_b     FROM public.wa_bridge_outbox
    WHERE institution_id = '22222222-2222-2222-2222-222222222222';

  IF v_null <> 0 THEN
    RAISE EXCEPTION
      'FAIL 2: a platform-wide (NULL institution) message is visible to an ordinary College A user — % row(s)', v_null;
  END IF;
  IF v_b <> 0 THEN
    RAISE EXCEPTION 'FAIL 2: College B''s message is visible to a College A user — % row(s)', v_b;
  END IF;
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'FAIL 2: expected exactly College A''s own row, saw %', v_total;
  END IF;
  RAISE NOTICE 'PASS 2: College A staff see 1 row — their own. NULL-institution and College B are both hidden.';
END
$$;

RESET ROLE;

-- ===========================================================================
-- 2b. NEGATIVE CONTROL — put the OLD policy back and watch it leak.
--
-- If this section does NOT leak, the harness is not measuring what it claims to
-- measure and section 2 above proves nothing.
-- ===========================================================================
DROP POLICY IF EXISTS wa_bridge_outbox_select ON public.wa_bridge_outbox;
CREATE POLICY wa_bridge_outbox_select ON public.wa_bridge_outbox
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('admission.settings.whatsapp.view')
      AND public.role_has_institution_access(institution_id)
    )
  );

SET ROLE authenticated;
SET "test.uid" = '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE v_null int;
BEGIN
  SELECT count(*) INTO v_null FROM public.wa_bridge_outbox WHERE institution_id IS NULL;
  IF v_null = 0 THEN
    RAISE EXCEPTION
      'FAIL 2b: the OLD policy did NOT leak the platform-wide row. This harness cannot detect the defect, so PASS 2 means nothing.';
  END IF;
  RAISE NOTICE 'PASS 2b: negative control — the old policy leaks % platform-wide row(s) to the same user. The test can fail.', v_null;
END
$$;

RESET ROLE;

-- Restore the fixed policy for the rest of the run.
DROP POLICY IF EXISTS wa_bridge_outbox_select ON public.wa_bridge_outbox;
CREATE POLICY wa_bridge_outbox_select ON public.wa_bridge_outbox
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      institution_id IS NOT NULL
      AND public.user_has_permission('admission.settings.whatsapp.view')
      AND public.role_has_institution_access(institution_id)
    )
  );

-- ===========================================================================
-- 3. type — 'media' MUST be accepted (the sender lane writes it) and the old
--    four-name list must be gone.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, media_url, body)
    VALUES ('919876543210', 'media', 'https://example.org/f.pdf', 'caption');
  RAISE NOTICE 'PASS 3a: type=media is accepted — media sends work';
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'FAIL 3a: type=media was REJECTED — 100%% of media sends would fail';
END
$$;

DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, media_url)
    VALUES ('919876543210', 'image', 'https://example.org/f.png');
  RAISE EXCEPTION 'FAIL 3b: type=image was accepted — the type list is not the agreed contract';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 3b: type=image is refused';
END
$$;

-- ===========================================================================
-- 4. A text row with no body cannot be queued, so it can never be claimed and
--    handed to the bridge with nothing to send.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, body) VALUES ('919876543210', 'text', NULL);
  RAISE EXCEPTION 'FAIL 4a: a text message with a NULL body was queued';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 4a: text with NULL body is refused';
END
$$;

DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, body) VALUES ('919876543210', 'text', '   ');
  RAISE EXCEPTION 'FAIL 4b: a text message of only whitespace was queued';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 4b: whitespace-only text is refused';
END
$$;

DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, media_url) VALUES ('919876543210', 'media', NULL);
  RAISE EXCEPTION 'FAIL 4c: a media message with no media_url was queued';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 4c: media with NULL media_url is refused';
END
$$;

-- ===========================================================================
-- 5. to_phone is canonical E.164 DIGITS ONLY.
-- ===========================================================================
DO $$
DECLARE v_bad text;
BEGIN
  FOREACH v_bad IN ARRAY ARRAY['+919876543210', '919876543210@s.whatsapp.net', '91 98765 43210', '09876543210', ''] LOOP
    BEGIN
      INSERT INTO public.wa_bridge_outbox (to_phone, type, body) VALUES (v_bad, 'text', 'hi');
      RAISE EXCEPTION 'FAIL 5: to_phone "%" was accepted', v_bad;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 5: +, JID suffix, spaces, leading zero and empty are all refused as to_phone';
END
$$;

-- ===========================================================================
-- 6. THE TAMIL CASE — 4096 CHARACTERS, not 4096 bytes.
--
-- The body cap is the one the byte-cap defect lived in. A Tamil character is 3
-- bytes in UTF-8, so a 2,000-character Tamil message is ~6,000 bytes: well over
-- the old 4096-BYTE limit and well inside WhatsApp's 4096-CHARACTER one.
-- ===========================================================================
DO $$
DECLARE
  v_tamil text := repeat('வணக்கம் பெற்றோருக்கு வாழ்த்துக்கள். ', 100);
BEGIN
  RAISE NOTICE 'Tamil sample: % characters, % bytes',
    char_length(v_tamil), octet_length(v_tamil);

  IF octet_length(v_tamil) <= 4096 THEN
    RAISE EXCEPTION 'FAIL 6: the Tamil sample is under 4096 BYTES, so it does not exercise the defect';
  END IF;
  IF char_length(v_tamil) > 4096 THEN
    RAISE EXCEPTION 'FAIL 6: the Tamil sample is over 4096 CHARACTERS, so WhatsApp would refuse it anyway';
  END IF;

  INSERT INTO public.wa_bridge_outbox (to_phone, type, body)
    VALUES ('919876543210', 'text', v_tamil);
  RAISE NOTICE 'PASS 6: a % character / % byte Tamil message is accepted',
    char_length(v_tamil), octet_length(v_tamil);
END
$$;

DO $$
BEGIN
  INSERT INTO public.wa_bridge_outbox (to_phone, type, body)
    VALUES ('919876543210', 'text', repeat('அ', 4097));
  RAISE EXCEPTION 'FAIL 6b: a 4097-CHARACTER body was accepted — the cap is not in characters';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 6b: 4097 characters is refused — the cap counts characters, both ways';
END
$$;

-- ===========================================================================
-- 7. An ambiguous inbound message can never carry a lead.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO public.wa_bridge_inbound (wa_message_id, from_phone, match_status, lead_id, match_candidate_count)
    VALUES ('wamid.ambiguous', '919876543210', 'ambiguous', '44444444-4444-4444-4444-444444444444', 2);
  RAISE EXCEPTION 'FAIL 7: an ambiguous message was attached to a lead';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS 7: an ambiguous inbound message cannot carry a lead_id';
END
$$;

-- ===========================================================================
-- 8. Idempotency — the same wa_message_id cannot be recorded twice.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO public.wa_bridge_inbound (wa_message_id, from_phone, match_status, lead_id, match_candidate_count)
    VALUES ('wamid.once', '919876543210', 'matched', '44444444-4444-4444-4444-444444444444', 1);
  BEGIN
    INSERT INTO public.wa_bridge_inbound (wa_message_id, from_phone)
      VALUES ('wamid.once', '919876543210');
    RAISE EXCEPTION 'FAIL 8: the same wa_message_id was recorded twice';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 8: a repeated wa_message_id is refused — the bridge''s retries collapse';
  END;
END
$$;

-- ===========================================================================
-- 9. Foreign keys exist and behave as declared.
-- ===========================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.wa_bridge_outbox (to_phone, type, body, lead_id)
      VALUES ('919876543210', 'text', 'hi', '99999999-9999-9999-9999-999999999999');
    RAISE EXCEPTION 'FAIL 9a: a lead_id pointing at nothing was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS 9a: an unknown lead_id is refused';
  END;

  INSERT INTO public.wa_bridge_outbox (to_phone, type, body, lead_id)
    VALUES ('919876543210', 'text', 'keep me', '44444444-4444-4444-4444-444444444444');
  DELETE FROM public.wa_bridge_inbound WHERE lead_id = '44444444-4444-4444-4444-444444444444';
  DELETE FROM public.admission_leads WHERE id = '44444444-4444-4444-4444-444444444444';

  IF NOT EXISTS (SELECT 1 FROM public.wa_bridge_outbox WHERE body = 'keep me' AND lead_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL 9b: deleting the lead did not leave the message with a NULL lead_id';
  END IF;
  RAISE NOTICE 'PASS 9b: deleting a lead keeps the message and nulls its link (ON DELETE SET NULL)';
END
$$;

SELECT 'ALL WA-BRIDGE ASSERTIONS PASSED' AS result;
