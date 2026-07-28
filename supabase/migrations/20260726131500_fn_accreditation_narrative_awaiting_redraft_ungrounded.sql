-- ============================================================================
-- Updated: 2026-07-26 — an UNGROUNDED narrative must not permanently block its
-- metric from ever being re-drafted.
--
-- WHY (live production evidence, 2026-07-26):
-- The AI NAAC narrative drafter's first real batch recorded 24 narratives; 11 of
-- them (46%) were flagged 'ungrounded' by the deterministic grounding gate. All
-- 11 were FALSE POSITIVES of the validator (fixed in the same PR), not model
-- fabrication. But an ungrounded row is a dead end by design:
-- fn_accreditation_narrative_transition raises 'ungrounded draft cannot be
-- okayed', so no human can ever advance it.
--
-- The previous body of this function excluded any (institution, metric, period)
-- that had ANY row in accreditation_metric_narratives, regardless of verdict.
-- Consequence: those 11 metrics would NEVER be re-drafted, even after the
-- validator fix ships — the false positive would be permanent.
--
-- THE CHANGE (one added predicate): a narrative row only BLOCKS re-drafting when
-- it is grounded (hence approvable) OR a human has already acted on it. An
-- ungrounded-and-untouched draft is re-offered so the corrected validator can
-- re-judge a fresh draft.
--
-- SAFETY — a human-progressed narrative is NEVER re-drafted:
--   * status must still be 'ai_drafted' (no human has moved it), AND
--   * owner_okayed_at / principal_approved_at / director_submitted_at all NULL.
--   * 'revision_requested' is deliberately NOT re-draftable: the live
--     transition RPC only reaches it from 'owner_okayed' or
--     'principal_approved', so a human has acted and left a revision_note that
--     an automated re-draft must not overwrite.
--   * 'grounded' rows are untouched — including a grounded row that a human
--     sent back for revision.
-- A NULL grounding_verdict is treated as not-grounded (also unapprovable), so it
-- is re-draftable too. `IS DISTINCT FROM` is used for exactly that reason.
--
-- IN-FLIGHT DUPLICATION: no guard is added here — one already exists upstream.
-- fn_ai_enqueue_system takes pg_advisory_xact_lock(hashtext('ai_jobs_sys:' ||
-- job_type || ':' || dedupe_key)) and returns {'ok':false,'error':'in_flight'}
-- when a job with that dedupe key is still in ('pending','claimed','running')
-- (verified against the live definition, 2026-07-26). The cron already passes
-- dedupeKey = '<institution_id>:<metric_code>:<period>', so firing it mid-queue
-- cannot double-enqueue a pair. Adding a second guard inside this STABLE
-- function would duplicate that logic for no benefit.
--
-- RETRY SHAPE (intended, documented): a pair whose re-draft is ALSO ungrounded
-- reappears on the next nightly run. That is a once-per-night retry on the ₹0
-- Max lane, capped by the caller's p_limit (cron passes 25). Follow-up if a pair
-- proves permanently ungrounded: cap attempts per (pair, period).
--
-- Body is reproduced VERBATIM from the LIVE definition
-- (pg_get_functiondef, 2026-07-26) plus the single added predicate — NOT
-- re-derived from the repo file. Signature, return shape, volatility and grants
-- are unchanged: the live ACL is {postgres=X, service_role=X}, i.e. service_role
-- ONLY, so the REVOKE below re-asserts anon + authenticated + PUBLIC exactly as
-- migration 20260725071500 established it.
--
-- Ref: specs/accreditation-narrative-drafter-plan-2026-07-25.md
-- Supersedes the body in 20260725071500_accreditation_naac_narrative_drafter.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_awaiting(
  p_body_code     text,
  p_period_label  text,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE(institution_id uuid, metric_code text, evidence_rows bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
          -- ADDED 2026-07-26: an existing narrative stops blocking the pair when
          -- it is NOT grounded AND no human has touched it — such a row can
          -- never be okayed, so the metric would otherwise be stuck forever.
          AND NOT (
                n.grounding_verdict      IS DISTINCT FROM 'grounded'
            AND n.status                 =  'ai_drafted'
            AND n.owner_okayed_at        IS NULL
            AND n.principal_approved_at  IS NULL
            AND n.director_submitted_at  IS NULL
          )
      )
    GROUP BY qem.institution_id, qem.metric_code
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $function$;

-- Grant shape preserved EXACTLY as live (service_role only — cron/system RPC).
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,int)
  TO service_role;
