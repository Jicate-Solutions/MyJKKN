-- ============================================================================
-- SCHOOL OF INFLUENCE — session attendance + derived completion (S6)
-- Created: 2026-07-30  (spec: specs/school-of-influence-batches-2026-07-30.md, §7 S6)
-- ============================================================================
-- Decisions implemented here (spec §2):
--   D9  Completion ONLY if the attendance share meets
--       soi.completion.min_attendance_pct, READ AT RUNTIME per batch. There is no
--       literal threshold at any call site — see "NO HARDCODED THRESHOLD" below.
--   D11 A coordinator ticks a list each session.
--
-- NO NEW TABLE, NO NEW COLUMN, NO NEW RLS POLICY, NO STORED COMPLETION FLAG.
--   Sessions are public.event_sessions rows and marks are
--   public.event_session_attendance rows — the same pair that already carries
--   855 marks across 43 sessions. Completion is a DERIVED READ
--   (fn_soi_batch_completion) recomputed from those marks on every call. A
--   denormalised `completed` boolean is deliberately NOT introduced: it is the
--   one shape that can drift away from the attendance it claims to summarise,
--   and a completion record that silently disagrees with the register is the
--   failure mode spec §5 names ("claims X while doing nothing is a FAILURE").
--
-- WHY EVERYTHING GOES THROUGH SECURITY DEFINER RPCs (measured live 2026-07-30)
--   Both underlying tables are already RLS-locked AGAINST this module:
--     • event_sessions   — policy event_sessions_admin (20260627180000) is
--       FOR ALL USING (is_super_admin() OR is_admin()). Nobody else touches the
--       raw table; induction itself reaches it only through DEFINER RPCs.
--     • event_session_attendance — policies esa_manage / esa_view
--       (20260627160000) are gated on induction.manage / induction.view.
--   A School of Influence coordinator holds cohort.manage, NOT induction.manage,
--   so direct table access returns ZERO ROWS and writes fail silently under RLS.
--   Widening those policies to admit cohort.manage would hand SoI coordinators
--   every induction register on the platform. So this file adds NO policy and
--   instead follows the pattern induction already established: narrow DEFINER
--   functions that authorise against THIS batch and can only ever read or write
--   sessions belonging to THIS programme's event.
--
-- IDENTITY BRIDGE — the structural gotcha, surfaced not swallowed
--   cohort_memberships.member_ref is a profiles.id (SoiBatchService resolves every
--   member to one, which is what makes D10's unique index read as
--   "one human, one batch"). But event_session_attendance.learner_id is
--   NOT NULL REFERENCES learners_profiles(id). The bridge is profiles.learner_id.
--   D4 admits STAFF as programme members, and a staff profile has learner_id NULL
--   — such a member CANNOT be given an attendance row at all (FK violation).
--   Rather than score them 0% and report them as having failed, every read below
--   returns attendance_trackable=false plus a plain-English reason, and
--   fn_soi_batch_completion returns completion_state='not_tracked' for them. They
--   are excluded from the completion verdict, never silently failed by it, and a
--   coordinator can see exactly why on screen (CLAUDE.md rule 27).
--
-- NO HARDCODED THRESHOLD
--   fn_soi_batch_completion reads soi.completion.min_attendance_pct through the
--   shared fn_get_policy_int reader, scoped to the batch. The spec §4 default is
--   declared ONCE, as a named constant inside that one function, and the
--   EFFECTIVE value is returned in every result row so the screen displays the
--   number it actually used. Nothing downstream re-states it.
--   S1 has since landed (20260731180000 taught fn_get_policy the 'cohort' branch,
--   20260731180200 seeded soi.completion.min_attendance_pct at 75), so a
--   per-batch override resolves for real: scope_type='cohort' with
--   scope_id = the batch beats the programme-wide cohort row, which beats global.
--   The in-function bounds re-check below is therefore belt-and-braces against
--   trg_guard_soi_policy_thresholds (20260731180100), not a substitute for it —
--   a threshold reader must not depend on a trigger it cannot see having run.
--
-- NEW POLICY KEY this section READS but does NOT seed (spec §8 config-not-constants):
--   soi.completion.attending_statuses — text, default 'present,od'.
--   Suggested ui_category 'School of Influence', ui_widget 'text',
--   ui_consequence: "Which attendance marks count towards completion. The
--   default counts someone as attending when they were present or on official
--   duty; excused and absent do not count. Widening this makes completion easier
--   to reach for everyone, including people already recorded."
--   It is NOT in the S1 seed (20260731180200 carries the 15 keys of spec §4 and
--   this is a 16th). fn_soi_attending_statuses works correctly before the row
--   exists — the documented default IS the induction convention — so seeding it
--   is a follow-up for whoever owns the settings surface, not a blocker here.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. This file carries no
-- BEGIN;/COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN..ROLLBACK
-- stays a genuine dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. Shared guard — may the caller run this batch? ─────────────────────────
-- Authorises against the BATCH, so a coordinator can only ever reach sessions of
-- a programme they administer. Guard order is the repo-canonical one and every
-- SECDEF predicate is COALESCEd: is_super_admin() and is_admin() return NULL for
-- a caller with no profile row, and `NULL OR x` would fall through to x instead
-- of denying (ref feedback_secdef_guard_not_null_safe_falls_through).
--
-- Takes NO caller-supplied user id — identity comes from auth.uid() inside the
-- shared helpers, which is what keeps this out of the IDOR shape that
-- feedback_secdef_caller_supplied_user_id_is_an_idor documents.
CREATE OR REPLACE FUNCTION public.fn_soi_can_manage_batch(p_cohort_id uuid)
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
  SELECT c.institution_id, c.kind INTO v_inst, v_kind
  FROM public.cohorts c
  WHERE c.id = p_cohort_id;

  -- Unknown cohort, or a cohort of another programme, is never manageable here.
  IF v_inst IS NULL OR v_kind IS DISTINCT FROM 'school_of_influence' THEN
    RETURN false;
  END IF;

  RETURN COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR (COALESCE(public.user_has_permission('cohort.manage'), false)
          AND COALESCE(public.role_has_institution_access(v_inst), false));
END;
$$;

COMMENT ON FUNCTION public.fn_soi_can_manage_batch(uuid) IS
  'School of Influence S6: may the signed-in caller run this batch? '
  'cohort.manage scoped to the batch institution; super admin / admin first. '
  'Returns false for any cohort that is not kind=school_of_influence.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_can_manage_batch(uuid) TO authenticated;


-- ── 2. Which marks count as attending (spec §8 config-not-constants) ─────────
-- Read at runtime from soi.completion.attending_statuses. The default matches
-- the convention the induction register already uses on this very table
-- ("Present and OD count toward completion"), so the two modules cannot disagree
-- about what a tick means. Unrecognised entries are dropped rather than guessed,
-- and an empty result falls back to the default: a misconfigured row must never
-- silently make it impossible for anyone to complete.
CREATE OR REPLACE FUNCTION public.fn_soi_attending_statuses(p_cohort_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Spec §8 default for soi.completion.attending_statuses, declared once.
  c_default constant text := 'present,od';
  v_raw     text;
  v_out     text[];
BEGIN
  v_raw := public.fn_get_policy_text('soi.completion.attending_statuses', c_default, p_cohort_id);

  SELECT COALESCE(array_agg(s.t), '{}'::text[]) INTO v_out
  FROM (
    SELECT DISTINCT btrim(lower(x)) AS t
    FROM unnest(string_to_array(COALESCE(v_raw, c_default), ',')) AS x
  ) s
  -- Must stay inside event_session_attendance's own CHECK vocabulary.
  WHERE s.t IN ('present', 'absent', 'excused', 'od');

  IF v_out = '{}'::text[] THEN
    v_out := string_to_array(c_default, ',');
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_attending_statuses(uuid) IS
  'School of Influence S6: which event_session_attendance statuses count towards '
  'completion, read at runtime from soi.completion.attending_statuses '
  '(default present,od — the same convention the induction register uses).';

REVOKE EXECUTE ON FUNCTION public.fn_soi_attending_statuses(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_attending_statuses(uuid) TO authenticated;


-- ── 3. The programme's sessions (P4 — the means to create them) ──────────────
-- Spec §6 P4: this event has ZERO sessions and D9/D11 need some. This is the
-- means to create one; NO session is created by this migration.
--
-- The event is derived from the batch (cohorts.config.source_event_id), never
-- passed in, so a coordinator cannot aim a write at somebody else's event by
-- supplying a different id.
CREATE OR REPLACE FUNCTION public.fn_soi_create_session(
  p_cohort_id  uuid,
  p_title      text,
  p_start_at   timestamptz,
  p_end_at     timestamptz,
  p_venue_text text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event uuid;
  v_order integer;
  v_id    uuid;
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to add sessions to this School of Influence batch. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid INTO v_event
  FROM public.cohorts c WHERE c.id = p_cohort_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'This batch is not linked to a programme event yet, so it has nowhere to put a session. Set the batch''s source event first.'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'A session needs a title.' USING ERRCODE = '22023';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'A session must finish after it starts.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(s.session_order), 0) + 1 INTO v_order
  FROM public.event_sessions s WHERE s.event_id = v_event;

  INSERT INTO public.event_sessions
    (event_id, title, start_at, end_at, session_order, venue_text, status, created_by)
  VALUES
    (v_event, btrim(p_title), p_start_at, p_end_at, v_order,
     NULLIF(btrim(COALESCE(p_venue_text, '')), ''), 'scheduled', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_create_session(uuid, text, timestamptz, timestamptz, text) IS
  'School of Influence S6 (spec P4): add one session to the programme event that '
  'this batch points at. The event is derived from the cohort, never supplied.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_create_session(uuid, text, timestamptz, timestamptz, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_create_session(uuid, text, timestamptz, timestamptz, text)
  TO authenticated;


-- ── 4. List the programme's sessions, with this batch's marking progress ─────
-- marked_count / present_count are scoped to THIS batch's members, so two
-- parallel batches (D1) sharing one session each see their own progress.
CREATE OR REPLACE FUNCTION public.fn_soi_list_sessions(p_cohort_id uuid)
RETURNS TABLE (
  session_id     uuid,
  title          text,
  start_at       timestamptz,
  end_at         timestamptz,
  venue_text     text,
  session_status text,
  session_order  integer,
  has_happened   boolean,
  marked_count   integer,
  present_count  integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event    uuid;
  v_statuses text[];
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to view this School of Influence batch''s sessions. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid INTO v_event
  FROM public.cohorts c WHERE c.id = p_cohort_id;

  IF v_event IS NULL THEN
    RETURN;  -- no event linked yet: no sessions, not an error
  END IF;

  v_statuses := public.fn_soi_attending_statuses(p_cohort_id);

  RETURN QUERY
  WITH batch_learners AS (
    SELECT p.learner_id AS lid
    FROM public.cohort_memberships m
    JOIN public.profiles p ON p.id = m.member_ref
    WHERE m.cohort_id = p_cohort_id
      AND m.status NOT IN ('graduated', 'removed')
      AND p.learner_id IS NOT NULL
  )
  SELECT
    s.id::uuid,
    s.title::text,
    s.start_at::timestamptz,
    s.end_at::timestamptz,
    s.venue_text::text,
    s.status::text,
    s.session_order::integer,
    (s.end_at <= now())::boolean,
    COALESCE(a.marked, 0)::integer,
    COALESCE(a.present, 0)::integer
  FROM public.event_sessions s
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS marked,
      COUNT(*) FILTER (WHERE esa.status = ANY (v_statuses))::integer AS present
    FROM public.event_session_attendance esa
    WHERE esa.session_id = s.id
      AND esa.learner_id IN (SELECT bl.lid FROM batch_learners bl)
  ) a ON true
  WHERE s.event_id = v_event
  ORDER BY s.start_at, s.session_order;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_list_sessions(uuid) IS
  'School of Influence S6: the programme''s sessions with THIS batch''s marking '
  'progress. Read-only; authorised against the batch.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_list_sessions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_list_sessions(uuid) TO authenticated;


-- ── 5. The tick-list roster for one session (D11) ────────────────────────────
-- One row per batch member who still occupies a seat (non-terminal status —
-- the same predicate SoiBatchService.SOI_OCCUPYING_STATUSES derives from the
-- spine's transition map, so a paused member still appears and is not quietly
-- dropped from the register).
--
-- attendance_trackable / untrackable_reason carry the identity-bridge truth to
-- the screen instead of hiding it: a staff member has no learners_profiles row,
-- so no mark can be stored for them, and the coordinator is told so in words.
CREATE OR REPLACE FUNCTION public.fn_soi_session_roster(
  p_cohort_id  uuid,
  p_session_id uuid
)
RETURNS TABLE (
  membership_id        uuid,
  profile_id           uuid,
  full_name            text,
  member_type          text,
  membership_status    text,
  attendance_trackable boolean,
  untrackable_reason   text,
  marked_status        text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to open this School of Influence register. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  -- The session must belong to THIS batch's programme event. Without this a
  -- coordinator could read any session's roster by id.
  SELECT true INTO v_ok
  FROM public.event_sessions s
  JOIN public.cohorts c ON c.id = p_cohort_id
  WHERE s.id = p_session_id
    AND s.event_id = NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid;

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'That session does not belong to this batch''s programme.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    m.id::uuid,
    p.id::uuid,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unnamed')::text,
    m.member_type::text,
    m.status::text,
    (p.learner_id IS NOT NULL)::boolean,
    CASE
      WHEN p.learner_id IS NOT NULL THEN NULL
      ELSE 'Attendance cannot be recorded for this person: the register stores marks against a learner record, and this profile has none (staff profiles usually do not). They stay in the batch and are left out of the completion figures rather than counted as absent.'
    END::text,
    esa.status::text
  FROM public.cohort_memberships m
  JOIN public.profiles p ON p.id = m.member_ref
  LEFT JOIN public.event_session_attendance esa
         ON esa.session_id = p_session_id
        AND esa.learner_id = p.learner_id
  WHERE m.cohort_id = p_cohort_id
    AND m.status NOT IN ('graduated', 'removed')
  ORDER BY (p.learner_id IS NULL),
           COALESCE(NULLIF(btrim(p.full_name), ''), p.email);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_session_roster(uuid, uuid) IS
  'School of Influence S6 (D11): the tick-list for one session — every batch '
  'member still holding a seat, their current mark, and whether a mark can be '
  'stored for them at all.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_session_roster(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_session_roster(uuid, uuid) TO authenticated;


-- ── 6. Save the ticks (D11) ──────────────────────────────────────────────────
-- p_marks: [{"profile_id":"…","status":"present"}, …]. Keyed on profile_id
-- because that is what the batch roster is keyed on; the learners_profiles id is
-- resolved here so no caller has to know about the bridge.
--
-- Rejects, loudly:
--   • a profile that is not a live member of THIS batch (no cross-batch writes)
--   • a member with no learner record (rather than dropping them silently)
--   • a status outside the table's own vocabulary
-- One rejected row rejects the whole save, so a coordinator never sees "saved"
-- over a partially-written register.
CREATE OR REPLACE FUNCTION public.fn_soi_mark_session_attendance(
  p_cohort_id  uuid,
  p_session_id uuid,
  p_marks      jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event uuid;
  v_inst  uuid;
  v_n     integer;
  v_bad   text;
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to mark attendance for this School of Influence batch. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.institution_id, NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid
    INTO v_inst, v_event
  FROM public.cohorts c WHERE c.id = p_cohort_id;

  IF v_event IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.event_sessions s
                    WHERE s.id = p_session_id AND s.event_id = v_event) THEN
    RAISE EXCEPTION 'That session does not belong to this batch''s programme.'
      USING ERRCODE = '22023';
  END IF;

  IF p_marks IS NULL OR jsonb_typeof(p_marks) <> 'array' OR jsonb_array_length(p_marks) = 0 THEN
    RAISE EXCEPTION 'No attendance marks were supplied.' USING ERRCODE = '22023';
  END IF;

  -- Vocabulary check first: a typo must not be stored as an absence.
  SELECT string_agg(DISTINCT (mk ->> 'status'), ', ') INTO v_bad
  FROM jsonb_array_elements(p_marks) mk
  WHERE COALESCE(mk ->> 'status', '') NOT IN ('present', 'absent', 'excused', 'od');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unrecognised attendance mark(s): %. Use present, absent, excused or od.', v_bad
      USING ERRCODE = '22023';
  END IF;

  -- Every marked person must be a live member of THIS batch AND have a learner
  -- record. Named explicitly so the coordinator can act on it (rule 27).
  SELECT string_agg(DISTINCT COALESCE(NULLIF(btrim(p.full_name), ''), mk ->> 'profile_id'), ', ')
    INTO v_bad
  FROM jsonb_array_elements(p_marks) mk
  LEFT JOIN public.profiles p ON p.id = (mk ->> 'profile_id')::uuid
  LEFT JOIN public.cohort_memberships m
         ON m.cohort_id = p_cohort_id
        AND m.member_ref = (mk ->> 'profile_id')::uuid
        AND m.status NOT IN ('graduated', 'removed')
  WHERE m.id IS NULL OR p.learner_id IS NULL;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Attendance could not be saved for: %. Each person must still be in this batch and must have a learner record. Nothing was saved.', v_bad
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, p.learner_id, v_inst, (mk ->> 'status'), auth.uid(), now()
  FROM jsonb_array_elements(p_marks) mk
  JOIN public.profiles p ON p.id = (mk ->> 'profile_id')::uuid
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status     = EXCLUDED.status,
    marked_by  = EXCLUDED.marked_by,
    marked_at  = now(),
    updated_at = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_mark_session_attendance(uuid, uuid, jsonb) IS
  'School of Influence S6 (D11): save one session''s ticks. Keyed on profiles.id; '
  'resolves the learner record itself. All-or-nothing — a member who cannot be '
  'marked fails the whole save with a named reason.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_mark_session_attendance(uuid, uuid, jsonb)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_mark_session_attendance(uuid, uuid, jsonb)
  TO authenticated;


-- ── 7. Completion — DERIVED, recomputable, never stored (D9) ─────────────────
-- Every number is computed from event_session_attendance at call time. Nothing
-- here writes, so a completion figure cannot drift from the register it
-- summarises: re-running this after a correction always agrees with the ticks.
--
-- Two denominators are returned on purpose, because "who is short and by how
-- much BEFORE the programme ends" cannot be answered by one:
--   • pct_to_date       — of the sessions that have ALREADY happened. The fair
--                         picture of how someone is doing right now.
--   • pct_of_programme  — of every scheduled session. What completion is
--                         ultimately judged on.
--   • sessions_still_needed / can_still_complete — the actionable pair: how many
--     of the remaining sessions this person must attend, and whether that is
--     still arithmetically possible. A coordinator can act on this weeks early.
--
-- completion_state:
--   'met'          — already at or above the bar for the whole programme.
--   'on_track'     — not there yet, but still reachable.
--   'cannot_meet'  — even attending everything left falls short.
--   'not_tracked'  — no learner record, so no mark can exist. NOT a failure.
CREATE OR REPLACE FUNCTION public.fn_soi_batch_completion(p_cohort_id uuid)
RETURNS TABLE (
  membership_id         uuid,
  profile_id            uuid,
  full_name             text,
  member_type           text,
  membership_status     text,
  attendance_trackable  boolean,
  sessions_scheduled    integer,
  sessions_held         integer,
  sessions_attended     integer,
  sessions_remaining    integer,
  pct_to_date           numeric,
  pct_of_programme      numeric,
  min_attendance_pct    integer,
  sessions_needed_total integer,
  sessions_still_needed integer,
  can_still_complete    boolean,
  completion_state      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Spec §4 default for soi.completion.min_attendance_pct, declared ONCE and used
  -- only as the reader's fallback. The effective value is returned in every row
  -- so the screen shows the number this actually ran against — there is no
  -- second copy of it anywhere in the codebase.
  c_spec_default_min_pct constant integer := 75;
  v_event     uuid;
  v_min       integer;
  v_statuses  text[];
  v_sched     integer;
  v_held      integer;
  v_remaining integer;
  v_needed    integer;
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to view completion for this School of Influence batch. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid INTO v_event
  FROM public.cohorts c WHERE c.id = p_cohort_id;

  -- p_scope_id = the batch: since 20260731180000 taught fn_get_policy the
  -- 'cohort' branch, a scope_type='cohort' row for THIS batch wins over the
  -- programme-wide cohort row, which wins over global.
  v_min := public.fn_get_policy_int('soi.completion.min_attendance_pct',
                                    c_spec_default_min_pct, p_cohort_id);
  -- trg_guard_soi_policy_thresholds (20260731180100) already rejects a value
  -- outside 0 < n <= 100 at write time. This re-check is deliberate anyway: a
  -- reader that decides who completes a programme must not silently depend on a
  -- trigger it cannot see having been present for every historical write.
  IF v_min IS NULL OR v_min <= 0 OR v_min > 100 THEN
    v_min := c_spec_default_min_pct;
  END IF;

  v_statuses := public.fn_soi_attending_statuses(p_cohort_id);

  -- Cancelled sessions count for nobody, in either the numerator or either
  -- denominator, so calling one off cannot push the whole batch below the bar.
  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE s.end_at <= now())::integer
    INTO v_sched, v_held
  FROM public.event_sessions s
  WHERE v_event IS NOT NULL
    AND s.event_id = v_event
    AND s.status <> 'cancelled';

  v_sched     := COALESCE(v_sched, 0);
  v_held      := COALESCE(v_held, 0);
  v_remaining := GREATEST(v_sched - v_held, 0);
  -- Rounded UP: at 75% of 10 sessions the bar is 8 (7.5 rounded up), never 7.
  v_needed    := CEIL(v_sched * v_min / 100.0)::integer;

  RETURN QUERY
  SELECT
    m.id::uuid,
    p.id::uuid,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unnamed')::text,
    m.member_type::text,
    m.status::text,
    (p.learner_id IS NOT NULL)::boolean,
    v_sched,
    v_held,
    att.attended,
    v_remaining,
    CASE WHEN v_held  > 0 THEN ROUND(att.attended * 100.0 / v_held,  1) ELSE 0::numeric END,
    CASE WHEN v_sched > 0 THEN ROUND(att.attended * 100.0 / v_sched, 1) ELSE 0::numeric END,
    v_min,
    v_needed,
    GREATEST(v_needed - att.attended, 0),
    CASE
      WHEN p.learner_id IS NULL THEN false
      ELSE (v_needed - att.attended) <= v_remaining
    END,
    CASE
      WHEN p.learner_id IS NULL                          THEN 'not_tracked'
      WHEN v_sched = 0                                   THEN 'on_track'
      WHEN att.attended >= v_needed                      THEN 'met'
      WHEN (v_needed - att.attended) <= v_remaining      THEN 'on_track'
      ELSE 'cannot_meet'
    END::text
  FROM public.cohort_memberships m
  JOIN public.profiles p ON p.id = m.member_ref
  CROSS JOIN LATERAL (
    SELECT COALESCE((
      SELECT COUNT(*)::integer
      FROM public.event_session_attendance esa
      JOIN public.event_sessions s2 ON s2.id = esa.session_id
      WHERE esa.learner_id = p.learner_id
        AND s2.event_id = v_event
        AND s2.status <> 'cancelled'
        AND esa.status = ANY (v_statuses)
    ), 0) AS attended
  ) att
  WHERE m.cohort_id = p_cohort_id
    AND m.status NOT IN ('graduated', 'removed')
  ORDER BY (p.learner_id IS NULL),
           COALESCE(NULLIF(btrim(p.full_name), ''), p.email);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_batch_completion(uuid) IS
  'School of Influence S6 (D9): completion as a DERIVED read — recomputed from '
  'event_session_attendance on every call, never stored. Reads '
  'soi.completion.min_attendance_pct at runtime and returns the effective value '
  'so nothing downstream restates it.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_batch_completion(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_batch_completion(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
