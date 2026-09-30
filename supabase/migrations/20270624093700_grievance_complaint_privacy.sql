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
--      UPDATE trigger blanks raised_by_id / _name / _email / _phone AND
--      filed_by (the person who typed it in — on the /accreditation form that
--      is the staff member herself) whenever is_anonymous is true — for every
--      writer (InstaSolver, the Learners Council board, the /accreditation
--      form, anything later), not only the ones the app changed. Existing
--      anonymous rows are scrubbed below, and the comments their filer wrote
--      (as raised_by_id OR as filed_by) are de-named the same way.
--      No sealed copy of the filer is kept anywhere: nothing in the system reads
--      it (there is no abuse limit keyed on the filer), and a copy would be the
--      one thing a handler could ask to have looked up.
--      KNOWN CONSEQUENCE, accepted: SLA escalation (fn_grievance_level_target,
--      20270420090000) excludes raised_by_id and filed_by from its targets.
--      On an anonymous row both are NULL, so if the ICC chair or the
--      Director-policy person filed anonymously, her own complaint can be
--      escalated to her. Excluding her would need her id on the row, which is
--      exactly what the ruling forbids. (The InstaSolver route does exclude
--      the filer from the committee-reader check in 6 below — it knows who is
--      filing at that moment and keeps it nowhere.)
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
--   5. The person an ICC-only complaint is ASSIGNED to can open and act on it:
--      the superior-route person InstaSolver hands it to (nobody at that
--      college can read ICC-only complaints, or it is about the filer's own
--      HOD / principal / manager), and the ICC chair or Director-policy person
--      SLA escalation (#4079) assigns it to at level 3. This REVERSES substrate
--      v2's demotion of assigned_to for ICC-only rows — see section 5 for why
--      that costs no confidentiality. Additive policies; the existing ones are
--      not touched.
--   6. fn_grievance_icc_reader_exists(institution, exclude): whether at least
--      one real person can read that college's ICC-only complaints through the
--      committee branch of grievance_tickets_select (an icc_member holder with
--      access to the college). A committee ROW is not that proof. InstaSolver
--      asks this before leaving a harassment or ragging complaint unassigned
--      for the committee. Service role only.
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

-- The emission trigger (emit_grievance_evidence_on_resolve) is AFTER UPDATE OF
-- status with a WHEN guard, so this UPDATE emits no accreditation evidence.
UPDATE public.grievance_tickets
   SET raised_by_id = NULL,
       raised_by_name = NULL,
       raised_by_email = NULL,
       raised_by_phone = NULL,
       filed_by = NULL
 WHERE COALESCE(is_anonymous, false)
   AND (raised_by_id IS NOT NULL OR raised_by_name IS NOT NULL
        OR raised_by_email IS NOT NULL OR raised_by_phone IS NOT NULL
        OR filed_by IS NOT NULL);

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
-- 5) The person an ICC-only complaint is assigned to can open it
-- ---------------------------------------------------------------------
-- Substrate v2 demoted assigned_to for ICC-only rows ("a handler not on the
-- committee should not read it merely because it was assigned to them"). That
-- left two real assignees locked out of the complaint they were sent:
--   * the superior-route person InstaSolver hands it to (route.ts), and
--   * the ICC chair / Director-policy person SLA escalation assigns it to at
--     level 3 (fn_grievance_level_target, 20270420090000), who need not hold
--     icc_member.
-- An earlier draft admitted only rows stamped metadata.routing =
-- 'icc_no_committee' / 'superior_bypass'. That pin was never a control:
-- grievance_tickets_insert admits any authenticated caller with any metadata,
-- so a direct insert could forge it, and escalation never sets it.
--
-- Why letting the assignee read costs no confidentiality: on an EXISTING
-- ICC-only row, assigned_to can only be written by someone who may already
-- read and update that row — super admin, admin, an institution-scoped
-- icc_member (substrate v2 grievance_tickets_update), the service-role
-- escalation run, or the assignee herself, pinned to herself by the WITH
-- CHECK below. The raiser cannot change it (fn_grievance_raiser_update_guard).
-- So assignment is a decision a trusted reader made, and this honours it.
-- A filer inserting a new ICC-only row can name an assignee — but it is her
-- own complaint she is choosing to send.
--
-- KNOWN, ACCEPTED — the assignee can reclassify the row. Postgres ORs the
-- WITH CHECK clauses of permissive UPDATE policies, and substrate v2's
-- grievance_tickets_update WITH CHECK still offers `raised_by_id = auth.uid()`
-- and `(is_icc_only = false AND assigned_to = auth.uid())`. So an assignee
-- admitted by the USING below can, on a NAMED row, set raised_by_id to herself
-- and reassign; and on any row set is_icc_only = false (keeping herself as
-- assignee) and so expose it to every holder of grievance.tickets.view at that
-- college. On an ANONYMOUS row the first path is closed by section 1's scrub,
-- which nulls raised_by_id before the WITH CHECK runs. The assignees this admits are
-- the superior-route person, the ICC chair and the Director-policy person —
-- people already trusted with the complaint's confidentiality. Not closed
-- here; a column guard would be a trigger of its own.
DROP POLICY IF EXISTS grievance_tickets_select_icc_routed_assignee ON public.grievance_tickets;
CREATE POLICY grievance_tickets_select_icc_routed_assignee ON public.grievance_tickets
  FOR SELECT TO authenticated
  USING (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS grievance_tickets_update_icc_routed_assignee ON public.grievance_tickets;
CREATE POLICY grievance_tickets_update_icc_routed_assignee ON public.grievance_tickets
  FOR UPDATE TO authenticated
  USING (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
  )
  WITH CHECK (
    is_icc_only = true
    AND assigned_to = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------
-- 6) Can anybody at this college actually read an ICC-only complaint?
-- ---------------------------------------------------------------------
-- The committee branch of grievance_tickets_select (substrate v2) admits a
-- holder of custom_roles.role_key = 'icc_member' (via user_roles; is_active
-- is NOT checked there, so it is not checked here) for whom
-- role_has_institution_access(institution_id) is true. An
-- accreditation_committees row proves none of that, and no migration seeds or
-- assigns icc_member. InstaSolver calls this before leaving a harassment or
-- ragging complaint unassigned for the committee; false (or an error) sends it
-- privately to the superior-route person instead.
--
-- Institution access is UNDER-approximated on purpose — own college
-- (profiles.institution_id), an active user_institution_access grant, any
-- role with institution_scope = 'all', or profiles.is_super_admin. The CAS
-- sibling arm of role_has_institution_access is left out. Missing a real
-- reader only routes the complaint to the superior-route person, who can read
-- it (section 5); counting a non-reader would strand it.
--
-- The holder must also be a usable profile (fn_grievance_profile_unusable,
-- 20270420090000: active, login not disabled, not a test/placeholder), and
-- not p_exclude — the person filing, whose own complaint must not wait on
-- her alone.
CREATE OR REPLACE FUNCTION public.fn_grievance_icc_reader_exists(p_institution_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE cr.role_key = 'icc_member'
      AND public.fn_grievance_profile_unusable(ur.user_id, array_remove(ARRAY[p_exclude], NULL)) IS NULL
      AND (
        COALESCE(p.is_super_admin, false)
        OR p.institution_id = p_institution_id
        OR EXISTS (SELECT 1 FROM public.user_institution_access uia
                    WHERE uia.user_id = ur.user_id
                      AND uia.institution_id = p_institution_id
                      AND uia.is_active = true)
        OR EXISTS (SELECT 1 FROM public.user_roles ur2
                     JOIN public.custom_roles cr2 ON cr2.id = ur2.role_id
                    WHERE ur2.user_id = ur.user_id
                      AND cr2.institution_scope = 'all')
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_icc_reader_exists(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_icc_reader_exists(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_grievance_icc_reader_exists(uuid, uuid) IS
  'True when at least one usable icc_member holder (other than p_exclude) can read ICC-only grievance tickets of p_institution_id through the committee branch of grievance_tickets_select. Institution access deliberately under-approximated (own college, active user_institution_access grant, a role with institution_scope = all, super admin; no CAS sibling arm): a false negative only sends the complaint to the superior-route person. Called by the InstaSolver complaint route with the service-role client.';
