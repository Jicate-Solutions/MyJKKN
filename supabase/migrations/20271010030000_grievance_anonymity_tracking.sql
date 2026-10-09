-- =====================================================================
-- Grievance / InstaSolver: anonymous really means anonymous, and the filer
-- follows up with the tracking code only.
-- Date: 2026-10-10. Carried from PR #4156 (20270624093700, Director rulings
-- 30 Sep 2026), trimmed by the Director's rulings of 8 Oct 06:20 and
-- 9 Oct 23:18: ONLY the two privacy parts are kept.
--
-- STACKED ON 20271010020000_grievance_sla_escalation.sql (#4079). Apply after it.
--
-- KEPT FROM #4156
--   1. Anonymous tickets keep NO trace of who filed them, from everyone — the
--      Joint MD included. A BEFORE INSERT OR UPDATE trigger blanks
--      raised_by_id / _name / _email / _phone AND filed_by whenever
--      is_anonymous is true, for every writer. Existing anonymous rows are
--      scrubbed, and the comments and grievance_history rows their filer wrote
--      are de-named.
--      KNOWN CONSEQUENCE, accepted: SLA escalation (fn_grievance_level_target,
--      20271010020000) and the about-the-Joint-MD routing exclude raised_by_id
--      and filed_by from their targets. On an anonymous row both are NULL, so
--      if the person at level 3 (or the Director) filed anonymously, her own
--      complaint can reach her. Excluding her needs her id on the row, which
--      is exactly what the ruling forbids.
--   2. grievance_anonymous_messages: a handler asks the anonymous filer a
--      question on the ticket; the filer reads it and answers on the tracking
--      page, without a name. RLS: whoever can read the ticket — so a
--      complaint about the Joint MD stays hidden from the Joint MD here too
--      (her ticket rows are filtered by 20271010020000 section 11).
--   3. Three SECURITY DEFINER functions for the tracking page, callable by a
--      signed-in person holding the private code (never by anon):
--        fn_grievance_track_conversation(token) -> the questions/answers + rating
--        fn_grievance_track_answer(token, body) -> the filer answers, nameless
--        fn_grievance_track_rate(token, rating, note) -> 1-5 stars once resolved
--
-- NOT CARRIED (overruled 8 Oct 06:20, or a separate ruling not asked for):
--   * harassment / ragging routed to the ICC committee, or to the
--     superior-route person when nobody can read it as the committee
--     (#4156 sections 5-8: assignee policies, fn_grievance_icc_reader_exists,
--     fn_grievance_is_icc_only_category, trg_grievance_icc_route_on_create,
--     trg_grievance_icc_column_guard);
--   * complaints about a principal routed to a named person;
--   * the 3-character description minimum (#4156 section 2).
--
-- Rehearsal: supabase/tests/grievance/run.sh (local Postgres only).
-- Safe to apply twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Anonymous means no filer on the row
-- ---------------------------------------------------------------------
-- Not SECURITY DEFINER: it only rewrites the row being written.
-- Named zzz_* so it is the LAST BEFORE trigger to run: Postgres fires
-- same-event triggers in name order (byte order), and 'zzz_' sorts after every
-- name starting with a letter, digit or underscore — including set_*, check_*,
-- trg_* and update_* — so nothing after it can put a name back. (An earlier
-- draft was trg_grievance_zz_*, which an update_* trigger would have followed.)
CREATE OR REPLACE FUNCTION public.fn_grievance_scrub_anonymous_filer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_anonymous, false) THEN
    NEW.raised_by_id    := NULL;
    NEW.raised_by_name  := NULL;
    NEW.raised_by_email := NULL;
    NEW.raised_by_phone := NULL;
    NEW.filed_by        := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_scrub_anonymous_filer() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_grievance_scrub_anonymous_filer() IS
  'BEFORE INSERT OR UPDATE on grievance_tickets: an anonymous ticket (is_anonymous = true) never stores raised_by_id, raised_by_name, raised_by_email, raised_by_phone or filed_by. Director ruling 30 Sep 2026: anonymous must hide the filer from everyone handling the complaint. The filer follows it with the private tracking code only.';

DROP TRIGGER IF EXISTS trg_grievance_zz_scrub_anonymous_filer ON public.grievance_tickets;
DROP TRIGGER IF EXISTS zzz_grievance_scrub_anonymous_filer ON public.grievance_tickets;
CREATE TRIGGER zzz_grievance_scrub_anonymous_filer
  BEFORE INSERT OR UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_grievance_scrub_anonymous_filer();

-- Backfill. Comments first, while the filer ids are still on the ticket: a
-- comment the filer wrote on her own anonymous ticket carries her id and name.
-- She may be on the row as raised_by_id (Learners Council, InstaSolver) or
-- only as filed_by (the /accreditation form left raised_by_id NULL on an
-- anonymous filing and wrote filed_by; she then commented through the filed_by
-- branch of grievance_comments_insert). Both are de-named. Deliberate
-- over-reach: a filed_by who also handled the ticket gets her handler comments
-- de-named too — privacy over attribution.
-- (grievance_comments is guarded: the rehearsal and fresh databases may not
-- have it.)
DO $$
BEGIN
  IF to_regclass('public.grievance_comments') IS NOT NULL THEN
    UPDATE public.grievance_comments c
       SET author_id = NULL,
           author_name = 'Anonymous filer'
      FROM public.grievance_tickets gt
     WHERE gt.id = c.ticket_id
       AND COALESCE(gt.is_anonymous, false)
       AND (gt.raised_by_id IS NOT NULL OR gt.filed_by IS NOT NULL)
       AND c.author_id IN (gt.raised_by_id, gt.filed_by);
  END IF;
END $$;

-- grievance_history is LIVE (types/supabase.ts) but defined and written by no
-- migration or app code in this repo — only a live-only trigger could fill it.
-- Its read policy (rls_initplan_wrap_sweep.sql grievance_history_select) lets
-- every admin / super_admin / staff / hod / principal read the history of ANY
-- ticket, so a row the filer performed on her own anonymous ticket names her.
-- De-named the same way, and before the ticket UPDATE below, which is what
-- still knows who she was. Fires no trigger on grievance_tickets.
DO $$
BEGIN
  IF to_regclass('public.grievance_history') IS NOT NULL THEN
    UPDATE public.grievance_history h
       SET performed_by = NULL
      FROM public.grievance_tickets gt
     WHERE gt.id = h.ticket_id
       AND COALESCE(gt.is_anonymous, false)
       AND (gt.raised_by_id IS NOT NULL OR gt.filed_by IS NOT NULL)
       AND h.performed_by IN (gt.raised_by_id, gt.filed_by);
  END IF;
END $$;

-- The ticket scrub, one anonymous ticket at a time. The emission trigger
-- (emit_grievance_evidence_on_resolve) is AFTER UPDATE OF status with a WHEN
-- guard, so this UPDATE emits no accreditation evidence.
--
-- grievance_history.old_value / new_value (text) are cleared too, whatever
-- wrote them. The filer's id, name, email and phone are taken from the ticket
-- BEFORE it is scrubbed; after the scrub, any history row on that ticket whose
-- old_value or new_value contains one of them loses that value. This covers
-- (a) field-level rows an earlier edit left, and (b) rows a live-only history
-- trigger on grievance_tickets writes for THIS scrub UPDATE (it would record
-- the filer's id or name as old_value): AFTER ROW triggers fire at the end of
-- the UPDATE statement, so their rows exist when the redaction runs. It does
-- not depend on knowing what that trigger is (live pg_trigger was never read
-- from this repo). Matching is strpos, not LIKE: emails and phones may carry
-- '_' or '%'. Deliberate over-reach, as with comments: a handler's value that
-- happens to contain the filer's name is cleared too. The `action` column
-- (NOT NULL) is left as it is.
DO $$
DECLARE
  r      record;
  v_vals text[];
BEGIN
  FOR r IN
    SELECT id, raised_by_id, raised_by_name, raised_by_email, raised_by_phone, filed_by
      FROM public.grievance_tickets
     WHERE COALESCE(is_anonymous, false)
       AND (raised_by_id IS NOT NULL OR raised_by_name IS NOT NULL
            OR raised_by_email IS NOT NULL OR raised_by_phone IS NOT NULL
            OR filed_by IS NOT NULL)
  LOOP
    UPDATE public.grievance_tickets
       SET raised_by_id = NULL,
           raised_by_name = NULL,
           raised_by_email = NULL,
           raised_by_phone = NULL,
           filed_by = NULL
     WHERE id = r.id;

    IF to_regclass('public.grievance_history') IS NOT NULL THEN
      v_vals := array_remove(ARRAY[
        lower(r.raised_by_id::text),
        lower(nullif(btrim(r.raised_by_name), '')),
        lower(nullif(btrim(r.raised_by_email), '')),
        lower(nullif(btrim(r.raised_by_phone), '')),
        lower(r.filed_by::text)
      ], NULL);
      UPDATE public.grievance_history h
         SET old_value = CASE WHEN EXISTS (SELECT 1 FROM unnest(v_vals) v
                                            WHERE strpos(lower(h.old_value), v) > 0)
                              THEN NULL ELSE h.old_value END,
             new_value = CASE WHEN EXISTS (SELECT 1 FROM unnest(v_vals) v
                                            WHERE strpos(lower(h.new_value), v) > 0)
                              THEN NULL ELSE h.new_value END
       WHERE h.ticket_id = r.id
         AND EXISTS (SELECT 1 FROM unnest(v_vals) v
                      WHERE strpos(lower(coalesce(h.old_value, '')), v) > 0
                         OR strpos(lower(coalesce(h.new_value, '')), v) > 0);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2) Questions to an anonymous filer, and her answers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grievance_anonymous_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.grievance_tickets(id) ON DELETE CASCADE,
  -- 'question' = a handler asks; 'answer' = the anonymous filer replies.
  direction   text NOT NULL CHECK (direction IN ('question', 'answer')),
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  -- The handler who asked. ALWAYS NULL on an answer: the filer is never named.
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grievance_anonymous_messages_answer_has_no_author
    CHECK (direction = 'question' OR author_id IS NULL)
);

COMMENT ON TABLE public.grievance_anonymous_messages IS
  'Questions a handler asks the anonymous filer of a grievance ticket, and her nameless answers. Handlers read and ask under RLS (whoever can read the ticket). The filer reads and answers only through fn_grievance_track_conversation / fn_grievance_track_answer with her private tracking code. Director ruling 30 Sep 2026.';

CREATE INDEX IF NOT EXISTS idx_grievance_anonymous_messages_ticket
  ON public.grievance_anonymous_messages (ticket_id, created_at);

ALTER TABLE public.grievance_anonymous_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grievance_anonymous_messages FROM anon, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.grievance_anonymous_messages TO authenticated;
GRANT ALL ON TABLE public.grievance_anonymous_messages TO service_role;

-- The parent read runs under the caller's own grievance_tickets RLS, so the
-- ICC-only rules, institution scope and the rest are inherited exactly.
DROP POLICY IF EXISTS grievance_anonymous_messages_select ON public.grievance_anonymous_messages;
CREATE POLICY grievance_anonymous_messages_select ON public.grievance_anonymous_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.grievance_tickets gt WHERE gt.id = ticket_id));

-- A handler may only ASK, only as herself, only on an anonymous ticket she can
-- read, and not once it is closed or withdrawn. Answers go through the RPC.
-- No UPDATE / DELETE policy: a message, once sent, stays as sent.
DROP POLICY IF EXISTS grievance_anonymous_messages_insert ON public.grievance_anonymous_messages;
CREATE POLICY grievance_anonymous_messages_insert ON public.grievance_anonymous_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'question'
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.grievance_tickets gt
      WHERE gt.id = ticket_id
        AND COALESCE(gt.is_anonymous, false)
        AND gt.status::text <> 'closed'
        AND gt.withdrawn_at IS NULL
    )
  );

-- ---------------------------------------------------------------------
-- 3) The tracking page's three functions
-- ---------------------------------------------------------------------
-- Shared lookup: the same token rule as fn_track_issue_by_token (substrate v2).
CREATE OR REPLACE FUNCTION public.fn_grievance_ticket_by_token(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT gt.id
  FROM public.grievance_tickets gt
  WHERE gt.is_anonymous = true
    AND gt.anonymous_token IS NOT NULL
    AND gt.anonymous_token = p_token
    AND p_token LIKE 'anon\_%'
    AND length(COALESCE(p_token, '')) >= 20
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_ticket_by_token(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_ticket_by_token(text) TO service_role;

-- ci:allow-secdef-authenticated the three fn_grievance_track_* functions are the anonymous filer's only door: the AUTHORITY is the private tracking code (122 to 192 bits of randomness, 'anon_' prefix, length >= 20), checked in every body through fn_grievance_ticket_by_token before anything is read or written. A signed-in caller without the code gets NULL / "No complaint matches this code"; they return no author id, no handler, no raised_by_* column, and write only an author-less answer or the rating on that one ticket.
-- What the filer sees: the conversation and her rating. Never an author id,
-- never the handler's name, never any raised_by_* column. NULL = no such code.
CREATE OR REPLACE FUNCTION public.fn_grievance_track_conversation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id  uuid;
  v_t   public.grievance_tickets;
  v_msg jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  v_id := public.fn_grievance_ticket_by_token(p_token);
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = v_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id, 'direction', m.direction, 'body', m.body, 'created_at', m.created_at)
           ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_msg
  FROM public.grievance_anonymous_messages m
  WHERE m.ticket_id = v_id;

  RETURN jsonb_build_object(
    'messages', v_msg,
    'can_answer', (v_t.status::text <> 'closed' AND v_t.withdrawn_at IS NULL
                   AND EXISTS (SELECT 1 FROM public.grievance_anonymous_messages q
                               WHERE q.ticket_id = v_id AND q.direction = 'question')),
    'can_rate', (v_t.status::text IN ('resolved', 'closed')),
    'satisfaction_rating', v_t.satisfaction_rating,
    'satisfaction_feedback', v_t.satisfaction_feedback
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_track_conversation(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_track_conversation(text) TO authenticated, service_role;

-- The filer answers. Stored with author_id NULL — the signed-in caller's id is
-- used for nothing and written nowhere.
CREATE OR REPLACE FUNCTION public.fn_grievance_track_answer(p_token text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_t     public.grievance_tickets;
  v_body  text := btrim(COALESCE(p_body, ''));
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not signed in. Sign in and try again.');
  END IF;
  v_id := public.fn_grievance_ticket_by_token(p_token);
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No complaint matches this code.');
  END IF;
  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = v_id;

  IF v_t.status::text = 'closed' OR v_t.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This complaint is closed, so it cannot take new answers.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grievance_anonymous_messages
                  WHERE ticket_id = v_id AND direction = 'question') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nobody has asked you anything on this complaint yet.');
  END IF;
  IF char_length(v_body) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please write your answer first.');
  END IF;
  IF char_length(v_body) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please keep your answer to 2000 characters or fewer.');
  END IF;

  -- A flood guard, not a rule about the filer: at most 20 answers a day.
  SELECT count(*) INTO v_count FROM public.grievance_anonymous_messages
   WHERE ticket_id = v_id AND direction = 'answer' AND created_at > now() - interval '24 hours';
  IF v_count >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have sent a lot of answers today. Please wait until tomorrow.');
  END IF;

  INSERT INTO public.grievance_anonymous_messages (ticket_id, direction, body, author_id)
  VALUES (v_id, 'answer', v_body, NULL);

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_track_answer(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_track_answer(text, text) TO authenticated, service_role;

-- The filer rates the outcome, 1-5 stars and an optional note, once the
-- complaint is resolved or closed. A later rating replaces the earlier one.
-- The rating is the one write to grievance_tickets made while the anonymous
-- filer's own session is the request identity (SECURITY DEFINER does not
-- change auth.uid()). Any trigger that records auth.uid() as the actor — a
-- live-only history or audit trigger, say — would write her id onto her own
-- anonymous ticket. So the UPDATE runs with NO request identity (both places
-- auth.uid() reads, transaction-local), restored straight after.
CREATE OR REPLACE FUNCTION public.fn_grievance_track_rate(p_token text, p_rating integer, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id   uuid;
  v_t    public.grievance_tickets;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_sub    text;
  v_claims text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not signed in. Sign in and try again.');
  END IF;
  v_id := public.fn_grievance_ticket_by_token(p_token);
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No complaint matches this code.');
  END IF;
  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = v_id;

  IF v_t.status::text NOT IN ('resolved', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can rate this once it has been resolved.');
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please choose from 1 to 5 stars.');
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please keep the note to 1000 characters or fewer.');
  END IF;

  v_sub    := current_setting('request.jwt.claim.sub', true);
  v_claims := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  -- '{}' rather than '': a reader that casts the claims to jsonb without
  -- NULLIF must still parse them.
  PERFORM set_config('request.jwt.claims', '{}', true);

  UPDATE public.grievance_tickets
     SET satisfaction_rating = p_rating,
         satisfaction_feedback = v_note
   WHERE id = v_id;

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, '{}'), true);

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_track_rate(text, integer, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_track_rate(text, integer, text) TO authenticated, service_role;
