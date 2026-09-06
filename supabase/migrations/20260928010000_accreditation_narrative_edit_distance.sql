-- ============================================================================
-- Accreditation narrative drafter — measure how far the reviewer moves each
-- AI draft (the drafter's RETURN EDGE)
-- File: 20260831010000_accreditation_narrative_edit_distance.sql
-- Date: 2026-08-13
--   (Versioned 20260831* deliberately: main already carries future-dated
--   migrations up to 20260825010000, and open sibling PRs #3026/#3027 hold
--   20260828010000/20260830010000. The version-collision gate diffs against
--   main ONLY and is blind to sibling PRs, so this file sorts after all of
--   them on purpose.)
--
-- WHY
--   The drafter loop today has no return edge. The AI drafts narrative_md; the
--   owning reviewer edits that text in the UI and okays it; and
--   fn_accreditation_narrative_transition then OVERWRITES narrative_md with the
--   edited text (narrative_md = COALESCE(p_edited_md, narrative_md)). The AI's
--   draft is destroyed at the exact moment a human judgement about its quality
--   is expressed — so "how much did the reviewer have to change" is
--   unmeasurable, and the drafter's quality trend (466 draft jobs so far) is
--   invisible to the prompt champion–challenger machinery.
--
--   Timing makes the backfill exact: verified live 2026-08-13, ALL 85 rows in
--   accreditation_metric_narratives are still status='ai_drafted' (23 grounded,
--   62 ungrounded). Not one narrative has ever been okayed, so narrative_md IS
--   the AI draft on every current row and nothing has been lost yet.
--
-- WHAT THIS ADDS
--   1. accreditation_metric_narratives.ai_draft_md — a snapshot of the AI's
--      draft text, written at generation time and never touched by the human
--      workflow. Refreshed only while status='ai_drafted' (same guard as every
--      other drafter-owned column), i.e. one snapshot per generation, immutable
--      once a human has acted.
--   2. edit_distance / edit_ratio / edit_measured_at — the measurement.
--      Token-level Levenshtein distance between ai_draft_md and the text the
--      owner okayed, and that distance normalised by the longer side's token
--      count (0 = accepted verbatim, 1 = fully rewritten). Computed in
--      TypeScript at the okay path (lib/services/accreditation/
--      narrative-edit-distance.ts, called from the okay-narrative server
--      action) — NOT in SQL, because fuzzystrmatch's levenshtein() is capped at
--      255 chars and narratives are far longer. The write is a fail-open side
--      channel: if it fails, the okay still stands and a console.warn records
--      the skip.
--   3. fn_accreditation_record_narrative_draft — replaced from the LIVE
--      definition (pg_get_functiondef read 2026-08-13; body matches
--      20260726170000 verbatim) with only the snapshot line and a
--      measurement-reset added: a fresh AI draft sets ai_draft_md and clears
--      any previous measurement (a new draft invalidates the old edit
--      measurement; in practice the ai_drafted-only guard means the metrics are
--      necessarily NULL there already — the reset is belt-and-braces).
--   4. Backfill: ai_draft_md := narrative_md for every row still in
--      'ai_drafted' — exact today per the count above. Rows that have advanced
--      past 'ai_drafted' by apply time keep ai_draft_md NULL and are simply
--      never measured (the okay path skips rows without a snapshot).
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * fn_accreditation_narrative_transition is UNTOUCHED — the fraud gate and
--     the approval state machine do not change, and measurement can never block
--     an okay.
--   * No auto-actions, no prompt changes, no notifications. This is
--     measurement only; the numbers feed humans (and later the prompt
--     championship) — they trigger nothing.
--
-- SECURITY
--   fn_accreditation_record_narrative_draft's LIVE ACL (read 2026-08-13, same
--   as 20260726170000 recorded): anon=false, authenticated=false,
--   service_role=true. CREATE OR REPLACE preserves grants; the REVOKE/GRANT
--   below restates that shape against drift, exactly as 20260726170000 did.
--   The new columns ride the table's existing RLS (owner / narrative.view +
--   institution scope / admin) — ai_draft_md shows viewers nothing they have
--   not already seen (it IS the draft they reviewed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The snapshot + the measurement columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_metric_narratives
  ADD COLUMN IF NOT EXISTS ai_draft_md      text,
  ADD COLUMN IF NOT EXISTS edit_distance    integer,
  ADD COLUMN IF NOT EXISTS edit_ratio       numeric,
  ADD COLUMN IF NOT EXISTS edit_measured_at timestamptz;

COMMENT ON COLUMN public.accreditation_metric_narratives.ai_draft_md IS
  'Snapshot of the AI-generated draft text, written by fn_accreditation_record_narrative_draft at generation time and refreshed only while status = ''ai_drafted''. The human workflow never touches it — narrative_md becomes the human-edited final at owner okay, while this column keeps what the AI actually wrote, so the two can be compared. NULL on rows that advanced past ai_drafted before this column existed (those are simply never measured).';
COMMENT ON COLUMN public.accreditation_metric_narratives.edit_distance IS
  'Token-level Levenshtein distance between ai_draft_md and the text the owner okayed. Written by the okay-narrative server action (lib/services/accreditation/narrative-edit-distance.ts) after a successful owner_okay transition; fail-open — an okay never fails because this could not be written. Re-okays after a revision request re-measure against the same AI snapshot (latest wins).';
COMMENT ON COLUMN public.accreditation_metric_narratives.edit_ratio IS
  'edit_distance normalised by the longer side''s token count, 0..1. 0 = the reviewer accepted the AI draft verbatim; 1 = fully rewritten. The drafter''s quality trend is the trajectory of this number over time.';
COMMENT ON COLUMN public.accreditation_metric_narratives.edit_measured_at IS
  'When the edit measurement was last computed (at owner okay).';

-- ----------------------------------------------------------------------------
-- 2. Backfill — exact today: every live row is still status=''ai_drafted''
--    (verified 2026-08-13: 85/85), so narrative_md IS the AI draft. Idempotent
--    (ai_draft_md IS NULL guard) and never touches human-advanced rows.
-- ----------------------------------------------------------------------------
UPDATE public.accreditation_metric_narratives
SET ai_draft_md = narrative_md
WHERE ai_draft_md IS NULL
  AND status = 'ai_drafted'
  AND narrative_md IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Recorder — snapshot each AI draft. Replaced from the LIVE definition
--    (pg_get_functiondef, prod 2026-08-13 — identical to 20260726170000) with
--    ONLY the ai_draft_md lines and the measurement reset added, so no
--    unrelated behaviour drifts. Same "only while ai_drafted" guard as every
--    other drafter-owned column.
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
    generated_at, status, owner_user_id, attempt_count, ai_draft_md
  ) VALUES (
    p_institution_id, p_body_code, p_metric_code, p_period_label, p_narrative_md,
    COALESCE(p_citations,'[]'::jsonb), p_grounding_verdict, COALESCE(p_ungrounded_tokens,'[]'::jsonb),
    GREATEST(0, p_evidence_row_count), p_model, p_ai_job_id, now(), 'ai_drafted', v_owner,
    1,  -- the first draft IS an attempt
    p_narrative_md  -- NEW: snapshot the AI text before any human can edit it
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
    attempt_count     = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN accreditation_metric_narratives.attempt_count + 1
                             ELSE accreditation_metric_narratives.attempt_count END,
    -- NEW: a fresh AI draft refreshes the snapshot and invalidates any prior
    -- edit measurement. Same ai_drafted guard as everything above (a
    -- human-touched row keeps its snapshot and its measurement forever).
    ai_draft_md       = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN EXCLUDED.ai_draft_md ELSE accreditation_metric_narratives.ai_draft_md END,
    edit_distance     = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN NULL ELSE accreditation_metric_narratives.edit_distance END,
    edit_ratio        = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN NULL ELSE accreditation_metric_narratives.edit_ratio END,
    edit_measured_at  = CASE WHEN accreditation_metric_narratives.status = 'ai_drafted'
                             THEN NULL ELSE accreditation_metric_narratives.edit_measured_at END,
    updated_at        = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- ----------------------------------------------------------------------------
-- 4. ACLs — restate the LIVE shape (anon=false, authenticated=false,
--    service_role=true; read from prod 2026-08-13 before writing this).
--    CREATE OR REPLACE keeps existing grants, so this is belt-and-braces
--    against drift rather than a change.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(
  uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_record_narrative_draft(
  uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly rather than the return edge silently not
--    existing while the okay path warns into a log nobody reads.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE v_missing integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accreditation_metric_narratives'
      AND column_name='ai_draft_md'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accreditation_metric_narratives'
      AND column_name='edit_ratio'
  ) THEN
    RAISE EXCEPTION 'edit-distance columns missing — the return edge cannot work without them';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.accreditation_metric_narratives
  WHERE status = 'ai_drafted' AND narrative_md IS NOT NULL AND ai_draft_md IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % ai_drafted rows still have no ai_draft_md snapshot', v_missing;
  END IF;

  IF has_function_privilege('anon','public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE fn_accreditation_record_narrative_draft — cron-only lockdown failed';
  END IF;
  IF NOT has_function_privilege('service_role','public.fn_accreditation_record_narrative_draft(uuid,text,text,text,text,jsonb,text,jsonb,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost EXECUTE on fn_accreditation_record_narrative_draft — the nightly drafter would stop';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
