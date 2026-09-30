-- =====================================================================
-- Grievance / InstaSolver: anonymous really means anonymous, harassment stays
-- with the committee, questions to an anonymous filer through the tracking code,
-- a rating once resolved, and a 3-character description minimum.
-- Date: 2026-10-01 (Director rulings, 30 Sep 2026)
--
-- STACKED ON 20270420090000_grievance_sla_escalation.sql (#4079). Apply after it.
--
-- WHAT THIS FILE DOES
--   1. Anonymous tickets keep NO trace of who filed them. A BEFORE INSERT OR
--      UPDATE trigger blanks raised_by_id / _name / _email / _phone whenever
--      is_anonymous is true — for every writer (InstaSolver, the Learners
--      Council board, the /accreditation form, anything later), not only the
--      ones the app changed. Existing anonymous rows are scrubbed below, and the
--      comments their filer wrote are de-named the same way.
--      No sealed copy of the filer is kept anywhere: nothing in the system reads
--      it (there is no abuse limit keyed on the filer), and a copy would be the
--      one thing a handler could ask to have looked up.
--   2. grievance_tickets_description_check: 10 characters -> 3 (after trimming).
--      The constraint was LIVE but defined by no migration in this repo; it is
--      now defined here, under the SAME NAME, because
--      lib/validations/grievance-ticket.ts matches refusals on that name.
--   3. grievance_anonymous_messages: a handler asks the anonymous filer a
--      question on the ticket; the filer reads it and answers on the tracking
--      page, without a name. RLS: whoever can read the ticket can read and ask.
--      The filer reaches it ONLY through the token-checked functions in 4.
--   4. Three SECURITY DEFINER functions for the tracking page, callable by a
--      signed-in person holding the private code (never by anon):
--        fn_grievance_track_conversation(token) -> the questions/answers + rating
--        fn_grievance_track_answer(token, body) -> the filer answers, nameless
--        fn_grievance_track_rate(token, rating, note) -> 1-5 stars once resolved
--   5. An ICC-only complaint that InstaSolver hands to the superior-route person
--      (no active ICC committee at that college, or a complaint about the
--      filer's own HOD / principal / manager) is readable by that assignee.
--      The ICC-only rules in substrate v2 demote assigned_to, so without this
--      the person it was sent to could not open it unless she is also a super
--      admin, an admin or an icc_member. Additive policies; the existing ones
--      are not touched.
--
-- CORRECTING THE RECORD in 20261213100000_instasolver_substrate_v2.sql (that
-- file is applied and is deliberately NOT edited — touching it re-runs its
-- policy block):
--   * its comment at ~line 337 says anonymous rows have raised_by_id IS NULL.
--     They did not: LCIssueService and GrievanceService both stored the filer's
--     id. From this migration on they do not, and the old rows are scrubbed.
--   * its comment at ~line 396 says harassment categories auto-flag
--     is_icc_only "via service layer". Nothing did. The InstaSolver complaint
--     route now sets it (app/api/instasolver/complaint/route.ts).
--
-- Rehearsal: supabase/tests/grievance/run-privacy.sh (local Postgres only).
-- Safe to apply twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Anonymous means no filer on the row
-- ---------------------------------------------------------------------
-- Not SECURITY DEFINER: it only rewrites the row being written.
-- Named trg_grievance_zz_* so it is the LAST BEFORE trigger to run (Postgres
-- fires same-event triggers in name order) — nothing after it can put a name
-- back.
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
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_scrub_anonymous_filer() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_grievance_scrub_anonymous_filer() IS
  'BEFORE INSERT OR UPDATE on grievance_tickets: an anonymous ticket (is_anonymous = true) never stores raised_by_id, raised_by_name, raised_by_email or raised_by_phone. Director ruling 30 Sep 2026: anonymous must hide the filer from everyone handling the complaint. The filer follows it with the private tracking code only.';

DROP TRIGGER IF EXISTS trg_grievance_zz_scrub_anonymous_filer ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_zz_scrub_anonymous_filer
  BEFORE INSERT OR UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_grievance_scrub_anonymous_filer();

-- Backfill. Comments first, while the filer id is still on the ticket: a
-- comment the filer wrote on her own anonymous ticket carries her id and name.
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
       AND gt.raised_by_id IS NOT NULL
       AND c.author_id = gt.raised_by_id;
  END IF;
END $$;

-- The emission trigger (emit_grievance_evidence_on_resolve) is AFTER UPDATE OF
-- status with a WHEN guard, so this UPDATE emits no accreditation evidence.
UPDATE public.grievance_tickets
   SET raised_by_id = NULL,
       raised_by_name = NULL,
       raised_by_email = NULL,
       raised_by_phone = NULL
 WHERE COALESCE(is_anonymous, false)
   AND (raised_by_id IS NOT NULL OR raised_by_name IS NOT NULL
        OR raised_by_email IS NOT NULL OR raised_by_phone IS NOT NULL);

-- ---------------------------------------------------------------------
-- 2) Description: at least 3 characters (was 10)
-- ---------------------------------------------------------------------
ALTER TABLE public.grievance_tickets DROP CONSTRAINT IF EXISTS grievance_tickets_description_check;
ALTER TABLE public.grievance_tickets
  ADD CONSTRAINT grievance_tickets_description_check
  CHECK (char_length(btrim(description)) >= 3) NOT VALID;
-- Every existing row met the old 10-character rule. Validated separately so a
-- row that is 10 characters of mostly spaces cannot fail the whole migration.
DO $$
BEGIN
  ALTER TABLE public.grievance_tickets VALIDATE CONSTRAINT grievance_tickets_description_check;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'grievance_tickets_description_check left NOT VALID: an existing row has fewer than 3 non-space characters. New writes are still checked.';
END $$;

-- ---------------------------------------------------------------------
-- 3) Questions to an anonymous filer, and her answers
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
-- 4) The tracking page's three functions
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

  UPDATE public.grievance_tickets
     SET satisfaction_rating = p_rating,
         satisfaction_feedback = v_note
   WHERE id = v_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_track_rate(text, integer, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_track_rate(text, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) The person InstaSolver sends an ICC-only complaint to can open it
-- ---------------------------------------------------------------------
-- Only when the route itself did the sending: metadata.routing is
-- 'icc_no_committee' (no active ICC committee at that college) or
-- 'superior_bypass' (about the filer's own HOD / principal / manager), and
-- only for the person it is assigned to. The existing ICC branches (committee
-- members, super admin, admin) are untouched and still apply.
DROP POLICY IF EXISTS grievance_tickets_select_icc_routed_assignee ON public.grievance_tickets;
CREATE POLICY grievance_tickets_select_icc_routed_assignee ON public.grievance_tickets
  FOR SELECT TO authenticated
  USING (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
    AND (metadata ->> 'routing') IN ('icc_no_committee', 'superior_bypass')
  );

DROP POLICY IF EXISTS grievance_tickets_update_icc_routed_assignee ON public.grievance_tickets;
CREATE POLICY grievance_tickets_update_icc_routed_assignee ON public.grievance_tickets
  FOR UPDATE TO authenticated
  USING (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
    AND (metadata ->> 'routing') IN ('icc_no_committee', 'superior_bypass')
  )
  WITH CHECK (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
    AND (metadata ->> 'routing') IN ('icc_no_committee', 'superior_bypass')
  );
