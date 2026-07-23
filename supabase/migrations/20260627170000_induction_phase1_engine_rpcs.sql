-- ============================================================================
-- Fresher Induction Program — Phase 1a: engine RPCs
-- File: 20260627170000_induction_phase1_engine_rpcs.sql
-- Date: 2026-06-27
-- Spec: specs/induction-program-module-2026-06-27.md (Phase 1)
-- Adds: create-induction, auto-enroll (first-years + laterals = the joining
--   cohort), auto-split-batches-by-department. All SECURITY DEFINER with an
--   INTERNAL auth+permission gate (DEFINER bypasses RLS) + anon-revoked.
-- Verified live: events requires (institution_id,event_type,name,slug)+a venue;
--   events.event_type='induction' is the type tag; learners_profiles.academic_year_id
--   is the joining-cohort year (per-institution academic_years).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_induction_create_program — create the events row (event_type='induction')
--    + induction_programs satellite. Returns the new event_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id   UUID,
  p_academic_year_id UUID,
  p_name             TEXT,
  p_start_date       TIMESTAMPTZ,
  p_end_date         TIMESTAMPTZ,
  p_venue_text       TEXT DEFAULT 'Campus',
  p_description      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_slug     TEXT;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_create_program: not authorized';
  END IF;
  IF p_institution_id IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution_id and name are required';
  END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text,
                             start_date, end_date, description, status, created_by)
  VALUES (p_institution_id, 'induction', p_name, v_slug, coalesce(p_venue_text, 'Campus'),
          p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id)
  VALUES (v_event_id, p_institution_id, p_academic_year_id);

  RETURN v_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_create_program(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_program(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. fn_induction_auto_enroll — enroll the joining cohort (first-years + laterals)
--    of the induction's (institution, academic_year). Idempotent. Returns count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst  UUID;
  v_year  UUID;
  v_count INTEGER;
BEGIN
  SELECT institution_id, academic_year_id INTO v_inst, v_year
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id;
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized';
  END IF;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no academic_year_id set';
  END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, v_inst, 'auto_first_year'
  FROM public.learners_profiles lp
  WHERE lp.institution_id = v_inst
    AND lp.academic_year_id = v_year
    AND lp.lifecycle_status NOT IN ('graduated','exited','inactive','rejected','alumni')
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. fn_induction_auto_split_batches — create N batches (A,B,...) then assign
--    WHOLE departments to the least-loaded batch (decision 8: by department,
--    classmates stay together, sizes balanced). Returns learners assigned.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_auto_split_batches(
  p_event_id    UUID,
  p_num_batches INTEGER DEFAULT 2
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst      UUID;
  v_batch_ids UUID[];
  v_loads     BIGINT[];
  v_assigned  INTEGER := 0;
  v_min_idx   INTEGER;
  v_label     TEXT;
  i           INTEGER;
  dept        RECORD;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: induction program not found for event %', p_event_id;
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: not authorized';
  END IF;
  IF p_num_batches < 1 OR p_num_batches > 12 THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: num_batches must be 1..12';
  END IF;

  -- ensure batches A..N exist
  FOR i IN 1..p_num_batches LOOP
    v_label := chr(64 + i);   -- 1->A, 2->B, ...
    INSERT INTO public.induction_batches (event_id, institution_id, label, fill_rule)
    VALUES (p_event_id, v_inst, v_label, 'by_department')
    ON CONFLICT (event_id, label) DO NOTHING;
  END LOOP;

  SELECT array_agg(id ORDER BY label) INTO v_batch_ids
  FROM public.induction_batches WHERE event_id = p_event_id;
  v_loads := array_fill(0::bigint, ARRAY[array_length(v_batch_ids,1)]);

  -- greedy: biggest departments first, each whole dept to the least-loaded batch
  FOR dept IN
    SELECT lp.department_id AS dept_id, count(*) AS n
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
    GROUP BY lp.department_id
    ORDER BY count(*) DESC
  LOOP
    v_min_idx := 1;
    FOR i IN 2..array_length(v_loads,1) LOOP
      IF v_loads[i] < v_loads[v_min_idx] THEN v_min_idx := i; END IF;
    END LOOP;

    UPDATE public.induction_enrollment ie
    SET batch_id = v_batch_ids[v_min_idx]
    FROM public.learners_profiles lp
    WHERE ie.learner_id = lp.id
      AND ie.event_id = p_event_id
      AND lp.department_id IS NOT DISTINCT FROM dept.dept_id;

    v_loads[v_min_idx] := v_loads[v_min_idx] + dept.n;
    v_assigned := v_assigned + dept.n;
  END LOOP;

  RETURN v_assigned;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_split_batches(UUID,INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_split_batches(UUID,INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
