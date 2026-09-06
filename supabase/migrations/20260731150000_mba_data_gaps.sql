-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap intake (Phase 1)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- 11 of 14 departments have NO analyst views, so an MBA Associate posted to
-- one lands on an empty analytics page. This gives them a structured way to
-- FILE a "data gap" from that empty state. HYBRID model: a gap lives in its own
-- table; when a board manager ACCEPTS it, we auto-create a linked
-- improvement_ideas row so the real work rides the existing board + leaderboard.
--
-- Writes happen ONLY through the three SECURITY DEFINER RPCs below (each
-- REVOKE anon,PUBLIC + GRANT authenticated). RLS lets managers read/manage and
-- an Associate read their own filed rows.
-- ============================================================================

-- 1) mba_data_gaps ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mba_data_gaps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id          uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  filed_by         uuid NOT NULL REFERENCES public.profiles(id),
  institution_id   uuid,
  gap_type         text NOT NULL CHECK (gap_type IN ('not_captured','not_surfaced','unsure')) DEFAULT 'unsure',
  title            text NOT NULL,
  what_missing     text NOT NULL,
  what_analysis    text,
  what_decision    text,
  candidate_source text,
  status           text NOT NULL CHECK (status IN ('filed','triaged','accepted','not_feasible','captured_elsewhere','duplicate')) DEFAULT 'filed',
  linked_idea_id   uuid REFERENCES public.improvement_ideas(id) ON DELETE SET NULL,
  triaged_by       uuid,
  triaged_at       timestamptz,
  triage_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mba_data_gaps_area_status ON public.mba_data_gaps(area_id, status);
CREATE INDEX IF NOT EXISTS idx_mba_data_gaps_filed_by    ON public.mba_data_gaps(filed_by);

-- updated_at trigger (shared helper)
DROP TRIGGER IF EXISTS trg_mba_data_gaps_touch ON public.mba_data_gaps;
CREATE TRIGGER trg_mba_data_gaps_touch BEFORE UPDATE ON public.mba_data_gaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RLS --------------------------------------------------------------------
-- Managers read + manage everything; an Associate reads only their own filed
-- gaps. All INSERT/UPDATE happens through the SECDEF RPCs below (an Associate
-- has NO direct write path — only the manage policy grants ALL).
ALTER TABLE public.mba_data_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mba_data_gaps_manage ON public.mba_data_gaps;
CREATE POLICY mba_data_gaps_manage ON public.mba_data_gaps FOR ALL USING (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
) WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
);

DROP POLICY IF EXISTS mba_data_gaps_associate_read_own ON public.mba_data_gaps;
CREATE POLICY mba_data_gaps_associate_read_own ON public.mba_data_gaps FOR SELECT USING (
  filed_by = auth.uid()
);

-- 3) File a data gap (SECDEF) -----------------------------------------------
-- Any Associate who can view the board (or a manager) may file. filed_by and
-- institution_id come from the caller's own session/profile — never the client.
CREATE OR REPLACE FUNCTION public.fn_mba_file_data_gap(
  p_area_id          uuid,
  p_gap_type         text,
  p_title            text,
  p_what_missing     text,
  p_what_analysis    text,
  p_what_decision    text,
  p_candidate_source text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_institution_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to file a data gap.';
  END IF;
  IF NOT (user_has_permission('improvement.ideas.view')
          OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'You do not have permission to file a data gap.';
  END IF;
  IF coalesce(btrim(p_title), '') = '' THEN
    RAISE EXCEPTION 'A title is required.';
  END IF;
  IF coalesce(btrim(p_what_missing), '') = '' THEN
    RAISE EXCEPTION 'A description of what is missing is required.';
  END IF;

  SELECT institution_id INTO v_institution_id FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.mba_data_gaps (
    area_id, filed_by, institution_id, gap_type, title,
    what_missing, what_analysis, what_decision, candidate_source, status
  ) VALUES (
    p_area_id,
    v_uid,
    v_institution_id,
    coalesce(p_gap_type, 'unsure'),
    btrim(p_title),
    btrim(p_what_missing),
    nullif(btrim(coalesce(p_what_analysis, '')), ''),
    nullif(btrim(coalesce(p_what_decision, '')), ''),
    nullif(btrim(coalesce(p_candidate_source, '')), ''),
    'filed'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_file_data_gap(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_file_data_gap(uuid, text, text, text, text, text, text) TO authenticated;

-- 4) Triage a data gap (SECDEF, manager-only) -------------------------------
-- Updates status/triage stamps. HYBRID: accepting a gap that has no linked idea
-- yet auto-creates an improvement_ideas row (status 'logged', visibility 'open')
-- and links it, so the real work rides the existing board + leaderboard.
CREATE OR REPLACE FUNCTION public.fn_mba_triage_data_gap(
  p_gap_id uuid,
  p_status text,
  p_note   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gap public.mba_data_gaps;
  v_institution_id uuid;
  v_new_idea_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can triage a data gap.';
  END IF;
  IF p_status NOT IN ('filed','triaged','accepted','not_feasible','captured_elsewhere','duplicate') THEN
    RAISE EXCEPTION 'Invalid triage status: %', p_status;
  END IF;

  SELECT * INTO v_gap FROM public.mba_data_gaps WHERE id = p_gap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data gap not found.';
  END IF;

  -- HYBRID: accepting an un-linked gap materialises a linked improvement idea.
  IF p_status = 'accepted' AND v_gap.linked_idea_id IS NULL THEN
    -- improvement_ideas.institution_id is NOT NULL; fall back from the gap to
    -- the filer's, then the manager's, institution so accept never fails with a
    -- cryptic constraint error.
    v_institution_id := coalesce(
      v_gap.institution_id,
      (SELECT institution_id FROM public.profiles WHERE id = v_gap.filed_by),
      (SELECT institution_id FROM public.profiles WHERE id = v_uid)
    );
    IF v_institution_id IS NULL THEN
      RAISE EXCEPTION 'Cannot accept: no institution is set for the person who filed this gap.';
    END IF;

    INSERT INTO public.improvement_ideas (
      institution_id, area_id, author_id, title, problem, proposed_fix,
      expected_impact, contributors, attachments, is_urgent, status, visibility
    ) VALUES (
      v_institution_id,
      v_gap.area_id,
      v_gap.filed_by,
      '[Data gap] ' || v_gap.title,
      v_gap.what_missing,
      coalesce(v_gap.what_analysis, 'Capture or surface this data'),
      v_gap.what_decision,
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      'logged',
      'open'
    )
    RETURNING id INTO v_new_idea_id;
  END IF;

  UPDATE public.mba_data_gaps SET
    status         = p_status,
    triaged_by     = v_uid,
    triaged_at     = now(),
    triage_note    = p_note,
    linked_idea_id = coalesce(v_new_idea_id, linked_idea_id)
  WHERE id = p_gap_id
  RETURNING linked_idea_id INTO v_new_idea_id;

  RETURN v_new_idea_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_triage_data_gap(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_triage_data_gap(uuid, text, text) TO authenticated;

-- 5) List data gaps (SECDEF) ------------------------------------------------
-- Manager sees all (optional area/status filters); an Associate sees only their
-- own. Joins the area label + filer's name for display.
CREATE OR REPLACE FUNCTION public.fn_mba_list_data_gaps(
  p_area_id uuid DEFAULT NULL,
  p_status  text DEFAULT NULL
) RETURNS TABLE (
  id               uuid,
  area_id          uuid,
  area_label       text,
  filed_by         uuid,
  filer_name       text,
  institution_id   uuid,
  gap_type         text,
  title            text,
  what_missing     text,
  what_analysis    text,
  what_decision    text,
  candidate_source text,
  status           text,
  linked_idea_id   uuid,
  triaged_by       uuid,
  triaged_at       timestamptz,
  triage_note      text,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  RETURN QUERY
  SELECT
    g.id, g.area_id, a.label, g.filed_by, p.full_name, g.institution_id,
    g.gap_type, g.title, g.what_missing, g.what_analysis, g.what_decision,
    g.candidate_source, g.status, g.linked_idea_id, g.triaged_by, g.triaged_at,
    g.triage_note, g.created_at, g.updated_at
  FROM public.mba_data_gaps g
  LEFT JOIN public.improvement_areas a ON a.id = g.area_id
  LEFT JOIN public.profiles p ON p.id = g.filed_by
  WHERE (v_is_manager OR g.filed_by = v_uid)
    AND (p_area_id IS NULL OR g.area_id = p_area_id)
    AND (p_status IS NULL OR g.status = p_status)
  ORDER BY g.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) TO authenticated;
