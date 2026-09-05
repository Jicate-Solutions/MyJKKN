-- ============================================================================
-- Induction — session feedback split by the LEARNER's college (D5), plus the
-- audience an edit to a SHARED session has to reach (D10).
--
-- ── WHY (the live defect, measured on prod 2026-08-13) ──────────────────────
-- `public.event_session_feedback.institution_id` is `uuid NOT NULL` and it is
-- NOT the college of the person who submitted the feedback. It records the
-- WRITE PATH — who/where the row was created from. Measured today:
--
--     grouping by event_session_feedback.institution_id
--       JKKN College of Arts and Science (Self) ... 10,339
--       JKKN Main Office ..........................    30
--
--     grouping by the learner (learners_profiles.institution_id)
--       JKKN College of Arts and Science (Self) ... 10,369
--
-- Those 30 rows were submitted by Arts & Science freshers through a Main-Office
-- write path. Today that is cosmetic — one college has an induction, so every
-- answer collapses to the same number. Once sessions are shared across colleges
-- (event_session_institutions, PR #2992), "show each college's feedback
-- separately" (Director decision D5) would be derived from that column, and a
-- 30-row defect becomes a structural one.
--
-- ── WHAT THIS MIGRATION DOES / DOES NOT DO ─────────────────────────────────
-- Fixes what is READ, never what is STORED. The 30 mis-stamped rows are left
-- exactly as they are: rewriting them is a separate Director decision, and
-- `event_session_feedback.institution_id` still has legitimate meaning as a
-- provenance record of the write path. Nothing here writes to any table.
--
-- Identity note that decides the whole join: `event_session_feedback.learner_id`
-- keys on **learners_profiles.id**, NOT profiles.id. Verified live: 10,369 of
-- 10,369 feedback rows match learners_profiles; ZERO match profiles. Joining
-- profiles returns a confident, wrong zero.
--
-- ── THE 42702 TRAP (PR #2992) ──────────────────────────────────────────────
-- A `RETURNS TABLE` OUT column name reused bare in the body raises
-- `42702: column reference "..." is ambiguous` on EVERY call, while still
-- passing CREATE, catalog counts, typecheck and all 24 CI checks — ambiguity
-- resolves at EXECUTION, not at CREATE. Two defences are used below:
--   1. the OUT columns are named so they cannot collide (`feedback_session_id`,
--      `learner_institution_id`, `joining_institution_id`) — never the bare
--      `session_id` / `institution_id` that killed the #2992 function; and
--   2. every table reference is aliased and every column qualified.
-- Both functions were CALLED against prod inside a self-aborting transaction
-- before this file was committed; the output is pasted in the PR body.
-- ============================================================================

-- ── 1. Feedback grouped by the college of the LEARNER who submitted it ──────
-- Companion to the existing fn_induction_session_feedback_summary (which
-- answers "how did this session score overall"). This one answers "…and how did
-- each college score it", which is the question a shared session creates.
--
-- p_session_id NULL  -> every session in the induction (the section view)
-- p_session_id set   -> one session (the per-session breakdown)
--
-- Access gate is a deliberate copy of fn_induction_session_feedback_summary's:
-- host-college view/manage, or an event coordinator. No new access policy is
-- introduced here — deciding whether a JOINING college may read another
-- college's feedback is a Director question, not an implementation detail.
CREATE OR REPLACE FUNCTION public.fn_induction_feedback_by_learner_college(
  p_event_id   UUID,
  p_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
  feedback_session_id      UUID,
  learner_institution_id   UUID,
  learner_institution_name TEXT,
  response_count           INTEGER,
  avg_rating               NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_host UUID;
BEGIN
  -- Aliased (ip.) on purpose: see the 42702 note in this file's header.
  SELECT ip.institution_id INTO v_host
  FROM public.induction_programs ip
  WHERE ip.event_id = p_event_id;

  IF v_host IS NULL THEN
    RAISE EXCEPTION 'fn_induction_feedback_by_learner_college: not an induction event';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_feedback_by_learner_college: not authorized';
  END IF;

  RETURN QUERY
  -- LEFT JOIN to learners_profiles on purpose. An INNER join would silently DROP
  -- a feedback row whose learner_id has no learners_profiles row, and a dropped
  -- row is a wrong count that looks right. All 10,369 rows match today; an
  -- orphan tomorrow surfaces as 'Unattributed' instead of disappearing.
  -- institutions.name is varchar -> ::text is required (42804 otherwise).
  SELECT f.session_id,
         lp.institution_id,
         COALESCE(i.name::text, 'Unattributed'),
         count(*)::integer,
         round(avg(f.rating), 2)::numeric
  FROM public.event_session_feedback f
  LEFT JOIN public.learners_profiles lp ON lp.id = f.learner_id
  LEFT JOIN public.institutions      i  ON i.id  = lp.institution_id
  WHERE f.event_id = p_event_id
    AND (p_session_id IS NULL OR f.session_id = p_session_id)
  GROUP BY f.session_id, lp.institution_id, i.name
  ORDER BY f.session_id, COALESCE(i.name::text, 'Unattributed');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_feedback_by_learner_college(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_feedback_by_learner_college(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_feedback_by_learner_college(UUID, UUID) IS
  'Induction session feedback grouped by the college of the LEARNER who submitted it '
  '(learners_profiles.institution_id), never by event_session_feedback.institution_id — '
  'that column records the write path and mis-attributes 30 live rows to JKKN Main Office. '
  'Director decision D5. Read-only.';

-- ── 2. Who a host edit to a SHARED session has to reach (D10) ──────────────
-- D10: the HOST college controls a shared session; the JOINING college is
-- notified, not able to edit. This resolves the recipient list for that notice —
-- the induction coordinators of every college the session is shared with.
--
-- It RESOLVES recipients only. It writes nothing, queues nothing and sends
-- nothing; delivery is the caller's job and is gated off in this PR (see
-- lib/services/induction/shared-session-change-notifier.ts).
--
-- The host is excluded twice over: event_session_institutions holds only
-- JOINING colleges by construction (fn_induction_session_share_add rejects the
-- host), and the predicate below re-asserts it. "Zero notices for the host" is
-- therefore structural, not incidental.
CREATE OR REPLACE FUNCTION public.fn_induction_shared_session_change_audience(
  p_session_id UUID
)
RETURNS TABLE (
  recipient_id             UUID,
  recipient_name           TEXT,
  recipient_email          TEXT,
  joining_institution_id   UUID,
  joining_institution_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_host UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_shared_session_change_audience: not authenticated';
  END IF;

  SELECT h.event_id, h.host_institution_id INTO v_event, v_host
  FROM public._fn_induction_session_host_inst(p_session_id) h;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'fn_induction_shared_session_change_audience: not an induction session';
  END IF;

  -- Same host-side gate as fn_induction_session_share_add / _remove: this
  -- answers a question about the host's own outgoing notice.
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN
    RAISE EXCEPTION 'fn_induction_shared_session_change_audience: not authorized (the host college owns this session)';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
         pr.id,
         pr.full_name::text,
         pr.email::text,
         esi.institution_id,
         i.name::text
  FROM public.event_session_institutions esi
  JOIN public.institutions  i  ON i.id  = esi.institution_id
  JOIN public.profiles      pr ON pr.institution_id = esi.institution_id
  JOIN public.user_roles    ur ON ur.user_id = pr.id
  JOIN public.custom_roles  cr ON cr.id = ur.role_id
  WHERE esi.session_id = p_session_id
    AND esi.institution_id <> v_host          -- the host is never its own audience
    AND cr.role_key = 'induction_coordinator'
    AND COALESCE(cr.is_active, true)
  ORDER BY 5, 2;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_shared_session_change_audience(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_shared_session_change_audience(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_shared_session_change_audience(UUID) IS
  'Induction coordinators of every JOINING college of a shared session — the audience for a '
  'host edit to its time, venue or speaker (Director decision D10). Resolves recipients only: '
  'writes nothing and sends nothing. The host college is excluded by predicate.';

NOTIFY pgrst, 'reload schema';
