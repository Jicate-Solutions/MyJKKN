-- ============================================================================
-- 20260713000100_ai_job_types_admin_and_run.sql
-- ----------------------------------------------------------------------------
-- AI Studio: admin CRUD + self-describing run form support for the generic
-- AI-jobs registry (ai_job_types / ai_jobs, created by #1998
-- 20260712183000_ai_jobs_registry_queue.sql).
--
-- Adds two columns so a job type can DESCRIBE its own run form:
--   input_schema     — array of field descriptors → the UI auto-draws inputs
--   expected_seconds — powers the "expected ~Ns" progress timer (NULL = derive)
--
-- Adds five super-admin registry RPCs (list / upsert / set_enabled / delete /
-- last_run) so an admin manages job types entirely from the AI Studio UI with
-- no per-type migration. Every RPC is SECURITY DEFINER with an internal
-- is_super_admin() gate that RAISEs, anon/PUBLIC revoked, authenticated granted
-- (mirrors #1998 style). The generic RUN path (fn_ai_enqueue / fn_ai_job_status)
-- is REUSED unchanged — not reimplemented here.
-- Ref: memory/project_ai_jobs_registry_lane.md
-- ============================================================================

-- ── 1. SELF-DESCRIBING RUN FORM: two additive columns ───────────────────────
ALTER TABLE public.ai_job_types
  ADD COLUMN IF NOT EXISTS input_schema     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_seconds int;

COMMENT ON COLUMN public.ai_job_types.input_schema IS
  'Array of field descriptors the run UI auto-draws. Each: { key, label, type: text|textarea|number|select, options?[], required? }.';
COMMENT ON COLUMN public.ai_job_types.expected_seconds IS
  'Typical run time in seconds for the progress timer. NULL = derive from recent avg.';

-- ── 2. ADMIN RPC: list every job type (incl. disabled) ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_admin_list()
RETURNS SETOF public.ai_job_types
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;
  RETURN QUERY SELECT * FROM public.ai_job_types ORDER BY job_type;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_admin_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_admin_list() TO authenticated;

-- ── 3. ADMIN RPC: create/update one job type from a JSON def ────────────────
-- Validates job_type is a safe key, coerces lane/output_target/allow_rule to
-- the table's CHECK-constraint vocab (invalid → safe default), upserts.
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_upsert(p_def jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
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
  IF v_lane NOT IN ('max', 'api', 'either') THEN
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
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) TO authenticated;

-- ── 4. ADMIN RPC: enable/disable one job type ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_set_enabled(p_job_type text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE v_found boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  UPDATE public.ai_job_types
     SET enabled = coalesce(p_enabled, false), updated_at = now()
   WHERE job_type = p_job_type
  RETURNING true INTO v_found;

  IF NOT coalesce(v_found, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown job_type');
  END IF;
  RETURN jsonb_build_object('ok', true, 'job_type', p_job_type, 'enabled', coalesce(p_enabled, false));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_set_enabled(text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_set_enabled(text, boolean) TO authenticated;

-- ── 5. ADMIN RPC: delete one job type ───────────────────────────────────────
-- Blocked if the type still has jobs referencing it (ai_jobs.job_type FK).
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_delete(p_job_type text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE v_found boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ai_jobs WHERE job_type = p_job_type) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'job_type has existing jobs; disable it instead of deleting');
  END IF;

  DELETE FROM public.ai_job_types WHERE job_type = p_job_type
  RETURNING true INTO v_found;

  IF NOT coalesce(v_found, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown job_type');
  END IF;
  RETURN jsonb_build_object('ok', true, 'job_type', p_job_type);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_delete(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_delete(text) TO authenticated;

-- ── 6. ADMIN RPC: last run stamp for a job type ─────────────────────────────
-- max(completed_at) from ai_jobs. Requester-scoped when the type is interactive
-- (each user's own run), global for batch/scheduled types.
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_last_run(p_job_type text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_interactive boolean;
  v_last        timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  SELECT interactive INTO v_interactive
    FROM public.ai_job_types WHERE job_type = p_job_type;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_interactive THEN
    SELECT max(completed_at) INTO v_last
      FROM public.ai_jobs
     WHERE job_type = p_job_type AND status = 'done' AND requested_by = auth.uid();
  ELSE
    SELECT max(completed_at) INTO v_last
      FROM public.ai_jobs
     WHERE job_type = p_job_type AND status = 'done';
  END IF;

  RETURN v_last;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_last_run(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_last_run(text) TO authenticated;
