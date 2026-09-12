-- ============================================================================
-- COHORT STATUS CHANGE — the human control, and its record
-- Created: 2026-09-07
-- ============================================================================
-- WHAT THIS IS FOR
--   public.cohort_status_events has carried the full audit shape since
--   20260731040000_cohort_core_spine.sql (cohort_id, membership_id, event_type,
--   from_status, to_status, actor_id, reason, metadata, created_at) and holds
--   ZERO rows for a cohort-level change, because no screen anywhere moves a
--   cohort from one status to the next. Measured on production 2026-09-07:
--   10 cohorts, 392 memberships, 0 status events.
--
--   Meanwhile the three School of Influencer batches still say 'enrolling'
--   although intake ends 12 September (Batch A 35 members, Batch B 35,
--   Batch C 0). There is no way for the person running the programme to say
--   "this batch has started" or "this round is over" — and no way for anyone
--   reading it later to see who decided that, or why.
--
--   This file adds a database path that moves a cohort's status and cannot move
--   one without recording the reason, and repoints the application at it.
--
--   IT IS THE ONLY PATH IN THIS CODEBASE, NOT THE ONLY PATH THE DATABASE ALLOWS.
--   cohorts_update_permission and cohorts_soi_scoped_update still permit a
--   direct UPDATE of the status column by anyone they admit, and this file adds
--   no column-level REVOKE and no trigger — a REVOKE UPDATE (status) would also
--   block the archived_at/archived_by writes those same policies exist for, and
--   deciding that belongs with the spine, not with one screen's control. What
--   this change does enforce is at the layer it owns: UpdateCohortDto no longer
--   carries `status` (lib/types/cohort-core.ts), so no typed caller of
--   CohortService.updateCohort can move a cohort's stage by accident, and
--   transitionCohortStatus is the one method that can.
--
-- WHY AN RPC AND NOT A PLAIN TABLE UPDATE
--   lib/services/cohort-core/cohort-service.ts already has
--   transitionCohortStatus(), which does an UPDATE on cohorts followed by a
--   BEST-EFFORT insert into cohort_status_events inside a try/catch that
--   swallows failures. PostgREST gives a browser client no transaction, so
--   those two writes can diverge: the status moves and the reason is lost —
--   exactly the failure this control exists to prevent. Three things only a
--   function can give:
--
--     1. ATOMIC. The event and the status change are one statement pair in one
--        transaction. A cohort cannot end up moved with nothing saying why.
--     2. THE ACTOR CANNOT BE FORGED. recordStatusEvent() takes actor_id from
--        its caller. Here it is auth.uid(), read server-side.
--     3. THE PEOPLE WHO RUN A BATCH CAN REACH IT. cohorts_update_permission
--        admits super admins, admins, and holders of 'cohort.edit' scoped to
--        the institution. It has NO coordinator branch — so the coordinator
--        this platform appointed to run a School of Influencer batch, who may
--        already remove somebody from it through fn_soi_remove_member, could
--        not close the batch they run. Widening the table policy would widen it
--        for every cohort kind; a function scoped to this one decision does not.
--
--   transitionCohortStatus() is REPOINTED at fn_cohort_set_status in the same
--   change, so there is exactly one path, not a second mechanism beside an
--   unused first one.
--
-- WHAT IS DELIBERATELY NOT HERE
--   • NO automatic advance. Every row written here is the result of a person
--     choosing a status and typing a reason. Nothing in this file runs on a
--     schedule, and there is no trigger that moves a cohort on a date.
--   • NO decision about Batch C. Four School of Influencer applications are
--     still pending and the gate shuts 12 September; if they are accepted,
--     Batch C is where they would go. This file builds the control and leaves
--     the decision to a human, which is the whole point of it.
--   • NO new status. The five values and the moves between them are the spine's
--     (cohorts_status_check + lib/services/cohort-core/lifecycle.ts).
--
-- SECURITY
--   All four functions are REVOKEd from anon and PUBLIC and GRANTed to
--   authenticated in this same file — Supabase's ALTER DEFAULT PRIVILEGES gives
--   anon a direct EXECUTE grant separate from PUBLIC, so revoking PUBLIC alone
--   ships an anon-callable function (CLAUDE.md, "Lock new RPCs from anon").
--   The three SECURITY DEFINER functions each authorise through a real
--   predicate — is_super_admin / is_admin / user_has_permission +
--   role_has_institution_access, or the programme's own
--   fn_soi_can_manage_batch — never a bare auth.uid() test.
--
-- NOT APPLIED TO ANY DATABASE. Migrations ship as files here; applying is a
-- separate, Director-gated step. Until it is applied the control is inert: the
-- screen reads can_change=false and says so, rather than half-working.
-- ============================================================================

-- ── 1. The transition map, in SQL ─────────────────────────────────────────────
-- The same edges as COHORT_TRANSITIONS in lib/services/cohort-core/lifecycle.ts:
--   draft → enrolling | archived
--   enrolling → active | archived
--   active → completed | archived
--   completed → archived
--   archived → (terminal)
-- Written once and read by both functions below, so the rule that decides which
-- buttons a screen offers and the rule that decides whether a change is legal
-- can never drift apart. IMMUTABLE and side-effect-free: it is a lookup table
-- expressed as a function, not an authorization decision, so it is deliberately
-- NOT security definer.
CREATE OR REPLACE FUNCTION public.fn_cohort_next_statuses(p_from text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'draft'     THEN ARRAY['enrolling', 'archived']
    WHEN 'enrolling' THEN ARRAY['active', 'archived']
    WHEN 'active'    THEN ARRAY['completed', 'archived']
    WHEN 'completed' THEN ARRAY['archived']
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.fn_cohort_next_statuses(text) IS
  'Legal next values of cohorts.status from p_from. Mirrors COHORT_TRANSITIONS in lib/services/cohort-core/lifecycle.ts. Terminal statuses return an empty array.';

-- ── 2. Who may move a cohort's status ─────────────────────────────────────────
-- ONE definition of the predicate, used by the reader and the writer below, so
-- the verdict a screen renders and the verdict the write enforces are the same
-- sentence evaluated twice — never two sentences that drift.
--
-- Branch 1 mirrors cohorts_update_permission (20260731040000): a super admin,
-- an admin, or 'cohort.edit' scoped to the cohort's institution.
--
-- public.cohorts has TWO UPDATE policies, OR'd by Postgres, not one — the
-- second is cohorts_soi_scoped_update (20260808140000): kind =
-- 'school_of_influence' AND 'cohort.school_of_influence.edit' AND institution
-- access. Branch 2 therefore carries a '.edit' arm as well as the '.manage'
-- ones, so that "anyone who could already UPDATE the row directly still can"
-- is true of BOTH policies and this function is never NARROWER than the table
-- it writes to. (Live blast radius today is zero: measured on production
-- 2026-09-07, ZERO of the 104 roles in custom_roles grant
-- 'cohort.school_of_influence.edit' — the roles that carry the key at all carry
-- it set to false. The arm is here so the sentence above stays true when a role
-- is edited in Role Management, which is a live value, not a deployment.)
--
-- Branch 2 is School of Influencer only, and it is the reason this exists: it
-- admits the appointed coordinator, who holds no permission key at all.
-- fn_soi_can_manage_batch is already pinned to kind='school_of_influence'
-- internally, and fn_is_cohort_programme_coordinator is the sibling-batch case
-- (decision A6 — a batch is a label, so an appointment to one batch carries
-- across the programme). These are the SAME two predicates fn_soi_remove_member
-- checks, in the same order: somebody who may close one person's place may
-- close the batch that place is in.
--
-- No other kind gets a branch. sf100, foundations, cdc, trainer, mba_associate
-- and the resident cohorts are governed by branch 1 alone until their own
-- programme authority is written, which fails CLOSED.
CREATE OR REPLACE FUNCTION public.fn_cohort_can_set_status(p_cohort_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inst uuid;
  v_kind text;
BEGIN
  SELECT c.institution_id, c.kind
    INTO v_inst, v_kind
  FROM public.cohorts c
  WHERE c.id = p_cohort_id;

  -- A cohort nobody can name is a cohort nobody may move.
  IF v_inst IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.is_super_admin(), false)
     OR COALESCE(public.is_admin(), false)
     OR (COALESCE(public.user_has_permission('cohort.edit'), false)
         AND COALESCE(public.role_has_institution_access(v_inst), false)) THEN
    RETURN true;
  END IF;

  IF v_kind = 'school_of_influence' THEN
    RETURN COALESCE(public.fn_soi_can_manage_batch(p_cohort_id), false)
        OR COALESCE(public.fn_is_cohort_programme_coordinator(p_cohort_id), false)
        -- The second UPDATE policy on the table, mirrored: see the note above.
        OR (COALESCE(public.user_has_permission('cohort.school_of_influence.edit'), false)
            AND COALESCE(public.role_has_institution_access(v_inst), false));
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.fn_cohort_can_set_status(uuid) IS
  'May the signed-in caller change this cohort''s status? Mirrors cohorts_update_permission, plus the School of Influencer coordinator path. The single predicate behind fn_cohort_status_control and fn_cohort_set_status.';

-- ── 3. What the screen needs to render the control ────────────────────────────
-- Returns the caller's verdict, the moves that are legal from here, and the
-- change history with the actor resolved to a name.
--
-- THE VERDICT IS A VALUE, NOT AN EXCEPTION, so a screen can say "you do not
-- have access, ask X" instead of showing an empty history that looks exactly
-- like a cohort nobody has ever changed (CLAUDE.md rule 27).
--
-- IT RETURNS NOTHING ABOUT THE COHORT ITSELF when the caller may not change it
-- — no name, no status, no counts. The screen already holds the cohort row it
-- read under RLS; this function's job is the verdict and the audit, so a
-- refusal leaks neither.
--
-- WHY THE HISTORY IS READ HERE AND NOT FROM THE TABLE. cohort_status_events'
-- SELECT policy requires 'cohort.view'. An appointed coordinator holds no
-- permission key, so reading the table directly would hand exactly the person
-- allowed to change the status an empty list where their own change should be.
CREATE OR REPLACE FUNCTION public.fn_cohort_status_control(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status  text;
  v_history jsonb;
BEGIN
  IF NOT COALESCE(public.fn_cohort_can_set_status(p_cohort_id), false) THEN
    RETURN jsonb_build_object(
      'can_change',    false,
      'status',        NULL,
      'next_statuses', '[]'::jsonb,
      'history',       '[]'::jsonb
    );
  END IF;

  SELECT c.status INTO v_status
  FROM public.cohorts c
  WHERE c.id = p_cohort_id;

  -- Newest first, and capped: this is a decision log, not a data export. A
  -- cohort accumulates at most a handful of status changes in its life, so 100
  -- is a ceiling nothing legitimate reaches rather than a page size.
  SELECT COALESCE(jsonb_agg(row_to_json(h)::jsonb ORDER BY h.created_at DESC), '[]'::jsonb)
    INTO v_history
  FROM (
    SELECT e.id,
           e.event_type,
           e.from_status,
           e.to_status,
           e.reason,
           e.created_at,
           e.actor_id,
           NULLIF(btrim(COALESCE(p.full_name, '')), '') AS actor_name
    FROM public.cohort_status_events e
    LEFT JOIN public.profiles p ON p.id = e.actor_id
    WHERE e.cohort_id = p_cohort_id
      AND e.membership_id IS NULL
    ORDER BY e.created_at DESC
    LIMIT 100
  ) h;

  RETURN jsonb_build_object(
    'can_change',    true,
    'status',        v_status,
    'next_statuses', to_jsonb(public.fn_cohort_next_statuses(v_status)),
    'history',       v_history
  );
END;
$$;

COMMENT ON FUNCTION public.fn_cohort_status_control(uuid) IS
  'Verdict + legal next statuses + cohort-level change history (actor resolved to a name) for one cohort. Returns can_change=false rather than raising, so a screen can render an explicit refusal.';

-- ── 4. The change itself ──────────────────────────────────────────────────────
-- A status change is a HUMAN DECISION with a WRITTEN REASON, recorded as one
-- indivisible act.
--
-- THE REASON IS CHECKED FIRST, before anything is looked up, so a blank reason
-- can never be the thing that happens to succeed on a cohort the caller could
-- not otherwise touch.
--
-- RECORD FIRST, THEN MOVE — the same order as
-- fn_cohort_coordinator_close_ended_programmes and fn_soi_remove_member. Both
-- statements are in this function's transaction, so a failure at either end
-- rolls back both: there is no state in which the status moved and no row says
-- why, and none in which an event claims a move that did not happen.
--
-- THE ROW IS LOCKED. Two coordinators reading "enrolling" at the same moment
-- would otherwise both write an event claiming they moved it from 'enrolling',
-- and one of those two records would be false.
-- p_event_type exists ONLY so the round-close path (CohortService.closeCohort)
-- keeps labelling its own container move 'round_close', as it does today. It is
-- checked against a two-value allowlist rather than written through: an audit
-- table whose event_type is free text from the caller is a table anyone can put
-- words into.
CREATE OR REPLACE FUNCTION public.fn_cohort_set_status(
  p_cohort_id  uuid,
  p_to_status  text,
  p_reason     text,
  p_event_type text DEFAULT 'status_change'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason   text;
  v_to       text;
  v_from     text;
  v_name     text;
  v_kind     text;
  v_event    uuid;
  v_type     text;
  v_total    integer;
  v_holding  integer;
BEGIN
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_to     := NULLIF(btrim(COALESCE(p_to_status, '')), '');
  v_type   := COALESCE(NULLIF(btrim(COALESCE(p_event_type, '')), ''), 'status_change');

  IF v_type NOT IN ('status_change', 'round_close') THEN
    RAISE EXCEPTION 'Unknown change type "%". A cohort status change is recorded as either status_change or round_close.', v_type
      USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Write why this group is moving to a new stage. The reason is kept with the change so anyone reading it later can see who decided and why.'
      USING ERRCODE = '22023';
  END IF;

  -- A reason nobody will read is not a reason. The cap is generous and only
  -- stops a paste of an entire document into an audit column.
  IF length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'That reason is too long. Keep it under 2000 characters — a sentence or two saying what changed and why.'
      USING ERRCODE = '22023';
  END IF;

  -- Authority BEFORE existence, deliberately. This function is SECURITY
  -- DEFINER, so it reads past RLS; answering "no such cohort" to an
  -- unauthorised caller would turn it into a way to test which ids exist.
  IF NOT COALESCE(public.fn_cohort_can_set_status(p_cohort_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to change this group''s stage, or it is no longer there. Changing it needs the "cohort.edit" permission for the institution that runs it — or, for a School of Influencer batch, "cohort.manage" or an appointment as one of its coordinators. Ask a MyJKKN administrator.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.status, c.name, c.kind
    INTO v_from, v_name, v_kind
  FROM public.cohorts c
  WHERE c.id = p_cohort_id
  FOR UPDATE;

  IF v_from IS NULL THEN
    RAISE EXCEPTION 'That group no longer exists. Reload the page and try again.'
      USING ERRCODE = '22023';
  END IF;

  IF v_to IS NULL OR NOT (v_to = ANY (public.fn_cohort_next_statuses(v_from))) THEN
    RAISE EXCEPTION 'A group at "%" cannot move to "%". From "%" the only next stages are: %.',
      v_from, COALESCE(v_to, '(nothing chosen)'), v_from,
      COALESCE(NULLIF(array_to_string(public.fn_cohort_next_statuses(v_from), ', '), ''),
               'none — this is the last stage')
      USING ERRCODE = '22023';
  END IF;

  -- The size of the group AT THE MOMENT OF THE DECISION. Membership keeps
  -- changing afterwards, so a count read later cannot answer "how many people
  -- were in it when this was closed?" — this is the only chance to record it.
  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE m.status NOT IN ('graduated', 'removed'))::integer
    INTO v_total, v_holding
  FROM public.cohort_memberships m
  WHERE m.cohort_id = p_cohort_id;

  INSERT INTO public.cohort_status_events
    (cohort_id, membership_id, event_type, from_status, to_status,
     actor_id, reason, metadata)
  VALUES (
    p_cohort_id, NULL, v_type, v_from, v_to,
    auth.uid(), v_reason,
    jsonb_build_object(
      'source',                 'fn_cohort_set_status',
      'cohort_name',            v_name,
      'kind',                   v_kind,
      'members_total',          COALESCE(v_total, 0),
      'members_holding_place',  COALESCE(v_holding, 0)
    )
  )
  RETURNING id INTO v_event;

  -- archived_at / archived_by are the spine's own columns and are stamped only
  -- on the move that earns them; every other move leaves them exactly as they
  -- were, so re-archiving cannot rewrite who archived it first.
  UPDATE public.cohorts c
     SET status      = v_to,
         archived_at = CASE WHEN v_to = 'archived' THEN now()        ELSE c.archived_at END,
         archived_by = CASE WHEN v_to = 'archived' THEN auth.uid()   ELSE c.archived_by END
   WHERE c.id = p_cohort_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'cohort_id',   p_cohort_id,
    'cohort_name', v_name,
    'from_status', v_from,
    'to_status',   v_to,
    'reason',      v_reason,
    'event_id',    v_event,
    'message',     format('%s is now at "%s", and the reason you wrote is on the record.',
                          v_name, v_to)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_cohort_set_status(uuid, text, text, text) IS
  'Move one cohort to its next status with a written reason, recording a cohort_status_events row (from_status, to_status, actor_id = auth.uid(), reason) in the same transaction. The only path the APPLICATION uses to change cohorts.status; the table''s UPDATE policies still permit a direct write, so this is a convention enforced in the service layer, not a database lock.';

-- ── 5. The read side, without which none of the above is reachable ───────────
-- A control the person it was built for cannot get to is not a control.
--
-- Measured on production 2026-09-07, the appointed coordinator (the single
-- status='active' row in cohort_coordinators) passes every write predicate
-- above — fn_soi_can_manage_batch, fn_is_cohort_programme_coordinator and
-- fn_cohort_can_set_status all return true for Batch A — and yet
-- `SELECT count(*) FROM public.cohorts` returns ZERO for them, because none of
-- the three SELECT policies on the table has a coordinator branch:
--   • cohorts_select_permission    needs 'cohort.view'
--   • cohorts_soi_scoped_select    needs 'cohort.school_of_influence.view'
--   • cohorts_soi_member_select    needs a cohort_memberships row
-- A coordinator holds no permission key (that is the whole premise of the
-- appointment) and is not a member of the batch they run. So the batch list on
-- the members screen comes back empty, no batch can be selected, and the card
-- added by this change never renders. The write authority was granted to
-- somebody who cannot see the thing it acts on.
--
-- WHY A POLICY AND NOT A WIDER PERMISSION. Handing the coordinator
-- 'cohort.view' would let them read every cohort of every kind in the
-- institution. fn_is_cohort_programme_coordinator is already pinned to the
-- programme they were appointed to (cc.programme_kind = c.kind), so this
-- policy shows them their own programme's cohorts and nothing else, and it
-- fails CLOSED: no active appointment row, no rows.
--
-- IT IS EXACTLY AS WIDE AS THE APPOINTMENT, NOT AS WIDE AS THE WRITE. Reading
-- is the narrower act; a coordinator of a non-SoI programme may see the cohorts
-- they coordinate here even though fn_cohort_can_set_status still refuses to
-- move them (branch 2 is School of Influencer only). Seeing is not changing.
DROP POLICY IF EXISTS cohorts_coordinator_select ON public.cohorts;
CREATE POLICY cohorts_coordinator_select ON public.cohorts
FOR SELECT TO authenticated
USING (public.fn_is_cohort_programme_coordinator(id));

COMMENT ON POLICY cohorts_coordinator_select ON public.cohorts IS
  'An appointed programme coordinator may READ the cohorts of the programme they were appointed to. Added 2026-09-07 with fn_cohort_set_status: the coordinator passed every write predicate and still saw zero cohorts, so the status control never rendered for the one person it exists for.';

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
-- anon is revoked EXPLICITLY as well as PUBLIC: Supabase's default privileges
-- give anon a direct EXECUTE grant on every new function, separate from its
-- PUBLIC membership, so revoking PUBLIC alone leaves the function callable by
-- any holder of the public anon key.
REVOKE EXECUTE ON FUNCTION public.fn_cohort_next_statuses(text)                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_can_set_status(uuid)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_status_control(uuid)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_set_status(uuid, text, text, text) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_cohort_next_statuses(text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_can_set_status(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_status_control(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_set_status(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
