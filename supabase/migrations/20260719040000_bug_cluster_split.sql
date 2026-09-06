-- =====================================================================
-- Bug clusters: SPLIT a multi-cause group into per-cause groups
-- Spec: docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md
-- (follow-on; Director-interviewed decisions S1-S4, 2026-07-19)
--
-- A fixability verdict with 2+ distinct-cause subgroups deliberately
-- LOCKS the automated fix lane (anti-false-consolidation). This fn is
-- the designed exit: one human click re-sorts the group by the
-- verdict's causes so each cause gets its own full pipeline.
--
-- Locked decisions:
--   S1 works on confirmed groups too — members are re-filed from the
--      old canonical to each cause's own oldest report.
--   S2 children are born CONFIRMED — the split click IS the decision.
--      (Born-confirmed members are parked => they leave the nightly
--      scan pool, which also implements S4 for free.)
--   S3 members the verdict didn't sort stay together in a
--      needs-another-look child (flagged for re-diagnosis).
--   S4 a split is final — the scan never re-merges split members
--      (parked members are invisible to it; the parent is dismissed).
--   S5 (technical) a cause with a single report doesn't form a group —
--      that report is un-parked back to an ordinary open bug.
--   S6 (technical) split is refused once reporter-feedback rows exist
--      on the parent (protects the ground-truth thread), and refused
--      if the group was already split (idempotency).
--
-- Children start their pipeline FRESH at step 1: fixability metadata is
-- NOT inherited; the parent's cause text/files are stored as
-- metadata.split_context for display only. Resolved members are left
-- untouched (history keeps their old link) and excluded from children.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_bug_cluster_split(p_cluster_id uuid, p_actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cluster   public.bug_clusters%ROWTYPE;
  v_subgroups jsonb;
  v_children  jsonb := '[]'::jsonb;
  v_unparked  int := 0;
  v_sg        jsonb;
  v_cause     text;
  v_files     jsonb;
  v_ids       uuid[];
  v_seed      uuid;
  v_child_id  uuid;
  v_sorted    uuid[] := '{}';
  v_leftover  uuid[];
  v_leftover_id uuid := NULL;
  v_repurposed boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;
  IF v_cluster.metadata ? 'split_into' THEN
    RETURN jsonb_build_object('success', false, 'error', 'group was already split');
  END IF;

  v_subgroups := v_cluster.metadata -> 'fixability' -> 'verdict' -> 'subgroups';
  IF v_subgroups IS NULL OR jsonb_array_length(v_subgroups) < 2 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'split needs a diagnosis with 2+ distinct causes');
  END IF;

  -- S6: never split under an in-flight reporter-feedback thread.
  IF EXISTS (SELECT 1 FROM public.bug_fix_feedback_requests WHERE cluster_id = p_cluster_id) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'reporter questions already exist for this group — resolve that thread first');
  END IF;

  -- One child per cause (open members only; resolved members keep history).
  FOR v_sg IN SELECT * FROM jsonb_array_elements(v_subgroups)
  LOOP
    v_cause := left(coalesce(v_sg ->> 'root_cause', ''), 2000);
    v_files := coalesce(v_sg -> 'files', '[]'::jsonb);

    SELECT coalesce(array_agg(br.id ORDER BY br.created_at ASC), '{}') INTO v_ids
      FROM public.bug_reports br
     WHERE br.id = ANY (v_cluster.member_ids)
       -- 'duplicate' = parked under the old canonical (S1: confirmed groups
       -- ARE splittable); only resolved/wont_fix members are history.
       AND br.status IN ('new','seen','in_progress','duplicate')
       AND br.display_id IN (SELECT jsonb_array_elements_text(v_sg -> 'bug_ids'));

    v_sorted := v_sorted || v_ids;

    IF array_length(v_ids, 1) IS NULL THEN
      CONTINUE;  -- cause matched no open members
    ELSIF array_length(v_ids, 1) = 1 THEN
      -- S5: a single report is not a group — back to an ordinary open bug.
      UPDATE public.bug_reports
         SET duplicate_of = NULL,
             status = CASE WHEN status = 'duplicate' THEN 'new' ELSE status END,
             updated_at = now()
       WHERE id = v_ids[1];
      v_unparked := v_unparked + 1;
      CONTINUE;
    END IF;

    v_seed := v_ids[1];
    IF v_seed = v_cluster.seed_bug_id THEN
      -- Seed collision: this cause's oldest report IS the old canonical, and
      -- seed_bug_id is UNIQUE — so the parent row is REPURPOSED in place as
      -- this cause's group (and must NOT be dismissed at the end; the audit
      -- lands as split_siblings below). Fixability metadata is dropped with
      -- the rest of the parent metadata: children re-diagnose fresh.
      UPDATE public.bug_clusters
         SET member_ids = v_ids, member_count = array_length(v_ids, 1),
             sample_description = left((SELECT description FROM public.bug_reports WHERE id = v_seed), 500),
             module_names = ARRAY(SELECT DISTINCT br.module_name FROM public.bug_reports br
                                   WHERE br.id = ANY (v_ids) AND br.module_name IS NOT NULL ORDER BY 1),
             status = 'confirmed', decided_by = p_actor, decided_at = now(),
             metadata = jsonb_build_object('split_context',
                          jsonb_build_object('cause', v_cause, 'files', v_files)),
             updated_at = now()
       WHERE id = p_cluster_id
       RETURNING id INTO v_child_id;
      v_repurposed := true;
    ELSE
    INSERT INTO public.bug_clusters AS bc
      (seed_bug_id, member_ids, member_count, sample_description, module_names,
       status, decided_by, decided_at, metadata)
    SELECT v_seed, v_ids, array_length(v_ids, 1),
           left((SELECT description FROM public.bug_reports WHERE id = v_seed), 500),
           ARRAY(SELECT DISTINCT br.module_name FROM public.bug_reports br
                  WHERE br.id = ANY (v_ids) AND br.module_name IS NOT NULL ORDER BY 1),
           'confirmed', p_actor, now(),
           jsonb_build_object('split_from', p_cluster_id,
                              'split_context', jsonb_build_object('cause', v_cause, 'files', v_files))
    ON CONFLICT (seed_bug_id) DO UPDATE SET
      member_ids = EXCLUDED.member_ids, member_count = EXCLUDED.member_count,
      sample_description = EXCLUDED.sample_description, module_names = EXCLUDED.module_names,
      status = 'confirmed', decided_by = EXCLUDED.decided_by, decided_at = now(),
      metadata = EXCLUDED.metadata, updated_at = now()
    RETURNING bc.id INTO v_child_id;
    END IF;

    -- Re-file members under this cause's own oldest report (S1) — same
    -- semantics as Confirm: members parked (status 'duplicate'), seed active.
    UPDATE public.bug_reports
       SET duplicate_of = v_seed, status = 'duplicate', updated_at = now()
     WHERE id = ANY (v_ids) AND id <> v_seed;
    UPDATE public.bug_reports
       SET duplicate_of = NULL,
           status = CASE WHEN status = 'duplicate' THEN 'new' ELSE status END,
           updated_at = now()
     WHERE id = v_seed;

    v_children := v_children || jsonb_build_object(
      'id', v_child_id, 'count', array_length(v_ids, 1), 'cause', left(v_cause, 200));
  END LOOP;

  -- S3: open members the verdict never sorted → needs-another-look child.
  SELECT coalesce(array_agg(br.id ORDER BY br.created_at ASC), '{}') INTO v_leftover
    FROM public.bug_reports br
   WHERE br.id = ANY (v_cluster.member_ids)
     AND br.status IN ('new','seen','in_progress','duplicate')
     AND NOT (br.id = ANY (v_sorted));

  IF array_length(v_leftover, 1) = 1 THEN
    UPDATE public.bug_reports
       SET duplicate_of = NULL,
           status = CASE WHEN status = 'duplicate' THEN 'new' ELSE status END,
           updated_at = now()
     WHERE id = v_leftover[1];
    v_unparked := v_unparked + 1;
  ELSIF array_length(v_leftover, 1) >= 2 THEN
    v_seed := v_leftover[1];
    INSERT INTO public.bug_clusters AS bc
      (seed_bug_id, member_ids, member_count, sample_description, module_names,
       status, decided_by, decided_at, metadata)
    SELECT v_seed, v_leftover, array_length(v_leftover, 1),
           left((SELECT description FROM public.bug_reports WHERE id = v_seed), 500),
           ARRAY(SELECT DISTINCT br.module_name FROM public.bug_reports br
                  WHERE br.id = ANY (v_leftover) AND br.module_name IS NOT NULL ORDER BY 1),
           'confirmed', p_actor, now(),
           jsonb_build_object('split_from', p_cluster_id, 'needs_rediagnosis', true,
                              'split_context', jsonb_build_object(
                                'cause', 'not sorted by the diagnosis — needs another look', 'files', '[]'::jsonb))
    ON CONFLICT (seed_bug_id) DO UPDATE SET
      member_ids = EXCLUDED.member_ids, member_count = EXCLUDED.member_count,
      sample_description = EXCLUDED.sample_description, module_names = EXCLUDED.module_names,
      status = 'confirmed', decided_by = EXCLUDED.decided_by, decided_at = now(),
      metadata = EXCLUDED.metadata, updated_at = now()
    RETURNING bc.id INTO v_leftover_id;

    UPDATE public.bug_reports
       SET duplicate_of = v_seed, status = 'duplicate', updated_at = now()
     WHERE id = ANY (v_leftover) AND id <> v_seed;
    UPDATE public.bug_reports
       SET duplicate_of = NULL,
           status = CASE WHEN status = 'duplicate' THEN 'new' ELSE status END,
           updated_at = now()
     WHERE id = v_seed;
  END IF;

  -- Parent epilogue (S4): normally dismissed with the split audit; when the
  -- parent row was repurposed as a child (seed collision), it stays confirmed
  -- and carries the audit as split_siblings instead ('split_into' is reserved
  -- for truly-dismissed parents so the idempotency guard never blocks a
  -- legitimate future re-split of the repurposed child).
  IF v_repurposed THEN
    UPDATE public.bug_clusters
       SET metadata = metadata || jsonb_build_object('split_siblings', v_children, 'split_at', now()),
           updated_at = now()
     WHERE id = p_cluster_id;
  ELSE
    UPDATE public.bug_clusters
       SET status = 'dismissed', decided_by = p_actor, decided_at = now(),
           metadata = metadata || jsonb_build_object('split_into', v_children, 'split_at', now()),
           updated_at = now()
     WHERE id = p_cluster_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'children', v_children,
    'unparked', v_unparked, 'leftover_id', v_leftover_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_split(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_split(uuid, uuid) TO service_role;
