-- ============================================================================
-- Migration: 20260808200000_soi_review_permission_coherence
-- School of Influence S5 — two coherence defects found by adversarial review of
-- the review/accept queue (20260808146000_soi_review_accept_queue.sql).
-- ============================================================================
-- DEFECT 1 — the gate and the write disagreed.
--   Every S5 RPC authorises the reviewer on 'cohort.manage'. The enrolment those
--   RPCs authorise does NOT run under that permission. The membership is written
--   by CohortService.createMembership() AS THE COORDINATOR, under
--   cohort_memberships' own RLS, verified live 2026-08-01:
--     cohort_memberships_insert_permission  WITH CHECK → cohort.create
--     cohort_memberships_select_permission  USING      → cohort.view
--       (PostgREST re-reads the row it just inserted for .select().single())
--   both AND-ed with role_has_institution_access(<that batch>.institution_id).
--
--   So a coordinator holding only 'cohort.manage' opened the queue, read the
--   applications, passed fn_soi_prepare_acceptance — was told the acceptance was
--   ready — and then met a bare 42501 from the RLS layer naming nothing they
--   could act on. That late, uninterpretable refusal is exactly what CLAUDE.md
--   rule 27 forbids.
--
--   FIX: fn_soi_prepare_acceptance is already documented as "step 1 of 2:
--   authorise". It was authorising the wrong thing. It now also checks, BEFORE
--   anything is written, the permissions the enrolment write itself requires, and
--   refuses in words naming exactly what is missing.
--
--   WHY NOT move the INSERT into fn_soi_confirm_acceptance under one permission.
--   Considered and rejected. The membership write is deliberately left outside
--   these functions so the spine's own guards apply: assertMemberIdentity()
--   (TypeScript, rejects an unresolvable member before any write), the lifecycle
--   transition map, the cohort_status_events audit trail and the D10 unique
--   index. A SECURITY DEFINER insert here would bypass the identity guard and
--   become a SECOND enrolment path — the exact shape that let SF100 admit 23
--   fabricated roster rows (audit 2026-07-27). Making the CHECK agree with the
--   write is the coherent fix; moving the write is a regression.
--
--   WHY fn_soi_can_review_applications IS UNCHANGED. Reading the queue and
--   rejecting an application are pure DEFINER paths — they touch no table the
--   caller writes directly, so 'cohort.manage' is genuinely sufficient for them.
--   Gating the whole screen on 'cohort.create' would take REJECT away from a
--   coordinator who can legitimately do it. The capability that needs more is
--   accept alone, so accept alone is where the check belongs.
--
--   NOTHING IS GRANTED HERE. This narrows what passes; it hands no permission to
--   any role. Who may review applications remains a Director decision.
--
--   FOLLOW-UP (not this file, and deliberately not faked here): the truest place
--   to surface this is the Accept button itself, disabled with the reason on it.
--   That needs a can_accept flag on fn_soi_review_context AND the screen to read
--   it. The screen is owned by an open PR, and adding a flag nothing reads would
--   be a fresh decorative value — the very defect fixed below.
--
-- DEFECT 2 — soi.batch_full_behaviour described behaviour that does not exist.
--   The row offers "hold them on a waiting list" or "point them to a batch that
--   still has room". Only the second is implemented: fn_soi_prepare_acceptance
--   refuses a full batch and names the batches with room, whatever the value
--   says. Setting it to 'waitlist' changes nothing.
--
--   FIX: option (b) of the two on the table — the row's human-facing strings now
--   say plainly that the waiting list is not built yet. Option (a), implementing
--   the branch, was rejected as neither small nor safe: a waitlist outcome needs
--   a third result shape out of the accept path and a screen that renders it, and
--   the screen is owned by an open PR. Building a branch whose only consumer
--   cannot show it would move the decoration rather than remove it.
--
--   The KEY IS KEPT, not deleted. Unlike soi.block_multiple_batches (removed by a
--   sibling change because its behaviour was structurally impossible — the D10
--   unique index is unconditional), a waiting list is a real, wanted future
--   behaviour. The honest state is a live setting that says what it does today.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply, applied serially by the
-- orchestrator. No BEGIN;/COMMIT; of its own, so wrapping this file in a
-- Mgmt-API BEGIN..ROLLBACK stays a genuine dry run
-- (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
--
-- DEPENDS ON 20260808146000_soi_review_accept_queue.sql, whose seven functions
-- were verified LIVE on prod 2026-08-01 via pg_proc (they are invisible to
-- supabase_migrations.schema_migrations — the ledger is not a repo index). The
-- function body below was taken from the LIVE definition (pg_proc.prosrc,
-- byte-identical to that file, checked 2026-08-01) and not from an older copy
-- (ref feedback_secdef_replace_silently_reverted_money_gate).
-- ============================================================================


-- ── DEFECT 1 ────────────────────────────────────────────────────────────────
-- Live body, unchanged except for the block marked "COHERENCE GATE".
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
  -- Added 2026-08-01 (defect 1).
  v_batch_institution uuid;
  v_missing           text[];
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

  -- ── COHERENCE GATE (added 2026-08-01, defect 1) ───────────────────────────
  -- Everything above authorises REVIEWING. The enrolment this function is
  -- clearing the way for runs under cohort_memberships' RLS as the coordinator,
  -- which needs cohort.create (the INSERT) and cohort.view (the read-back),
  -- scoped to the TARGET batch's institution. Check that here so the refusal is
  -- explicit and arrives before any write, instead of a bare 42501 later.
  --
  -- Checked against the TARGET batch, not the programme, on purpose: the
  -- reviewer gate is an EXISTS over every batch of the programme, so institution
  -- access to one batch admits a coordinator to accept into a batch belonging to
  -- another institution — where the INSERT policy would then refuse them. Same
  -- defect, second doorway.
  --
  -- Skipped entirely for super admin / admin, who are the first disjunct of
  -- every one of those policies. COALESCEd because both helpers return NULL for
  -- a caller with no profile row, and `NULL OR x` falls through to x
  -- (ref feedback_secdef_guard_not_null_safe_falls_through).
  IF NOT (COALESCE(public.is_super_admin(), false)
          OR COALESCE(public.is_admin(), false)) THEN

    SELECT c.institution_id INTO v_batch_institution
    FROM public.cohorts c
    WHERE c.id = v_target;

    v_missing := ARRAY[]::text[];

    IF NOT COALESCE(public.user_has_permission('cohort.create'), false) THEN
      v_missing := v_missing
        || 'the "cohort.create" permission, to give them a place in the batch';
    END IF;

    -- The read-back PostgREST performs on the freshly inserted row. A
    -- coordinator accepting THEIR OWN application reads that row through
    -- cohort_memberships_soi_member_select (own row, once they are a member),
    -- so cohort.view is genuinely not required in that one case and naming it
    -- would be a false refusal.
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
          'You can review this programme''s applications, but you cannot enrol anyone into %s, so nothing was written and this application is untouched. Still needed: %s. Ask an administrator to add that to your role.',
          v_batch.batch_name,
          array_to_string(v_missing, '; ')
        );
    END IF;
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
  'the batch filled since the application (D5), and — since 2026-08-01 — when the '
  'caller lacks the permissions the enrolment write itself needs (cohort.create + '
  'cohort.view + institution access on the TARGET batch), so that refusal arrives '
  'before any write instead of as a bare RLS denial. Writes nothing — the '
  'membership is created by CohortService so the spine''s identity guard and D10 '
  'index apply.';

-- Re-asserted in the same file as the CREATE OR REPLACE. Supabase's
-- ALTER DEFAULT PRIVILEGES grants anon a direct EXECUTE on every new function,
-- separate from PUBLIC, so REVOKE FROM PUBLIC alone would leave this callable
-- with the anon key that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_prepare_acceptance(uuid, uuid) TO authenticated;


-- ── DEFECT 2 ────────────────────────────────────────────────────────────────
-- Every human-facing string on the row now describes what the setting actually
-- does today. The key, its value, its enum options and its data type are all
-- untouched — no behaviour changes and no Director choice is overridden.
--
-- Applied to EVERY scope of the key, not just the programme-wide default, so a
-- per-batch override created later cannot keep the old promise on its own screen.
UPDATE public.platform_policies
   SET ui_consequence =
         'What a full batch does. Today both options behave the same way: the '
         'acceptance is refused and the coordinator is told which batches still '
         'have room. The waiting-list option is not built yet — choosing it holds '
         'nobody on a list.',
       ui_options = $json$[
         {"value":"waitlist","label":"Hold them on a waiting list (not built yet — behaves the same as the option below)"},
         {"value":"offer_another_batch","label":"Point them to a batch that still has room (default)"}
       ]$json$::jsonb,
       ui_cascade = $json$[
         {"effect":"Neither option changes anything today: a full batch refuses the acceptance and names the batches that still have room","severity":"low"},
         {"effect":"If the waiting list is built later, it would leave applicants with no access until a place frees up, so somebody would have to work that list","severity":"high"}
       ]$json$::jsonb,
       updated_at = now()
 WHERE policy_key = 'soi.batch_full_behaviour';


NOTIFY pgrst, 'reload schema';


-- ── Apply-time assert — on the END STATE, not on "did I change a row" ───────
-- Everything here re-reads the catalogue and the table after the fact, so this
-- block is equally true on a first apply and a re-apply.
DO $assert$
DECLARE
  v_oid  oid;
  v_src  text;
  v_bad  integer;
BEGIN
  -- to_regprocedure, not ::regprocedure: the cast RAISES on a missing object and
  -- would report "function does not exist" instead of this file's own message
  -- (ref feedback_privilege_checks_raise_on_missing_object).
  v_oid := to_regprocedure('public.fn_soi_prepare_acceptance(uuid,uuid)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'fn_soi_prepare_acceptance(uuid,uuid) is not present after this migration.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;

  -- Defect 1 end state: the accept path names both permissions the write needs.
  IF position('cohort.create' in v_src) = 0
     OR position('cohort.view' in v_src) = 0
     OR position('role_has_institution_access(v_batch_institution)' in v_src) = 0 THEN
    RAISE EXCEPTION
      'fn_soi_prepare_acceptance does not check the permissions the enrolment write requires (cohort.create / cohort.view / institution access on the target batch) — defect 1 is not fixed.';
  END IF;

  -- The function must still be SECURITY DEFINER with a pinned search_path, and
  -- must not be reachable by anon.
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'fn_soi_prepare_acceptance lost SECURITY DEFINER.';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_soi_prepare_acceptance — the REVOKE did not take.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_soi_prepare_acceptance — the GRANT did not take.';
  END IF;

  -- Defect 2 end state: no surviving soi.batch_full_behaviour row still promises
  -- a waiting list. Passes vacuously where the S1 seed has not run, which is
  -- correct — there is nothing making the false claim there.
  SELECT count(*) INTO v_bad
  FROM public.platform_policies
  WHERE policy_key = 'soi.batch_full_behaviour'
    AND ui_consequence IS DISTINCT FROM NULL
    AND position('not built yet' in ui_consequence) = 0;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      '% soi.batch_full_behaviour row(s) still describe a waiting list that is not implemented — defect 2 is not fixed.', v_bad;
  END IF;

  RAISE NOTICE 'School of Influence S5 coherence: accept path now checks cohort.create + cohort.view + target-batch institution access; soi.batch_full_behaviour describes only the behaviour that exists.';
END;
$assert$;
