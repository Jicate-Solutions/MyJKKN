-- ============================================================================
-- Learner 360 verdict — plain-language standing narrative per learner
-- Created: 2026-07-30
-- ----------------------------------------------------------------------------
-- 🛑 NOT APPLIED TO ANY DATABASE — Director-gated apply. File only.
-- ----------------------------------------------------------------------------
--
-- MyJKKN already scores every learner twice a night and shows nobody the answer
-- in words. Verified on prod 2026-07-30:
--   learner_risk_assessments       4,342 rows  (59 critical · 403 high ·
--                                               746 moderate · 979 low ·
--                                               2,155 healthy)
--   learner_contribution_scores    4,342 rows  (tiers: minimal/emerging/
--                                               steady/strong)
--   mv_learner_attendance_summary  3,527 rows  (last_14d_pct, delta_pct,
--                                               last_absent_date)
-- Those are numbers. A learner cannot read "composite_risk_score 60" and a
-- Senior Learner cannot act on "tier: high". This migration adds the table those
-- engines write their MEANING into, generated overnight on the ₹0 Max lane.
--
-- INPUTS ARE NOT CREATED HERE. All three already exist in production; this
-- migration only reads them (via the cron's service-role client) and never
-- alters them.
--
-- ----------------------------------------------------------------------------
-- 🔒 HARD DATA BOUNDARY
-- ----------------------------------------------------------------------------
-- The loop must NEVER read, join or feed the model:
--   session_feedback, event_session_feedback, carre_micro_impressions,
--   scf_learner_notes, and any health_* / medical table.
-- Those four carry a learner id and so are trivially joinable, but they hold
-- feedback the learner GAVE under an explicit anonymity promise — the product's
-- own UI copy says responses are aggregated and anonymous and that individual
-- learner responses are never shown, a fully_anonymous policy mode strips
-- author_id, and k>=3 suppression is applied before display. Scoring the AUTHOR
-- of that feedback would break the promise that makes it honest, and would turn
-- every candid rating into a personal record. The same boundary is restated in
-- lib/services/learner-360/verdict-prompt.ts and in the job type's description
-- row, so it has to be crossed in three places to be crossed at all.
--
-- ----------------------------------------------------------------------------
-- WHY TWO TABLES — the load-bearing design decision.
-- ----------------------------------------------------------------------------
-- The verdict has two audiences with DIFFERENT rights:
--   (a) the learner and their Senior Learner see the developmental half
--       (standing_band, standing_narrative, next_actions);
--   (b) leadership ONLY sees the ranking half (contribution_summary,
--       value_rank_note).
-- Postgres RLS is ROW-level. No policy returns a row with some columns blanked.
-- Putting both halves in one table and "hiding" the admin columns in the
-- application query is a client-side promise, not a database one: any faculty
-- member able to read the row could `select *` and read the ranking language
-- written about their learners. So the admin half lives in a SEPARATE table
-- whose only read policy is the leadership one. Two tables = two doors.
--
-- ----------------------------------------------------------------------------
-- SECURITY (CLAUDE.md mandatory locks)
--   Both tables: RLS ENABLED + REVOKE ALL FROM anon. Supabase's
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon means every new
--   public-schema table is BORN readable by the anon key shipped in every page
--   bundle, so the revoke is mandatory, not decorative.
--   Both RPCs: SECURITY DEFINER, SET search_path = public, and
--   REVOKE EXECUTE FROM anon, PUBLIC — *both*, because revoking anon alone is a
--   silent no-op while anon still inherits PUBLIC's default EXECUTE.
--   Every authorization predicate is COALESCE(..., false) wrapped: a SECDEF
--   guard returning NULL falls through and GRANTS.
--   Policies use user_has_permission() + role_has_institution_access() — the
--   house pattern — never a hardcoded role name.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. learner_360_verdicts — the SHARED half (learner + Senior Learner + leadership)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_360_verdicts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  verdict_date        date NOT NULL DEFAULT CURRENT_DATE,

  standing_band       text NOT NULL CHECK (standing_band IN
                        ('thriving','steady','needs_support','needs_urgent_support')),
  standing_narrative  text NOT NULL,
  next_actions        text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- A human correction. When set, every surface must show THIS instead of the
  -- generated narrative — the model is never the last word on a person.
  faculty_override    text,
  overridden_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  overridden_at       timestamptz,

  model               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (learner_id, verdict_date)
);

CREATE INDEX IF NOT EXISTS idx_l360_verdicts_institution_date
  ON public.learner_360_verdicts (institution_id, verdict_date DESC);
CREATE INDEX IF NOT EXISTS idx_l360_verdicts_needs_support
  ON public.learner_360_verdicts (institution_id, verdict_date DESC)
  WHERE standing_band IN ('needs_support','needs_urgent_support');

ALTER TABLE public.learner_360_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learner_360_verdicts FROM anon;
GRANT SELECT ON TABLE public.learner_360_verdicts TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. learner_360_verdicts_admin — the ADMIN-ONLY half (leadership only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_360_verdicts_admin (
  verdict_id           uuid PRIMARY KEY
                         REFERENCES public.learner_360_verdicts(id) ON DELETE CASCADE,
  institution_id       uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  contribution_summary text,
  value_rank_note      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_l360_verdicts_admin_institution
  ON public.learner_360_verdicts_admin (institution_id);

ALTER TABLE public.learner_360_verdicts_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learner_360_verdicts_admin FROM anon;
GRANT SELECT ON TABLE public.learner_360_verdicts_admin TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
-- 3a. service_role writes both halves (the cron's door).
DROP POLICY IF EXISTS l360_verdicts_service_all ON public.learner_360_verdicts;
CREATE POLICY l360_verdicts_service_all
  ON public.learner_360_verdicts FOR ALL
  USING (auth.role() = 'service_role');

-- 3b. Team members who may already see learner standing, scoped to their institution.
--     The is_admin() branch is institution-scoped here, exactly as on the admin
--     table below. is_admin() is platform-wide (true for an admin in ANY tenant,
--     see supabase/setup/02_functions.sql), and these rows are a personal
--     narrative about a named learner — the whole feature turns on tenant
--     isolation, so an unscoped branch would hand every tenant admin every other
--     college's learners. Only is_super_admin() reads across tenants.
DROP POLICY IF EXISTS l360_verdicts_select_staff ON public.learner_360_verdicts;
CREATE POLICY l360_verdicts_select_staff
  ON public.learner_360_verdicts FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR (
      (
        COALESCE(is_admin(), false)
        OR COALESCE(user_has_permission('learners.standing.view'), false)
      )
      AND COALESCE(role_has_institution_access(institution_id), false)
    )
  );

-- 3c. The learner reads their OWN verdict.
--     learner_id references learners_profiles.id, NOT auth.users.id — the map is
--     profiles.learner_id -> learners_profiles.id and profiles.id = auth.uid().
DROP POLICY IF EXISTS l360_verdicts_select_own ON public.learner_360_verdicts;
CREATE POLICY l360_verdicts_select_own
  ON public.learner_360_verdicts FOR SELECT
  TO authenticated
  USING (
    learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- NOTE: there is deliberately NO UPDATE policy on learner_360_verdicts.
-- A correction goes through fn_learner_360_set_override, which touches ONLY
-- faculty_override / overridden_by / overridden_at. An UPDATE policy would let
-- the same person rewrite standing_narrative itself, and RLS cannot restrict an
-- UPDATE to a column subset.

-- 3d. ADMIN TABLE — service_role write, leadership read, NOTHING ELSE.
--     No team-member policy and no learner policy exist here, on purpose. This is the
--     entire reason the table was split off.
DROP POLICY IF EXISTS l360_verdicts_admin_service_all ON public.learner_360_verdicts_admin;
CREATE POLICY l360_verdicts_admin_service_all
  ON public.learner_360_verdicts_admin FOR ALL
  USING (auth.role() = 'service_role');

-- is_admin() is NOT institution-scoped — it is true for any profile whose role
-- is admin/super_admin/administrator, in ANY tenant (supabase/setup/02_functions
-- .sql). On the shared table that matches every other migrated table, but this
-- table holds comparative ranking language about named learners, so the
-- is_admin() branch is institution-scoped here. Only is_super_admin() — the
-- platform owner — reads across tenants.
DROP POLICY IF EXISTS l360_verdicts_admin_select_leadership ON public.learner_360_verdicts_admin;
CREATE POLICY l360_verdicts_admin_select_leadership
  ON public.learner_360_verdicts_admin FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR (
      (
        COALESCE(is_admin(), false)
        OR COALESCE(user_has_permission('learners.standing.admin_note.view'), false)
      )
      AND COALESCE(role_has_institution_access(institution_id), false)
    )
  );

COMMENT ON TABLE public.learner_360_verdicts IS
  'Plain-language standing verdict per learner per day, generated on the Max lane from learner_risk_assessments + learner_contribution_scores + mv_learner_attendance_summary. Shared half: visible to the learner, to team members holding learners.standing.view, and to leadership.';
COMMENT ON TABLE public.learner_360_verdicts_admin IS
  'ADMIN-ONLY half of a learner 360 verdict (contribution summary + relative value note). A SEPARATE table because RLS is row-level and cannot hide columns — keeping these in learner_360_verdicts would expose the ranking language to every team member able to read the row.';
COMMENT ON COLUMN public.learner_360_verdicts.faculty_override IS
  'Human correction. When non-null every surface must display this INSTEAD of standing_narrative. Written only via fn_learner_360_set_override.';

-- ----------------------------------------------------------------------------
-- 4. updated_at triggers (reuse the platform helper when present).
-- ----------------------------------------------------------------------------
DO $trg$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS trg_l360_verdicts_updated_at ON public.learner_360_verdicts;
    CREATE TRIGGER trg_l360_verdicts_updated_at
      BEFORE UPDATE ON public.learner_360_verdicts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS trg_l360_verdicts_admin_updated_at ON public.learner_360_verdicts_admin;
    CREATE TRIGGER trg_l360_verdicts_admin_updated_at
      BEFORE UPDATE ON public.learner_360_verdicts_admin
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$trg$;

-- ----------------------------------------------------------------------------
-- 5. fn_learner_360_record_verdict — the cron's write door (service_role ONLY).
--    Writes BOTH halves in one transaction so an admin note can never exist
--    without its shared row, and upserts on (learner_id, verdict_date) so
--    re-running the same night is idempotent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_360_record_verdict(
  p_learner_id           uuid,
  p_institution_id       uuid,
  p_standing_band        text,
  p_standing_narrative   text,
  p_next_actions         text[]  DEFAULT ARRAY[]::text[],
  p_contribution_summary text    DEFAULT NULL,
  p_value_rank_note      text    DEFAULT NULL,
  p_model                text    DEFAULT NULL,
  p_verdict_date         date    DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id            uuid;
  v_institution   uuid;
BEGIN
  IF p_standing_band NOT IN ('thriving','steady','needs_support','needs_urgent_support') THEN
    RAISE EXCEPTION 'fn_learner_360_record_verdict: bad standing_band %', p_standing_band
      USING ERRCODE = '22023';
  END IF;
  IF p_standing_narrative IS NULL OR btrim(p_standing_narrative) = '' THEN
    RAISE EXCEPTION 'fn_learner_360_record_verdict: empty standing_narrative'
      USING ERRCODE = '22023';
  END IF;

  -- The tenant is DERIVED from the learner, never taken on trust. p_institution_id
  -- is only an assertion the caller must get right. Without this the FK to
  -- institutions(id) is the only constraint, and nothing binds the learner to
  -- that tenant — so a caller controlling the pair could file a learner-facing
  -- verdict AND a leadership ranking note about a learner into a DIFFERENT
  -- college's leadership view. A SECURITY DEFINER writer must not accept a
  -- caller-supplied scope key it can resolve itself.
  SELECT lp.institution_id INTO v_institution
    FROM public.learners_profiles lp
   WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_record_verdict: unknown learner %', p_learner_id
      USING ERRCODE = '23503';
  END IF;
  IF p_institution_id IS NOT NULL AND p_institution_id <> v_institution THEN
    RAISE EXCEPTION 'fn_learner_360_record_verdict: institution % does not own learner %',
      p_institution_id, p_learner_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.learner_360_verdicts AS v
    (learner_id, institution_id, verdict_date, standing_band, standing_narrative,
     next_actions, model)
  VALUES
    (p_learner_id, v_institution, p_verdict_date, p_standing_band,
     btrim(p_standing_narrative), COALESCE(p_next_actions, ARRAY[]::text[]), p_model)
  ON CONFLICT (learner_id, verdict_date) DO UPDATE SET
    institution_id     = EXCLUDED.institution_id,
    standing_band      = EXCLUDED.standing_band,
    standing_narrative = EXCLUDED.standing_narrative,
    next_actions       = EXCLUDED.next_actions,
    model              = EXCLUDED.model,
    updated_at         = now()
  RETURNING v.id INTO v_id;

  -- The admin half rides the same transaction. Regenerating a verdict replaces
  -- both halves together; a NULL note clears a stale one rather than leaving
  -- yesterday's ranking language attached to today's narrative.
  INSERT INTO public.learner_360_verdicts_admin AS a
    (verdict_id, institution_id, contribution_summary, value_rank_note)
  VALUES (v_id, v_institution, p_contribution_summary, p_value_rank_note)
  ON CONFLICT (verdict_id) DO UPDATE SET
    institution_id       = EXCLUDED.institution_id,
    contribution_summary = EXCLUDED.contribution_summary,
    value_rank_note      = EXCLUDED.value_rank_note,
    updated_at           = now();

  RETURN v_id;
END;
$$;

-- service_role ONLY. This RPC bypasses RLS and authors text a learner reads
-- about themselves; granting `authenticated` would let any signed-in user of any
-- tenant write a standing verdict for any learner on the platform.
REVOKE EXECUTE ON FUNCTION public.fn_learner_360_record_verdict(uuid,uuid,text,text,text[],text,text,text,date)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_360_record_verdict(uuid,uuid,text,text,text[],text,text,text,date)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 6. fn_learner_360_set_override — a human corrects a verdict.
--    Touches ONLY faculty_override / overridden_by / overridden_at.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_360_set_override(
  p_verdict_id uuid,
  p_override   text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_institution uuid;
  v_may         boolean;
  v_clean       text;
BEGIN
  -- Barrier 1: no session, no write. Checked BEFORE any row is read, so an
  -- unauthenticated caller cannot probe which verdict ids exist.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_set_override: authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT v.institution_id INTO v_institution
    FROM public.learner_360_verdicts v
   WHERE v.id = p_verdict_id;

  -- Barrier 2: an unknown verdict id raises the SAME 42501 as a forbidden one,
  -- so the caller cannot tell the two apart and gains no cross-tenant "does this
  -- verdict id exist" oracle.
  --
  -- ⚠️ This MUST be an explicit IS NULL branch and must come FIRST.
  -- role_has_institution_access(NULL) returns **true** — it treats a NULL
  -- institution as a system-wide record (20260521_role_has_institution_access
  -- _cas_aware.sql, first branch). So a NULL v_institution does NOT fail closed
  -- through the guard below; it would sail past it for any override-holder and
  -- return a clean `false`, which is exactly the oracle. Do not "simplify" this
  -- away by trusting the COALESCE.
  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_set_override: no such verdict, or not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- Every term COALESCEd to false and the whole expression COALESCEd again, so a
  -- NULL from any present or future term fails CLOSED.
  SELECT COALESCE(
    COALESCE(is_super_admin(), false)
    OR (
      (
        COALESCE(is_admin(), false)
        OR COALESCE(user_has_permission('learners.standing.override'), false)
      )
      AND COALESCE(role_has_institution_access(v_institution), false)
    )
  , false) INTO v_may;

  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'fn_learner_360_set_override: no such verdict, or not permitted'
      USING ERRCODE = '42501';
  END IF;

  v_clean := NULLIF(btrim(COALESCE(p_override, '')), '');

  UPDATE public.learner_360_verdicts
     SET faculty_override = v_clean,
         overridden_by    = CASE WHEN v_clean IS NULL THEN NULL ELSE v_uid END,
         overridden_at    = CASE WHEN v_clean IS NULL THEN NULL ELSE now() END,
         updated_at       = now()
   WHERE id = p_verdict_id;

  RETURN true;
END;
$$;

-- Reachable by signed-in users only; the body decides which verdict each caller
-- may correct. anon AND PUBLIC both revoked — revoking anon alone is a silent
-- no-op while anon still inherits PUBLIC's default EXECUTE.
REVOKE EXECUTE ON FUNCTION public.fn_learner_360_set_override(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_360_set_override(uuid,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. AI job type — ₹0 Max lane, text only. Mirrors improvement.rank_data_gaps.
--      tool_set='none'         → text only; the numbers are fenced as data.
--      interactive=false       → served by the BATCH drain (the CHAT drain
--                                refuses non-chat jobs).
--      allow_rule='seat_owner' → the generic authenticated enqueue path is
--                                locked to the seat allowlist; the real door is
--                                the CRON_SECRET-gated route via
--                                fn_ai_enqueue_system.
--      external_allowed=false  → not reachable through the external AI Door.
--      model_id='sonnet'       → always-latest family alias, never a dated id.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, external_allowed, provider, model_id)
VALUES
('learner.360_verdict',
 'Learner 360 — plain-language standing verdict (Max lane)',
 'Turns the nightly learner_risk_assessments + learner_contribution_scores + 14-day attendance numbers into one developmental standing narrative per learner (band, 2-3 sentences, 2-3 next actions) plus an admin-only contribution/value note held in a separate table. Reads NO feedback the learner GAVE (session_feedback, event_session_feedback, carre_micro_impressions, scf_learner_notes) and no health data — those are collected under an anonymity promise. Recommendation-only: a human can override any verdict via fn_learner_360_set_override.',
 '{{prompt}}',
 'none', 'job.result', false, 'max', 'seat_owner', 3, true, true,
 '[{"key":"prompt","type":"textarea","label":"Assembled verdict prompt","required":true}]'::jsonb,
 60, false, 'anthropic', 'sonnet')
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
  external_allowed = EXCLUDED.external_allowed,
  provider         = EXCLUDED.provider,
  model_id         = EXCLUDED.model_id,
  updated_at       = now();

-- ----------------------------------------------------------------------------
-- 8. Schedule row — fired by the AI-routine dispatcher, which resolves the
--    triggerPath from the AI_ROUTINES registry (lib/ai-routines/misc-ai.ts).
--    NOT a raw vercel.json cron: vercel.json already carries exactly 100 crons
--    (counted on jicate/main 2026-07-30), which is the plan's hard ceiling, so a
--    101st entry would fail the deploy for EVERY change in the repo, not just
--    this one. 06:37 IST = 397 minutes, after the scoring engines refresh.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('learner-360-verdict', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 397)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. Apply-time asserts — fail loudly here rather than letting the loop fail
--    silently forever.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_job_types WHERE job_type = 'learner.360_verdict') THEN
    RAISE EXCEPTION 'learner.360_verdict job type not seeded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_routine_schedules WHERE routine_id = 'learner-360-verdict') THEN
    RAISE EXCEPTION 'learner-360-verdict schedule row not seeded';
  END IF;
  -- The whole point of the two-table split: the admin table must expose NO
  -- policy to a team member or a learner. Exactly two are expected
  -- (service_role ALL + leadership SELECT).
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'learner_360_verdicts_admin') <> 2 THEN
    RAISE EXCEPTION 'learner_360_verdicts_admin must carry exactly 2 policies (service_role, leadership)';
  END IF;
END
$assert$;

COMMIT;
