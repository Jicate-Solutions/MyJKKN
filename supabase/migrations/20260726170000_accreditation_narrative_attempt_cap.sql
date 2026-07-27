-- ============================================================================
-- Accreditation — cap how many times a narrative may be re-drafted
-- File: 20260726170000_accreditation_narrative_attempt_cap.sql
-- Date: 2026-07-26
--
-- WHY
--   fn_accreditation_narrative_awaiting re-offers a metric/institution pair for
--   drafting whenever its existing narrative is ungrounded, still 'ai_drafted'
--   and untouched by a human. That clause (added 2026-07-26) is correct — such a
--   row can never be okayed, so without it the metric is stuck forever — but it
--   has NO counter. A pair the model genuinely cannot ground therefore re-drafts
--   EVERY NIGHT, FOREVER.
--
--   This is not hypothetical. Metric 7.3.f on institution 5736d86f is blocked on
--   ungrounded tokens ["0.22","2"] — a computed value that appears nowhere in its
--   evidence. That is a real fabrication and the gate is RIGHT to block it; it
--   must never be relaxed. But it will also never pass, so it re-drafts nightly
--   with no end condition. The lane is ₹0, so nothing bleeds money — it burns
--   queue slots, writes a new row version every night, and buries genuine
--   first-time drafts behind work that cannot succeed.
--
-- WHAT THIS ADDS
--   1. accreditation_metric_narratives.attempt_count — how many AI drafts have
--      been recorded for this row. Existing rows start at 0, i.e. every current
--      narrative gets a FULL fresh budget. That is deliberate: PR #2462
--      (number-word compounds) and PR #2469 (the self-correcting-reply parser)
--      both land around now, and the two stuck 7.10.1 drafts deserve to be
--      retried against the fixed code rather than being capped out on attempts
--      they made against the broken code.
--   2. platform_policies row 'accreditation.narrative_max_draft_attempts' = 5,
--      read through fn_get_policy_int. A cap is an operational judgement about
--      how much retrying is useful, so it is a config row per the house rule
--      (docs/architecture/config-table-pattern.md) — raise it to 20 or drop it
--      to 1 with an UPDATE, no deploy. (Contrast the k-anonymity floor in the
--      event-feedback emitter, which is deliberately hardcoded: a privacy floor
--      an operator can lower is not a floor. Different kind of number.)
--   3. fn_accreditation_record_narrative_draft — counts each recorded AI draft.
--   4. fn_accreditation_narrative_awaiting — stops re-offering a pair once its
--      narrative has used the budget. The row then simply blocks the pair again,
--      exactly as a grounded or human-touched row already does.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It does not relax the grounding gate, mark anything grounded, delete a
--   narrative, or notify anyone. A capped-out row keeps its real ungrounded
--   verdict and its real tokens, and stays visible in the narratives UI as the
--   honest record of a draft the AI could not ground. Escalation to a human is
--   the existing owner/IQAC queue's job, not this migration's.
--
-- SECURITY
--   Both functions are replaced, not created. Their LIVE ACLs were read before
--   writing this (has_function_privilege, prod 2026-07-26): anon=false,
--   authenticated=false, service_role=true for BOTH. The REVOKE/GRANT pair below
--   restates exactly that, because CREATE OR REPLACE preserves existing grants
--   and a silent drift here would either open a cron-only writer to the public
--   anon key or break the nightly drafter.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The counter.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_metric_narratives
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.accreditation_metric_narratives.attempt_count IS
  'How many AI drafts have been recorded for this narrative. Incremented by fn_accreditation_record_narrative_draft only while status = ''ai_drafted''. fn_accreditation_narrative_awaiting stops re-offering the pair once this reaches the policy accreditation.narrative_max_draft_attempts, so a narrative the model cannot ground does not re-draft every night forever. Existing rows start at 0 (a full fresh budget) on purpose — the grounding false-positive fixes landed at the same time.';

-- ----------------------------------------------------------------------------
-- 2. The cap, as CONFIG. WHERE NOT EXISTS, never ON CONFLICT: platform_policies
--    uniqueness is an expression index and ON CONFLICT fails 42P10 against it.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description,
   data_type, is_system, is_active, classification, publication_state)
SELECT
  'accreditation.narrative_max_draft_attempts', 'global', NULL, '5',
  'How many times the nightly drafter may re-draft one accreditation narrative that keeps failing the grounding gate. Once reached, the pair stops being re-offered and the ungrounded draft stands as the honest record for a human to pick up. Raise it to allow more retries; set it to 1 to disable retrying entirely. Does NOT affect grounded or human-touched narratives, and never relaxes the grounding gate itself.',
  'number', true, true, 'operational', 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'accreditation.narrative_max_draft_attempts'
    AND scope_type  = 'global'
    AND scope_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 3. Recorder — count each AI draft.
--    Replaced verbatim from the LIVE definition (pg_get_functiondef, prod
--    2026-07-26) with only the attempt_count lines added, so no unrelated
--    behaviour drifts. attempt_count follows the same "only while ai_drafted"
--    rule as every other refreshed column: a human-touched row is never
--    rewritten, so its counter must not move either.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_record_narrative_draft(
  p_institution_id uuid, p_body_code text, p_metric_code text, p_period_label text,
  p_narrative_md text, p_citations jsonb, p_grounding_verdict text,
  p_ungrounded_tokens jsonb, p_evidence_row_count integer, p_model text, p_ai_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  IF p_grounding_verdict NOT IN ('grounded','ungrounded') THEN
    RAISE EXCEPTION 'record_narrative_draft: bad verdict %', p_grounding_verdict;
  END IF;
  v_owner := public.fn_accreditation_resolve_metric_owner(p_institution_id, p_body_code, p_metric_code);
  INSERT INTO public.accreditation_metric_narratives (
    institution_id, body_code, metric_code, period_label, narrative_md, citations,
    grounding_verdict, ungrounded_tokens, evidence_row_count, model, ai_job_id,
    generated_at, status, owner_user_id, attempt_count
  ) VALUES (
    p_institution_id, p_body_code, p_metric_code, p_period_label, p_narrative_md,
    COALESCE(p_citations,'[]'::jsonb), p_grounding_verdict, COALESCE(p_ungrounded_tokens,'[]'::jsonb),
    GREATEST(0, p_evidence_row_count), p_model, p_ai_job_id, now(), 'ai_drafted', v_owner,
    1  -- the first draft IS an attempt
  )
  ON CONFLICT (institution_id, body_code, metric_code, period_label) DO UPDATE SET
    -- only refresh drafts still in the AI stage; never clobber human-touched rows
    narrative_md      = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.narrative_md ELSE accreditation_metric_narratives.narrative_md END,
    citations         = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.citations ELSE accreditation_metric_narratives.citations END,
    grounding_verdict = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.grounding_verdict ELSE accreditation_metric_narratives.grounding_verdict END,
    ungrounded_tokens = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.ungrounded_tokens ELSE accreditation_metric_narratives.ungrounded_tokens END,
    evidence_row_count= CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.evidence_row_count ELSE accreditation_metric_narratives.evidence_row_count END,
    model             = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.model ELSE accreditation_metric_narratives.model END,
    generated_at      = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.generated_at ELSE accreditation_metric_narratives.generated_at END,
    -- NEW: count this attempt. Same ai_drafted guard as everything above.
    attempt_count     = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN accreditation_metric_narratives.attempt_count + 1
                             ELSE accreditation_metric_narratives.attempt_count END,
    updated_at        = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- ----------------------------------------------------------------------------
-- 4. Awaiting — stop re-offering a pair whose narrative has used its budget.
--    Replaced verbatim from the LIVE definition with only the budget clause
--    added. Once attempt_count reaches the cap the row resumes BLOCKING the
--    pair, which is the same thing a grounded or human-touched row already does
--    — no new state, no new code path.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_awaiting(
  p_body_code text, p_period_label text, p_limit integer DEFAULT 50)
RETURNS TABLE(institution_id uuid, metric_code text, evidence_rows bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Read once per call, not per row. Default 5 matches the seeded policy, so the
  -- function still behaves correctly if the policy row is ever deactivated.
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
          -- ADDED 2026-07-26: an existing narrative stops blocking the pair when
          -- it is NOT grounded AND no human has touched it — such a row can
          -- never be okayed, so the metric would otherwise be stuck forever.
          AND NOT (
                n.grounding_verdict      IS DISTINCT FROM 'grounded'
            AND n.status                 =  'ai_drafted'
            AND n.owner_okayed_at        IS NULL
            AND n.principal_approved_at  IS NULL
            AND n.director_submitted_at  IS NULL
            -- ADDED 2026-07-26 (attempt cap): ...but only while it still has
            -- attempts left. Without this the pair re-drafts every night forever
            -- when the model cannot ground it (e.g. 7.3.f on 5736d86f, blocked on
            -- a fabricated 0.22 that will never appear in its evidence).
            AND COALESCE(n.attempt_count, 0) < v_max_attempts
          )
      )
    GROUP BY qem.institution_id, qem.metric_code
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $function$;

-- ----------------------------------------------------------------------------
-- 5. ACLs — restate the LIVE shape (anon=false, authenticated=false,
--    service_role=true for both, read from prod before writing this).
--    CREATE OR REPLACE keeps existing grants, so these are belt-and-braces
--    against drift rather than a change.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(
  uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(
  uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_awaiting(text,text,integer)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Apply-time asserts — fail loudly here rather than the cap silently not
--    existing and the nightly churn continuing unnoticed.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accreditation_metric_narratives'
      AND column_name='attempt_count'
  ) THEN
    RAISE EXCEPTION 'attempt_count column missing — the cap cannot work without it';
  END IF;

  IF public.fn_get_policy_int('accreditation.narrative_max_draft_attempts', -1) < 1 THEN
    RAISE EXCEPTION 'policy accreditation.narrative_max_draft_attempts is missing or < 1 (got %) — the seed failed',
      public.fn_get_policy_int('accreditation.narrative_max_draft_attempts', -1);
  END IF;

  IF has_function_privilege('anon','public.fn_accreditation_narrative_awaiting(text,text,integer)','EXECUTE')
     OR has_function_privilege('anon','public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE a narrative drafter function — cron-only lockdown failed';
  END IF;

  IF NOT has_function_privilege('service_role','public.fn_accreditation_narrative_awaiting(text,text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost EXECUTE on a narrative drafter function — the nightly drafter would stop';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
