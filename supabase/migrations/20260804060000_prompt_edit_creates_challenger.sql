-- ============================================================================
-- 20260804060000_prompt_edit_creates_challenger.sql
-- ----------------------------------------------------------------------------
-- Make an admin prompt EDIT create a CHALLENGER instead of overwriting the
-- live prompt. This is the missing write-side of the champion–challenger loop.
--
-- WHY (measured on prod 2026-07-27): ai_prompt_versions holds 37 rows, ALL
-- status='champion', ZERO challengers. The substrate (20260726073915) and the
-- judge/graduation mechanism (20260803030000) are both in place, but nothing
-- ever MINTS a challenger — so the judge has nothing to compare and the loop
-- can never start. The substrate's own table comment already states the intent:
-- "A prompt fix is a champion–challenger, not an edit". Today
-- fn_ai_job_type_upsert still does exactly the edit that comment forbids:
-- prompt_template = EXCLUDED.prompt_template, old text gone.
-- Director decision 2026-07-27: editing a prompt creates a challenger version.
--
-- WHAT CHANGES — one function, fn_ai_job_type_upsert. Its body is reproduced
-- VERBATIM from 20260713000100 (verified byte-identical against the live prod
-- definition, body md5 258bf64b6f06e050bb944b7284bd2e0b) apart from the
-- deliberate prompt-routing block and the extra keys on the returned jsonb.
-- Every other field (title, lane, model, enabled, max_inflight, input_schema…)
-- keeps upserting exactly as before.
--
-- THE BRANCHES (all five, because a naive "changed → challenger" would try to
-- file a NULL prompt as a challenger and hit a NOT NULL violation):
--
--   1. NEW job type            → prompt goes LIVE + version 1 'champion'.
--                                A job type must never exist without one.
--   2. Prompt UNCHANGED        → plain upsert, no version row. Compared with
--                                BOTH sides whitespace-normalised, so a no-op
--                                save never mints a junk challenger. Note the
--                                trap this walked into first: Postgres
--                                trim()/btrim() default to trimming the SPACE
--                                character ALONE — not tabs, not newlines —
--                                so a textarea's trailing "\n" survives and a
--                                plain btrim() comparison mints a challenger
--                                on the commonest no-op save of all. The
--                                comparison passes an explicit whitespace set.
--   3. First prompt for an     → goes LIVE + 'champion'. There is no champion
--      existing job type that     to challenge, and a job type with no prompt
--      had none (and no           cannot run at all — parking its first prompt
--      champion row)              behind approval would just break it.
--   4. Prompt CHANGED          → ai_job_types.prompt_template is NOT touched.
--                                New text filed as 'challenger' at
--                                max(version)+1. The live prompt moves ONLY
--                                when a human promotes via the existing
--                                fn_prompt_promote_version (reused, never
--                                re-implemented — one door for every
--                                promotion, as the graduation migration also
--                                does from fn_prompt_graduation_decide).
--   5. Prompt CLEARED to empty → live prompt KEPT, and the response says so.
--                                An empty prompt cannot be judged
--                                (ai_prompt_versions.prompt is NOT NULL) and
--                                wiping the live text would break every future
--                                run with no version record of what was lost.
--                                Never silent — prompt_action='clear_ignored'
--                                and the dialog surfaces it (CLAUDE.md #27).
--
-- MULTIPLE CHALLENGERS — every edit appends a NEW version; an open challenger
-- is never rewritten in place. Two reasons: (a) replacing it would silently
-- destroy the admin's earlier proposed text, the one thing this change exists
-- to prevent; (b) ai_prompt_judgments carries an FK on
-- (job_type, challenger_version), so mutating a challenger's text would leave
-- every verdict already recorded against it pointing at text that no longer
-- exists — the tally would silently mix judgments of two different prompts.
-- The schema was built for this: only ONE champion is constrained (the partial
-- unique index); challengers are deliberately unconstrained in number.
--
-- BACKFILL — 6 job types on prod (accreditation.cac_brief,
-- accreditation.naac_narrative_draft, accreditation.meeting_minutes_polish,
-- improvement.rank_data_gaps, prompt_compare.judge, ai_pulse.prompt_dedup) were
-- created THROUGH this RPC after the substrate's backfill ran, so they carry a
-- live prompt with no version row at all. Same WHERE NOT EXISTS shape as the
-- substrate backfill (never ON CONFLICT — ref
-- feedback_seed_platform_policies_expression_unique_index). Idempotent.
--
-- No table, no policy, no grant widened. Runners (~/jkkn-max-lane) are
-- untouched: they keep reading ai_job_types.prompt_template, which now simply
-- stops changing under them until a human promotes.
--
-- Stamped 20260804060000, not …050000: PR #2499 landed
-- 20260804050000_ai_pulse_v2_classmates_feed_killswitch.sql on main while this
-- was being built, and two migrations sharing a timestamp have no defined order
-- on an ordered rebuild.
--
-- ⛔ NOT APPLIED to any database — file only, Director-gated apply.
--    (Validated on prod via a single BEGIN..ROLLBACK Mgmt-API batch only.
--     This file carries NO BEGIN;/COMMIT; of its own, so wrapping it in a
--     dry-run transaction stays a dry run —
--     ref feedback_inner_commit_defeats_begin_rollback_dryrun.)
-- ============================================================================

-- ── 1. BACKFILL: champion row for job types created after the substrate ──────
INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
SELECT t.job_type,
       1,
       t.prompt_template,
       'champion',
       'backfill: live prompt_template of a job type created after the substrate backfill',
       'migration:20260804060000'
  FROM public.ai_job_types t
 WHERE t.prompt_template IS NOT NULL
   AND btrim(t.prompt_template) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = t.job_type
   );

-- ── 2. THE CHANGE: fn_ai_job_type_upsert files a challenger instead of ───────
--      overwriting the live prompt.
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
  -- champion–challenger routing (added 2026-08-04)
  v_new_prompt    text := nullif(trim(p_def->>'prompt_template'), '');
  v_prev_prompt   text;
  -- Whitespace-normalised copies, used ONLY to decide the branch — never
  -- stored. Postgres trim()/btrim() default to trimming the SPACE character
  -- alone, NOT tabs or newlines (unlike every language's .trim()), so the
  -- v_new_prompt above still carries a textarea's trailing newline. Comparing
  -- on it directly would mint a junk challenger on the single most common
  -- no-op save. Caught by the BEGIN..ROLLBACK probe, S2.
  v_prev_norm     text;
  v_new_norm      text;
  v_had_row       boolean;
  v_has_champion  boolean;
  v_prompt_live   text;    -- what actually lands in ai_job_types.prompt_template
  v_action        text;
  v_version       int;
  v_actor         text := coalesce(auth.uid()::text, 'fn_ai_job_type_upsert');
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

  -- ══ CHAMPION–CHALLENGER ROUTING (the deliberate change) ═══════════════════
  -- Lock the existing registry row so two admins editing the same job type
  -- serialize here rather than racing on max(version) below. For a brand-new
  -- job type there is nothing to lock; the UNIQUE (job_type, version)
  -- constraint is the backstop and a true collision RAISEs visibly.
  SELECT true, t.prompt_template
    INTO v_had_row, v_prev_prompt
    FROM public.ai_job_types t
   WHERE t.job_type = v_job_type
   FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.ai_prompt_versions v
     WHERE v.job_type = v_job_type AND v.status = 'champion'
  ) INTO v_has_champion;

  -- Explicit whitespace set: space, tab, CR, LF, form feed, vertical tab.
  v_prev_norm := nullif(btrim(coalesce(v_prev_prompt, ''), E' \t\r\n\f\v'), '');
  v_new_norm  := nullif(btrim(coalesce(v_new_prompt,  ''), E' \t\r\n\f\v'), '');

  IF NOT coalesce(v_had_row, false) THEN
    -- (1) NEW job type — unchanged behaviour: the prompt goes live, and the
    --     champion row is written below.
    v_prompt_live := v_new_prompt;
    v_action := CASE WHEN v_new_norm IS NULL THEN 'none' ELSE 'champion_created' END;

  ELSIF v_new_norm IS NULL THEN
    -- (5) CLEARED (empty, or whitespace only) — keep the live prompt; an empty
    --     prompt is not a proposal.
    v_prompt_live := v_prev_prompt;
    v_action := CASE WHEN v_prev_norm IS NULL THEN 'none' ELSE 'clear_ignored' END;

  ELSIF v_prev_norm IS NULL AND NOT v_has_champion THEN
    -- (3) FIRST prompt for a job type that had none — nothing to challenge.
    v_prompt_live := v_new_prompt;
    v_action := 'champion_created';

  ELSIF v_prev_norm = v_new_norm THEN
    -- (2) UNCHANGED (ignoring surrounding whitespace) — no version row.
    v_prompt_live := v_prev_prompt;
    v_action := 'none';

  ELSE
    -- (4) CHANGED — the live prompt is NOT touched; file a challenger.
    v_prompt_live := v_prev_prompt;
    v_action := 'challenger_created';
  END IF;
  -- ══ end champion–challenger routing ═══════════════════════════════════════

  INSERT INTO public.ai_job_types (
    job_type, title, description, prompt_template, tool_set, output_target,
    interactive, lane, allow_rule, max_inflight, schedulable, enabled,
    input_schema, expected_seconds, updated_at
  ) VALUES (
    v_job_type,
    v_title,
    nullif(trim(p_def->>'description'), ''),
    v_prompt_live,        -- was: nullif(trim(p_def->>'prompt_template'), '')
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

  -- ── version bookkeeping ────────────────────────────────────────────────────
  IF v_action IN ('champion_created', 'challenger_created') THEN
    -- Self-heal: if a live prompt exists with NO version row at all (a job type
    -- created through this RPC before this migration), adopt that live text as
    -- version 1 champion FIRST, so the pair the judge compares is complete and
    -- we never file a challenger that has nothing to challenge. The §1 backfill
    -- closes today's 6; this keeps the invariant true for any that appear
    -- between apply and now.
    IF v_action = 'challenger_created' AND NOT v_has_champion
       AND NOT EXISTS (SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = v_job_type)
    THEN
      INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
      VALUES (v_job_type, 1, v_prev_prompt, 'champion',
              'adopted: live prompt_template had no version row when a challenger was filed',
              v_actor);
    END IF;

    SELECT coalesce(max(v.version), 0) + 1 INTO v_version
      FROM public.ai_prompt_versions v
     WHERE v.job_type = v_job_type;

    INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
    VALUES (
      v_job_type,
      v_version,
      v_new_prompt,
      CASE WHEN v_action = 'champion_created' THEN 'champion' ELSE 'challenger' END,
      CASE WHEN v_action = 'champion_created'
           THEN 'first live prompt, saved with the job type'
           ELSE 'proposed by an admin prompt edit — awaiting approval' END,
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'job_type', v_row.job_type,
    'row', to_jsonb(v_row),
    -- champion–challenger outcome, so the caller can SAY what happened rather
    -- than showing a bare success toast for a save that did not go live.
    'prompt_action', v_action,
    'prompt_version', v_version,
    'prompt_live_changed', (v_action = 'champion_created'),
    'prompt_message', CASE v_action
      WHEN 'challenger_created' THEN
        format('Prompt saved as proposed version %s, awaiting approval. The live prompt has NOT changed.', v_version)
      WHEN 'champion_created' THEN
        format('Prompt saved and live, recorded as version %s.', v_version)
      WHEN 'clear_ignored' THEN
        'The prompt box was left empty, so the live prompt was kept. Clearing a live prompt is not a proposal — replace it with new text, or delete the job type.'
      ELSE 'Prompt unchanged.'
    END
  );
END;
$fn$;

-- Grants re-asserted EXACTLY as 20260713000100 set them (verified live before
-- this change: anon=false, authenticated=true, service_role=true via Supabase's
-- default grant, which CREATE OR REPLACE preserves). Nothing widened.
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_job_type_upsert(jsonb) IS
  'Super-admin upsert for one ai_job_types row. A prompt CHANGE is a champion–challenger, not an edit: the live prompt_template is left alone and the new text is filed in ai_prompt_versions as a challenger at max(version)+1. Only fn_prompt_promote_version (human) moves a version into prompt_template. New job types (and the first prompt for a job type that had none) still go live immediately and are recorded as the champion. Returns prompt_action / prompt_version / prompt_message so the caller can tell the admin their prompt is a PROPOSAL, not a live change.';
