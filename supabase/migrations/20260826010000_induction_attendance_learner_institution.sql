-- ============================================================================
-- Induction — SHARED (cross-college) sessions, step 2 of 4: attendance that
-- knows which college the learner belongs to.
--
-- Builds on 20260821060000 (event_session_institutions — the per-session share
-- register, Director decisions D2/D10). That step deliberately only LABELLED a
-- session. This step makes the two attendance writers correct for a shared
-- session, and nothing else.
--
-- TWO DEFECTS, both read from production on 2026-08-13:
--
-- D-1  The stamp is the HOST's college, not the learner's.
--      Both writers insert `institution_id = v_inst`, where v_inst is
--      induction_programs.institution_id — the college that OWNS the induction
--      programme. All 855 live attendance rows therefore carry exactly ONE
--      distinct institution. A Nursing fresher marked present at a shared Arts
--      & Science session is filed under Arts & Science and is invisible to
--      Nursing's own reporting, which is precisely what Director decision D5
--      ("each college's numbers shown separately") asks for.
--      FIX: resolve the institution PER ROW from learners_profiles and stamp
--      COALESCE(lp.institution_id, v_inst). The COALESCE is required, not
--      defensive dressing: event_session_attendance.institution_id is NOT NULL
--      and 3 learners_profiles rows cluster-wide carry a NULL institution.
--
-- D-2  Authorization asks about the HOST's college.
--      `role_has_institution_access(v_inst)` is the host's institution, so a
--      JOINING college's coordinator cannot mark their own learners at all —
--      not even on a session their college has been shared into.
--      FIX: keep every existing branch untouched and ADD one branch for the
--      joining side — the session must be shared (a row in
--      event_session_institutions) with an institution the caller can reach,
--      AND the caller must hold induction.manage / induction.view.
--
-- THE SECURITY-CRITICAL HALF of D-2: a caller who qualifies ONLY through the
-- new joining branch is confined to their OWN learners. They may read and mark
-- only learners whose learners_profiles.institution_id is BOTH reachable by
-- them AND shared on this session — never the host's learners, never a third
-- college's. A payload containing any other learner is refused outright, with
-- the rejected count named, rather than silently filtered: a partial write
-- would leave a coordinator believing they had marked a full roster.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does NOT touch fn_induction_recompute_completion, and it moves ZERO
--     completion outcomes. Verified: recompute takes its institution from
--     induction_enrollment.institution_id and joins attendance on
--     (session_id, learner_id) only — it never reads
--     event_session_attendance.institution_id. The trailing PERFORM in both
--     writers is preserved verbatim.
--   * It does NOT rewrite the 855 existing rows. There is no UPDATE over the
--     table here. Correction is forward-only: a row's institution is
--     re-resolved when — and only when — a coordinator actually re-marks it
--     (the ON CONFLICT path now refreshes institution_id along with status, so
--     one function cannot produce two different stamps for the same learner
--     depending on whether a row happened to exist). A bulk backfill of the
--     855 remains a separate Director decision.
--   * It does NOT widen the DAY-level authorization. Sharing is per SESSION
--     (D2), so only the per-session writer/reader gain the joining branch. The
--     day writer gets the stamp fix alone — it writes into the very same
--     event_session_attendance rows from the same screen, so leaving it
--     stamping the host's college would have left the defect fully reachable
--     from the button next to the one being fixed.
--
-- Reader side: both roster RPCs now also return the learner's college name, so
-- the marking dialogs can group visiting learners under their own college. The
-- return type changes, so those two are DROP + CREATE (CREATE OR REPLACE
-- cannot alter a RETURNS TABLE signature) and their grants are re-issued.
-- ============================================================================

-- ── 1. Per-session marking — learner's college + the joining-college branch ──
CREATE OR REPLACE FUNCTION public.fn_induction_mark_attendance(p_session_id UUID, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event    UUID;
  v_inst     UUID;
  v_n        INTEGER;
  v_host_ok  BOOLEAN;
  v_allowed  UUID[];
  v_rejected INTEGER;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: session not found'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: not an induction session'; END IF;

  -- The host side, exactly as before: super admin, admin, host-college
  -- induction.manage, event coordinator, or an assigned resource person.
  v_host_ok := (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid()));

  IF NOT v_host_ok THEN
    -- The joining side: which shared colleges on THIS session can this caller
    -- reach? Empty (or NULL) means they have no business here at all.
    SELECT array_agg(esi.institution_id) INTO v_allowed
    FROM public.event_session_institutions esi
    WHERE esi.session_id = p_session_id
      AND role_has_institution_access(esi.institution_id);

    IF NOT (user_has_permission('induction.manage') AND COALESCE(array_length(v_allowed, 1), 0) > 0) THEN
      RAISE EXCEPTION 'fn_induction_mark_attendance: not authorized';
    END IF;

    -- Confined to their own learners. A learner who is unknown, or who has no
    -- college recorded, counts as rejected too — otherwise the COALESCE below
    -- would quietly file them under the HOST, which is the very defect being
    -- fixed and would be reachable by anyone holding a joining-college seat.
    SELECT count(*) INTO v_rejected
    FROM jsonb_array_elements(p_marks) m
    LEFT JOIN public.learners_profiles lp ON lp.id = (m->>'learner_id')::uuid
    WHERE lp.institution_id IS NULL
       OR NOT (lp.institution_id = ANY (v_allowed));

    IF v_rejected > 0 THEN
      RAISE EXCEPTION
        'fn_induction_mark_attendance: % of % learners in this list are not from a college you can mark on this shared session',
        v_rejected, jsonb_array_length(p_marks);
    END IF;
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  )
  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, inc.learner_id, COALESCE(lp.institution_id, v_inst), inc.status, auth.uid(), now()
  FROM incoming inc
  LEFT JOIN public.learners_profiles lp ON lp.id = inc.learner_id
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, institution_id = EXCLUDED.institution_id,
    marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Unchanged for every caller that exists today: all five host branches set
  -- v_host_ok, so this PERFORM runs exactly where and as it always did.
  --
  -- The guard exists only for the NEW joining branch, and it is not optional:
  -- fn_induction_recompute_completion carries the SAME host-institution check
  -- (`user_has_permission('induction.manage') AND role_has_institution_access(v_inst)`),
  -- so calling it as a joining-college coordinator raises
  -- 'fn_induction_recompute_completion: not authorized' and takes the whole
  -- mark down with it — the widened branch above would be dead on arrival.
  -- Measured on production 2026-08-13; that is why this line is here.
  --
  -- Skipping it loses nothing TODAY: recompute reads induction_enrollment for
  -- the event, and a joining college's learners are not enrolled in the host's
  -- induction (cross-college enrolment is step 3 of 4). A joining coordinator's
  -- mark therefore cannot move any completion row.
  --
  -- ⚠ HANDOFF TO STEP 3: the moment a joining college's learners ARE enrolled
  -- here, this stops being a no-op and completion would go stale. Step 3 must
  -- widen fn_induction_recompute_completion's own institution gate and then
  -- make this PERFORM unconditional again. That function is out of scope for
  -- this PR by explicit instruction — it owns the completion denominator that
  -- 222 of 435 freshers have already cleared.
  IF v_host_ok THEN
    PERFORM public.fn_induction_recompute_completion(v_event);
  END IF;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_attendance(UUID, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_attendance(UUID, JSONB) TO authenticated;

-- ── 2. Day-level marking — stamp fix only (authorization unchanged) ──────────
CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id UUID, p_day_number INTEGER, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_mark_day_attendance: not authorized';
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  ),
  fanned AS (
    SELECT s.id AS session_id, inc.learner_id, inc.status,
           COALESCE(lp.institution_id, v_inst) AS learner_inst
    FROM incoming inc
    JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = inc.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = inc.learner_id
    JOIN public.event_sessions s
      ON s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
  )
  INSERT INTO public.event_session_attendance (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT f.session_id, f.learner_id, f.learner_inst, f.status, auth.uid(), now() FROM fanned f
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, institution_id = EXCLUDED.institution_id,
    marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();

  PERFORM public.fn_induction_recompute_completion(p_event_id);
  RETURN jsonb_array_length(p_marks);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) TO authenticated;

-- ── 3. Per-session roster — returns the learner's college; joining side reads ─
-- Return type changes (institution_name added), so DROP first.
DROP FUNCTION IF EXISTS public.fn_induction_session_roster(UUID);

CREATE OR REPLACE FUNCTION public.fn_induction_session_roster(p_session_id UUID)
RETURNS TABLE (
  learner_id       UUID,
  name             TEXT,
  register_number  TEXT,
  batch_label      TEXT,
  status           TEXT,
  institution_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   UUID;
  v_batch   UUID;
  v_inst    UUID;
  v_host_ok BOOLEAN;
  v_allowed UUID[];
BEGIN
  SELECT s.event_id, s.batch_id INTO v_event, v_batch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;

  v_host_ok := (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)
          OR EXISTS (SELECT 1 FROM public.event_session_speakers sp
                     WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid()));

  IF NOT v_host_ok THEN
    -- Mirrors the writer: without a readable roster the marking branch above
    -- would be authorized but unusable — the coordinator could never see whom
    -- to mark.
    SELECT array_agg(esi.institution_id) INTO v_allowed
    FROM public.event_session_institutions esi
    WHERE esi.session_id = p_session_id
      AND role_has_institution_access(esi.institution_id);

    IF NOT (user_has_permission('induction.view') AND COALESCE(array_length(v_allowed, 1), 0) > 0) THEN
      RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
    END IF;
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text,
         i.name::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
    -- A joining-side reader sees only their own colleges' learners.
    AND (v_host_ok OR lp.institution_id = ANY (v_allowed))
  ORDER BY 2;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_roster(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_roster(UUID) TO authenticated;

-- ── 4. Day roster — the learner's college, for the same grouping. ────────────
-- Authorization intentionally unchanged (sharing is per session, not per day).
DROP FUNCTION IF EXISTS public.fn_induction_day_roster(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id UUID, p_day_number INTEGER)
RETURNS TABLE (
  learner_id       UUID,
  name             TEXT,
  register_number  TEXT,
  batch_label      TEXT,
  status           TEXT,
  is_mixed         BOOLEAN,
  institution_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1,
         i.name::text
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) TO authenticated;

-- ── 5. Guard — the four functions exist at the expected signature and none of
-- them is reachable by anon. DROP + CREATE silently discards grants, so this
-- catches a re-grant that was forgotten rather than merely mis-typed. RAISE
-- EXCEPTION, never NOTICE: a NOTICE stamps zero rows and reads as success.
DO $guard$
DECLARE v_missing TEXT; v_anon TEXT;
BEGIN
  SELECT string_agg(x.sig, ', ') INTO v_missing
  FROM (VALUES
    ('public.fn_induction_mark_attendance(uuid,jsonb)'),
    ('public.fn_induction_mark_day_attendance(uuid,integer,jsonb)'),
    ('public.fn_induction_session_roster(uuid)'),
    ('public.fn_induction_day_roster(uuid,integer)')
  ) AS x(sig)
  WHERE to_regprocedure(x.sig) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '20260826010000: missing after apply: %', v_missing;
  END IF;

  SELECT string_agg(x.sig, ', ') INTO v_anon
  FROM (VALUES
    ('public.fn_induction_mark_attendance(uuid,jsonb)'),
    ('public.fn_induction_mark_day_attendance(uuid,integer,jsonb)'),
    ('public.fn_induction_session_roster(uuid)'),
    ('public.fn_induction_day_roster(uuid,integer)')
  ) AS x(sig)
  WHERE has_function_privilege('anon', to_regprocedure(x.sig), 'EXECUTE');
  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '20260826010000: still EXECUTE-able by anon: %', v_anon;
  END IF;
END $guard$;
