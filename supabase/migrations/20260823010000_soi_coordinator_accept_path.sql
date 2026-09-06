-- ============================================================================
-- School of Influence / cohort spine — CLOSE THE "A COORDINATOR CANNOT ACCEPT"
-- GAP.
--
-- Date: 2026-08-23   Ticket: coordinator-accept-path
--
-- WHAT WAS BROKEN
-- ---------------
-- 20260816020001 (PR #2918, applied) gave a `cohort_coordinators` appointment
-- READ/REVIEW rights: fn_soi_can_review_applications, fn_soi_can_manage_batch and
-- fn_soi_has_programme_access each grew an appointment branch beside the existing
-- permission branch. An appointed coordinator holding NO cohort.* permission key
-- can therefore open the queue and REJECT an application.
--
-- They still could not ACCEPT one, for two separate reasons, and fixing either
-- alone leaves the gap open:
--
--   1. RLS.  Every policy on public.cohort_memberships is keyed on a PERMISSION
--      ("cohort.create" / "cohort.view" / "cohort.edit" / "cohort.manage"), and
--      none of them consults the appointment. Enrolment runs under the CALLER's
--      RLS (SoiBatchService.addMember -> CohortService.createMembership, a plain
--      PostgREST insert), so the INSERT matched no policy.
--
--   2. THE COHERENCE GATE.  fn_soi_prepare_acceptance (added 20260808200000,
--      "defect 1") pre-checks those very same permission keys and raises 42501
--      BEFORE any write, precisely so the refusal is a sentence instead of an RLS
--      silence. A keyless appointed coordinator hits that gate first and never
--      reaches RLS at all. Relaxing only the policies would have moved the
--      failure, not removed it — the gate had to learn about appointments too.
--
-- DIRECTOR DECISIONS IMPLEMENTED HERE
-- -----------------------------------
-- A-CORE  An appointment branch is added BESIDE, never replacing, the existing
--         permission branch on the cohort_memberships INSERT / SELECT / UPDATE /
--         DELETE policies. Every existing branch keeps working; the policies keep
--         their names and their current expressions verbatim (read out of
--         pg_policy with pg_get_expr, not retyped from a spec), and are widened
--         with ALTER POLICY so their command and role list cannot drift.
--
-- A6      BATCH IS A LABEL ONLY. A coordinator appointed to one batch may act on
--         ANY batch of that programme. fn_is_cohort_coordinator ANDs on the
--         appointment's own cohort_id, so it is the WRONG predicate for these
--         policies. A sibling — fn_is_cohort_programme_coordinator — matches on
--         the PROGRAMME (the cohort's kind) and ignores the row's cohort_id
--         restriction. fn_is_cohort_coordinator itself is left untouched: three
--         other callers depend on its narrower meaning.
--
-- A1      REMOVAL IS RECORDED, and it is SOFT. fn_soi_remove_member sets the
--         membership to 'removed' — a value the live
--         cohort_memberships_status_check already admits, not a new one — and
--         writes a cohort_status_events row carrying who, why and the status it
--         moved from. No hard DELETE right is granted to coordinators: the row is
--         history (cohort-core/lifecycle.ts calls 'removed' the archived-
--         equivalent terminal and says the row is never deleted), and a DELETE
--         would destroy the audit trail this decision exists to create. A blank
--         reason raises 22023 in plain English.
--
-- A2      TRANSFER. soi.transfer_staff_only = true is read here as "not the
--         learners themselves" — i.e. a member cannot move their own place. An
--         appointed coordinator IS staff for this purpose and satisfies it. The
--         database floor is the UPDATE policy widened below; the readable refusal
--         stays in batch-service.ts, which keeps its existing cohort.manage check
--         and gains the appointment as an ALTERNATIVE. No second transfer
--         mechanism is introduced — CohortService.transferMembership remains the
--         only one.
--
-- A3      CAPACITY OVERRIDE, EXPLICIT AND RECORDED. fn_soi_prepare_acceptance
--         takes a new p_override_capacity boolean, DEFAULT false, so every
--         existing caller keeps today's refuse-when-full behaviour unchanged.
--         Passing true admits past soi.batch_capacity and writes a
--         'capacity_override' cohort_status_events row naming the actor, the
--         batch, the occupancy, the capacity and the application. Nothing ever
--         exceeds the limit silently.
--
-- A7      WAITING-LIST WARNING. fn_soi_waiting_counts reports, per batch, how
--         many people are already waiting, so the screen can say "N people are
--         already on the waiting list" BEFORE the coordinator confirms.
--         fn_soi_prepare_acceptance returns the same numbers, and the
--         batch-is-full refusal now names them too. Proceeding anyway is allowed
--         and recorded — this warns, it never blocks.
--
-- A4      DECISIONS CONTINUE AFTER CLOSE — ALREADY TRUE, VERIFIED, NOT CHANGED.
--         fn_soi_prepare_acceptance deliberately does not re-check the intake
--         window; its own comment says so ("the applicant applied while it was
--         open, and a coordinator must still be able to clear a queue after
--         applications close"). fn_soi_confirm_acceptance and
--         fn_soi_reject_application check no window either. The only place
--         closes_at is consulted is fn_soi_review_batches' `intake_open` /
--         `accepting_now`, which the accept path never gates on. No block was
--         found, so no block was removed.
--
-- A5      A DEPARTED COORDINATOR'S LEARNERS ARE UNTOUCHED — ALREADY TRUE,
--         VERIFIED, NOT CHANGED. REGRESSION NOTE: the departure path is
--         fn_cohort_coordinator_on_departure + trg_cohort_coordinator_on_departure.
--         Read in full on 2026-08-23: it writes cohort_coordinator_events and
--         UPDATEs cohort_coordinators, and touches NOTHING else. It contains no
--         reference to cohort_memberships. Ending an appointment ends the
--         appointment; the people that coordinator admitted keep their places.
--         Anyone editing that trigger must keep it that way.
--
-- A8      "ALREADY DECIDED" — ALREADY TRUE, VERIFIED, NOT REBUILT.
--         fn_soi_prepare_acceptance and fn_soi_reject_application both refuse a
--         non-(pending|waitlisted) application with "This application has already
--         been decided...". Left exactly as found.
--
-- NOT IN THIS MIGRATION, AND WHY
-- ------------------------------
-- fn_soi_can_review_applications admits ONLY programme-wide appointments
-- (cc.cohort_id IS NULL) to the review queue, with a written rationale: the queue
-- holds applicants who have no batch yet, so a batch-scoped appointment would be
-- handed every applicant of the whole event. That is a REVIEW-QUEUE decision and
-- is deliberately left standing. A6 is implemented where A6 was scoped — the
-- membership policies — so a batch-scoped coordinator can manage members across
-- their programme's batches. It does not silently re-open the review queue to
-- them. See the PR body: this is a real, reportable seam.
--
-- NO BEGIN/COMMIT IN THIS FILE. Supabase's migration runner wraps it, and an
-- inner COMMIT would defeat a BEGIN..ROLLBACK rehearsal against production.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. A6 — the programme-level sibling of fn_is_cohort_coordinator.
-- ---------------------------------------------------------------------------
-- Identical to fn_is_cohort_coordinator EXCEPT that it drops
--   AND (cc.cohort_id IS NULL OR cc.cohort_id = p_cohort_id)
-- so an appointment naming one batch still answers true for every batch of the
-- same programme. The programme (cc.programme_kind = c.kind) remains the
-- boundary: this never reaches another programme's cohorts.
--
-- No institution predicate, matching the appointment model established by
-- 20260816020001 (D9): an appointment is to a PROGRAMME, and a programme's
-- batches may span colleges.
CREATE OR REPLACE FUNCTION public.fn_is_cohort_programme_coordinator(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cohort_coordinators cc
    JOIN public.cohorts c ON c.id = p_cohort_id
    WHERE cc.user_id = (SELECT auth.uid())
      AND cc.status = 'active'
      AND cc.programme_kind = c.kind
  );
$function$;

COMMENT ON FUNCTION public.fn_is_cohort_programme_coordinator(uuid) IS
  'A6: true when the caller holds an ACTIVE cohort_coordinators appointment for the PROGRAMME this cohort belongs to, regardless of which batch the appointment names. Batch is a label, not a boundary. Use fn_is_cohort_coordinator instead when the appointment''s own cohort_id must be honoured.';

REVOKE EXECUTE ON FUNCTION public.fn_is_cohort_programme_coordinator(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_cohort_programme_coordinator(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. A-CORE — widen the four cohort_memberships permission policies.
-- ---------------------------------------------------------------------------
-- ALTER POLICY, not DROP+CREATE: it preserves the policy's name, its command and
-- its role list by construction, so none of those can be lost in transcription.
-- The expression on the left of each OR is the live expression, taken verbatim
-- from pg_get_expr(pg_policy) on 2026-08-23. Only the trailing
--   OR COALESCE(public.fn_is_cohort_programme_coordinator(...), false)
-- is new.
--
-- The four SoI-scoped siblings (cohort_memberships_soi_scoped_*) and
-- cohort_memberships_soi_member_select and cohort_memberships_foundations_self_insert
-- are NOT touched. RLS permissive policies are OR-ed, so widening these four is
-- sufficient, and leaving the others alone keeps this change auditable.
--
-- COALESCE is belt-and-braces: EXISTS never returns NULL, but a NULL anywhere in
-- a policy expression reads as "not permitted" rather than as an error, which is
-- the failure mode that hides bugs.

ALTER POLICY cohort_memberships_insert_permission ON public.cohort_memberships
  WITH CHECK (
    (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cohort.create'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
       FROM cohorts c
      WHERE ((c.id = cohort_memberships.cohort_id) AND role_has_institution_access(c.institution_id))))))
    OR COALESCE(public.fn_is_cohort_programme_coordinator(cohort_memberships.cohort_id), false)
  );

ALTER POLICY cohort_memberships_select_permission ON public.cohort_memberships
  USING (
    (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cohort.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
       FROM cohorts c
      WHERE ((c.id = cohort_memberships.cohort_id) AND role_has_institution_access(c.institution_id))))))
    OR COALESCE(public.fn_is_cohort_programme_coordinator(cohort_memberships.cohort_id), false)
  );

-- USING only. This policy's WITH CHECK is NULL today, and PostgreSQL then reuses
-- USING for the check on UPDATE — naming a WITH CHECK here would change that
-- shape, so it is deliberately left unset.
ALTER POLICY cohort_memberships_update_permission ON public.cohort_memberships
  USING (
    (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cohort.edit'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
       FROM cohorts c
      WHERE ((c.id = cohort_memberships.cohort_id) AND role_has_institution_access(c.institution_id))))))
    OR COALESCE(public.fn_is_cohort_programme_coordinator(cohort_memberships.cohort_id), false)
  );

ALTER POLICY cohort_memberships_delete_permission ON public.cohort_memberships
  USING (
    (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cohort.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
       FROM cohorts c
      WHERE ((c.id = cohort_memberships.cohort_id) AND role_has_institution_access(c.institution_id))))))
    OR COALESCE(public.fn_is_cohort_programme_coordinator(cohort_memberships.cohort_id), false)
  );


-- ---------------------------------------------------------------------------
-- 3. A7 — how many people are already waiting, per batch.
-- ---------------------------------------------------------------------------
-- Read-only. Gated on the same reviewer predicate as fn_soi_waiting_list, so it
-- exposes no count to anyone who could not already open the waiting list itself.
--
-- Three numbers per batch, because they answer different questions:
--   waiting_for_this_batch — people who asked for THIS batch
--   waiting_unassigned     — people waiting with no batch named (staff_assign)
--   waiting_total          — everyone waiting on the programme
-- Under soi.batch_choice_mode = 'staff_assign' (the live value) nobody names a
-- batch, so waiting_for_this_batch is 0 and the unassigned queue is the real one.
-- Returning all three keeps the warning honest under either mode.
CREATE OR REPLACE FUNCTION public.fn_soi_waiting_counts(p_event_id uuid)
RETURNS TABLE(
  cohort_id              uuid,
  batch_name             text,
  waiting_for_this_batch integer,
  waiting_unassigned     integer,
  waiting_total          integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to see the waiting list for this School of Influence programme. Ask a programme coordinator or an administrator.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH waiting AS (
    SELECT NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid AS batch_id
    FROM public.events_registrations r
    WHERE r.event_id = p_event_id
      AND r.source   = 'soi_apply'
      AND r.status   = 'waitlisted'
  ),
  totals AS (
    SELECT
      COUNT(*)::integer                                        AS all_waiting,
      COUNT(*) FILTER (WHERE batch_id IS NULL)::integer        AS unassigned
    FROM waiting
  )
  SELECT
    c.id,
    c.name,
    (SELECT COUNT(*)::integer FROM waiting w WHERE w.batch_id = c.id),
    t.unassigned,
    t.all_waiting
  FROM public.cohorts c
  CROSS JOIN totals t
  WHERE c.kind = 'school_of_influence'
    AND c.archived_at IS NULL
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
  ORDER BY c.name;
END;
$function$;

COMMENT ON FUNCTION public.fn_soi_waiting_counts(uuid) IS
  'A7: per-batch waiting-list sizes for one School of Influence programme, so the accept screen can warn "N people are already on the waiting list" before a coordinator confirms into a full batch. Warns; never blocks.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_waiting_counts(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_waiting_counts(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. A3 + the coherence gate — fn_soi_prepare_acceptance.
-- ---------------------------------------------------------------------------
-- DROP then CREATE, not CREATE OR REPLACE: the argument count changes, and
-- CREATE OR REPLACE would leave the old two-argument function in place as an
-- overload. `fn_soi_prepare_acceptance(a, b)` would then be AMBIGUOUS against
-- the new three-argument form's default, and every existing call would start
-- failing with 42725. Dropping first is the only safe order.
--
-- The body below is the live 20260808200000 body with exactly three changes,
-- each marked "A3"/"COHERENCE"/"A7". Everything else — D6 self-review, D2 choice
-- mode, the D10 already-a-member report, the member_type derivation, the
-- deliberate absence of an intake-window re-check (A4) — is unchanged.
DROP FUNCTION IF EXISTS public.fn_soi_prepare_acceptance(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_soi_prepare_acceptance(
  p_application_id   uuid,
  p_batch_cohort_id  uuid    DEFAULT NULL,
  p_override_capacity boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_default_choice_mode constant text := 'staff_assign';
  v_event        uuid;
  v_status       text;
  v_profile      uuid;
  v_name         text;
  v_requested    uuid;
  v_mode         text;
  v_target       uuid;
  v_batch        record;
  v_audiences    text[];
  v_member_type  text;
  v_existing        uuid;
  v_existing_cohort uuid;
  v_existing_batch  text;
  v_alternatives text;
  v_batch_institution uuid;
  v_missing           text[];
  -- ADDED 2026-08-23.
  v_is_coordinator boolean := false;   -- A6/A-CORE
  v_override_used  boolean := false;   -- A3
  v_waiting_batch  integer := 0;       -- A7
  v_waiting_total  integer := 0;       -- A7
BEGIN
  SELECT r.event_id, r.status, r.profile_id, r.participant_name,
         NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid,
         ARRAY(SELECT jsonb_array_elements_text(
                        COALESCE(r.custom_data -> 'soi' -> 'audiences', '[]'::jsonb)))
    INTO v_event, v_status, v_profile, v_name, v_requested, v_audiences
  FROM public.events_registrations r
  WHERE r.id = p_application_id
    AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists, or it was not made through the School of Influence apply form. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to accept applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution, or an appointment as a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- D6. Nobody marks their own homework, super admins included.
  IF v_profile IS NOT NULL AND v_profile = auth.uid() THEN
    RAISE EXCEPTION 'This is your own application, so you cannot decide it. Ask another coordinator or an administrator to look at it.'
      USING ERRCODE = '42501';
  END IF;

  -- A8, already true before this migration and left exactly as found.
  IF v_status NOT IN ('pending', 'waitlisted') THEN
    RAISE EXCEPTION 'This application has already been decided, so it cannot be accepted again. Reload the queue to see its current state.'
      USING ERRCODE = '22023';
  END IF;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'This application is not linked to a MyJKKN account, so nobody can be enrolled from it. Ask the applicant to apply again while signed in.'
      USING ERRCODE = '22023';
  END IF;

  -- D2, read at runtime.
  v_mode := public.fn_get_policy_text('soi.batch_choice_mode',
                                      c_default_choice_mode, NULL);
  IF v_mode IS DISTINCT FROM 'participant_choose'
     AND v_mode IS DISTINCT FROM 'staff_assign' THEN
    v_mode := c_default_choice_mode;
  END IF;

  IF v_mode = 'participant_choose' THEN
    IF v_requested IS NULL THEN
      RAISE EXCEPTION 'This applicant did not choose a batch, but this programme is set to let applicants choose their own. Either ask them to re-apply, or switch soi.batch_choice_mode to staff-assign in the programme settings so a coordinator can assign one.'
        USING ERRCODE = '22023';
    END IF;
    IF p_batch_cohort_id IS NOT NULL AND p_batch_cohort_id <> v_requested THEN
      RAISE EXCEPTION 'This programme lets applicants choose their own batch, so a reviewer can only confirm the batch this person asked for. To put them somewhere else, accept them first and then move them between batches — a transfer keeps their full history.'
        USING ERRCODE = '22023';
    END IF;
    v_target := v_requested;
  ELSE
    IF p_batch_cohort_id IS NULL THEN
      RAISE EXCEPTION 'Choose which batch this person joins before accepting them. This programme is set so that a coordinator assigns the batch.'
        USING ERRCODE = '22023';
    END IF;
    v_target := p_batch_cohort_id;
  END IF;

  SELECT * INTO v_batch
  FROM public.fn_soi_review_batches(v_event) b
  WHERE b.cohort_id = v_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That batch is not part of this programme. Reload the queue and pick one of the batches listed.'
      USING ERRCODE = '22023';
  END IF;

  -- A6/A-CORE. Resolved once, against the TARGET batch, and reused below.
  v_is_coordinator := COALESCE(
    public.fn_is_cohort_programme_coordinator(v_target), false);

  -- A7. How many people are ALREADY waiting — the applicant being decided is
  -- excluded, because they are not somebody this coordinator is queue-jumping.
  SELECT
    COUNT(*) FILTER (
      WHERE NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid = v_target
    )::integer,
    COUNT(*)::integer
    INTO v_waiting_batch, v_waiting_total
  FROM public.events_registrations r
  WHERE r.event_id = v_event
    AND r.source   = 'soi_apply'
    AND r.status   = 'waitlisted'
    AND r.id      <> p_application_id;

  -- ── COHERENCE GATE (added 2026-08-01, defect 1) ───────────────────────────
  -- Everything above authorises REVIEWING. The enrolment this function is
  -- clearing the way for runs under cohort_memberships' RLS as the coordinator.
  -- This gate names the missing keys BEFORE any write, so the refusal is a
  -- sentence rather than a bare 42501 from RLS later.
  --
  -- COHERENCE (2026-08-23): an appointed programme coordinator is now added to
  -- the skip list, because as of this migration the four cohort_memberships
  -- permission policies admit them WITHOUT any cohort.* key. Leaving them out
  -- would make this gate refuse the very caller RLS now allows — the gate would
  -- become the bug it was written to prevent. Super admin / admin keep their
  -- existing skip for exactly the same reason: they are the first disjunct of
  -- every one of those policies.
  IF NOT (COALESCE(public.is_super_admin(), false)
          OR COALESCE(public.is_admin(), false)
          OR v_is_coordinator) THEN

    SELECT c.institution_id INTO v_batch_institution
    FROM public.cohorts c
    WHERE c.id = v_target;

    v_missing := ARRAY[]::text[];

    IF NOT COALESCE(public.user_has_permission('cohort.create'), false) THEN
      v_missing := v_missing
        || 'the "cohort.create" permission, to give them a place in the batch';
    END IF;

    IF v_profile IS DISTINCT FROM auth.uid()
       AND NOT COALESCE(public.user_has_permission('cohort.view'), false) THEN
      v_missing := v_missing
        || 'the "cohort.view" permission, to read that place back once it exists';
    END IF;

    IF NOT COALESCE(public.role_has_institution_access(v_batch_institution), false) THEN
      v_missing := v_missing
        || format('access to the institution %s belongs to', v_batch.batch_name);
    END IF;

    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format(
          'You can review this programme''s applications, but you cannot enrol anyone into %s, so nothing was written and this application is untouched. Still needed: %s. Ask an administrator to add that to your role, or ask for an appointment as a coordinator of this programme.',
          v_batch.batch_name,
          array_to_string(v_missing, '; ')
        );
    END IF;
  END IF;

  -- D5 + A3 — the batch may have filled between apply and accept.
  --
  -- The intake WINDOW is deliberately not re-checked (A4): the applicant applied
  -- while it was open, and a coordinator must still be able to clear a queue
  -- after applications close.
  --
  -- A3: p_override_capacity defaults to false, so every caller that does not opt
  -- in gets exactly today's refusal. Opting in admits past the limit and RECORDS
  -- that it happened — who, which batch, how full it already was. Never silent.
  IF v_batch.is_full THEN
    IF NOT COALESCE(p_override_capacity, false) THEN
      SELECT string_agg(b2.batch_name, ', ' ORDER BY b2.batch_name) INTO v_alternatives
      FROM public.fn_soi_review_batches(v_event) b2
      WHERE b2.accepting_now AND b2.cohort_id <> v_target;

      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          '%s is full — it holds %s of %s places, and accepting this person would put it over. %s %s',
          v_batch.batch_name, v_batch.occupancy, v_batch.capacity,
          CASE
            WHEN v_alternatives IS NULL
            THEN 'No other batch has room either. Raise soi.batch_capacity for this batch in the programme settings, or tell the applicant about the next round.'
            ELSE 'These batches still have room: ' || v_alternatives || '.'
          END,
          CASE
            WHEN v_waiting_total > 0
            THEN format('%s %s already on the waiting list for this programme.',
                        v_waiting_total,
                        CASE WHEN v_waiting_total = 1 THEN 'person is' ELSE 'people are' END)
            ELSE ''
          END
        );
    END IF;

    v_override_used := true;

    -- Recorded on the BATCH (cohort_id), because no membership exists yet — the
    -- insert happens after this function returns. cohort_status_events'
    -- target CHECK is satisfied by cohort_id alone. If the enrolment that follows
    -- fails, this row still truthfully says an override was authorised, which is
    -- the fact A3 asks to be recorded.
    INSERT INTO public.cohort_status_events
      (cohort_id, membership_id, event_type, from_status, to_status,
       actor_id, reason, metadata)
    VALUES (
      v_target,
      NULL,
      'capacity_override',
      NULL,
      NULL,
      auth.uid(),
      format('Accepted past the batch limit: %s already held %s of %s places.',
             v_batch.batch_name, v_batch.occupancy, v_batch.capacity),
      jsonb_build_object(
        'application_id',   p_application_id,
        'applicant_profile_id', v_profile,
        'batch_cohort_id',  v_target,
        'batch_name',       v_batch.batch_name,
        'occupancy',        v_batch.occupancy,
        'capacity',         v_batch.capacity,
        'waiting_for_batch', v_waiting_batch,
        'waiting_total',     v_waiting_total,
        'by_appointment',    v_is_coordinator
      )
    );
  END IF;

  -- D10 — one active place per person per programme. Reported, not raised.
  SELECT m.id, m.cohort_id, c.name
    INTO v_existing, v_existing_cohort, v_existing_batch
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.member_ref = v_profile
    AND c.kind = 'school_of_influence'
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = v_event
    AND m.status NOT IN ('graduated', 'removed')
  LIMIT 1;

  v_member_type := CASE
                     WHEN 'learner' = ANY (v_audiences) THEN 'learner'
                     WHEN 'staff'   = ANY (v_audiences) THEN 'staff'
                     WHEN EXISTS (SELECT 1 FROM public.profiles p
                                   WHERE p.id = v_profile AND p.learner_id IS NOT NULL)
                       THEN 'learner'
                     ELSE 'staff'
                   END;

  RETURN jsonb_build_object(
    'ok',              true,
    'application_id',  p_application_id,
    'profile_id',      v_profile,
    'applicant_name',  v_name,
    'batch_cohort_id', v_target,
    'batch_name',      v_batch.batch_name,
    'member_type',     v_member_type,
    'batch_choice_mode', v_mode,
    'seats_left',      v_batch.capacity - v_batch.occupancy,
    'already_member',  (v_existing IS NOT NULL),
    'membership_id',   v_existing,
    'existing_batch_cohort_id', v_existing_cohort,
    'existing_batch_name',      v_existing_batch,
    -- ADDED 2026-08-23 so the screen can narrate what just happened (A3, A7).
    'batch_is_full',          v_batch.is_full,
    'occupancy',              v_batch.occupancy,
    'capacity',               v_batch.capacity,
    'capacity_override_used', v_override_used,
    'waiting_for_batch',      v_waiting_batch,
    'waiting_total',          v_waiting_total,
    'by_appointment',         v_is_coordinator
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid, boolean) IS
  'Step 1 of the School of Influence accept path: authorise, resolve the batch under the live choice mode, and re-check capacity. 2026-08-23: an appointed programme coordinator now passes the coherence gate without any cohort.* key (the membership policies admit them), p_override_capacity allows a RECORDED accept past soi.batch_capacity, and the payload carries the waiting-list counts. The intake window is deliberately NOT re-checked — a coordinator must be able to clear the queue after applications close.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. A1 — remove a member, softly, with a recorded reason.
-- ---------------------------------------------------------------------------
-- SOFT, not DELETE. 'removed' is already in cohort_memberships_status_check, and
-- cohort-core/lifecycle.ts documents it as the archived-equivalent terminal whose
-- row is kept as history. A hard delete would erase the very trail this decision
-- exists to create, and would cascade the row's cohort_status_events with it.
--
-- Authorisation is fn_soi_can_manage_batch — which 20260816020001 already widened
-- with an appointment branch and which pins kind = 'school_of_influence' — OR the
-- new programme-level predicate.
--
-- BOTH, because fn_soi_can_manage_batch's appointment branch calls
-- fn_is_cohort_coordinator, which is BATCH-scoped: a coordinator appointed to
-- Batch C is refused on Batch A. Measured against production on 2026-08-23, in
-- the very rehearsal that proved the policies: the INSERT succeeded and this
-- function still raised 42501. A6 says batch is a label only and removal is a
-- membership operation, so the programme-level branch is added BESIDE the
-- existing one rather than replacing it — every caller who passes today still
-- passes.
--
-- SECURITY DEFINER because the audit write must not be skippable: a caller who
-- could UPDATE the membership under RLS but not INSERT the event would otherwise
-- produce a removal with no record. Both writes happen here or neither does.
CREATE OR REPLACE FUNCTION public.fn_soi_remove_member(
  p_membership_id uuid,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cohort   uuid;
  v_batch    text;
  v_status   text;
  v_ref      uuid;
  v_reason   text;
  v_who      text;
BEGIN
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  -- A1 — the reason is not optional, and the refusal says why in plain words.
  -- Checked FIRST, before anything is looked up, so a blank reason can never be
  -- the thing that happens to work on a row the caller could not otherwise touch.
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Write why this person is being removed from the batch. The reason is kept on their record so anyone reviewing it later can see who decided and why.'
      USING ERRCODE = '22023';
  END IF;

  SELECT m.cohort_id, c.name, m.status, m.member_ref
    INTO v_cohort, v_batch, v_status, v_ref
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.id = p_membership_id
    AND c.kind = 'school_of_influence';

  IF v_cohort IS NULL THEN
    RAISE EXCEPTION 'That place no longer exists, or it is not a School of Influence place. Reload the batch and try again.'
      USING ERRCODE = '22023';
  END IF;

  -- A6: the second disjunct is what admits a coordinator appointed to a
  -- DIFFERENT batch of the same programme. Without it this function refuses the
  -- exact caller the membership policies above now allow.
  IF NOT (COALESCE(public.fn_soi_can_manage_batch(v_cohort), false)
          OR COALESCE(public.fn_is_cohort_programme_coordinator(v_cohort), false)) THEN
    RAISE EXCEPTION 'You do not have permission to remove somebody from this batch. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution, or an appointment as a coordinator of this programme.'
      USING ERRCODE = '42501';
  END IF;

  -- The lifecycle map (cohort-core/lifecycle.ts) makes graduated and removed
  -- terminal. Re-removing somebody would write a second audit row claiming a
  -- transition that did not happen.
  IF v_status IN ('graduated', 'removed') THEN
    RAISE EXCEPTION 'This place is already closed (%), so there is nothing to remove. Reload the batch to see its current state.', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.cohort_memberships m
     SET status = 'removed',
         config = COALESCE(m.config, '{}'::jsonb)
                  || jsonb_build_object('removal', jsonb_build_object(
                       'reason',      v_reason,
                       'removed_by',  auth.uid(),
                       'removed_at',  now(),
                       'from_status', v_status
                     )),
         updated_at = now()
   WHERE m.id = p_membership_id;

  INSERT INTO public.cohort_status_events
    (cohort_id, membership_id, event_type, from_status, to_status,
     actor_id, reason, metadata)
  VALUES (
    v_cohort, p_membership_id, 'status_change', v_status, 'removed',
    auth.uid(), v_reason,
    jsonb_build_object(
      'source',     'fn_soi_remove_member',
      'batch_name', v_batch,
      'member_ref', v_ref
    )
  );

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'This person')
    INTO v_who
  FROM public.profiles p
  WHERE p.id = v_ref;

  RETURN jsonb_build_object(
    'ok',            true,
    'membership_id', p_membership_id,
    'cohort_id',     v_cohort,
    'batch_name',    v_batch,
    'from_status',   v_status,
    'status',        'removed',
    'reason',        v_reason,
    'message',       format('%s has been removed from %s, and the reason you wrote is on their record.',
                            COALESCE(v_who, 'This person'), v_batch)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_soi_remove_member(uuid, text) IS
  'A1: soft-remove one School of Influence member — status becomes ''removed'' (an existing CHECK value), the row is KEPT as history, and who/why lands in cohort_status_events plus the membership''s own config. A blank reason raises 22023. Authorised by fn_soi_can_manage_batch, so an appointed coordinator qualifies without a cohort.* key.';

-- Destructive-shaped, so the grant is asserted below rather than assumed.
-- Supabase's ALTER DEFAULT PRIVILEGES gives `authenticated` a DIRECT EXECUTE
-- grant that a revoke FROM PUBLIC does NOT remove, so `authenticated` is revoked
-- explicitly here and then re-granted deliberately: a coordinator IS an
-- authenticated user, and the function does its own authorisation internally.
REVOKE EXECUTE ON FUNCTION public.fn_soi_remove_member(uuid, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_soi_remove_member(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. ASSERT the result. A revoke that did not take must fail the migration, not
--    be discovered months later by an audit.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_fn   text;
  v_fns  text[] := ARRAY[
    'public.fn_is_cohort_programme_coordinator(uuid)',
    'public.fn_soi_waiting_counts(uuid)',
    'public.fn_soi_prepare_acceptance(uuid,uuid,boolean)',
    'public.fn_soi_remove_member(uuid,text)'
  ];
  v_pol  record;
BEGIN
  -- Every function exists, anon cannot execute it, authenticated can.
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'ASSERT FAILED: % is not present after this migration.', v_fn;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAILED: anon can still EXECUTE % — the revoke did not take.', v_fn;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       AND NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAILED: authenticated cannot EXECUTE % — the grant did not take.', v_fn;
    END IF;
  END LOOP;

  -- The old two-argument prepare must be GONE, or every existing call is
  -- ambiguous against the new three-argument default.
  IF to_regprocedure('public.fn_soi_prepare_acceptance(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: the two-argument fn_soi_prepare_acceptance still exists; calls would be ambiguous.';
  END IF;

  -- All four policies now mention the appointment helper, and all four still
  -- mention the permission key they started with. Both halves are asserted
  -- because "beside, never replacing" is the decision — a widened policy that
  -- lost its original branch would pass a naive existence check.
  FOR v_pol IN
    SELECT * FROM (VALUES
      ('cohort_memberships_insert_permission', 'cohort.create'),
      ('cohort_memberships_select_permission', 'cohort.view'),
      ('cohort_memberships_update_permission', 'cohort.edit'),
      ('cohort_memberships_delete_permission', 'cohort.manage')
    ) AS t(polname, permkey)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = 'public.cohort_memberships'::regclass
        AND p.polname  = v_pol.polname
        AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
             || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
            LIKE '%fn_is_cohort_programme_coordinator%'
    ) THEN
      RAISE EXCEPTION 'ASSERT FAILED: policy % was not widened with the appointment branch.', v_pol.polname;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = 'public.cohort_memberships'::regclass
        AND p.polname  = v_pol.polname
        AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
             || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
            LIKE '%' || v_pol.permkey || '%'
    ) THEN
      RAISE EXCEPTION 'ASSERT FAILED: policy % lost its "%" permission branch — the appointment must sit BESIDE it, not replace it.', v_pol.polname, v_pol.permkey;
    END IF;
  END LOOP;

  -- A5 regression guard. The departure trigger must never learn to touch
  -- memberships: ending an appointment ends the appointment, and the people that
  -- coordinator admitted keep their places.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_cohort_coordinator_on_departure'
      AND p.prosrc ILIKE '%cohort_memberships%'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: fn_cohort_coordinator_on_departure now references cohort_memberships. A departing coordinator must not disturb the learners they admitted (A5).';
  END IF;

  RAISE NOTICE 'coordinator-accept-path: all assertions passed.';
END;
$assert$;
