-- ============================================================================
-- Learner 360 — the RETURN EDGE: intervention record + re-verdict delta
-- Created: 2026-08-26 (Loop Program Wave 2, "Learner-360" row)
-- ----------------------------------------------------------------------------
-- 🛑 NOT APPLIED TO ANY DATABASE — Director-gated apply. File only.
-- ----------------------------------------------------------------------------
--
-- The learner.360_verdict pipeline (PRs #2646/#2648; base schema
-- 20260808110003_learner_360_verdict.sql, restored in this same PR after an
-- evil merge deleted it from the repo on 2026-08-04) writes ~279 standing
-- verdicts a day into learner_360_verdicts — and nothing ever comes BACK. A
-- mentor reads "needs_support", talks to the learner, and the platform never
-- learns the conversation happened, let alone whether the next verdict moved.
-- This migration adds the two missing legs:
--
--   ACT     — learner_360_interventions: one row per human action taken on a
--             verdict (which verdict, what was done, who did it, when).
--             Written ONLY via fn_learner_360_record_intervention (SECDEF,
--             permission-gated in-body; the new key learners.standing.intervene
--             is registered in lib/constants/permissions.ts in this PR).
--
--   MEASURE — fn_learner_360_measure_reverdict_delta: for each unmeasured
--             intervention, find the learner's FIRST verdict issued after the
--             action and record the band movement against the verdict that
--             triggered the action (the learner's OWN baseline — never a
--             cross-population comparison). Set-based single UPDATE (the
--             2026-08-21 counselor-targeting incident is the receipt for why
--             this is not a per-row loop). Called nightly by the existing
--             learner-360-verdict cron route right after its COLLECT leg — no
--             new schedule row, no vercel.json cron (the 100-cron ceiling).
--
-- Also seeds the loop_registry row for the family (loop_key 'learner-360') so
-- loop_audits rows from the regress runner (20260930020000) have their FK
-- target and the family appears on the Loop Control Tower. Charter legs stay
-- NULL on purpose — MetaLoop drafts charters, humans sign; a hand-written leg
-- here would bypass the chartering factory. NULL legs = the Tower honestly
-- shows a meter, not a loop, until the charter lands.
--
-- MEASUREMENT SEMANTICS (the honest-baseline decisions, in one place):
--   * Baseline = the TRIGGERING verdict's standing_band, ordinal-mapped:
--       needs_urgent_support 0 · needs_support 1 · steady 2 · thriving 3.
--     band_delta = re-verdict band − triggering band (positive = improved).
--   * The re-verdict must post-date BOTH the triggering verdict's date AND the
--     action itself (verdict_date > acted_at::date). Without the second bound,
--     an intervention recorded late — after a newer verdict already existed —
--     would attribute a PRE-action change to the action.
--   * band_delta is correlation, not causation, and the charter (MetaLoop's
--     job) must say so. This migration only makes the delta EXIST.
--   * faculty_override is narrative text and never changes standing_band, so
--     the band comparison is unaffected by human corrections.
--
-- SECURITY (CLAUDE.md mandatory locks):
--   * Table: RLS ENABLED + REVOKE ALL FROM anon, authenticated, PUBLIC then
--     GRANT SELECT to authenticated (Supabase's ALTER DEFAULT PRIVILEGES means
--     every new table is BORN writable by anon/authenticated).
--   * Both fns: SECURITY DEFINER, SET search_path = public, REVOKE EXECUTE
--     FROM anon, PUBLIC (and authenticated too on the service-only measurer)
--     re-asserted in this file. Every authorization predicate is
--     COALESCE(..., false) wrapped — a NULL from a SECDEF guard must fail
--     CLOSED, never fall through and grant.
--   * No learner-self read policy on interventions, deliberately: this is a
--     staff-side action log about the learner (a counselor's note of what was
--     done), not the learner's own verdict. Surfacing it to learners is a
--     product decision for the charter review, not a default.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. learner_360_interventions — the ACT leg's record.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_360_interventions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id         uuid NOT NULL REFERENCES public.learner_360_verdicts(id) ON DELETE CASCADE,
  learner_id         uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  action_taken       text NOT NULL CHECK (btrim(action_taken) <> ''),
  -- profiles.id == auth.users.id (1:1). SET NULL keeps the action record if
  -- the actor's account is ever removed — the fact an action happened is part
  -- of the measurement history and must not vanish with the person.
  acted_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at           timestamptz NOT NULL DEFAULT now(),

  -- MEASURE half — written ONLY by fn_learner_360_measure_reverdict_delta.
  -- NULL measured_at = still awaiting the learner's next verdict.
  re_verdict_id      uuid REFERENCES public.learner_360_verdicts(id) ON DELETE SET NULL,
  band_delta         integer,
  days_to_reverdict  integer,
  measured_at        timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_l360_interventions_learner
  ON public.learner_360_interventions (learner_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_l360_interventions_verdict
  ON public.learner_360_interventions (verdict_id);
-- The measurer's sweep: unmeasured rows only.
CREATE INDEX IF NOT EXISTS idx_l360_interventions_unmeasured
  ON public.learner_360_interventions (acted_at)
  WHERE measured_at IS NULL;

ALTER TABLE public.learner_360_interventions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learner_360_interventions FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.learner_360_interventions TO authenticated;

-- service_role writes (the measurer's and any future backfill's door).
DROP POLICY IF EXISTS l360_interventions_service_all ON public.learner_360_interventions;
CREATE POLICY l360_interventions_service_all
  ON public.learner_360_interventions FOR ALL
  USING (auth.role() = 'service_role');

-- Staff read mirrors l360_verdicts_select_staff: whoever may see the verdict
-- may see what was done about it, scoped to their institution. is_admin() is
-- institution-scoped here for the same reason as on the verdicts table — these
-- rows name a learner, so tenant isolation is the whole feature; only
-- is_super_admin() reads across tenants.
DROP POLICY IF EXISTS l360_interventions_select_staff ON public.learner_360_interventions;
CREATE POLICY l360_interventions_select_staff
  ON public.learner_360_interventions FOR SELECT
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

-- NOTE: deliberately NO learner-self policy (see header) and NO
-- INSERT/UPDATE/DELETE policy for authenticated — writes go through the SECDEF
-- recorder below, measurement writes through the SECDEF measurer.

COMMENT ON TABLE public.learner_360_interventions IS
  'Return edge of the learner-360 loop: one row per human action taken on a standing verdict (ACT), plus the measured band movement at the learner''s next verdict (MEASURE — written only by fn_learner_360_measure_reverdict_delta). Staff-side record; not learner-visible by default.';
COMMENT ON COLUMN public.learner_360_interventions.band_delta IS
  'Re-verdict band minus triggering-verdict band on the ordinal scale needs_urgent_support 0 · needs_support 1 · steady 2 · thriving 3. Positive = improved. Correlation, not causation.';

-- updated_at trigger (reuse the platform helper when present — same guard as
-- the base 20260808110003 migration).
DO $trg$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS trg_l360_interventions_updated_at ON public.learner_360_interventions;
    CREATE TRIGGER trg_l360_interventions_updated_at
      BEFORE UPDATE ON public.learner_360_interventions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$trg$;

-- ----------------------------------------------------------------------------
-- 2. fn_learner_360_record_intervention — a human records an action taken.
--    Mirrors fn_learner_360_set_override's guard shape exactly, including the
--    oracle-resistant IS NULL branch (role_has_institution_access(NULL)
--    returns TRUE — a NULL institution would sail past the permission guard,
--    so it must be refused explicitly and FIRST, with the SAME error as a
--    forbidden verdict so unknown-vs-forbidden is indistinguishable).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_360_record_intervention(
  p_verdict_id   uuid,
  p_action_taken text
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_learner     uuid;
  v_institution uuid;
  v_may         boolean;
  v_clean       text;
  v_id          uuid;
BEGIN
  -- Barrier 1: no session, no write — checked BEFORE any row is read, so an
  -- unauthenticated caller cannot probe which verdict ids exist.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention: authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_clean := NULLIF(btrim(COALESCE(p_action_taken, '')), '');
  IF v_clean IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention: empty action_taken'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_clean) > 2000 THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention: action_taken too long (max 2000 chars)'
      USING ERRCODE = '22023';
  END IF;

  -- learner_id and institution_id are DERIVED from the verdict row, never
  -- taken from the caller — a SECDEF writer must not accept a scope key it can
  -- resolve itself (same rule as fn_learner_360_record_verdict).
  SELECT v.learner_id, v.institution_id INTO v_learner, v_institution
    FROM public.learner_360_verdicts v
   WHERE v.id = p_verdict_id;

  -- Barrier 2: unknown verdict raises the SAME 42501 as a forbidden one.
  -- ⚠️ Must be an explicit IS NULL branch and must come FIRST — see header.
  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention: no such verdict, or not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- Every term COALESCEd to false and the whole expression COALESCEd again —
  -- a NULL from any present or future term fails CLOSED.
  SELECT COALESCE(
    COALESCE(is_super_admin(), false)
    OR (
      (
        COALESCE(is_admin(), false)
        OR COALESCE(user_has_permission('learners.standing.intervene'), false)
      )
      AND COALESCE(role_has_institution_access(v_institution), false)
    )
  , false) INTO v_may;

  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention: no such verdict, or not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- acted_at is ALWAYS now() — no caller-supplied timestamp. Backdating an
  -- action would move the measurement window and let a recorder attribute a
  -- pre-action verdict change to the action.
  INSERT INTO public.learner_360_interventions
    (verdict_id, learner_id, institution_id, action_taken, acted_by)
  VALUES (p_verdict_id, v_learner, v_institution, v_clean, v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Reachable by signed-in users only; the body decides who may record. anon AND
-- PUBLIC both revoked — revoking anon alone is a silent no-op while anon still
-- inherits PUBLIC's default EXECUTE.
REVOKE EXECUTE ON FUNCTION public.fn_learner_360_record_intervention(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_360_record_intervention(uuid,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. fn_learner_360_measure_reverdict_delta — the MEASURE leg.
--    One set-based UPDATE over every unmeasured intervention whose learner has
--    a verdict issued after the action. The LATERAL subselect is index-backed
--    by the UNIQUE (learner_id, verdict_date) on learner_360_verdicts. No
--    LIMIT on purpose: interventions are human-recorded (low volume), and a
--    batch cap here is exactly how a sentinel row escapes a regress sim.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_360_measure_reverdict_delta()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measured integer := 0;
  v_pending  integer := 0;
BEGIN
  WITH cand AS (
    SELECT i.id AS intervention_id,
           rv.id AS rv_id,
           (CASE rv.standing_band
              WHEN 'needs_urgent_support' THEN 0
              WHEN 'needs_support'        THEN 1
              WHEN 'steady'               THEN 2
              WHEN 'thriving'             THEN 3
            END
            -
            CASE tv.standing_band
              WHEN 'needs_urgent_support' THEN 0
              WHEN 'needs_support'        THEN 1
              WHEN 'steady'               THEN 2
              WHEN 'thriving'             THEN 3
            END) AS delta,
           (rv.verdict_date - tv.verdict_date) AS days_gap
    FROM public.learner_360_interventions i
    JOIN public.learner_360_verdicts tv ON tv.id = i.verdict_id
    JOIN LATERAL (
      -- The learner's FIRST verdict issued after the action. Both bounds
      -- matter: > tv.verdict_date excludes the triggering verdict itself;
      -- > acted_at::date (UTC on Supabase) excludes verdicts that already
      -- existed when the action was recorded late.
      SELECT v.id, v.standing_band, v.verdict_date
      FROM public.learner_360_verdicts v
      WHERE v.learner_id = i.learner_id
        AND v.verdict_date > tv.verdict_date
        AND v.verdict_date > (i.acted_at)::date
      ORDER BY v.verdict_date ASC
      LIMIT 1
    ) rv ON true
    WHERE i.measured_at IS NULL
  ),
  upd AS (
    UPDATE public.learner_360_interventions i
       SET re_verdict_id     = c.rv_id,
           band_delta        = c.delta,
           days_to_reverdict = c.days_gap,
           measured_at       = now(),
           updated_at        = now()
      FROM cand c
     WHERE i.id = c.intervention_id
     RETURNING i.id
  )
  SELECT count(*)::integer INTO v_measured FROM upd;

  SELECT count(*)::integer INTO v_pending
    FROM public.learner_360_interventions
   WHERE measured_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'measured', v_measured,
    'awaiting_reverdict', v_pending
  );
END;
$$;

-- service_role ONLY: the measurer writes measurement facts with no per-caller
-- scope, so a signed-in caller must not be able to fire it (the 2026-08-18
-- "granted to authenticated with no guard" incident class).
REVOKE EXECUTE ON FUNCTION public.fn_learner_360_measure_reverdict_delta() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_360_measure_reverdict_delta() TO service_role;

-- ----------------------------------------------------------------------------
-- 4. loop_registry row for the family. Legs (outcome_metric, baseline_window,
--    intervention, verdict_owner, remeasure_window) stay NULL — MetaLoop
--    drafts charters, the owner approves, the Director countersigns. Gates are
--    seeded HONESTLY for apply time: verdicts generate nightly (g on); the ACT
--    record and MEASURE fn exist from this migration but have produced zero
--    rows/numbers at seed time, so a/m/f stay off until they demonstrably run
--    (the mess loop's confident-liar lesson, 2026-07-26).
-- ----------------------------------------------------------------------------
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email, is_active) VALUES
  ('learner-360', 'Learner 360 Standing Loop', 3, 'cadence', 'learners',
   'Nightly plain-language standing verdicts per learner (learner.360_verdict, ~279/day) -> a mentor/counselor records the action taken on a verdict (learner_360_interventions) -> the learner''s next verdict is compared against the one that triggered the action (fn_learner_360_measure_reverdict_delta, band_delta vs the learner''s own baseline). Charter legs NULL until MetaLoop drafts and humans sign.',
   '{"g":"on","a":"off","m":"off","f":"off"}'::jsonb, 'learner-360-verdict', 'aieee@jkkn.ac.in', true)
ON CONFLICT (loop_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly here rather than silently forever.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.loop_registry WHERE loop_key = 'learner-360') THEN
    RAISE EXCEPTION 'learner-360 loop_registry row not seeded';
  END IF;
  -- Exactly two policies on the interventions table (service_role ALL + staff
  -- SELECT) — no learner-self door, no authenticated write door.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'learner_360_interventions') <> 2 THEN
    RAISE EXCEPTION 'learner_360_interventions must carry exactly 2 policies (service_role, staff select)';
  END IF;
  -- The measurer must not be callable by authenticated (effective privilege,
  -- not ACL text — the 2026-08-18 anon-via-PUBLIC lesson).
  IF has_function_privilege('authenticated',
       'public.fn_learner_360_measure_reverdict_delta()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_learner_360_measure_reverdict_delta must not be executable by authenticated';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_learner_360_record_intervention(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_learner_360_record_intervention must not be executable by anon';
  END IF;
END
$assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
