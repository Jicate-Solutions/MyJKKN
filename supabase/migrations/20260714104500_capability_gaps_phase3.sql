-- =====================================================================
-- Capability-Gap Loop — Phase 3 (spec §10)
--   class-2 candidate-tool drafting + IN-APP automated leak-test runner
--   + auto-retest re-enqueue + per-refusal event audit (capability_gap_events).
-- Spec: specs/capability-gap-loop-spec-2026-07-13.md
--       §6 (capability_gap_events), §7 (fix drawer: Draft tool / Run leak-test),
--       §8 (mandatory leak-test gate), §9 (auto-retest G13), §10 Phase 3.
-- Builds on: 20260714013517_capability_gaps_phase1.sql (table + scan + list),
--            20260714031839_capability_gaps_phase2.sql (triage/set_status/measure).
-- Created: 2026-07-14
--
-- What this ships (INERT until the RPCs are called by a super-admin):
--   1. capability_gaps  +draft_sql +leaktest_result +leaktest_at
--                       +retest_enqueued_at +retest_job_ids   (all additive/nullable)
--   2. capability_gap_events            — per-refusal audit (spec §6), RLS-locked.
--   3. fn_capgap_events_sync()          — idempotent per-refusal event population.
--   4. fn_capgap_draft_tool(uuid)       — class-2: generate a candidate SECDEF tool
--                                         TEMPLATE (name + filter-only args +
--                                         auth.uid()-pinned skeleton + anon-REVOKE).
--                                         DRAFTS text only — never executes SQL (G2).
--   5. fn_capgap_leaktest(uuid,uuid,uuid)— the §8 mandatory leak-test, run IN-APP:
--                                         impersonate two colleges + an id-spoof via
--                                         set_config(request.jwt.claims) in ONE
--                                         super-admin SECDEF txn; PASS iff the two
--                                         colleges see DIFFERENT data AND the spoof
--                                         is blocked. No Management-API token needed;
--                                         no self-reported PASS trusted.
--   6. fn_capgap_retest(uuid)           — §9/G13 auto-retest: re-enqueue the cluster's
--                                         stored sample questions as fresh
--                                         ai_query.chat jobs AS THE ORIGINAL ASKER
--                                         (owner-scoped; the drain answers scoped).
--
-- Security posture (unchanged from Phase 1/2 + the §8 constraint):
--   * Every RPC is SECURITY DEFINER, is_super_admin()-gated, anon-locked
--     (REVOKE EXECUTE FROM anon, PUBLIC). Supabase default-grants EXECUTE to
--     `authenticated` on new functions, so grants below are explicit.
--   * fn_capgap_leaktest binds the tool under test to a VALIDATED catalog name
--     (`^ai_rpc_` prefix + it must exist in pg_proc with the read-tool signature)
--     and passes args via USING — it is NOT an arbitrary-SQL primitive
--     (feedback_secdef_rpc_taking_sql_text_is_arbitrary_read_primitive).
--   * The impersonation set_config is is_local=true (transaction-scoped) and the
--     original claims are restored before the function returns.
--   * fn_capgap_draft_tool DRAFTS text only; the actual tool creation + exposure
--     still route through a human + the Windows READ_TOOLS handoff (§8, G2/G9).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columns — draft SQL, leak-test verdict, auto-retest provenance
-- ---------------------------------------------------------------------
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS draft_sql          text;         -- class-2 generated candidate tool template
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS leaktest_result    jsonb;        -- last fn_capgap_leaktest verdict (pass/cases/results)
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS leaktest_at        timestamptz;  -- when the last leak-test ran
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS retest_enqueued_at timestamptz;  -- when sample Qs were re-enqueued (G13)
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS retest_job_ids     jsonb NOT NULL DEFAULT '[]'::jsonb;  -- the re-enqueued ai_jobs.ids

COMMENT ON COLUMN public.capability_gaps.leaktest_result IS
  'Phase 3 (§8): last in-app leak-test verdict from fn_capgap_leaktest — {pass, isolation_ok, spoof_blocked, users/institutions used, truncated results}. A 3/3 PASS is the only path to awaiting_approval.';
COMMENT ON COLUMN public.capability_gaps.retest_job_ids IS
  'Phase 3 (§9/G13): ai_jobs.ids of the sample questions re-enqueued as the original askers after a fix went live. fn_capgap_measure reads their answers for the before→after proof.';


-- ---------------------------------------------------------------------
-- 2. Table: public.capability_gap_events  (spec §6 — per-refusal audit)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capability_gap_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id         uuid NOT NULL REFERENCES public.capability_gaps(id) ON DELETE CASCADE,
  job_id         uuid NOT NULL,                    -- ai_jobs.id of the refusing answer
  requested_by   uuid,                             -- who asked (cross-user demand provenance)
  matched_phrase text,                             -- which refusal phrase matched
  observed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capability_gap_events_gap_job_uniq UNIQUE (gap_id, job_id)  -- idempotent per (cluster, job)
);

COMMENT ON TABLE public.capability_gap_events IS
  'Capability-gap loop (Phase 3, spec §6): one row per individual AI-assistant refusal, linked to its cluster (capability_gaps). Enables exact per-window refusal-frequency math + provenance. Populated idempotently by fn_capgap_events_sync. RLS-locked; access only via SECDEF RPCs.';

ALTER TABLE public.capability_gap_events ENABLE ROW LEVEL SECURITY;
-- No policies: RLS-enabled + no policy = deny all direct access. All access via the
-- owner-run SECDEF RPCs below.
REVOKE ALL ON public.capability_gap_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS ix_capability_gap_events_gap ON public.capability_gap_events (gap_id, observed_at DESC);


-- ---------------------------------------------------------------------
-- 3. fn_capgap_events_sync() — idempotent per-refusal event population
-- ---------------------------------------------------------------------
-- Re-derives each refusal's cluster (same compact keyword ladder as
-- fn_capgap_scan) and inserts one capability_gap_events row per (gap, job).
-- Idempotent via ON CONFLICT (gap_id, job_id) DO NOTHING — safe to run every
-- scan. Gated to super-admin OR the service-role cron context (auth.uid() IS NULL).
CREATE OR REPLACE FUNCTION public.fn_capgap_events_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal_phrases text[] := ARRAY[
    '%don''t have%','%do not have%','%can''t access%','%cannot access%',
    '%outside the data%','%couldn''t find%','%not available to me%',
    '%don''t have access%','%no access%','%not able to access%'];
  v_inserted int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  WITH refusals AS (
    SELECT
      j.id AS job_id,
      j.requested_by,
      lower(coalesce(j.payload->>'message','')) AS q_l,
      j.result->>'answer' AS answer,
      -- first refusal phrase that matched (for the audit)
      (SELECT p FROM unnest(v_refusal_phrases) p
        WHERE lower(j.result->>'answer') ~~ p LIMIT 1) AS matched_phrase
    FROM public.ai_jobs j
    WHERE j.job_type = 'ai_query.chat'
      AND j.result->>'answer' IS NOT NULL
      AND lower(j.result->>'answer') ~~ ANY (v_refusal_phrases)
  ),
  mapped AS (
    SELECT r.job_id, r.requested_by, r.matched_phrase,
      CASE
        WHEN r.q_l ILIKE '%fee%' OR r.q_l ILIKE '%defaulter%' OR r.q_l ILIKE '%billing%'
             OR r.q_l ILIKE '%revenue%' OR r.q_l ILIKE '%collection%'
          THEN 'billing.fee_defaulters'
        WHEN r.q_l ILIKE '%hostel%' OR r.q_l ILIKE '%hostelite%' OR r.q_l ILIKE '%hosteite%'
             OR r.q_l ILIKE '%day scholar%' OR r.q_l ILIKE '%days scholar%'
             OR r.q_l ILIKE '%occupancy%'
          THEN 'hostel.capacity'
        WHEN r.q_l ILIKE '%participation%'
             OR (r.q_l ILIKE '%attendance%' AND r.q_l ILIKE '%75%')
             OR r.q_l ILIKE '%below 75%'
          THEN 'attendance.participation'
        ELSE 'uncategorized'
      END AS cluster_key
    FROM refusals r
  ),
  ins AS (
    INSERT INTO public.capability_gap_events (gap_id, job_id, requested_by, matched_phrase)
    SELECT cg.id, m.job_id, m.requested_by, m.matched_phrase
    FROM mapped m
    JOIN public.capability_gaps cg ON cg.cluster_key = m.cluster_key
    ON CONFLICT (gap_id, job_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$;


-- ---------------------------------------------------------------------
-- 4. fn_capgap_draft_tool(p_id) — class-2 candidate SECDEF tool TEMPLATE
-- ---------------------------------------------------------------------
-- Generates a candidate SECDEF read-tool spec for a class-2 gap: a name, the
-- filter-only signature, an auth.uid()-pinned body skeleton, and the anon-REVOKE
-- template. It DRAFTS text only (stored in draft_sql) — the actual tool creation,
-- leak-test, approval, and Windows exposure remain human-gated (§8, G2/G9).
CREATE OR REPLACE FUNCTION public.fn_capgap_draft_tool(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.capability_gaps;
  v_domain   text;
  v_toolname text;
  v_sql      text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.capability_gaps WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  -- Derive a safe tool name from the cluster's domain (letters/underscore only).
  v_domain   := regexp_replace(split_part(v_row.cluster_key, '.', 1), '[^a-z0-9]+', '_', 'g');
  IF v_domain IS NULL OR v_domain = '' THEN v_domain := 'topic'; END IF;
  v_toolname := 'ai_rpc_' || v_domain || '_summary';

  -- The candidate tool TEMPLATE. Args are FILTERS ONLY (no raw SQL text). The body
  -- is a hard-pinned skeleton the human completes with the real query; the pin and
  -- the anon-lock are pre-filled so the safe posture is the default.
  v_sql :=
    E'-- Candidate SECDEF read-tool for capability gap: ' || v_row.cluster_key || E'\n' ||
    E'-- Auto-drafted by fn_capgap_draft_tool (Phase 3). REVIEW + complete the query,\n' ||
    E'-- then leak-test (fn_capgap_leaktest) BEFORE exposing to the drain (§8).\n' ||
    E'CREATE OR REPLACE FUNCTION public.' || v_toolname || E'(\n' ||
    E'  p_user_id        uuid DEFAULT NULL,   -- IGNORED: always overwritten with auth.uid()\n' ||
    E'  p_institution_id uuid DEFAULT NULL    -- honored ONLY for super-admins; else hard-pinned\n' ||
    E')\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $body$\n' ||
    E'DECLARE\n  v_uid  uuid := auth.uid();\n  v_inst uuid;\nBEGIN\n' ||
    E'  IF v_uid IS NULL THEN RETURN jsonb_build_object(''success'', false, ''error'', ''UNAUTHORIZED''); END IF;\n' ||
    E'  -- Hard-pin scope: non-super callers are ALWAYS pinned to their own institution.\n' ||
    E'  IF public.is_super_admin() THEN\n' ||
    E'    v_inst := coalesce(p_institution_id, (SELECT institution_id FROM public.profiles WHERE id = v_uid));\n' ||
    E'  ELSE\n' ||
    E'    v_inst := (SELECT institution_id FROM public.profiles WHERE id = v_uid);\n' ||
    E'  END IF;\n' ||
    E'  -- TODO(human): SELECT the ' || v_row.cluster_key || E' aggregate for v_inst ONLY.\n' ||
    E'  --   Return jsonb_build_object(''success'', true, ''data'', ...). Never read another\n' ||
    E'  --   institution''s rows; scope every table by v_inst.\n' ||
    E'  RETURN jsonb_build_object(''success'', true, ''data'', jsonb_build_object(''institution_id'', v_inst));\n' ||
    E'END;\n$body$;\n\n' ||
    E'-- Anon-lock (CLAUDE.md): Supabase default-grants EXECUTE to authenticated too.\n' ||
    E'REVOKE EXECUTE ON FUNCTION public.' || v_toolname || E'(uuid, uuid) FROM anon, PUBLIC;\n' ||
    E'GRANT  EXECUTE ON FUNCTION public.' || v_toolname || E'(uuid, uuid) TO authenticated;';

  UPDATE public.capability_gaps cg
  SET draft_sql      = v_sql,
      candidate_tool = coalesce(cg.candidate_tool, v_toolname),
      status         = CASE WHEN cg.status IN ('open','triaged') THEN 'fix_drafted' ELSE cg.status END,
      disposed_by    = auth.uid(),
      updated_at     = now()
  WHERE cg.id = p_id
  RETURNING cg.* INTO v_row;

  RETURN jsonb_build_object('success', true,
    'data', jsonb_build_object('tool_name', v_toolname, 'draft_sql', v_sql, 'status', v_row.status));
END;
$$;


-- ---------------------------------------------------------------------
-- 5. fn_capgap_leaktest(p_id, p_user_a, p_user_b) — the §8 leak-test, IN-APP
-- ---------------------------------------------------------------------
-- Runs the mandatory two-college + id-spoof isolation test on the gap's
-- candidate_tool, entirely in-DB, gated to super-admin. Impersonates each test
-- user by setting request.jwt.claims (is_local) and calling the tool; the tool's
-- own auth.uid() pin does the scoping. PASS iff the two colleges see DIFFERENT
-- data AND an A-spoofing-B call still returns A's data (the spoof is blocked).
--
--   * p_user_a / p_user_b — optional explicit test users (two DIFFERENT
--     institutions). If NULL, auto-picks two non-super users from the two
--     institutions with the most profiles (best-effort; the result reports which).
--   * The tool name is validated: it must match ^ai_rpc_ and exist in pg_proc
--     with exactly the (uuid, uuid) read-tool signature — never arbitrary SQL.
--   * On a 3/3 PASS the row advances to awaiting_approval (human still approves +
--     Windows still exposes). On FAIL it parks at fix_drafted with the failing case.
-- Internal helper: recursively remove scope-echo keys (institution_id / user_id / …) from a
-- jsonb, so the leak-test's ISOLATION comparison looks at the SUBSTANTIVE data, not a
-- per-institution id a tool merely echoes back (which would otherwise make isolation
-- vacuously true even while a sibling field leaks global data). Internal-only.
CREATE OR REPLACE FUNCTION public._capgap_strip_scope_keys(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(p)
    WHEN 'object' THEN (
      SELECT coalesce(jsonb_object_agg(e.k, public._capgap_strip_scope_keys(e.v)), '{}'::jsonb)
      FROM jsonb_each(p) AS e(k, v)
      WHERE e.k NOT IN ('institution_id','institution','institution_name',
                        'user_id','uid','profile_id','learner_id')
    )
    WHEN 'array' THEN (
      SELECT coalesce(jsonb_agg(public._capgap_strip_scope_keys(a.v)), '[]'::jsonb)
      FROM jsonb_array_elements(p) AS a(v)
    )
    ELSE p
  END
$$;

CREATE OR REPLACE FUNCTION public.fn_capgap_leaktest(
  p_id     uuid,
  p_user_a uuid DEFAULT NULL,
  p_user_b uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.capability_gaps;
  v_tool       text;
  v_nargs      int;
  v_argtypes   text;
  v_argnames   text[];
  v_volatile   char;
  v_ua uuid; v_ub uuid; v_ia uuid; v_ib uuid;
  v_a_super boolean; v_b_super boolean;
  v_orig       text;
  v_res_a jsonb; v_res_b jsonb;
  v_res_s1 jsonb; v_res_s2 jsonb; v_res_s3 jsonb;   -- spoof variants: arg1, arg2, both
  v_isolation  boolean;
  v_spoof_ok   boolean;
  v_pass       boolean;
  v_result     jsonb;
  v_new_status text;
  v_note       text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.capability_gaps WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  v_tool := v_row.candidate_tool;
  IF v_tool IS NULL OR v_tool !~ '^ai_rpc_[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'candidate_tool missing or not an ai_rpc_* identifier');
  END IF;

  -- Validate the tool: public.<name>(p_user_id uuid, p_institution_id uuid), STABLE/IMMUTABLE
  -- (never VOLATILE — so the leak-tester never triggers a write under impersonation), with
  -- the exact arg NAMES (so the arg-ORDER the spoof relies on is verifiably true, not assumed).
  -- This binds the dynamic call to a known READ tool — not an arbitrary or write primitive.
  SELECT p.pronargs, pg_catalog.oidvectortypes(p.proargtypes), p.proargnames, p.provolatile
  INTO v_nargs, v_argtypes, v_argnames, v_volatile
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_tool
  ORDER BY p.pronargs DESC
  LIMIT 1;
  IF v_nargs IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tool not found in pg_proc: ' || v_tool);
  END IF;
  IF v_nargs <> 2 OR v_argtypes <> 'uuid, uuid' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'tool signature is not (uuid, uuid): got (' || coalesce(v_argtypes,'?') || ')');
  END IF;
  IF v_argnames IS DISTINCT FROM ARRAY['p_user_id','p_institution_id']::text[] THEN
    RETURN jsonb_build_object('success', false, 'error',
      'tool args must be named (p_user_id, p_institution_id); got '
      || coalesce(array_to_string(v_argnames, ','), '?'));
  END IF;
  IF v_volatile NOT IN ('s','i') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'tool must be STABLE/IMMUTABLE (read-only); it is VOLATILE — refusing to run it under impersonation');
  END IF;

  -- Choose two test users from two DIFFERENT institutions.
  v_ua := p_user_a; v_ub := p_user_b;
  IF v_ua IS NULL OR v_ub IS NULL THEN
    SELECT s.uid, s.inst INTO v_ua, v_ia FROM (
      SELECT p.id AS uid, p.institution_id AS inst,
             count(*) OVER (PARTITION BY p.institution_id) AS insz
      FROM public.profiles p
      WHERE coalesce(p.is_super_admin,false) = false AND p.institution_id IS NOT NULL
    ) s ORDER BY s.insz DESC, s.inst LIMIT 1;
    SELECT s.uid, s.inst INTO v_ub, v_ib FROM (
      SELECT p.id AS uid, p.institution_id AS inst,
             count(*) OVER (PARTITION BY p.institution_id) AS insz
      FROM public.profiles p
      WHERE coalesce(p.is_super_admin,false) = false AND p.institution_id IS NOT NULL
        AND p.institution_id <> v_ia
    ) s ORDER BY s.insz DESC, s.inst LIMIT 1;
  END IF;

  -- Resolve each user's institution + super-admin flag. BOTH test users MUST be non-super:
  -- a super-admin caller takes a tool's super branch and honors the spoofed id, which would
  -- distort the verdict (the auto-pick path filters supers; the explicit path must too).
  SELECT institution_id, coalesce(is_super_admin, false)
    INTO v_ia, v_a_super FROM public.profiles WHERE id = v_ua;
  SELECT institution_id, coalesce(is_super_admin, false)
    INTO v_ib, v_b_super FROM public.profiles WHERE id = v_ub;
  IF v_ua IS NULL OR v_ub IS NULL OR v_ia IS NULL OR v_ib IS NULL OR v_ia = v_ib THEN
    RETURN jsonb_build_object('success', false, 'error',
      'could not resolve two users from two different institutions');
  END IF;
  IF v_a_super OR v_b_super THEN
    RETURN jsonb_build_object('success', false, 'error',
      'both test users must be non-super-admins (a super-admin bypasses per-institution scoping)');
  END IF;

  -- Save the caller's claims so we can restore them after the impersonated calls.
  v_orig := current_setting('request.jwt.claims', true);

  -- (A) College A user, no spoof → A's legitimate scoped result.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT public.%I($1, $2)', v_tool) INTO v_res_a USING NULL::uuid, NULL::uuid;

  -- (B) College B user, no spoof → B's legitimate scoped result.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT public.%I($1, $2)', v_tool) INTO v_res_b USING NULL::uuid, NULL::uuid;

  -- SPOOF variants — all as College A, trying to reach B's data via EVERY caller-supplied
  -- uuid position. A correctly-scoped tool ignores both args (hard-pinned to auth.uid()=A)
  -- and returns A's data for all three. We spoof BOTH args because the tester cannot know
  -- which arg a tool keys on — and the codebase's #1 leak class is a p_user_id (arg1)
  -- confused deputy (feedback_ai_rpc_confused_deputy_p_user_id — the 4,486-learner leak),
  -- which an arg2-only spoof would never exercise.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT public.%I($1, $2)', v_tool) INTO v_res_s1 USING v_ub,       NULL::uuid;  -- spoof arg1 = B's user id
  EXECUTE format('SELECT public.%I($1, $2)', v_tool) INTO v_res_s2 USING NULL::uuid, v_ib;        -- spoof arg2 = B's institution
  EXECUTE format('SELECT public.%I($1, $2)', v_tool) INTO v_res_s3 USING v_ub,       v_ib;        -- spoof BOTH

  -- Restore the original caller claims (defense in depth; is_local resets at txn end anyway).
  PERFORM set_config('request.jwt.claims', coalesce(v_orig, ''), true);

  -- ISOLATION: the two colleges must see DIFFERENT SUBSTANTIVE data — compared with
  -- scope-echo keys stripped (institution_id/user_id/…), so a tool that merely echoes a
  -- different institution_id while leaking the SAME global data does NOT fake isolation.
  v_isolation := public._capgap_strip_scope_keys(v_res_a)
                 IS DISTINCT FROM public._capgap_strip_scope_keys(v_res_b);

  -- SPOOF BLOCKED: EVERY spoof variant (arg1, arg2, both) must return A's OWN full result —
  -- no caller-supplied uuid can move the result onto B's data.
  v_spoof_ok := (v_res_s1 IS NOT DISTINCT FROM v_res_a)
            AND (v_res_s2 IS NOT DISTINCT FROM v_res_a)
            AND (v_res_s3 IS NOT DISTINCT FROM v_res_a);

  v_pass := v_isolation AND v_spoof_ok;

  v_note := CASE
    WHEN NOT v_isolation
      THEN 'INCONCLUSIVE/FAIL: the two colleges saw identical substantive data (echo-stripped) — pick two institutions with differing data, or the tool is not scoping.'
    WHEN NOT v_spoof_ok
      THEN 'FAIL: a caller-supplied id (p_user_id and/or p_institution_id) moved the result off College A''s data — the tool leaks cross-tenant. Do NOT expose.'
    ELSE 'PASS: colleges isolated + every id-spoof (user, institution, both) blocked.'
  END;

  v_result := jsonb_build_object(
    'pass',          v_pass,
    'isolation_ok',  v_isolation,
    'spoof_blocked', v_spoof_ok,
    'spoof_user_ok',        (v_res_s1 IS NOT DISTINCT FROM v_res_a),
    'spoof_institution_ok', (v_res_s2 IS NOT DISTINCT FROM v_res_a),
    'spoof_both_ok',        (v_res_s3 IS NOT DISTINCT FROM v_res_a),
    'tool',          v_tool,
    'user_a',        v_ua, 'institution_a', v_ia,
    'user_b',        v_ub, 'institution_b', v_ib,
    'result_a',      left(v_res_a::text, 400),
    'result_b',      left(v_res_b::text, 400),
    'result_spoof_user',        left(v_res_s1::text, 300),
    'result_spoof_institution', left(v_res_s2::text, 300),
    'note', v_note,
    'checked_at', now()
  );

  v_new_status := CASE
    WHEN v_pass AND v_row.status IN ('open','triaged','fix_drafted','leak_testing')
      THEN 'awaiting_approval'
    -- A FAIL never leaves a gap in a green approval state — un-approve on re-test failure.
    WHEN (NOT v_pass) AND v_row.status IN ('open','triaged','leak_testing','awaiting_approval')
      THEN 'fix_drafted'
    ELSE v_row.status
  END;

  UPDATE public.capability_gaps cg
  SET leaktest_result = v_result,
      leaktest_at     = now(),
      status          = v_new_status,
      disposed_by     = auth.uid(),
      updated_at      = now()
  WHERE cg.id = p_id
  RETURNING cg.* INTO v_row;

  RETURN jsonb_build_object('success', true, 'data', v_result, 'new_status', v_new_status);
END;
$$;


-- ---------------------------------------------------------------------
-- 6. fn_capgap_retest(p_id) — §9/G13 auto-retest re-enqueue
-- ---------------------------------------------------------------------
-- Re-enqueues the cluster's stored sample_questions as fresh ai_query.chat jobs
-- AS THE ORIGINAL ASKER (payload.message = the question, requested_by = the user
-- who originally asked it, from the paired sample_job_ids). The drain answers
-- each owner-scoped, so the retest inherits the per-user scoping guarantee for
-- free (never service-role). Bounded to the gap's own <=5 stored questions.
-- Meant for a post-fix gap (fix_live / awaiting_approval / resolved).
CREATE OR REPLACE FUNCTION public.fn_capgap_retest(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.capability_gaps;
  v_ids     uuid[] := ARRAY[]::uuid[];
  v_q       text;
  v_jid     text;
  v_asker   uuid;
  v_new_id  uuid;
  v_i       int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.capability_gaps WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  IF v_row.status NOT IN ('fix_live','awaiting_approval','resolved') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'retest only applies after a fix is live/approved (status=' || v_row.status || ')');
  END IF;

  -- Iterate the parallel sample_questions / sample_job_ids arrays (<=5).
  FOR v_i IN 0 .. least(jsonb_array_length(coalesce(v_row.sample_questions,'[]'::jsonb)) - 1, 4) LOOP
    v_q := v_row.sample_questions->>v_i;
    IF v_q IS NULL OR length(trim(v_q)) = 0 THEN CONTINUE; END IF;

    -- The original asker = requested_by of the paired sample job, if resolvable;
    -- else the cluster's most recent asker. Never a service-role id.
    v_jid := v_row.sample_job_ids->>v_i;
    v_asker := NULL;
    IF v_jid IS NOT NULL THEN
      SELECT requested_by INTO v_asker FROM public.ai_jobs WHERE id = v_jid::uuid;
    END IF;
    IF v_asker IS NULL THEN
      SELECT requested_by INTO v_asker
      FROM public.ai_jobs
      WHERE job_type = 'ai_query.chat' AND requested_by IS NOT NULL
      ORDER BY requested_at DESC LIMIT 1;
    END IF;
    IF v_asker IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.ai_jobs (job_type, payload, requested_by, status, lane, priority)
    VALUES ('ai_query.chat',
            jsonb_build_object('message', v_q, 'source', 'capgap_retest', 'gap_id', p_id),
            v_asker, 'pending', 'max', 50)
    RETURNING id INTO v_new_id;
    v_ids := v_ids || v_new_id;
  END LOOP;

  UPDATE public.capability_gaps cg
  SET retest_enqueued_at = now(),
      retest_job_ids     = to_jsonb(v_ids),
      updated_at         = now()
  WHERE cg.id = p_id;

  RETURN jsonb_build_object('success', true,
    'data', jsonb_build_object('enqueued', coalesce(array_length(v_ids, 1), 0),
                               'job_ids', to_jsonb(v_ids)));
END;
$$;


-- ---------------------------------------------------------------------
-- 7. Grants — anon-lock per CLAUDE.md (Supabase default-grants anon + authenticated)
-- ---------------------------------------------------------------------
-- Internal helper: no anon/authenticated grant (called only inside fn_capgap_leaktest).
REVOKE EXECUTE ON FUNCTION public._capgap_strip_scope_keys(jsonb) FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_events_sync() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_events_sync() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_draft_tool(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_draft_tool(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_leaktest(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_leaktest(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_retest(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_retest(uuid) TO authenticated;
