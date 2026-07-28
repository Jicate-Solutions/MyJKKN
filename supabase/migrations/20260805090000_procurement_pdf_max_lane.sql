-- ============================================================================
-- Procurement PDF extraction → ₹0 Max lane (bucket + job-type config)
-- ============================================================================
-- Created: 2026-07-28. Applied by the orchestrator with BEGIN…ROLLBACK
-- rehearsal — NOT auto-applied by any deploy.
--
-- WHY: procurement.quotation_extract / invoice_extract were the LAST features
-- able to call the PAID Anthropic API (every other feature moved to the ₹0 Max
-- lane on 2026-07-15). The vendor PDF now rides the Max lane instead: the app
-- parks the PDF in a PRIVATE bucket and enqueues an ai_jobs row carrying only
-- the storage path; the Max-lane runner downloads it with the service role,
-- stages it beside an empty sandbox and lets the Claude CLI read it from disk.
-- The PDF never travels inside the job payload.
--
-- PRIVATE BY DESIGN: vendor quotations are commercial pricing data. Unlike
-- id-card artwork this bucket is NOT public — reads are gated on the same
-- permission that gates uploading and comparing quotations.
--
-- SHIPS DARK: enabled stays FALSE until the Max-lane runner is installed on the
-- Windows box. While dark, fn_ai_enqueue returns 'unknown or disabled job_type'
-- and the UI degrades to "AI reading unavailable — please enter prices
-- manually" (the Director-chosen fallback). Go-live = a one-line enabled flip,
-- no deploy.
--
-- TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING. No functions, no RPC.
-- ============================================================================

BEGIN;

-- ── 1. Private bucket for the vendor PDFs ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'procurement-quotation-pdfs',
  'procurement-quotation-pdfs',
  false,
  15728640, -- 15 MB — matches the existing route limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Upload: quotation managers (or admins) only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_quotation_pdfs_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_quotation_pdfs_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'procurement-quotation-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.quotation_manage')
        )
      )
    $policy$;
  END IF;
END $$;

-- Read: same gate as upload. NOT public — commercial pricing.
-- (The Max-lane runner reads with the service role, which bypasses RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_quotation_pdfs_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_quotation_pdfs_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'procurement-quotation-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.quotation_manage')
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_quotation_pdfs_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_quotation_pdfs_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'procurement-quotation-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.quotation_manage')
        )
      )
    $policy$;
  END IF;
END $$;

-- ── 2. Allow a dedicated Max sub-lane ───────────────────────────────────────
-- WIDEN-ONLY (never narrows): adds 'max-pdf' alongside the existing values.
-- The house doctrine is "LANE IS THE ISOLATION KNOB" (ai-jobs-drain-mac.mjs) —
-- fn_ai_claim filters on lane, so a dedicated lane is how a runner is kept from
-- racing another. The Mac drain already relies on this with LANE=mac-test; that
-- works only because ai_jobs.lane is unconstrained. A PRODUCTION job type takes
-- its lane from ai_job_types.lane, which this CHECK constrains — hence the
-- widen.
--
-- Naming matters: 'max-pdf' keeps the `max` prefix so the ₹0 Claude-only guard
-- in /admin/ai-models (isMaxLane) still recognises it as a Max sub-lane. That
-- guard is prefix-based in the same commit; do NOT rename this to something
-- that does not start with 'max-'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_job_types'::regclass AND conname = 'ai_job_types_lane_chk'
  ) THEN
    ALTER TABLE public.ai_job_types DROP CONSTRAINT ai_job_types_lane_chk;
  END IF;
  ALTER TABLE public.ai_job_types
    ADD CONSTRAINT ai_job_types_lane_chk
    CHECK (lane = ANY (ARRAY['max'::text, 'api'::text, 'either'::text, 'max-pdf'::text]));
END $$;

-- ── 3. Job-type config ──────────────────────────────────────────────────────
-- interactive = TRUE is the load-bearing bit for latency: the drain claims
-- interactive work first, so these land in the ~25s band (ai_query.chat: 25s
-- avg / 92s p95 over 14 days) instead of the multi-hour batch band.
--
-- lane = 'max-pdf' is the load-bearing bit for SAFETY, and it is NOT optional:
--
--   fn_ai_claim(p_lane, p_runner, p_interactive) selects the next pending job
--   with `(p_lane IS NULL OR j2.lane = p_lane) AND t2.interactive = p_interactive`
--   and NO job_type predicate whatsoever. A runner claims whatever is pending
--   on its (lane, interactive) pair.
--
--   The only other interactive lane='max' types are ai_query.chat and
--   ai_pulse.anomaly_detection, both enabled. So leaving procurement on
--   lane='max' with interactive=true would let the PDF runner claim a live
--   ai_query.chat question — a person waiting on an answer — and it CANNOT be
--   handed back: fn_ai_requeue_stale explicitly skips interactive job types
--   ("Skip interactive job types"), so a mis-claimed row sits in 'claimed'
--   forever and that person simply never gets their answer.
--
--   A dedicated lane is therefore the safe way to buy interactive latency
--   without sharing a claim pool with user-facing chat. The runner also guards
--   its own end (it fails any unexpected job_type loudly), but the lane split
--   is what makes the collision impossible in the first place.
--
-- allow_rule mirrors the UI gate — procurement.quotation_manage is
-- "Upload & Compare Vendor Quotations", exactly who uploads these PDFs.
--
-- enabled deliberately NOT touched here (stays false) — see SHIPS DARK above.
UPDATE public.ai_job_types
   SET lane        = 'max-pdf',
       interactive = true,
       allow_rule  = 'permission:procurement.quotation_manage',
       expected_seconds = 45,
       updated_at  = now()
 WHERE job_type = 'procurement.quotation_extract';

-- The GRN/invoice twin rides the identical contract and the SAME dedicated
-- lane; its runner arm is registered but disabled, so a stray invoice job fails
-- loudly rather than being answered with a quotation prompt.
UPDATE public.ai_job_types
   SET lane        = 'max-pdf',
       interactive = true,
       allow_rule  = 'permission:procurement.grn_create',
       expected_seconds = 45,
       updated_at  = now()
 WHERE job_type = 'procurement.invoice_extract';

NOTIFY pgrst, 'reload schema';

COMMIT;
