-- ============================================================================
-- Migration: 20260808231500_soi_waiting_list
-- SCHOOL OF INFLUENCE — a real waiting list when a batch is full.
-- Director decision, 2026-08-02: nobody hits a "batch full, sorry" dead end.
-- ============================================================================
-- WHAT WAS ALREADY THERE, AND WHAT WAS MISSING
--   The waitlisted STATE half-existed. apply-service.ts already writes
--   events_registrations.status = 'waitlisted' when the batch a person would land
--   in is full and soi.batch_full_behaviour says 'waitlist', and every S5 RPC
--   already treats 'waitlisted' as "still awaiting a coordinator", so such an
--   application can already be accepted by the existing two-phase accept path.
--
--   Everything DOWNSTREAM of that state was missing:
--     • the applicant was told only "your application is with a coordinator" —
--       the same sentence a pending applicant sees. They never learned they were
--       on a list, where they stood on it, or what happens next.
--     • the coordinator had no waiting list at all: the queue mixes pending and
--       waitlisted into one flat programme-wide list with no ordering by batch
--       and no notion of a place in a queue.
--   This file adds the two reads that close both gaps. It adds NO new write.
--
-- PROMOTION IS MANUAL, AND THAT IS THE DESIGN DECISION, NOT AN OMISSION.
--   When a seat frees (someone rejected, removed or withdrawn), a coordinator
--   opens the waiting list, sees who is waiting and in what order, and accepts
--   the person they choose through the EXISTING accept path
--   (fn_soi_prepare_acceptance → CohortService.createMembership →
--   fn_soi_confirm_acceptance). Promotion IS acceptance; there is no second path.
--
--   Three reasons automatic promotion was rejected:
--     1. soi.require_approval is true (D3): submitting is an application, and a
--        coordinator admits. A waitlisted application has never been read by
--        anybody. Auto-promoting would enrol a person whose application nobody
--        reviewed — the one thing this programme is built not to do.
--     2. An automatic promotion has to write a cohort_memberships row from
--        inside the database, i.e. a SECURITY DEFINER insert that bypasses
--        assertMemberIdentity(), the lifecycle transition map and the
--        cohort_status_events audit trail. That is a SECOND enrolment path — the
--        exact shape that let SF100 admit 23 fabricated roster rows (audit
--        2026-07-27).
--     3. It would fire as whoever removed the previous member, under their
--        permissions, at a moment nobody chose.
--   So the database offers the ORDER and the FACTS; a human still decides.
--
-- POSITION IS DERIVED, NEVER STORED, AND THAT IS LOAD-BEARING.
--   A place in the queue is ROW_NUMBER() over the applications that are
--   'waitlisted' RIGHT NOW, oldest first, within the batch group. Nothing is
--   written when somebody joins and nothing has to be rewritten when somebody
--   leaves: a withdrawal ('cancelled'), an acceptance ('confirmed') or a
--   rejection ('disqualified') drops the row out of the set and everybody behind
--   moves up on the next read, with no backfill and no queue to repair.
--
-- HONESTY OF THE NUMBER. Oldest-first is the order the queue is READ in, not a
--   promise about who is offered a place: a coordinator may accept out of order,
--   and both surfaces say so in words. A number presented as a guarantee it is
--   not would be worse than no number.
--
-- CAPACITY ACCOUNTING IS UNCHANGED, BY CONSTRUCTION.
--   A waiting-list entry is an events_registrations row. A seat is a
--   cohort_memberships row. A waitlisted person HAS NO MEMBERSHIP, so they
--   cannot occupy a seat — there is nothing to exclude and no second definition
--   of occupancy is introduced here. Occupancy stays "every non-terminal
--   membership" (status NOT IN ('graduated','removed')), computed once in
--   fn_soi_review_batches, which this file CALLS rather than re-implements.
--   Promoting somebody creates the membership, which is what makes the seat
--   occupied — the same write, counted the same way.
--
-- SIGNATURES ARE NEW; NO EXISTING FUNCTION IS REPLACED.
--   Adding waiting-list columns to fn_soi_review_batches would change its OUT
--   columns, which PostgreSQL cannot do with CREATE OR REPLACE — it would need a
--   DROP, and fn_soi_prepare_acceptance does `SELECT * INTO v_batch FROM
--   fn_soi_review_batches(...)`, so dropping it mid-flight would break the live
--   accept path. Two new functions cost nothing and break nothing.
--
-- DEPENDS ON, and must be applied AFTER:
--   • 20260808146000_soi_review_accept_queue.sql — fn_soi_can_review_applications
--     and fn_soi_review_batches, both verified live on prod 2026-08-01 via
--     pg_proc (they are invisible to supabase_migrations.schema_migrations — the
--     ledger is not a repo index).
--   • 20260808200000_soi_review_permission_coherence.sql — which reworded
--     soi.batch_full_behaviour to say the waiting list was "not built yet". This
--     file makes that wording obsolete and rewrites it. Applied in version order
--     the two converge; applied out of order the earlier file would put the false
--     sentence back, which its own assert would then be satisfied by. Order
--     matters, and this file's assert catches it either way by requiring the NEW
--     wording at the end.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply, applied serially by the
-- orchestrator. No BEGIN;/COMMIT; of its own, so wrapping this file in a
-- Mgmt-API BEGIN..ROLLBACK stays a genuine dry run
-- (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. The coordinator's waiting list ───────────────────────────────────────
-- Every waitlisted application of one programme, grouped by the batch it names
-- and ordered oldest-first inside that group, with the position and the moment
-- each person joined.
--
-- GROUPING IS BY THE REQUESTED BATCH, INCLUDING "none". Under
-- soi.batch_choice_mode = 'staff_assign' (the locked default) an applicant never
-- names a batch, so requested_batch_id is NULL for everybody and the whole
-- programme is one list — which is the truth, not a degraded case: there is no
-- per-batch queue when nobody has been assigned a batch. Under
-- 'participant_choose' each batch gets its own queue. One definition covers both
-- modes, and neither is assumed here.
--
-- already_placed_batch_name is the D10 pre-warning. A person can hold only one
-- active place per programme (uniq_soi_one_active_batch_per_person), so a
-- waiting-list entry belonging to somebody who has since been enrolled elsewhere
-- cannot be promoted into a second batch. The accept path already handles that
-- gracefully (fn_soi_prepare_acceptance reports already_member instead of
-- letting the unique index raise), but the coordinator should SEE it before
-- clicking rather than read about it afterwards.
--
-- Takes NO caller-supplied user id — the reviewer's identity comes from
-- auth.uid() inside fn_soi_can_review_applications
-- (ref feedback_secdef_caller_supplied_user_id_is_an_idor).
CREATE OR REPLACE FUNCTION public.fn_soi_waiting_list(p_event_id uuid)
RETURNS TABLE (
  application_id          uuid,
  applicant_name          text,
  applicant_email         text,
  profile_id              uuid,
  institution_name        text,
  audiences               text[],
  requested_batch_id      uuid,
  requested_batch_name    text,
  waiting_position        integer,
  waiting_group_size      integer,
  joined_waiting_list_at  timestamptz,
  already_placed_batch_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to see the waiting list for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH waiting AS (
    SELECT
      r.id,
      r.participant_name,
      r.participant_email,
      r.profile_id AS applicant_profile_id,
      COALESCE(r.institution_name, i.name) AS institution,
      ARRAY(
        SELECT jsonb_array_elements_text(
                 COALESCE(r.custom_data -> 'soi' -> 'audiences', '[]'::jsonb))
      ) AS applicant_audiences,
      NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid AS batch_id,
      NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_name'), '') AS batch_name,
      r.created_at
    FROM public.events_registrations r
    LEFT JOIN public.institutions i ON i.id = r.institution_id
    WHERE r.event_id = p_event_id
      AND r.source = 'soi_apply'
      AND r.status = 'waitlisted'
  ),
  ranked AS (
    SELECT
      w.*,
      -- Oldest first. The person who has waited longest is first in the list.
      -- created_at can tie to the microsecond on a bulk write, so the row id is
      -- the tiebreak — an arbitrary but STABLE order beats a position that
      -- reshuffles between two reads of the same unchanged list.
      (ROW_NUMBER() OVER (
        PARTITION BY w.batch_id ORDER BY w.created_at, w.id
      ))::integer AS position_in_group,
      (COUNT(*) OVER (PARTITION BY w.batch_id))::integer AS group_size
    FROM waiting w
  )
  SELECT
    k.id,
    k.participant_name,
    k.participant_email,
    k.applicant_profile_id,
    k.institution,
    k.applicant_audiences,
    k.batch_id,
    k.batch_name,
    k.position_in_group,
    k.group_size,
    k.created_at,
    -- D10 pre-warning: do they ALREADY hold a live place in this programme?
    -- Same predicate as uniq_soi_one_active_batch_per_person.
    (SELECT c.name
       FROM public.cohort_memberships m
       JOIN public.cohorts c ON c.id = m.cohort_id
      WHERE m.member_ref = k.applicant_profile_id
        AND c.kind = 'school_of_influence'
        AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
        AND m.status NOT IN ('graduated', 'removed')
      LIMIT 1)
  FROM ranked k
  -- Batches with a named queue first, in name order; the unassigned queue last.
  ORDER BY k.batch_name NULLS LAST, k.position_in_group;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_waiting_list(uuid) IS
  'School of Influence (D5): the coordinator waiting list for one programme — '
  'every waitlisted application grouped by the batch it names, oldest first, with '
  'its position, the size of that queue, when the person joined it, and whether '
  'they already hold a place in this programme (D10). Position is derived at read '
  'time, never stored, so a withdrawal or an acceptance closes the gap by itself.';

-- Hard rule: re-assert the anon lock in the SAME file as the CREATE. Supabase's
-- ALTER DEFAULT PRIVILEGES grants anon a direct EXECUTE on every new function,
-- separate from PUBLIC, so REVOKE FROM PUBLIC alone would leave this callable
-- with the anon key that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_soi_waiting_list(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_waiting_list(uuid) TO authenticated;


-- ── 2. The applicant's own place on the list ────────────────────────────────
-- What one person is entitled to be told about their own wait, and nothing more:
-- their position, how many are in the same queue, when they joined, and whether
-- applications have closed. No other applicant's name, address or position is
-- reachable through this function at any argument.
--
-- IDENTITY COMES FROM auth.uid() ONLY. There is deliberately no p_user_id and no
-- p_application_id parameter: every row this function can see is pinned to the
-- session's own profile id, so it cannot be pointed at somebody else
-- (ref feedback_secdef_caller_supplied_user_id_is_an_idor). It is GRANTed to
-- authenticated for exactly that reason — the grant admits everybody, the body
-- admits each caller to their own row.
--
-- ALWAYS RETURNS EXACTLY ONE ROW, including for somebody who is not waiting
-- (on_waiting_list = false). A screen that has to distinguish "not on the list"
-- from "the call returned nothing" would guess, and the guess would be shown to
-- a person as fact (CLAUDE.md rule 27).
--
-- WHY "APPLICATIONS CLOSED" IS READ FROM THE EVENT, NOT FROM BATCH WINDOWS.
-- Under the locked default a waiting applicant has no batch, so a batch window
-- cannot answer the question they are asking. The date they were shown when they
-- applied, and the date the programme publishes, is events.registration_close_date
-- — so that is the date they are told about. Closing it does NOT remove anybody
-- from the list: the accept path deliberately does not re-check the intake window
-- ('a coordinator must still be able to clear a queue after applications close'),
-- so a place can still be offered afterwards, and the surface says so rather than
-- leaving somebody to assume they have been forgotten.
-- ci:allow-secdef-authenticated fn_soi_my_waiting_list_place is SELF-SCOPED: identity is
-- auth.uid() only (v_me below), there is no p_user_id, and the WHERE clause pins every
-- row to r.profile_id = v_me — a signed-in caller can only ever read their OWN place on
-- the list, never another applicant's name or position. An unauthenticated caller
-- (auth.uid() NULL) matches no row and gets on_waiting_list=false. That is the whole
-- authorisation, and it lives in the predicate rather than a separate permission check;
-- fn_soi_waiting_list (the coordinator read, above) IS guarded by
-- fn_soi_can_review_applications and this marker does not apply to it.
CREATE OR REPLACE FUNCTION public.fn_soi_my_waiting_list_place(p_event_id uuid)
RETURNS TABLE (
  on_waiting_list        boolean,
  application_id         uuid,
  waiting_position       integer,
  waiting_group_size     integer,
  joined_waiting_list_at timestamptz,
  requested_batch_name   text,
  intake_closed          boolean,
  intake_closes_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_closes   timestamptz;
  v_app      uuid;
  v_batch    uuid;
  v_batch_nm text;
  v_joined   timestamptz;
  v_pos      integer;
  v_size     integer;
BEGIN
  SELECT e.registration_close_date INTO v_closes
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, NULL::integer,
                        NULL::timestamptz, NULL::text,
                        COALESCE(v_closes < now(), false), v_closes;
    RETURN;
  END IF;

  -- The caller's OWN waitlisted application, if they have one. Most recent, so a
  -- person who applied to an earlier round and was turned down is not answered
  -- with that dead row.
  SELECT r.id,
         NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid,
         NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_name'), ''),
         r.created_at
    INTO v_app, v_batch, v_batch_nm, v_joined
  FROM public.events_registrations r
  WHERE r.event_id = p_event_id
    AND r.source = 'soi_apply'
    AND r.profile_id = v_me
    AND r.status = 'waitlisted'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_app IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, NULL::integer,
                        NULL::timestamptz, NULL::text,
                        COALESCE(v_closes < now(), false), v_closes;
    RETURN;
  END IF;

  -- The same derivation as fn_soi_waiting_list, over the same set and with the
  -- same tiebreak, so the number a coordinator sees and the number the applicant
  -- sees cannot disagree. Counted inside the caller's OWN batch group.
  SELECT (COUNT(*) FILTER (
            WHERE (r.created_at, r.id) <= (v_joined, v_app)
          ))::integer,
         (COUNT(*))::integer
    INTO v_pos, v_size
  FROM public.events_registrations r
  WHERE r.event_id = p_event_id
    AND r.source = 'soi_apply'
    AND r.status = 'waitlisted'
    AND NULLIF(btrim(r.custom_data -> 'soi' ->> 'requested_batch_cohort_id'), '')::uuid
        IS NOT DISTINCT FROM v_batch;

  RETURN QUERY SELECT true, v_app, v_pos, v_size, v_joined, v_batch_nm,
                      COALESCE(v_closes < now(), false), v_closes;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_my_waiting_list_place(uuid) IS
  'School of Influence (D5): the signed-in person''s OWN place on this '
  'programme''s waiting list — position, queue size, when they joined, and '
  'whether applications have closed. Identity is auth.uid() only, so no argument '
  'can point it at anybody else. Always returns one row, with on_waiting_list '
  'false when the caller is not waiting.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_my_waiting_list_place(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_my_waiting_list_place(uuid) TO authenticated;


-- ── 3. The setting now describes what it actually does ──────────────────────
-- 20260808200000 made this row say the waiting list was "not built yet". It is
-- built, so that sentence is now the false one. Rewritten at EVERY scope, not
-- just the programme-wide default, so a per-batch override cannot keep the old
-- promise on its own screen.
--
-- The key, its value, its enum options and its data type are untouched: no
-- behaviour changes here and no Director choice is overridden. Only the words a
-- person editing the setting reads.
UPDATE public.platform_policies
   SET ui_consequence =
         'What a full batch does with a NEW applicant. "Hold them on a waiting '
         'list" keeps the application open in a queue instead of turning it away; '
         'a coordinator sees the queue in order and offers a place when one frees '
         'up. Nobody is ever enrolled automatically. "Point them to a batch that '
         'still has room" turns the application away and names the batches with '
         'space. Changing this affects new applicants only — anyone already '
         'waiting stays on the list.',
       ui_options = $json$[
         {"value":"waitlist","label":"Hold them on a waiting list — a coordinator offers free places from it"},
         {"value":"offer_another_batch","label":"Point them to a batch that still has room (default)"}
       ]$json$::jsonb,
       ui_cascade = $json$[
         {"effect":"A waiting list has to be worked: nobody on it has a place until a coordinator offers one, and no promotion happens on its own","severity":"high"},
         {"effect":"Pointing applicants at another batch fills the quieter batches, but somebody may not get the batch they asked for — and when every batch is full they are turned away outright","severity":"medium"},
         {"effect":"Switching away from the waiting list does not clear it: people already waiting stay on the list until a coordinator decides","severity":"medium"}
       ]$json$::jsonb,
       updated_at = now()
 WHERE policy_key = 'soi.batch_full_behaviour';


NOTIFY pgrst, 'reload schema';


-- ── Apply-time assert — on the END STATE, not on "did I change a row" ───────
-- Re-reads the catalogue and the table after the fact, so this block is equally
-- true on a first apply and on a re-apply.
DO $assert$
DECLARE
  v_list_oid  oid;
  v_mine_oid  oid;
  v_dep_oid   oid;
  v_bad       integer;
BEGIN
  -- to_regprocedure, not ::regprocedure: the cast RAISES on a missing object and
  -- would report "function does not exist" instead of this file's own message
  -- (ref feedback_privilege_checks_raise_on_missing_object).
  v_dep_oid  := to_regprocedure('public.fn_soi_can_review_applications(uuid)');
  IF v_dep_oid IS NULL THEN
    RAISE EXCEPTION 'fn_soi_can_review_applications(uuid) is missing — apply 20260808146000_soi_review_accept_queue.sql before this file. The waiting-list reads call it for their permission check and would fail at runtime, not at apply.';
  END IF;

  IF to_regprocedure('public.fn_soi_review_batches(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_soi_review_batches(uuid) is missing — apply 20260808146000_soi_review_accept_queue.sql before this file. Promotion from the waiting list is the existing accept path and depends on it.';
  END IF;

  v_list_oid := to_regprocedure('public.fn_soi_waiting_list(uuid)');
  v_mine_oid := to_regprocedure('public.fn_soi_my_waiting_list_place(uuid)');

  IF v_list_oid IS NULL OR v_mine_oid IS NULL THEN
    RAISE EXCEPTION 'The waiting-list functions are not both present after this migration.';
  END IF;

  -- Both must be SECURITY DEFINER, unreachable by anon, reachable by a signed-in
  -- caller. Writing no GRANT is not the same as denying one, so both directions
  -- are proved rather than assumed.
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_list_oid) THEN
    RAISE EXCEPTION 'fn_soi_waiting_list is not SECURITY DEFINER.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_mine_oid) THEN
    RAISE EXCEPTION 'fn_soi_my_waiting_list_place is not SECURITY DEFINER.';
  END IF;

  IF has_function_privilege('anon', v_list_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_soi_waiting_list — the REVOKE did not take.';
  END IF;
  IF has_function_privilege('anon', v_mine_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_soi_my_waiting_list_place — the REVOKE did not take.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_list_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_soi_waiting_list — the GRANT did not take.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_mine_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_soi_my_waiting_list_place — the GRANT did not take.';
  END IF;

  -- The setting must no longer claim the waiting list is unbuilt, and must
  -- describe the behaviour that now exists. Both halves are checked: dropping
  -- the old phrase without saying anything true would pass a one-sided test.
  -- Passes vacuously where the S1 seed has not run, which is correct — there is
  -- nothing making either claim there.
  SELECT count(*) INTO v_bad
  FROM public.platform_policies
  WHERE policy_key = 'soi.batch_full_behaviour'
    AND ui_consequence IS DISTINCT FROM NULL
    AND (position('not built yet' in ui_consequence) > 0
         OR position('waiting list' in ui_consequence) = 0);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      '% soi.batch_full_behaviour row(s) still describe the waiting list as unbuilt, or no longer describe it at all — the setting and the behaviour disagree.', v_bad;
  END IF;

  RAISE NOTICE 'School of Influence: waiting list reads installed (coordinator + own place), and soi.batch_full_behaviour now describes a waiting list that exists. Promotion stays the existing manual accept path — no automatic enrolment was added.';
END;
$assert$;

-- ROLLBACK (down migration) — removes the two reads and restores the wording
-- 20260808200000 left behind. The false "not built yet" sentence comes back on
-- purpose: a rollback must reproduce what was there, and with the reads gone it
-- is true again.
--   DROP FUNCTION IF EXISTS public.fn_soi_my_waiting_list_place(uuid);
--   DROP FUNCTION IF EXISTS public.fn_soi_waiting_list(uuid);
--   UPDATE public.platform_policies
--      SET ui_consequence =
--            'What a full batch does. Today both options behave the same way: the '
--            'acceptance is refused and the coordinator is told which batches still '
--            'have room. The waiting-list option is not built yet — choosing it holds '
--            'nobody on a list.',
--          ui_options = $json$[
--            {"value":"waitlist","label":"Hold them on a waiting list (not built yet — behaves the same as the option below)"},
--            {"value":"offer_another_batch","label":"Point them to a batch that still has room (default)"}
--          ]$json$::jsonb,
--          ui_cascade = $json$[
--            {"effect":"Neither option changes anything today: a full batch refuses the acceptance and names the batches that still have room","severity":"low"},
--            {"effect":"If the waiting list is built later, it would leave applicants with no access until a place frees up, so somebody would have to work that list","severity":"high"}
--          ]$json$::jsonb
--    WHERE policy_key = 'soi.batch_full_behaviour';
