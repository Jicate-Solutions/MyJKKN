-- ============================================================================
-- 20260726073915_prompt_champion_challenger_substrate.sql
-- ----------------------------------------------------------------------------
-- Champion–challenger substrate for AI job prompts. SUBSTRATE ONLY.
--
-- Today a prompt edit on ai_job_types.prompt_template is DESTRUCTIVE: the old
-- prompt is overwritten — no versions, no rollback. This migration adds
-- version bookkeeping AROUND the existing column, fully backwards-compatible:
--
--   1. ai_prompt_versions — every prompt version per job_type; status is
--      champion | challenger | retired; a partial unique index enforces at
--      most ONE champion per job_type. Admin-only SELECT; NO direct write
--      policies (writes only via the RPC below + service_role, mirroring
--      the ai_jobs write discipline from 20260712183000 / #1998).
--   2. fn_prompt_promote_version — admin-gated SECURITY DEFINER RPC that, in
--      one transaction, retires the current champion, crowns the challenger,
--      and COPIES its prompt text into ai_job_types.prompt_template. THIS is
--      what keeps the out-of-repo runners (~/jkkn-max-lane) working with ZERO
--      change: they keep reading ai_job_types.prompt_template as before.
--   3. Backfill — one version-1 'champion' row per job type that already has
--      a non-empty prompt_template (WHERE NOT EXISTS guard, never ON CONFLICT
--      — ref feedback_seed_platform_policies_expression_unique_index).
--
-- Rollback of a bad promotion = version revert: the old champion row is kept
-- as 'retired'; re-promoting it (a later flow) or manually copying its prompt
-- back restores the previous behaviour. Nothing is ever destroyed.
--
-- NO UI, NO runner changes, NO judge-scoring flow in this PR — those graduate
-- later once the substrate is in.
--
-- ⛔ NOT APPLIED to any database — file only, Director-gated apply.
-- ============================================================================

-- ── 1. TABLE: ai_prompt_versions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type   text NOT NULL REFERENCES public.ai_job_types(job_type),
  version    int  NOT NULL,
  prompt     text NOT NULL,
  status     text NOT NULL,
  clean_rate numeric,                                     -- judge clean-rate on the shared input set (filled by a later flow)
  notes      text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompt_versions_status_chk CHECK (status IN ('champion','challenger','retired')),
  CONSTRAINT ai_prompt_versions_job_ver_uq UNIQUE (job_type, version)
);

-- At most ONE champion per job_type.
CREATE UNIQUE INDEX IF NOT EXISTS ai_prompt_versions_one_champion_idx
  ON public.ai_prompt_versions (job_type)
  WHERE status = 'champion';

COMMENT ON TABLE public.ai_prompt_versions IS
  'Version bookkeeping for ai_job_types.prompt_template. A prompt fix is a champion–challenger, not an edit: versions are kept forever, promotion (fn_prompt_promote_version) copies the winning text into ai_job_types.prompt_template so out-of-repo runners need no change, and rollback = promoting the previous version back.';
COMMENT ON COLUMN public.ai_prompt_versions.clean_rate IS
  'Judge-scored clean rate for this version on the shared evaluation inputs (0..1 or 0..100 as the later judge flow defines). NULL until scored.';

-- ── 2. RLS: admin-only read; NO direct writes ────────────────────────────────
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prompt_versions_admin_read ON public.ai_prompt_versions;
CREATE POLICY ai_prompt_versions_admin_read ON public.ai_prompt_versions
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());
-- (no INSERT/UPDATE/DELETE policies for authenticated → all writes go through
--  the SECURITY DEFINER RPC below or service_role, same discipline as ai_jobs)

REVOKE ALL ON public.ai_prompt_versions FROM anon;

-- ── 3. RPC: promote a challenger to champion ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_prompt_promote_version(p_job_type text, p_version int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_target public.ai_prompt_versions%ROWTYPE;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin required to promote a prompt version';
  END IF;

  -- Serialize concurrent promotions for this job_type (lock all its versions).
  PERFORM 1 FROM public.ai_prompt_versions
   WHERE job_type = p_job_type
   FOR UPDATE;

  SELECT * INTO v_target
    FROM public.ai_prompt_versions
   WHERE job_type = p_job_type AND version = p_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no prompt version % for job type %', p_version, p_job_type;
  END IF;

  IF v_target.status <> 'challenger' THEN
    RAISE EXCEPTION 'INVALID_STATE: version % of % is ''%'' — only a challenger can be promoted',
      p_version, p_job_type, v_target.status;
  END IF;

  -- Retire the current champion FIRST (frees the one-champion partial index).
  UPDATE public.ai_prompt_versions
     SET status = 'retired', updated_at = now()
   WHERE job_type = p_job_type AND status = 'champion';

  -- Crown the challenger.
  UPDATE public.ai_prompt_versions
     SET status = 'champion', updated_at = now()
   WHERE job_type = p_job_type AND version = p_version
  RETURNING * INTO v_target;

  -- Copy the winning prompt into the column the out-of-repo runners read.
  -- Runners (~/jkkn-max-lane) keep reading ai_job_types.prompt_template
  -- unchanged — promotion is invisible to them except as a better prompt.
  UPDATE public.ai_job_types
     SET prompt_template = v_target.prompt, updated_at = now()
   WHERE job_type = p_job_type;

  RETURN to_jsonb(v_target);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_prompt_promote_version(text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_prompt_promote_version(text, int) TO authenticated;
-- (the internal is_super_admin() OR is_admin() assert is the real gate —
--  mirrors the fn_ai_job_type_* admin RPC style from 20260713000100)

-- ── 4. BACKFILL: version 1 = the current live prompt, as champion ────────────
INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
SELECT t.job_type,
       1,
       t.prompt_template,
       'champion',
       'backfill: live prompt_template at substrate install',
       'migration:20260726073915'
  FROM public.ai_job_types t
 WHERE t.prompt_template IS NOT NULL
   AND btrim(t.prompt_template) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = t.job_type
   );
