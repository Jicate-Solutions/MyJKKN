-- ============================================================================
-- Accreditation narrative drafter — workflow additions (Director interview 07-26)
--   1) AUTO-REFRESH: an untouched AI draft is re-drafted when NEWER evidence has
--      arrived since it was generated (freshness). Reuses the existing
--      attempt-cap so it can never loop, and never touches a human-reviewed row.
--   2) REOPEN: an admin / IQAC coordinator can reopen a SUBMITTED narrative for
--      correction; it returns to the owner as a revision request.
--
-- ⚠️ SHARED FUNCTIONS — both are actively maintained by a sibling session.
-- These CREATE OR REPLACE bodies are built on the LIVE prod definitions read via
-- pg_get_functiondef on 2026-07-26 (they preserve the sibling's ungrounded-retry
-- + attempt-cap logic verbatim and ADD to it). BEFORE APPLYING, re-read the live
-- definitions of fn_accreditation_narrative_awaiting + _transition and confirm
-- they have not changed since — otherwise this migration would revert a newer
-- sibling change. Additive only; validated in BEGIN..ROLLBACK; NOT applied.
-- ============================================================================

-- 1) AWAITING work-list — add an evidence-freshness re-draft trigger ----------
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_awaiting(
  p_body_code text, p_period_label text, p_limit integer DEFAULT 50
) RETURNS TABLE(institution_id uuid, metric_code text, evidence_rows bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_max_attempts integer := public.fn_get_policy_int('accreditation.narrative_max_draft_attempts', 5);
BEGIN
  RETURN QUERY
    SELECT qem.institution_id, qem.metric_code, count(*) AS evidence_rows
    FROM public.quality_evidence_mappings qem
    WHERE qem.body_code = p_body_code
      AND qem.institution_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.accreditation_metric_narratives n
        WHERE n.institution_id = qem.institution_id
          AND n.body_code = p_body_code
          AND n.metric_code = qem.metric_code
          AND n.period_label = p_period_label
          -- An existing narrative stops blocking the pair only in these cases:
          AND NOT (
            -- (a) sibling logic: retry an UNGROUNDED, untouched draft, capped.
            (
                  n.grounding_verdict      IS DISTINCT FROM 'grounded'
              AND n.status                 =  'ai_drafted'
              AND n.owner_okayed_at        IS NULL
              AND n.principal_approved_at  IS NULL
              AND n.director_submitted_at  IS NULL
              AND COALESCE(n.attempt_count, 0) < v_max_attempts
            )
            OR
            -- (b) ADDED 07-26 (auto-refresh): refresh an untouched draft when
            -- NEWER evidence has landed since it was generated. Self-limiting
            -- (once refreshed, generated_at advances past the evidence) and
            -- attempt-capped; never re-drafts a human-touched row.
            (
                  n.status                 =  'ai_drafted'
              AND n.owner_okayed_at        IS NULL
              AND n.principal_approved_at  IS NULL
              AND n.director_submitted_at  IS NULL
              AND n.generated_at           IS NOT NULL
              AND COALESCE(n.attempt_count, 0) < v_max_attempts
              AND EXISTS (
                SELECT 1 FROM public.quality_evidence_mappings q2
                WHERE q2.institution_id = qem.institution_id
                  AND q2.body_code = p_body_code
                  AND q2.metric_code = qem.metric_code
                  AND q2.mapped_at > n.generated_at
              )
            )
          )
      )
    GROUP BY qem.institution_id, qem.metric_code
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $function$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int) TO service_role;

-- 2) TRANSITION — add the admin 'reopen' action ------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_transition(
  p_id uuid, p_action text, p_note text DEFAULT NULL::text, p_edited_md text DEFAULT NULL::text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.accreditation_metric_narratives; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_row FROM public.accreditation_metric_narratives WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'narrative % not found', p_id; END IF;
  IF NOT (is_super_admin() OR role_has_institution_access(v_row.institution_id)) THEN
    RAISE EXCEPTION 'not authorized for this institution';
  END IF;

  IF p_action = 'owner_okay' THEN
    IF NOT (v_uid = v_row.owner_user_id OR is_super_admin()
            OR user_has_permission('accreditation.naac.narrative.edit')) THEN
      RAISE EXCEPTION 'not the owner / lacks edit permission';
    END IF;
    IF v_row.status NOT IN ('ai_drafted','revision_requested') THEN
      RAISE EXCEPTION 'cannot okay from status %', v_row.status;
    END IF;
    IF v_row.grounding_verdict IS DISTINCT FROM 'grounded' THEN
      RAISE EXCEPTION 'ungrounded draft cannot be okayed';  -- FRAUD GATE at the transition
    END IF;
    UPDATE public.accreditation_metric_narratives SET
      narrative_md = COALESCE(p_edited_md, narrative_md),
      status = 'owner_okayed', owner_okayed_at = now(), owner_okayed_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'principal_approve' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status <> 'owner_okayed' THEN RAISE EXCEPTION 'cannot approve from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'principal_approved', principal_approved_at = now(), principal_approved_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'director_submit' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status <> 'principal_approved' THEN RAISE EXCEPTION 'cannot submit from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'director_submitted', director_submitted_at = now(), director_submitted_by = v_uid, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'request_revision' THEN
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.approve')) THEN
      RAISE EXCEPTION 'lacks approve permission'; END IF;
    IF v_row.status NOT IN ('owner_okayed','principal_approved') THEN
      RAISE EXCEPTION 'cannot request revision from status %', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'revision_requested', revision_requested_at = now(), revision_note = p_note, updated_at = now()
     WHERE id = p_id;

  ELSIF p_action = 'reopen' THEN
    -- ADDED 07-26: a submitted narrative is LOCKED, but an admin / IQAC
    -- coordinator can reopen it for a genuine correction. It returns to the
    -- owner as a revision request (reuses the revision flow).
    IF NOT (is_super_admin() OR user_has_permission('accreditation.naac.narrative.manage')) THEN
      RAISE EXCEPTION 'lacks manage permission to reopen'; END IF;
    IF v_row.status <> 'director_submitted' THEN
      RAISE EXCEPTION 'only a submitted narrative can be reopened (status %)', v_row.status; END IF;
    UPDATE public.accreditation_metric_narratives SET
      status = 'revision_requested', revision_requested_at = now(),
      revision_note = COALESCE(p_note, 'Reopened by administrator for correction'),
      updated_at = now()
     WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  RETURN p_action;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_transition(uuid,text,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_transition(uuid,text,text,text) TO authenticated;
