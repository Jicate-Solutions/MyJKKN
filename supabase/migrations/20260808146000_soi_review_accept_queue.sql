-- ============================================================================
-- SCHOOL OF INFLUENCE — coordinator review & accept queue (S5)
-- Created: 2026-07-31  (spec: specs/school-of-influence-batches-2026-07-30.md, §7 S5)
-- ============================================================================
-- Decisions implemented here (spec §2):
--   D2  Who picks the batch is CONFIGURABLE. Under 'staff_assign' the REVIEWER
--       names the batch at accept time; under 'participant_choose' the applicant
--       already named it and the reviewer only confirms it. Read at runtime from
--       soi.batch_choice_mode — never assumed, never hardcoded.
--   D3  Apply → a coordinator reviews → accepted. Submitting is NOT enrolment;
--       this file is where enrolment is authorised.
--   D5  A batch that filled between apply and accept REFUSES, in words, naming
--       the batches that still have room. It never silently over-fills.
--   D12 A rejection carries the coordinator's actual reason, stored on the
--       applicant's OWN registration row so their own view can show it verbatim.
--
-- NO NEW TABLE, NO NEW COLUMN, NO NEW RLS POLICY, NO CHECK-CONSTRAINT CHANGE.
--   Applications are public.events_registrations rows written by S4
--   (source = 'soi_apply'); the decision is recorded in that row's existing
--   status column and its existing custom_data jsonb. Widening the shared
--   events_registrations status CHECK to add 'accepted'/'rejected' was
--   considered and rejected: that CHECK is shared with the marathon and
--   tournament surfaces, and the vocabulary it already admits says everything
--   this section needs to say (see "STATUS VOCABULARY" below).
--
-- WHY EVERYTHING GOES THROUGH SECURITY DEFINER RPCs (measured from the policy
-- catalogue in supabase/migrations/rls_initplan_wrap_sweep.sql, 2026-07-31)
--   events_registrations' own policies do not fit this reviewer:
--     • events_reg_admin_read / events_reg_admin_update gate on HARDCODED role
--       names — super_admin, admin, administrator, event_coordinator. A School
--       of Influence coordinator holds cohort.manage and is none of those, so a
--       direct UPDATE matches no policy and silently affects ZERO ROWS. An
--       "accepted" toast over an unchanged row is precisely the failure spec §5
--       forbids.
--     • events_reg_institution_read admits any authenticated caller from the
--       same institution. Using it as the queue's read basis would be wrong in
--       BOTH directions: it lets people who are not coordinators read
--       applications, and — because S4 deliberately admits applicants from any
--       JKKN institution — it HIDES cross-college applicants from the reviewer.
--       A silently short queue is a wrong list, not a safe one.
--   So this file adds no policy (widening those would hand every marathon and
--   tournament register to SoI coordinators) and authorises inside narrow
--   DEFINER functions that can only ever see applications of a School of
--   Influence programme the caller administers.
--
--   The one path deliberately left OUTSIDE these functions is the membership
--   write itself. Enrolment goes through SoiBatchService.addMember() →
--   CohortService.createMembership() on the client, under the spine's own RLS,
--   so assertMemberIdentity(), the lifecycle transition map, the
--   cohort_status_events audit trail and D10's unique index all apply unchanged.
--   Re-implementing the insert here would be a second enrolment path and exactly
--   the shape that let SF100 admit 23 fabricated humans (audit 2026-07-27).
--
-- STATUS VOCABULARY — decided against the existing CHECK, not invented
--   events_registrations.status admits
--   pending / registered / confirmed / checked_in / cancelled / disqualified /
--   no_show / waitlisted. apply-service.ts treats 'pending' and 'waitlisted' as
--   "still under review" and everything else as "already dealt with".
--     • ACCEPTED  → 'confirmed'.   A coordinator confirmed the application. The
--       applicant then holds a membership, so their apply page refuses with
--       'already_member' ("You already have a place in Batch A") — the truest
--       sentence available.
--     • REJECTED  → 'disqualified'. This is the only admitted status that is
--       both terminal AND not in apply-service's REAPPLIABLE list. 'cancelled'
--       was rejected for this: apply-service treats a cancelled application as
--       withdrawn and lets the person apply again immediately, which would erase
--       the decision from their view within one click and make D12's stored
--       reason unreachable. With 'disqualified' the apply page says "your
--       application has been dealt with … contact the programme coordinator if
--       you think it should be looked at afresh" — explicit, and true.
--       'disqualified' is a STORAGE TOKEN only. Nothing shows that word to a
--       human; every surface reads the decision from custom_data.soi.review.
--       A coordinator who wants to reopen an application sets it back to
--       'cancelled', which is exactly what apply-service's re-apply rule means.
--
-- OCCUPANCY IS DEFINED ONCE. "A seat is occupied" is
-- `status NOT IN ('graduated','removed')` — the spine's two terminal membership
-- statuses (MEMBERSHIP_TRANSITIONS gives them no outgoing edges). That is the
-- same predicate as the D10 index uniq_soi_one_active_batch_per_person
-- (20260808130000), the same one fn_soi_batch_completion uses (20260808145000),
-- and the same set SOI_OCCUPYING_STATUSES derives in TypeScript. The count is
-- computed HERE, in SQL, for both the read and the write, and the TypeScript
-- layer never recounts: under the reviewer's own RLS a cohort_memberships count
-- would need cohort.view and would otherwise return 0 — a wrong number that
-- reads as "this batch is empty" and admits past a full batch.
--
-- NO HARDCODED THRESHOLD. Capacity, full-behaviour, batch-choice mode and
-- whether a rejection reason is mandatory are all read at call time through the
-- shared fn_get_policy_* readers, with the spec §4 locked default as the
-- fallback declared exactly once, as a named constant.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. This file carries no
-- BEGIN;/COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN..ROLLBACK
-- stays a genuine dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. Guard — may the caller review this programme's applications? ──────────
-- Authorises against the PROGRAMME (the event), because an application may name
-- no batch at all: under 'staff_assign' the applicant never chooses one, so a
-- per-batch guard could not answer "may you see this queue?".
--
-- Deliberately self-contained: it calls only helpers that have been in
-- production for months (is_super_admin / is_admin / user_has_permission /
-- role_has_institution_access) and NOT fn_soi_can_manage_batch, whose migration
-- (20260808145000) is itself Director-gated and may be applied after this one.
-- A plpgsql body is not resolved at CREATE time, so depending on it would look
-- fine at apply and fail at runtime.
--
-- Every SECDEF predicate is COALESCEd: is_super_admin() and is_admin() return
-- NULL for a caller with no profile row, and `NULL OR x` falls through to x
-- instead of denying (ref feedback_secdef_guard_not_null_safe_falls_through).
--
-- Takes NO caller-supplied user id — identity comes from auth.uid() inside the
-- shared helpers, keeping this out of the IDOR shape
-- (ref feedback_secdef_caller_supplied_user_id_is_an_idor).
CREATE OR REPLACE FUNCTION public.fn_soi_can_review_applications(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_batch boolean;
  v_permitted boolean;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN false;
  END IF;

  -- "Is this event a School of Influence programme?" is answered the same way
  -- the apply flow answers it: by whether any batch points at it. event_type is
  -- free text and is never trusted for a decision.
  SELECT EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
  ) INTO v_has_batch;

  IF NOT COALESCE(v_has_batch, false) THEN
    RETURN false;
  END IF;

  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  IF NOT COALESCE(public.user_has_permission('cohort.manage'), false) THEN
    RETURN false;
  END IF;

  -- Institution scope is taken from the BATCHES, not from the applicants: a
  -- coordinator administers a programme, and S4 deliberately admits applicants
  -- from any JKKN institution. Scoping on the applicant instead would hide
  -- cross-college applications from the person meant to decide them.
  SELECT EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
      AND COALESCE(public.role_has_institution_access(c.institution_id), false)
  ) INTO v_permitted;

  RETURN COALESCE(v_permitted, false);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_can_review_applications(uuid) IS
  'School of Influence S5: may the signed-in caller review this programme''s '
  'applications? cohort.manage scoped to a batch institution; super admin / '
  'admin first. False for any event with no School of Influence batch.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_can_review_applications(uuid) TO authenticated;


-- ── 2. Review context — the two config values the screen must obey ──────────
-- Returned together so the reviewer's screen cannot render one mode's controls
-- while the accept path enforces the other. Both are read at call time; neither
-- is ever stated in TypeScript.
--
-- Returns a row even when the caller may not review (can_review = false) so the
-- screen can render an explicit "you do not have access" surface rather than an
-- empty list (CLAUDE.md rule 27). No programme data is included in that case.
CREATE OR REPLACE FUNCTION public.fn_soi_review_context(p_event_id uuid)
RETURNS TABLE (
  can_review                boolean,
  event_name                text,
  batch_choice_mode         text,
  rejection_reason_required boolean,
  awaiting_count            integer,
  decided_count             integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Spec §4 locked defaults, declared once.
  c_default_choice_mode  constant text    := 'staff_assign';
  c_default_reason_req   constant boolean := true;
  v_ok    boolean;
  v_mode  text;
BEGIN
  v_ok := public.fn_soi_can_review_applications(p_event_id);

  IF NOT COALESCE(v_ok, false) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::boolean, 0, 0;
    RETURN;
  END IF;

  -- Programme-level keys are read with p_scope_id = NULL, which fn_get_policy
  -- resolves to the programme-wide cohort default seeded by S1. An unrecognised
  -- value must not silently hand batch selection to the applicant.
  v_mode := public.fn_get_policy_text('soi.batch_choice_mode',
                                      c_default_choice_mode, NULL);
  IF v_mode IS DISTINCT FROM 'participant_choose'
     AND v_mode IS DISTINCT FROM 'staff_assign' THEN
    v_mode := c_default_choice_mode;
  END IF;

  RETURN QUERY
  SELECT
    true,
    (SELECT e.name FROM public.events e WHERE e.id = p_event_id),
    v_mode,
    COALESCE(public.fn_get_policy_bool('soi.rejection.reason_required',
                                       c_default_reason_req, NULL),
             c_default_reason_req),
    (SELECT COUNT(*)::integer FROM public.events_registrations r
      WHERE r.event_id = p_event_id
        AND r.source = 'soi_apply'
        AND r.status IN ('pending', 'waitlisted')),
    (SELECT COUNT(*)::integer FROM public.events_registrations r
      WHERE r.event_id = p_event_id
        AND r.source = 'soi_apply'
        AND r.status NOT IN ('pending', 'waitlisted'));
END;
$$;

COMMENT ON FUNCTION public.fn_soi_review_context(uuid) IS
  'School of Influence S5: the reviewer screen''s runtime context — access '
  'verdict, soi.batch_choice_mode (D2) and soi.rejection.reason_required (D12), '
  'both read from platform_policies at call time, plus queue counts.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_review_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_review_context(uuid) TO authenticated;


-- ── 3. The batches, with the numbers the accept decision is made on ──────────
-- One definition of occupancy and capacity, used by the screen AND by the
-- accept path below, so what the reviewer is shown and what the write enforces
-- can never disagree.
CREATE OR REPLACE FUNCTION public.fn_soi_review_batches(p_event_id uuid)
RETURNS TABLE (
  cohort_id      uuid,
  batch_name     text,
  cohort_status  text,
  opens_at       timestamptz,
  closes_at      timestamptz,
  occupancy      integer,
  capacity       integer,
  is_full        boolean,
  full_behaviour text,
  intake_open    boolean,
  accepting_now  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Spec §4 locked defaults, declared once.
  c_default_capacity  constant integer := 30;
  c_default_behaviour constant text    := 'offer_another_batch';
  c_default_per_batch constant boolean := true;
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to review applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.status::text,
    b.opens_at,
    b.closes_at,
    b.seats,
    b.cap,
    (b.seats >= b.cap),
    b.behaviour,
    b.window_open,
    (b.window_open AND b.seats < b.cap)
  FROM (
    SELECT
      c.id,
      c.name,
      c.status,
      c.opens_at,
      c.closes_at,
      -- One definition of "a seat is occupied": every non-terminal membership.
      -- Mirrors uniq_soi_one_active_batch_per_person exactly.
      (SELECT COUNT(*)::integer
         FROM public.cohort_memberships m
        WHERE m.cohort_id = c.id
          AND m.status NOT IN ('graduated', 'removed')) AS seats,
      GREATEST(
        COALESCE(public.fn_get_policy_int('soi.batch_capacity',
                                          c_default_capacity, c.id),
                 c_default_capacity),
        1
      ) AS cap,
      -- Read ONCE, then validated. Calling the reader twice (once to test, once
      -- to return) would let two reads of the same key disagree and return a
      -- value the test never saw. An unrecognised value falls back to the locked
      -- §4 default rather than being passed through.
      (SELECT CASE
                WHEN t.raw IN ('waitlist', 'offer_another_batch') THEN t.raw
                ELSE c_default_behaviour
              END
         FROM (SELECT public.fn_get_policy_text('soi.batch_full_behaviour',
                                                c_default_behaviour, c.id) AS raw) t
      ) AS behaviour,
      -- D13 off = one set of dates covers the whole programme, so an individual
      -- batch stops gating on its own window.
      CASE
        WHEN COALESCE(public.fn_get_policy_bool('soi.intake_dates_per_batch',
                                                c_default_per_batch, c.id),
                      c_default_per_batch)
        THEN (c.opens_at IS NULL OR now() >= c.opens_at)
             AND (c.closes_at IS NULL OR now() <= c.closes_at)
        ELSE true
      END AS window_open
    FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
  ) b
  ORDER BY b.name;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_review_batches(uuid) IS
  'School of Influence S5 (D5/D13): every batch of one programme with its '
  'occupancy (non-terminal memberships), soi.batch_capacity, '
  'soi.batch_full_behaviour and intake window, all read at call time. The same '
  'numbers the accept path enforces, so screen and write cannot disagree.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_review_batches(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_review_batches(uuid) TO authenticated;


-- ── 4. The queue ────────────────────────────────────────────────────────────
-- p_scope: 'awaiting' (pending + waitlisted), 'decided', or 'all'. Anything
-- unrecognised narrows to 'awaiting' rather than widening — a filter typo must
-- not quietly show more than the caller asked for.
--
-- The applicant's answers are returned with their QUESTIONS attached, resolved
-- here against event_registration_form_fields. Returning bare custom_fields
-- would make the screen render raw field keys, and a reviewer deciding somebody's
-- place on the strength of `q_2: "yes"` is deciding on nothing.
CREATE OR REPLACE FUNCTION public.fn_soi_list_applications(
  p_event_id uuid,
  p_scope    text DEFAULT 'awaiting'
)
RETURNS TABLE (
  application_id        uuid,
  applicant_name        text,
  applicant_email       text,
  profile_id            uuid,
  institution_name      text,
  audiences             text[],
  requested_batch_id    uuid,
  requested_batch_name  text,
  application_status    text,
  submitted_at          timestamptz,
  decision              text,
  decision_reason       text,
  decided_at            timestamptz,
  decided_by_name       text,
  answers               jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to review applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  v_scope := CASE lower(btrim(COALESCE(p_scope, '')))
               WHEN 'decided' THEN 'decided'
               WHEN 'all'     THEN 'all'
               ELSE 'awaiting'
             END;

  RETURN QUERY
  SELECT
    r.id,
    r.participant_name,
    r.participant_email,
    r.profile_id,
    COALESCE(r.institution_name, i.name),
    ARRAY(
      SELECT jsonb_array_elements_text(
               COALESCE(r.custom_data -> 'soi' -> 'audiences', '[]'::jsonb))
    ),
    NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid,
    NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_name'), ''),
    r.status,
    r.created_at,
    NULLIF(btrim(r.custom_data -> 'soi' -> 'review' ->> 'decision'), ''),
    NULLIF(btrim(r.custom_data -> 'soi' -> 'review' ->> 'reason'), ''),
    NULLIF(btrim(r.custom_data -> 'soi' -> 'review' ->> 'decided_at'), '')::timestamptz,
    dp.full_name,
    -- Every stored answer, labelled with the question that was asked. A key with
    -- no surviving field row is still shown (under its raw key) rather than
    -- dropped: a reviewer must see everything the applicant wrote, including an
    -- answer to a question the form has since lost.
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'key',   kv.key,
                  'label', COALESCE(f.field_label, kv.key),
                  'value', kv.value
                )
                ORDER BY COALESCE(f.display_order, 9999), kv.key
              )
         FROM jsonb_each(COALESCE(r.custom_fields, '{}'::jsonb)) kv
         LEFT JOIN public.event_registration_form_fields f
                ON f.event_id = r.event_id
               AND f.field_key = kv.key),
      '[]'::jsonb
    )
  FROM public.events_registrations r
  LEFT JOIN public.institutions i ON i.id = r.institution_id
  LEFT JOIN public.profiles dp
         ON dp.id = NULLIF(btrim(r.custom_data -> 'soi' -> 'review' ->> 'decided_by'), '')::uuid
  WHERE r.event_id = p_event_id
    AND r.source = 'soi_apply'
    AND (
      (v_scope = 'awaiting' AND r.status IN ('pending', 'waitlisted'))
      OR (v_scope = 'decided' AND r.status NOT IN ('pending', 'waitlisted'))
      OR v_scope = 'all'
    )
  -- Oldest application first: a review queue that puts the newest on top makes
  -- the person who has waited longest the last to be seen.
  ORDER BY r.created_at;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_list_applications(uuid, text) IS
  'School of Influence S5: the coordinator queue for one programme. Applicant, '
  'audiences, requested batch, submitted-at, the recorded decision + reason, and '
  'every form answer labelled with the question that was asked.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_list_applications(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_list_applications(uuid, text) TO authenticated;


-- ── 5. Accept, step 1 of 2 — authorise and choose the batch ─────────────────
-- Writes NOTHING. It decides, in one place, everything the enrolment depends on:
-- who the applicant is, which batch they land in under the CURRENT
-- soi.batch_choice_mode, and whether that batch still has a seat RIGHT NOW.
--
-- Two-phase on purpose. The membership itself must be written by
-- CohortService.createMembership (identity guard + lifecycle + audit + D10
-- index), which is a client-side, RLS-enforced path — so it cannot happen inside
-- this function. Splitting the decision from the write means a failed enrolment
-- leaves the application UNTOUCHED and still in the queue, instead of an
-- application marked accepted with nobody enrolled.
--
-- already_member is returned rather than raised, and that matters: it is how the
-- caller recovers when step 2 succeeded and step 3 did not. Re-running accept
-- then skips straight to confirming the application, instead of hitting D10's
-- unique index and stranding the row as pending forever.
CREATE OR REPLACE FUNCTION public.fn_soi_prepare_acceptance(
  p_application_id  uuid,
  p_batch_cohort_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    RAISE EXCEPTION 'You do not have permission to accept applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'waitlisted') THEN
    RAISE EXCEPTION 'This application has already been decided, so it cannot be accepted again. Reload the queue to see its current state.'
      USING ERRCODE = '22023';
  END IF;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'This application is not linked to a MyJKKN account, so nobody can be enrolled from it. Ask the applicant to apply again while signed in.'
      USING ERRCODE = '22023';
  END IF;

  -- D2, read at runtime. Under participant_choose the applicant already chose
  -- and the reviewer only confirms; under staff_assign the reviewer names the
  -- batch and any choice stored on the application is ignored.
  v_mode := public.fn_get_policy_text('soi.batch_choice_mode',
                                      c_default_choice_mode, NULL);
  IF v_mode IS DISTINCT FROM 'participant_choose'
     AND v_mode IS DISTINCT FROM 'staff_assign' THEN
    v_mode := c_default_choice_mode;
  END IF;

  IF v_mode = 'participant_choose' THEN
    IF v_requested IS NULL THEN
      -- The mode was switched after this person applied. Say so, rather than
      -- silently letting the reviewer assign a batch the applicant never saw.
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

  -- NOT FOUND, not `v_batch IS NULL`: a record variable tests as NULL only when
  -- EVERY column is null, so the IS NULL form would let an unknown batch through.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That batch is not part of this programme. Reload the queue and pick one of the batches listed.'
      USING ERRCODE = '22023';
  END IF;

  -- D5 — the batch may have filled between apply and accept. Refuse in words,
  -- and name the batches that still have room. The intake WINDOW is deliberately
  -- not re-checked: the applicant applied while it was open, and a coordinator
  -- must still be able to clear a queue after applications close.
  IF v_batch.is_full THEN
    SELECT string_agg(b2.batch_name, ', ' ORDER BY b2.batch_name) INTO v_alternatives
    FROM public.fn_soi_review_batches(v_event) b2
    WHERE b2.accepting_now AND b2.cohort_id <> v_target;

    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        '%s is full — it holds %s of %s places, and accepting this person would put it over. %s',
        v_batch.batch_name, v_batch.occupancy, v_batch.capacity,
        CASE
          WHEN v_alternatives IS NULL
          THEN 'No other batch has room either. Raise soi.batch_capacity for this batch in the programme settings, or tell the applicant about the next round.'
          ELSE 'These batches still have room: ' || v_alternatives || '.'
        END
      );
  END IF;

  -- D10 — one active place per person per programme. Reported, not raised, so a
  -- half-finished accept can be completed instead of being stuck. The batch they
  -- are ALREADY in is returned too: it may not be the one the reviewer just
  -- picked, and the screen has to be able to say so rather than report the
  -- wrong batch back.
  SELECT m.id, m.cohort_id, c.name
    INTO v_existing, v_existing_cohort, v_existing_batch
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.member_ref = v_profile
    AND c.kind = 'school_of_influence'
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = v_event
    AND m.status NOT IN ('graduated', 'removed')
  LIMIT 1;

  -- Which member shape the enrolment takes. Read from the audiences S4 recorded
  -- from the applicant's OWN records, never from anything the browser sent.
  -- 'team' is never produced here: it is the one member_type the spine does not
  -- identity-check, and it is how SF100 admitted 23 fabricated humans.
  v_member_type := CASE
                     WHEN 'learner' = ANY (v_audiences) THEN 'learner'
                     WHEN 'staff'   = ANY (v_audiences) THEN 'staff'
                     -- No recorded audience (an application older than the
                     -- field): fall back to what the profile itself says.
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
    'existing_batch_name',      v_existing_batch
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid) IS
  'School of Influence S5 step 1: authorise an acceptance and resolve the target '
  'batch under the runtime soi.batch_choice_mode (D2), refusing explicitly when '
  'the batch filled since the application (D5). Writes nothing — the membership '
  'is created by CohortService so the spine''s identity guard and D10 index apply.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid) TO authenticated;


-- ── 6. Accept, step 2 of 2 — record the decision on the application ─────────
-- Called only after the membership exists. Verifies that it really does, against
-- the membership id the caller claims, so an application can never be marked
-- accepted without an enrolment behind it.
CREATE OR REPLACE FUNCTION public.fn_soi_confirm_acceptance(
  p_application_id uuid,
  p_membership_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event   uuid;
  v_profile uuid;
  v_status  text;
  v_cohort  uuid;
  v_batch   text;
  v_ref     uuid;
BEGIN
  SELECT r.event_id, r.profile_id, r.status
    INTO v_event, v_profile, v_status
  FROM public.events_registrations r
  WHERE r.id = p_application_id AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to accept applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.cohort_id, m.member_ref, c.name INTO v_cohort, v_ref, v_batch
  FROM public.cohort_memberships m
  JOIN public.cohorts c ON c.id = m.cohort_id
  WHERE m.id = p_membership_id
    AND c.kind = 'school_of_influence'
    AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = v_event
    AND m.status NOT IN ('graduated', 'removed');

  IF v_cohort IS NULL OR v_ref IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'That place does not belong to this applicant in this programme, so the application was left untouched. Reload the queue and try again.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.events_registrations r
     SET status = 'confirmed',
         custom_data = COALESCE(r.custom_data, '{}'::jsonb)
           || jsonb_build_object('soi',
                COALESCE(r.custom_data -> 'soi', '{}'::jsonb)
                || jsonb_build_object('review', jsonb_build_object(
                     'decision',        'accepted',
                     'batch_cohort_id', v_cohort,
                     'batch_name',      v_batch,
                     'membership_id',   p_membership_id,
                     'decided_at',      now(),
                     'decided_by',      auth.uid()
                   ))
              ),
         updated_at = now()
   WHERE r.id = p_application_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'application_id', p_application_id,
    'status',         'confirmed',
    'batch_name',     v_batch,
    'message',        format('%s has been accepted into %s.',
                             COALESCE((SELECT participant_name
                                         FROM public.events_registrations
                                        WHERE id = p_application_id), 'The applicant'),
                             v_batch)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid) IS
  'School of Influence S5 step 2: mark an application accepted (status '
  '''confirmed'') once the cohort membership behind it exists and belongs to the '
  'same person and programme. Refuses otherwise, so an accepted application '
  'always has an enrolment behind it.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_confirm_acceptance(uuid, uuid) TO authenticated;


-- ── 7. Reject, with the coordinator's actual reason (D12) ───────────────────
-- The reason is stored on the APPLICANT'S OWN registration row, which they can
-- already read under the long-standing events_reg_self_read policy
-- (profile_id = auth.uid()). So the text a coordinator types is, by
-- construction, readable verbatim by the person it is about — it is not held in
-- a table only reviewers can see.
--
-- Whether a reason is mandatory is soi.rejection.reason_required, read at call
-- time. Enforced HERE and not only in the form: a rule that lives only in a
-- screen is not a rule.
CREATE OR REPLACE FUNCTION public.fn_soi_reject_application(
  p_application_id uuid,
  p_reason         text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_default_reason_req constant boolean := true;
  v_event    uuid;
  v_status   text;
  v_name     text;
  v_required boolean;
  v_reason   text;
BEGIN
  SELECT r.event_id, r.status, r.participant_name
    INTO v_event, v_status, v_name
  FROM public.events_registrations r
  WHERE r.id = p_application_id AND r.source = 'soi_apply';

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists, or it was not made through the School of Influence apply form. Reload the queue.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(public.fn_soi_can_review_applications(v_event), false) THEN
    RAISE EXCEPTION 'You do not have permission to decide applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'waitlisted') THEN
    RAISE EXCEPTION 'This application has already been decided, so it cannot be rejected now. Reload the queue to see its current state.'
      USING ERRCODE = '22023';
  END IF;

  v_reason   := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_required := COALESCE(public.fn_get_policy_bool('soi.rejection.reason_required',
                                                   c_default_reason_req, NULL),
                         c_default_reason_req);

  IF v_required AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Write the reason for turning this application down. The applicant will be shown exactly what you type here, so it needs to be something they can act on.'
      USING ERRCODE = '22023';
  END IF;

  -- 'disqualified' is the storage token for a decided no (see STATUS VOCABULARY
  -- in this file's header). Nothing shows that word to a human.
  UPDATE public.events_registrations r
     SET status = 'disqualified',
         custom_data = COALESCE(r.custom_data, '{}'::jsonb)
           || jsonb_build_object('soi',
                COALESCE(r.custom_data -> 'soi', '{}'::jsonb)
                || jsonb_build_object('review', jsonb_build_object(
                     'decision',   'rejected',
                     'reason',     v_reason,
                     'decided_at', now(),
                     'decided_by', auth.uid()
                   ))
              ),
         updated_at = now()
   WHERE r.id = p_application_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'application_id', p_application_id,
    'status',         'disqualified',
    'reason',         v_reason,
    'message',        format('%s was not accepted, and the reason you wrote is now on their application.',
                             COALESCE(v_name, 'The applicant'))
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_reject_application(uuid, text) IS
  'School of Influence S5 (D12): turn an application down with the coordinator''s '
  'actual reason, stored on the applicant''s own events_registrations row so they '
  'can read it verbatim under events_reg_self_read. Requires a reason when '
  'soi.rejection.reason_required is on, read at call time.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_reject_application(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_reject_application(uuid, text) TO authenticated;


NOTIFY pgrst, 'reload schema';
