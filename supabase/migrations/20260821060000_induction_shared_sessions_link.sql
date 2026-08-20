-- ============================================================================
-- Induction — SHARED (cross-college) sessions, step 1 of 4: the link + its RPCs.
-- Director decisions D2 / D10 (2026-08-08, see
-- .claude/induction-venue-speaker-decisions-2026-08-08.md).
--
-- D2: sharing happens at the SESSION level, not the programme level. Each
--     college keeps its own induction programme; individual sessions can be
--     co-conducted. (This deliberately does NOT extend the programme-level
--     `enroll_scope='group'` path from PR #1708 — that shares a whole
--     programme, which the Director explicitly did not want.)
-- D10: the HOST college controls the session; the joining college is notified,
--     not able to edit. Hence add/remove are host-gated; the joining college
--     gets read only.
--
-- SCOPE OF THIS MIGRATION — deliberately inert:
--   This records WHICH colleges a session is shared with, and nothing else.
--   Attendance, feedback and completion are UNTOUCHED. A shared session is
--   merely labelled. That is intentional: `fn_induction_recompute_completion`
--   derives BOTH the attendance % and the feedback % from one denominator
--   (`sessions_total`), so widening it without matching feedback would push
--   already-complete freshers back under the 75% bar. As of 2026-08-11, 222 of
--   435 freshers are complete and EVERY ONE of them qualified through the
--   feedback limb (attendance coverage is 5.2%). Credit therefore moves in a
--   later, separately-gated migration — never as a side effect of this one.
--
-- NAMING: this module already uses "combined" to mean "all batches attend
--   together" (sessions-section.tsx `COMBINED = '__combined__'`). Cross-college
--   is therefore called SHARED throughout, so a coordinator reading the screen
--   is never asked to distinguish two meanings of one word.
-- ============================================================================

-- ── 1. event_session_institutions — one row per (session, joining college) ───
-- Mirrors the proven event_session_speakers shape: thin join table, unique
-- pair, cascade both ways, real access through DEFINER RPCs.
CREATE TABLE IF NOT EXISTS public.event_session_institutions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id)  ON DELETE CASCADE,
  added_by       UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_institution UNIQUE (session_id, institution_id)
);
CREATE INDEX IF NOT EXISTS idx_esi_session     ON public.event_session_institutions(session_id);
CREATE INDEX IF NOT EXISTS idx_esi_institution ON public.event_session_institutions(institution_id);

COMMENT ON TABLE public.event_session_institutions IS
  'Cross-college session sharing (Director decision D2, 2026-08-08). One row per '
  '(session, JOINING college). The HOST college is NOT listed here — it is '
  'induction_programs.institution_id for the session''s event. Records sharing only; '
  'carries no attendance/feedback/completion meaning on its own.';

-- Raw table locked; access via the gated DEFINER RPCs below — same posture as
-- event_session_speakers / induction_mentor_month_feedback.
ALTER TABLE public.event_session_institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_session_institutions_admin ON public.event_session_institutions;
CREATE POLICY event_session_institutions_admin ON public.event_session_institutions FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- Table-level ACL. RLS + an admin-only policy is NOT sufficient on its own:
-- Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` hands
-- anon a direct grant on every new table, separate from PUBLIC and independent
-- of RLS. Revoke it explicitly; `authenticated` reaches this data only through
-- the SECURITY DEFINER RPCs above, so it needs no table grant either.
REVOKE ALL ON TABLE public.event_session_institutions FROM anon, PUBLIC;

-- ── 2. internal helper: the HOST institution of a session's event ────────────
CREATE OR REPLACE FUNCTION public._fn_induction_session_host_inst(p_session_id UUID)
RETURNS TABLE (event_id UUID, host_institution_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.event_id, p.institution_id
  FROM public.event_sessions s
  JOIN public.induction_programs p ON p.event_id = s.event_id
  WHERE s.id = p_session_id;
$$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_session_host_inst(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_session_host_inst(UUID) TO authenticated;

-- ── 3. share a session with another college (HOST-ONLY, per D10) ─────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_share_add(
  p_session_id UUID, p_institution_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_host UUID; v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_share_add: not authenticated';
  END IF;

  SELECT h.event_id, h.host_institution_id INTO v_event, v_host
  FROM public._fn_induction_session_host_inst(p_session_id) h;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_share_add: not an induction session';
  END IF;

  -- D10: only the HOST side may change what a session is shared with.
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN
    RAISE EXCEPTION 'fn_induction_session_share_add: not authorized (the host college manages sharing)';
  END IF;

  -- Sharing with the host itself is meaningless: the host's own freshers already
  -- own the session through their enrollment. Rejected loudly so a mis-click
  -- cannot create a row that later double-counts.
  IF p_institution_id = v_host THEN
    RAISE EXCEPTION 'fn_induction_session_share_add: that college already hosts this session';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = p_institution_id) THEN
    RAISE EXCEPTION 'fn_induction_session_share_add: unknown college';
  END IF;

  INSERT INTO public.event_session_institutions (session_id, institution_id, added_by)
  VALUES (p_session_id, p_institution_id, auth.uid())
  ON CONFLICT ON CONSTRAINT uq_session_institution DO UPDATE
    SET session_id = EXCLUDED.session_id   -- no-op touch so RETURNING always yields the row
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_share_add(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_share_add(UUID, UUID) TO authenticated;

-- ── 4. stop sharing (HOST-ONLY, per D10) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_share_remove(
  p_session_id UUID, p_institution_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_host UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_share_remove: not authenticated';
  END IF;

  SELECT h.event_id, h.host_institution_id INTO v_event, v_host
  FROM public._fn_induction_session_host_inst(p_session_id) h;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_share_remove: not an induction session';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN
    RAISE EXCEPTION 'fn_induction_session_share_remove: not authorized (the host college manages sharing)';
  END IF;

  DELETE FROM public.event_session_institutions
  WHERE session_id = p_session_id AND institution_id = p_institution_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_share_remove(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_share_remove(UUID, UUID) TO authenticated;

-- ── 5. read: every share on an event's sessions ─────────────────────────────
-- Visible to the HOST side (manage/view/coordinator) AND to any college the
-- event actually shares a session with — a joining coordinator must be able to
-- see what their freshers have been invited to, even though they cannot edit it.
CREATE OR REPLACE FUNCTION public.fn_induction_event_session_shares(p_event_id UUID)
RETURNS TABLE (
  session_id       UUID,
  institution_id   UUID,
  institution_name TEXT,
  added_at         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_host UUID;
BEGIN
  -- Qualify with an alias: `institution_id` is ALSO one of this function's OUT
  -- columns (RETURNS TABLE), so the bare name is ambiguous to PL/pgSQL and the
  -- function raises 42702 on every call. Creating cleanly proves nothing here —
  -- the ambiguity only bites at execution time.
  SELECT ip.institution_id INTO v_host
  FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'fn_induction_event_session_shares: not an induction event';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          -- a joining college may READ the shares that involve it
          OR EXISTS (
               SELECT 1
               FROM public.event_session_institutions esi
               JOIN public.event_sessions s ON s.id = esi.session_id
               WHERE s.event_id = p_event_id
                 AND role_has_institution_access(esi.institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_event_session_shares: not authorized';
  END IF;

  RETURN QUERY
  SELECT esi.session_id, esi.institution_id, i.name::text, esi.created_at
  FROM public.event_session_institutions esi
  JOIN public.event_sessions s ON s.id = esi.session_id
  JOIN public.institutions   i ON i.id = esi.institution_id
  WHERE s.event_id = p_event_id
  ORDER BY esi.session_id, i.name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_event_session_shares(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_event_session_shares(UUID) TO authenticated;

-- ── 6. read: colleges this session can still be shared with (picker source) ──
-- A dedicated RPC rather than the existing useInstitutionsWithAccess hook,
-- because that hook returns only colleges the CALLER already administers — and
-- the entire point of sharing is to invite a college you do NOT administer, so
-- the hook's list would come back empty for exactly the person who needs it.
-- Exposure is limited to id + name of active colleges (already visible across
-- the product), gated to the host side, and excludes both the host itself and
-- colleges already sharing this session.
CREATE OR REPLACE FUNCTION public.fn_induction_session_shareable_institutions(p_session_id UUID)
RETURNS TABLE (institution_id UUID, institution_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_host UUID;
BEGIN
  SELECT h.event_id, h.host_institution_id INTO v_event, v_host
  FROM public._fn_induction_session_host_inst(p_session_id) h;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_shareable_institutions: not an induction session';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_host))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN
    RAISE EXCEPTION 'fn_induction_session_shareable_institutions: not authorized';
  END IF;

  RETURN QUERY
  SELECT i.id, i.name::text
  FROM public.institutions i
  WHERE i.id <> v_host
    AND coalesce(i.is_active, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.event_session_institutions esi
      WHERE esi.session_id = p_session_id AND esi.institution_id = i.id)
  ORDER BY i.name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_shareable_institutions(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_shareable_institutions(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
