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
-- ADDITIVE / IDEMPOTENT / DROPS-NOTHING for the bucket, policies and config.
--
-- CONTAINS ONE SECDEF REPLACE: fn_ai_job_type_upsert (section 4). It is a
-- CREATE OR REPLACE of the LIVE production body with a single vocabulary entry
-- added — required, because that RPC silently coerces an unknown lane back to
-- 'max' and would otherwise undo section 3 the first time anyone saves the job
-- type from /admin/ai-models. Re-read its live md5 before applying (see the
-- section header) and regenerate rather than apply blind if it has moved.
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


-- ── 4. Teach fn_ai_job_type_upsert about the sub-lane ───────────────────────
-- WITHOUT THIS THE WHOLE LANE SPLIT IS UNDONE BY A UI SAVE.
--
-- fn_ai_job_type_upsert (the RPC behind /admin/ai-models → job-type edit, via
-- POST /api/admin/ai-job-types) carries its OWN vocabulary gate, independent of
-- the CHECK constraint widened above:
--
--     IF v_lane NOT IN ('max', 'api', 'either') THEN
--       v_lane := 'max';          -- SILENT coercion, no error raised
--     END IF;
--
-- So after this migration sets lane='max-pdf', the next person who opens the
-- procurement job type and presses Save would have it quietly rewritten to
-- lane='max' while interactive stays true — re-arming the exact collision this
-- migration exists to prevent (the PDF runner claiming live ai_query.chat
-- questions, unrecoverable because fn_ai_requeue_stale skips interactive types).
-- No error would surface; the admin would simply have saved the form.
--
-- The body below is the LIVE production definition (md5
-- babe2215d3222add0c70a9790f9c5fc9, read from pg_get_functiondef at authoring
-- time — NOT a repo copy, which risks silently reverting unrelated changes).
-- The ONLY edits are the added 'max-pdf' vocabulary entry and its comment.
-- Re-read the live md5 before applying: if it has changed, someone amended this
-- function since, and this body must be regenerated rather than applied blind.

CREATE OR REPLACE FUNCTION public.fn_ai_job_type_upsert(p_def jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_job_type      text := nullif(trim(p_def->>'job_type'), '');
  v_title         text := nullif(trim(p_def->>'title'), '');
  v_lane          text := coalesce(p_def->>'lane', 'max');
  v_output_target text := coalesce(p_def->>'output_target', 'job.result');
  v_allow_rule    text := coalesce(p_def->>'allow_rule', 'seat_owner');
  v_tool_set      text := coalesce(nullif(trim(p_def->>'tool_set'), ''), 'all');
  v_input_schema  jsonb;
  v_expected      int;
  v_max_inflight  int;
  v_row           public.ai_job_types%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  -- job_type must be a safe key (lowercase, digits, underscore, dot)
  IF v_job_type IS NULL OR v_job_type !~ '^[a-z0-9_.]+$' THEN
    RAISE EXCEPTION 'job_type must match ^[a-z0-9_.]+$ (got %)', coalesce(v_job_type, '<null>');
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  -- Coerce to CHECK-constraint vocab; anything unrecognised → safe default.
  -- 'max-pdf' (2026-07-28): a dedicated Max sub-lane. It MUST be listed here —
  -- without it this coercion silently rewrites lane back to 'max', which for an
  -- interactive job type re-arms the ai_query.chat claim collision.
  IF v_lane NOT IN ('max', 'api', 'either', 'max-pdf') THEN
    v_lane := 'max';
  END IF;
  IF NOT (v_output_target IN ('job.result', 'inbox') OR v_output_target LIKE 'table:%') THEN
    v_output_target := 'job.result';
  END IF;
  IF NOT (v_allow_rule IN ('seat_owner', 'authenticated') OR v_allow_rule LIKE 'permission:%') THEN
    v_allow_rule := 'seat_owner';
  END IF;

  -- input_schema must be a JSON array; otherwise empty.
  v_input_schema := CASE
    WHEN jsonb_typeof(p_def->'input_schema') = 'array' THEN p_def->'input_schema'
    ELSE '[]'::jsonb
  END;

  -- expected_seconds / max_inflight: tolerate strings, clamp sane.
  BEGIN
    v_expected := nullif(p_def->>'expected_seconds', '')::int;
  EXCEPTION WHEN others THEN v_expected := NULL;
  END;
  IF v_expected IS NOT NULL AND v_expected < 0 THEN
    v_expected := NULL;
  END IF;
  BEGIN
    v_max_inflight := coalesce(nullif(p_def->>'max_inflight', '')::int, 3);
  EXCEPTION WHEN others THEN v_max_inflight := 3;
  END;
  IF v_max_inflight < 1 THEN
    v_max_inflight := 1;
  END IF;

  INSERT INTO public.ai_job_types (
    job_type, title, description, prompt_template, tool_set, output_target,
    interactive, lane, allow_rule, max_inflight, schedulable, enabled,
    input_schema, expected_seconds, updated_at
  ) VALUES (
    v_job_type,
    v_title,
    nullif(trim(p_def->>'description'), ''),
    nullif(trim(p_def->>'prompt_template'), ''),
    v_tool_set,
    v_output_target,
    coalesce((p_def->>'interactive')::boolean, false),
    v_lane,
    v_allow_rule,
    v_max_inflight,
    coalesce((p_def->>'schedulable')::boolean, false),
    coalesce((p_def->>'enabled')::boolean, true),
    v_input_schema,
    v_expected,
    now()
  )
  ON CONFLICT (job_type) DO UPDATE SET
    title            = EXCLUDED.title,
    description      = EXCLUDED.description,
    prompt_template  = EXCLUDED.prompt_template,
    tool_set         = EXCLUDED.tool_set,
    output_target    = EXCLUDED.output_target,
    interactive      = EXCLUDED.interactive,
    lane             = EXCLUDED.lane,
    allow_rule       = EXCLUDED.allow_rule,
    max_inflight     = EXCLUDED.max_inflight,
    schedulable      = EXCLUDED.schedulable,
    enabled          = EXCLUDED.enabled,
    input_schema     = EXCLUDED.input_schema,
    expected_seconds = EXCLUDED.expected_seconds,
    updated_at       = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'job_type', v_row.job_type, 'row', to_jsonb(v_row));
END;
$function$;

-- Preserve the exact grant set this function had before the replace
-- (service_role, authenticated, postgres). The explicit anon revoke is the
-- house rule: Supabase's default privileges grant EXECUTE on new functions to
-- anon, and CREATE OR REPLACE can re-apply them.
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
