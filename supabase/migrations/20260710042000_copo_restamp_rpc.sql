-- =====================================================================
-- Twin-college re-stamp control — CO/PO attainment rollups
-- Migration: 20260710042000_copo_restamp_rpc.sql
-- Created: 2026-07-10 (Director decision 2026-07-10, verbatim: "Build the
-- re-assignment control now")
--
-- WHAT:
--   Rollups whose metadata->>'institution_match' is 'ambiguous_first_mapped'
--   (CAS Self/Aided twins — the COE code maps to two MyJKKN colleges) or
--   'unmatched_first_mapped' (no course match — a guess) are HELD out of the
--   accreditation evidence ledger by fn_copo_emit_attainment_evidence
--   (20260710023000). This migration ships the human release valve:
--
--   1. fn_copo_restamp_rollup_institution(p_rollup_id, p_institution_id) —
--      a user-facing SECURITY DEFINER RPC that lets a permitted human assign
--      the right college. Sets institution_id, marks
--      metadata.institution_match = 'manual_assignment' (the EXACT value the
--      live emitter accepts — wire contract), and stamps who/when
--      (restamped_by / restamped_at). Gate lives INSIDE the body (SECDEF
--      bypasses RLS): is_super_admin() OR
--      user_has_permission('accreditation.evidence.restamp'), plus
--      role_has_institution_access(<target college>) so a college-scoped user
--      cannot stamp evidence into a college they have no authority over.
--
--   2. fn_copo_record_course_attainment — REPLACED with manual-re-stamp
--      preservation. Without it the weekly cron replay destroys the human's
--      work within a week: same-key replays clobber metadata back to the held
--      value ('metadata = EXCLUDED.metadata'), and different-key replays
--      (human moved the row to the twin college) resurrect a duplicate held
--      row under the old guess. Now each incoming row first looks for a
--      manual_assignment row for the same course+session (+ same COE
--      institution code) and, when found, redirects onto that row's college
--      and re-merges the manual stamp keys. Same mutable-stamp-resurrection
--      family as the crosswalk seed fixed in #1924.
--
-- Validated on prod in a rolled-back txn (seed transient held rollup →
-- impersonated super_admin re-stamp → impersonated non-privileged REFUSED →
-- replay-preservation probe → RAISE) before this PR was opened.
-- =====================================================================

-- ── 1. Re-stamp RPC (user-facing, permission-gated inside the body) ──────────
CREATE OR REPLACE FUNCTION public.fn_copo_restamp_rollup_institution(
  p_rollup_id uuid,
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rollup      public.obe_course_attainment_rollup%ROWTYPE;
  v_candidates  uuid[];
  v_inst_name   text;
  v_inst_active boolean;
BEGIN
  -- Permission gate INSIDE the fn (SECURITY DEFINER bypasses table RLS).
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('accreditation.evidence.restamp')) THEN
    RAISE EXCEPTION 'permission_denied: accreditation.evidence.restamp required'
      USING ERRCODE = '42501';
  END IF;

  IF p_rollup_id IS NULL OR p_institution_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input: p_rollup_id and p_institution_id are both required';
  END IF;

  -- Authority must hold against the TARGET college the evidence will land in
  -- (never called with NULL — validated just above, so the
  -- role_has_institution_access(NULL)=TRUE footgun cannot fire here).
  IF NOT (public.is_super_admin()
          OR public.role_has_institution_access(p_institution_id)) THEN
    RAISE EXCEPTION 'permission_denied: no institution access for target college %',
      p_institution_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rollup
  FROM public.obe_course_attainment_rollup
  WHERE id = p_rollup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rollup_not_found: %', p_rollup_id;
  END IF;

  -- Only the two HELD stamps are re-assignable. A confident stamp
  -- (unique_course_match) or an already-human stamp (manual_assignment) is
  -- not this control's business.
  IF COALESCE(v_rollup.metadata->>'institution_match', '') NOT IN
     ('ambiguous_first_mapped', 'unmatched_first_mapped') THEN
    RAISE EXCEPTION
      'rollup_not_held: institution_match=% — only ambiguous_first_mapped / unmatched_first_mapped rollups can be re-assigned',
      COALESCE(v_rollup.metadata->>'institution_match', '<absent>');
  END IF;

  SELECT i.name, i.is_active INTO v_inst_name, v_inst_active
  FROM public.institutions i
  WHERE i.id = p_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution_not_found: %', p_institution_id;
  END IF;

  -- Candidate validation: when the stamping cron recorded the COE code's
  -- mapped MyJKKN colleges (metadata->'myjkkn_institution_ids'), the human
  -- must pick one of those twins. When the list is absent, any ACTIVE
  -- college is assignable.
  SELECT COALESCE(array_agg(x.val::uuid), '{}'::uuid[]) INTO v_candidates
  FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(v_rollup.metadata->'myjkkn_institution_ids') = 'array'
              THEN v_rollup.metadata->'myjkkn_institution_ids'
              ELSE '[]'::jsonb END) AS x(val);

  IF cardinality(v_candidates) > 0 THEN
    IF NOT (p_institution_id = ANY (v_candidates)) THEN
      RAISE EXCEPTION
        'institution_not_candidate: % is not one of this rollup''s candidate colleges',
        p_institution_id;
    END IF;
  ELSIF NOT COALESCE(v_inst_active, false) THEN
    RAISE EXCEPTION 'institution_inactive: % is not an active college', v_inst_name;
  END IF;

  BEGIN
    UPDATE public.obe_course_attainment_rollup
    SET institution_id = p_institution_id,
        metadata = metadata || jsonb_build_object(
          'institution_match',        'manual_assignment',
          'institution_match_before', v_rollup.metadata->>'institution_match',
          'restamped_by',             auth.uid(),
          'restamped_at',             now()),
        updated_at = now()
    WHERE id = p_rollup_id;
  EXCEPTION WHEN unique_violation THEN
    -- (institution_id, course_code, session_code) is unique — the target
    -- college already has its own rollup for this course + session.
    RAISE EXCEPTION
      'duplicate_rollup: % (%) already has a rollup under % — nothing to re-assign',
      v_rollup.course_code, v_rollup.session_code, v_inst_name;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'rollup_id', p_rollup_id,
    'course_code', v_rollup.course_code,
    'session_code', v_rollup.session_code,
    'institution_id', p_institution_id,
    'institution_name', v_inst_name,
    'institution_match', 'manual_assignment',
    'previous_institution_id', v_rollup.institution_id,
    'previous_match', v_rollup.metadata->>'institution_match');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_copo_restamp_rollup_institution(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_copo_restamp_rollup_institution(uuid, uuid) TO authenticated;

-- ── 2. Recorder replay-preservation (weekly cron must not undo the human) ────
-- Identical to the live body except the MANUAL RE-STAMP PRESERVATION block
-- and the v_target_inst / v_manual_keys plumbing (marked -- >>> below).
CREATE OR REPLACE FUNCTION public.fn_copo_record_course_attainment(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l3 numeric;
  v_l2 numeric;
  v_l1 numeric;
  r jsonb;
  v_basis text;
  v_pct numeric;
  v_level smallint;
  v_prior public.obe_course_attainment_rollup%ROWTYPE;
  v_prev_pct numeric;
  v_delta numeric;
  v_prior_id uuid;
  v_upserted integer := 0;
  v_target_inst uuid;          -- >>> college this row upserts under
  v_redirect_inst uuid;        -- >>> manual_assignment row's college, if any
  v_manual_keys jsonb;         -- >>> manual stamp keys to re-merge, if any
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;

  -- Level bands from config (defensive defaults per the config-table pattern)
  v_l3 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level3_min_pct' AND scope_type = 'global' AND is_active), 70);
  v_l2 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level2_min_pct' AND scope_type = 'global' AND is_active), 60);
  v_l1 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level1_min_pct' AND scope_type = 'global' AND is_active), 50);

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Primary attainment: declared results when present, else CIA.
    IF COALESCE((r->>'final_learner_count')::int, 0) > 0
       AND (r->>'final_attainment_pct') IS NOT NULL THEN
      v_basis := 'final_total';
      v_pct   := (r->>'final_attainment_pct')::numeric;
    ELSIF COALESCE((r->>'internal_learner_count')::int, 0) > 0
       AND (r->>'internal_attainment_pct') IS NOT NULL THEN
      v_basis := 'internal_cia';
      v_pct   := (r->>'internal_attainment_pct')::numeric;
    ELSE
      v_basis := NULL;
      v_pct   := NULL;
    END IF;

    v_level := CASE
      WHEN v_pct IS NULL   THEN NULL
      WHEN v_pct >= v_l3   THEN 3
      WHEN v_pct >= v_l2   THEN 2
      WHEN v_pct >= v_l1   THEN 1
      ELSE 0
    END;

    -- >>> MANUAL RE-STAMP PRESERVATION (re-stamp control, Director 2026-07-10:
    -- >>> "Build the re-assignment control now"). If a human already assigned
    -- >>> this course + session (+ same COE institution) to a college via
    -- >>> fn_copo_restamp_rollup_institution, redirect the incoming replay row
    -- >>> onto that row's college and carry the manual stamp keys forward.
    -- >>> Without this, the weekly replay clobbers the stamp back to held
    -- >>> (same conflict key: metadata = EXCLUDED.metadata) or resurrects a
    -- >>> duplicate held row under the old guess (human moved it to the twin,
    -- >>> so the keys no longer conflict). Same mutable-stamp-resurrection
    -- >>> family as the crosswalk seed fixed in #1924.
    v_target_inst   := (r->>'institution_id')::uuid;
    v_redirect_inst := NULL;
    v_manual_keys   := NULL;
    SELECT o.institution_id,
           (SELECT jsonb_object_agg(k.key, o.metadata->k.key)
            FROM unnest(ARRAY['institution_match', 'institution_match_before',
                              'restamped_by', 'restamped_at']) AS k(key)
            WHERE o.metadata ? k.key)
      INTO v_redirect_inst, v_manual_keys
    FROM public.obe_course_attainment_rollup o
    WHERE o.course_code  = r->>'course_code'
      AND o.session_code = r->>'session_code'
      AND o.metadata->>'institution_match' = 'manual_assignment'
      AND o.metadata->>'coe_institution_code'
          IS NOT DISTINCT FROM (r->'metadata'->>'coe_institution_code')
    ORDER BY o.updated_at DESC
    LIMIT 1;
    IF v_redirect_inst IS NOT NULL THEN
      v_target_inst := v_redirect_inst;
    END IF;

    -- Trend: the most recent EARLIER session's rollup for the same course.
    v_prior_id := NULL; v_prev_pct := NULL; v_delta := NULL;
    IF (r->>'session_end_date') IS NOT NULL THEN
      SELECT * INTO v_prior
      FROM public.obe_course_attainment_rollup o
      WHERE o.institution_id = v_target_inst  -- >>> was (r->>'institution_id')::uuid
        AND o.course_code    = r->>'course_code'
        AND o.session_code  <> r->>'session_code'
        AND o.session_end_date IS NOT NULL
        AND o.session_end_date < (r->>'session_end_date')::date
      ORDER BY o.session_end_date DESC
      LIMIT 1;
      IF FOUND THEN
        v_prior_id := v_prior.id;
        v_prev_pct := v_prior.attainment_pct;
        IF v_pct IS NOT NULL AND v_prev_pct IS NOT NULL THEN
          v_delta := round(v_pct - v_prev_pct, 2);
        END IF;
      END IF;
    END IF;

    INSERT INTO public.obe_course_attainment_rollup AS o
      (institution_id, course_code, course_name, program_code, session_code,
       session_end_date, grain, threshold_pct_used,
       internal_learner_count, internal_meeting_threshold, internal_attainment_pct, avg_internal_pct,
       final_learner_count, final_meeting_threshold, final_attainment_pct,
       avg_external_pct, avg_total_pct, pass_pct,
       attainment_basis, attainment_pct, attainment_level,
       prior_rollup_id, prev_attainment_pct, delta_pct,
       metadata, computed_at, updated_at)
    VALUES (
      v_target_inst,  -- >>> was (r->>'institution_id')::uuid
      r->>'course_code',
      r->>'course_name',
      r->>'program_code',
      r->>'session_code',
      (r->>'session_end_date')::date,
      'course_proxy',
      COALESCE((r->>'threshold_pct_used')::numeric, 60),
      (r->>'internal_learner_count')::int,
      (r->>'internal_meeting_threshold')::int,
      (r->>'internal_attainment_pct')::numeric,
      (r->>'avg_internal_pct')::numeric,
      (r->>'final_learner_count')::int,
      (r->>'final_meeting_threshold')::int,
      (r->>'final_attainment_pct')::numeric,
      (r->>'avg_external_pct')::numeric,
      (r->>'avg_total_pct')::numeric,
      (r->>'pass_pct')::numeric,
      v_basis, v_pct, v_level,
      v_prior_id, v_prev_pct, v_delta,
      COALESCE(r->'metadata', '{}'::jsonb)
        || jsonb_build_object('grain', 'course_proxy', 'co_tagged', false, 'source', 'coe_direct')
        || COALESCE(v_manual_keys, '{}'::jsonb),  -- >>> manual stamp survives replay
      now(), now()
    )
    ON CONFLICT (institution_id, course_code, session_code) DO UPDATE SET
      course_name                = EXCLUDED.course_name,
      program_code               = EXCLUDED.program_code,
      session_end_date           = EXCLUDED.session_end_date,
      threshold_pct_used         = EXCLUDED.threshold_pct_used,
      internal_learner_count     = EXCLUDED.internal_learner_count,
      internal_meeting_threshold = EXCLUDED.internal_meeting_threshold,
      internal_attainment_pct    = EXCLUDED.internal_attainment_pct,
      avg_internal_pct           = EXCLUDED.avg_internal_pct,
      final_learner_count        = EXCLUDED.final_learner_count,
      final_meeting_threshold    = EXCLUDED.final_meeting_threshold,
      final_attainment_pct       = EXCLUDED.final_attainment_pct,
      avg_external_pct           = EXCLUDED.avg_external_pct,
      avg_total_pct              = EXCLUDED.avg_total_pct,
      pass_pct                   = EXCLUDED.pass_pct,
      attainment_basis           = EXCLUDED.attainment_basis,
      attainment_pct             = EXCLUDED.attainment_pct,
      attainment_level           = EXCLUDED.attainment_level,
      prior_rollup_id            = EXCLUDED.prior_rollup_id,
      prev_attainment_pct        = EXCLUDED.prev_attainment_pct,
      delta_pct                  = EXCLUDED.delta_pct,
      metadata                   = EXCLUDED.metadata,
      computed_at                = now(),
      updated_at                 = now();

    v_upserted := v_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted);
END;
$function$;

-- ── 3. ACL re-assertion (replays re-grant anon via default privileges) ───────
REVOKE EXECUTE ON FUNCTION public.fn_copo_record_course_attainment(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_copo_record_course_attainment(jsonb) TO service_role;
