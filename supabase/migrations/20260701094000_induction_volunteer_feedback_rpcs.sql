-- ============================================================================
-- Fresher Induction — PR2: peer-mentor feedback RPCs (the scale layer's engine)
-- File: 20260701094000_induction_volunteer_feedback_rpcs.sql  | Date: 2026-07-01
-- Spec: specs/yip-volunteer-kiosk-study-and-induction-port-2026-06-30.md §C5
--       specs/induction-feedback-coverage-no-smartphone-2026-06-30.md (Director decisions)
--
-- REQUIRES PR1 FIRST: fn_induction_volunteer_submit_feedback writes
--   public.event_session_feedback.capture_method / submitted_by, which PR1's
--   migration 20260701090000_* adds. Apply PR1 before this file.
--
-- Eight DEFINER + anon-revoked RPCs:
--   manage (lead / college coordinator):
--     fn_induction_assignable_peer_mentors  — pick a senior student
--     fn_induction_appoint_feedback_volunteer / _remove_  — appoint / remove
--     fn_induction_list_feedback_volunteers — coverage dashboard (group vs captured)
--     fn_induction_autobalance_feedback_volunteers — coverage balancer (no-account first)
--   mentor (a senior student on their phone):
--     fn_induction_my_volunteer_sessions    — the sessions I cover + my progress
--     fn_induction_my_feedback_group        — my assigned freshers for one session
--     fn_induction_volunteer_submit_feedback — write 1–5 for MY group only (kiosk)
--
-- Gate choice (deliberate deviation from cloning fn_induction_assign_coordinator's
--   lead-only gate): appointing a peer mentor is EVENT-scoped, not a global role
--   grant, and the panel lives on the event page that each college coordinator
--   already runs. So the manage RPCs use the SAME event-institution gate as the
--   attendance / feedback writers — induction.manage + role_has_institution_access
--   — letting both the Induction Lead AND each college's coordinator manage their
--   own induction's mentors. The mentor RPCs gate on "is the caller an active
--   appointed volunteer for this event" (resolved via get_my_learner_id()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. assignable peer mentors — senior students (with a login) of the event's
--    college who are NOT freshers in THIS induction and not already a mentor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_peer_mentors(
  p_event_id UUID, p_query TEXT DEFAULT NULL
)
RETURNS TABLE (learner_id UUID, full_name TEXT, register_number TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT lp.id,   -- DISTINCT: a learner with >1 profile in the college appears once (review #1694)
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text
  FROM public.learners_profiles lp
  -- must have a login in THIS college (so they can actually use the mentor page)
  JOIN public.profiles p ON p.learner_id = lp.id AND p.institution_id = v_inst
  WHERE NOT EXISTS (  -- not a fresher being inducted here
          SELECT 1 FROM public.induction_enrollment ie
          WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
    AND NOT EXISTS (  -- not already an active mentor on this event
          SELECT 1 FROM public.induction_feedback_volunteers v
          WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
    AND (
      p_query IS NULL OR p_query = ''
      OR btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')) ILIKE '%' || p_query || '%'
      OR lp.register_number ILIKE '%' || p_query || '%'
    )
  ORDER BY 2
  LIMIT 25;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. appoint a peer mentor (idempotent; re-appoint reactivates + updates cap).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_appoint_feedback_volunteer(
  p_event_id UUID, p_learner_id UUID, p_capacity INTEGER DEFAULT 20
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst UUID; v_id UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not authorized';
  END IF;
  IF p_learner_id IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: learner_id required'; END IF;
  -- guard: never appoint a fresher of THIS induction as a mentor.
  IF EXISTS (SELECT 1 FROM public.induction_enrollment ie
             WHERE ie.event_id = p_event_id AND ie.learner_id = p_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is a fresher in this induction';
  END IF;
  -- guard: the learner must be a MEMBER of this college (a profile in v_inst).
  -- Don't trust the client-supplied id — mirror the assignable query's JOIN so an
  -- out-of-college learner can't be appointed and then read this college's roster PII
  -- via fn_induction_my_feedback_group. (Closes the cross-tenant gap; review #1694.)
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = p_learner_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is not a member of this college';
  END IF;

  INSERT INTO public.induction_feedback_volunteers
    (event_id, learner_id, institution_id, capacity, is_active, appointed_by)
  VALUES (p_event_id, p_learner_id, v_inst, LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200), true, auth.uid())
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    is_active = true,
    capacity  = LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(UUID, UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(UUID, UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. remove a peer mentor (hard delete; cascades their group → freshers freed).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_remove_feedback_volunteer(
  p_event_id UUID, p_learner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not authorized';
  END IF;
  DELETE FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND learner_id = p_learner_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_remove_feedback_volunteer(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_remove_feedback_volunteer(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. list peer mentors + their coverage (group size vs freshers captured).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id UUID)
RETURNS TABLE (
  learner_id      UUID,
  full_name       TEXT,
  register_number TEXT,
  capacity        INTEGER,
  is_active       BOOLEAN,
  group_size      INTEGER,
  captured        INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not authorized';
  END IF;

  RETURN QUERY
  SELECT v.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         v.capacity,
         v.is_active,
         (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
            WHERE g.volunteer_id = v.id),
         (SELECT count(DISTINCT g.learner_id)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.event_session_feedback f
              ON f.event_id = v.event_id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id)
  FROM public.induction_feedback_volunteers v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.event_id = p_event_id
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. coverage balancer — assign every enrolled fresher to exactly one active
--    mentor. NO-ACCOUNT FIRST (the silent 155 are guaranteed an owner even under
--    capacity pressure), round-robin balanced, capacity-capped, idempotent
--    (full deterministic rebalance: clear then reassign).
-- ----------------------------------------------------------------------------
-- DROP needed: return type changes INTEGER → TABLE (Postgres forbids CREATE OR REPLACE across that).
DROP FUNCTION IF EXISTS public.fn_induction_autobalance_feedback_volunteers(UUID, INTEGER);
CREATE FUNCTION public.fn_induction_autobalance_feedback_volunteers(
  p_event_id UUID, p_capacity INTEGER DEFAULT NULL
)
RETURNS TABLE (enrolled INTEGER, assigned INTEGER, unassigned INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst UUID; v_nvol INTEGER; v_enrolled INTEGER; v_assigned INTEGER;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not authorized';
  END IF;

  SELECT count(*) INTO v_nvol
  FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND is_active;
  IF v_nvol = 0 THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: no active feedback volunteers — appoint at least one first';
  END IF;

  -- full deterministic rebalance
  DELETE FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;

  WITH active_vols AS (
    -- Effective per-mentor cap, clamped to [1,200] to bound slot generation: a direct
    -- RPC call with a huge p_capacity would otherwise materialize billions of slots →
    -- self-DoS (review #1694 r3 MEDIUM). p_capacity, WHEN PROVIDED, overrides per-run
    -- WITHOUT persisting (a per-mentor cap set elsewhere is never clobbered — r3 LOW);
    -- WHEN NULL, each mentor's own stored capacity drives balancing.
    SELECT id,
           LEAST(GREATEST(COALESCE(p_capacity, capacity), 1), 200) AS capacity,
           (row_number() OVER (ORDER BY created_at, id) - 1) AS vord
    FROM public.induction_feedback_volunteers
    WHERE event_id = p_event_id AND is_active
  ),
  -- each mentor contributes `capacity` slots; deal round-robin (round, then mentor
  -- order) so a mentor with capacity 1 takes exactly one fresher.
  ordered_slots AS (
    SELECT v.id AS volunteer_id,
           (row_number() OVER (ORDER BY gs.n, v.vord) - 1) AS slot_idx
    FROM active_vols v
    CROSS JOIN LATERAL generate_series(1, v.capacity) AS gs(n)
  ),
  ranked AS (
    SELECT ie.learner_id,
           (row_number() OVER (
              ORDER BY
                -- no-account FIRST (institution-scoped: a profile in ANOTHER college
                -- does NOT count as "has account" here — review #1694)
                (EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.learner_id = ie.learner_id AND p.institution_id = v_inst)),
                ie.batch_id NULLS FIRST,
                lp.first_name, lp.last_name, ie.learner_id
            ) - 1) AS rn
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  assign AS (
    -- fresher rn → slot rn; freshers with rn >= total slots stay UNASSIGNED (surfaced below)
    SELECT r.learner_id, s.volunteer_id
    FROM ranked r
    JOIN ordered_slots s ON s.slot_idx = r.rn
  )
  INSERT INTO public.induction_feedback_volunteer_group (volunteer_id, event_id, learner_id)
  SELECT a.volunteer_id, p_event_id, a.learner_id FROM assign a
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    volunteer_id = EXCLUDED.volunteer_id, updated_at = now();
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment WHERE event_id = p_event_id;

  -- Surface the coverage TRUTH: if capacity×mentors < enrolled, some freshers have NO
  -- owner. The UI warns when unassigned > 0 instead of implying full coverage
  -- (review #1694 HIGH: silent coverage gap).
  enrolled   := v_enrolled;
  assigned   := v_assigned;
  unassigned := v_enrolled - v_assigned;
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. mentor: the sessions I cover (across my events) + my live progress.
--    Self-scoped via get_my_learner_id(); empty for non-mentors (no leak).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_volunteer_sessions()
RETURNS TABLE (
  event_id          UUID,
  event_name        TEXT,
  institution_name  TEXT,
  session_id        UUID,
  session_title     TEXT,
  day_number        INTEGER,
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  group_size        INTEGER,
  captured          INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_my_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_volunteer_sessions: not authenticated'; END IF;
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RETURN; END IF;  -- not a learner → empty

  RETURN QUERY
  SELECT v.event_id,
         ev.name::text,
         inst.name::text,
         s.id,
         s.title::text,
         s.day_number,
         s.start_at,
         s.end_at,
         -- my group size for THIS session (respect batch-specific sessions)
         (SELECT count(*)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.induction_enrollment ie
              ON ie.event_id = v.event_id AND ie.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id
              AND (s.batch_id IS NULL OR ie.batch_id = s.batch_id)),
         -- of those (within the session's batch), how many already have a rating —
         -- same batch guard as group_size so captured can never exceed it (review #1694 r2)
         (SELECT count(*)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.induction_enrollment ie
              ON ie.event_id = v.event_id AND ie.learner_id = g.learner_id
            JOIN public.event_session_feedback f
              ON f.session_id = s.id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id
              AND (s.batch_id IS NULL OR ie.batch_id = s.batch_id))
  FROM public.induction_feedback_volunteers v
  JOIN public.events ev ON ev.id = v.event_id
  LEFT JOIN public.institutions inst ON inst.id = v.institution_id
  JOIN public.event_sessions s ON s.event_id = v.event_id
  WHERE v.learner_id = v_my_learner AND v.is_active
  ORDER BY ev.name, s.day_number NULLS LAST, s.start_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_volunteer_sessions() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_volunteer_sessions() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. mentor: my assigned freshers for one session — silent / no-account first,
--    flagging has_account + captured so the mentor targets the unheard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_feedback_group(p_session_id UUID)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  has_account     BOOLEAN,
  captured        BOOLEAN,
  capture_method  TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event UUID; v_sbatch UUID; v_my_learner UUID; v_vol UUID; v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  -- #1694 r6 (LOW): guard NULL like the sibling RPCs. Without it, has_account's
  -- institution-scoped EXISTS (... institution_id = v_inst) is false for everyone,
  -- mislabeling every fresher as 'no account'. Fail closed on a missing-program session.
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an induction session'; END IF;

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not a learner'; END IF;
  SELECT v.id INTO v_vol
  FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_my_feedback_group: not an assigned feedback volunteer'; END IF;

  RETURN QUERY
  SELECT lp.id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         -- has_account institution-scoped via EXISTS (no profiles JOIN → no duplicate
         -- rows, and a profile in ANOTHER college doesn't count — review #1694 round 2).
         EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = lp.id AND p.institution_id = v_inst) AS has_account,
         (f.id IS NOT NULL) AS captured,
         f.capture_method::text
  FROM public.induction_feedback_volunteer_group g
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = v_event AND ie.learner_id = g.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN public.event_session_feedback f ON f.session_id = p_session_id AND f.learner_id = g.learner_id
  WHERE g.volunteer_id = v_vol
    AND (v_sbatch IS NULL OR ie.batch_id = v_sbatch)   -- batch-specific session → only its batch
  ORDER BY 5, 6, 2;  -- no-account first (col5 has_account), then uncaptured (col6), then name (col2)
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_feedback_group(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_feedback_group(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. mentor: write 1–5 (+ comment) for freshers in MY group only.
--    capture_method='volunteer_kiosk', submitted_by=auth.uid() (the mentor).
--    ANTI-CLOBBER: never overwrite a fresher's own-login row (submitted_by NULL).
--    A later own-login submission re-marks the row to 'phone' (PR1's self RPC).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_submit_feedback(
  p_session_id UUID, p_marks JSONB   -- [{learner_id, rating, comment?}]
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event UUID; v_sbatch UUID; v_inst UUID; v_my_learner UUID; v_vol UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not an induction session'; END IF;

  -- AUTHORIZATION: caller must be an active appointed mentor for THIS event.
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not a learner'; END IF;
  SELECT v.id INTO v_vol
  FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not an assigned feedback volunteer'; END IF;

  -- SCOPE + FILTER (don't abort): the in-group / enrolled / batch / range checks below
  -- SKIP ineligible rows rather than RAISE-aborting the whole batch — if an autobalance
  -- or removal moves one fresher between the mentor's load and save, the rest of the
  -- collected kiosk ratings still save (review #1694 r5; matches the proxy writer). A
  -- mentor still cannot write outside their group: the in-group EXISTS filters it out.
  -- DISTINCT ON also dedupes a learner repeated in the payload (else ON CONFLICT "cannot
  -- affect row a second time" would abort the save).
  WITH valid AS (
    SELECT DISTINCT ON ((e->>'learner_id')::uuid)
           (e->>'learner_id')::uuid AS learner_id,
           (e->>'rating')::int       AS rating,
           NULLIF(btrim(coalesce(e->>'comment','')), '') AS comment
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'rating') IS NOT NULL
      AND (e->>'rating')::int BETWEEN 1 AND 5
      AND EXISTS (   -- in my group
        SELECT 1 FROM public.induction_feedback_volunteer_group g
        WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      AND EXISTS (   -- enrolled + (if batch-specific) in the session's batch
        SELECT 1 FROM public.induction_enrollment ie
        WHERE ie.event_id = v_event AND ie.learner_id = (e->>'learner_id')::uuid
          AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch))
    ORDER BY (e->>'learner_id')::uuid
  )
  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  SELECT p_session_id, v.learner_id, v_event, v_inst, v.rating, v.comment, 'volunteer_kiosk', auth.uid()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    capture_method = 'volunteer_kiosk', submitted_by = EXCLUDED.submitted_by, updated_at = now()
  -- ANTI-CLOBBER: a fresher's OWN-LOGIN row (submitted_by IS NULL) is never
  -- overwritten; a mentor may still correct an earlier kiosk row.
  WHERE public.event_session_feedback.submitted_by IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- refresh the leading metric for every touched fresher (same as the phone/self RPC).
  -- DISTINCT source: a learner repeated in the payload must not yield two completion rows
  -- for the same (event,learner) → ON CONFLICT "cannot affect row a second time" would
  -- abort the save (review #1694 r5 MEDIUM; matches the proxy writer's deduped refresh).
  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  SELECT v_event, picked.learner_id, v_inst,
         (SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
            WHERE f.event_id = v_event AND f.learner_id = picked.learner_id),
         now()
  FROM (
    SELECT DISTINCT (e->>'learner_id')::uuid AS learner_id
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'rating') IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                  WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      -- #1694 r6 (MEDIUM): only learners with an actual feedback row for this event get a
      -- value_score_avg refresh. A grouped, rating-present-but-FILTERED fresher (batch
      -- mismatch, dropped from `valid`) with no feedback row would otherwise upsert NULL,
      -- polluting the metric. The feedback-row EXISTS re-aligns `picked` with `valid`.
      AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                  WHERE f.event_id = v_event AND f.learner_id = (e->>'learner_id')::uuid)
  ) picked
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_n;  -- rows written/updated; UI compares to submitted count to show "N skipped (self-rated)"
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(UUID, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
