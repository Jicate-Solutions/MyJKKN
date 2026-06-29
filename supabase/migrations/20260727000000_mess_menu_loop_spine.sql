-- Migration: Choose Your Menu self-improving loop — PR1 spine + measurement
-- Date: 2026-06-28  Reason: close loop Parts 4 (measure-vs-baseline) — see
--   specs/mess-choose-your-menu-self-improving-loop-2026-06-28.md
-- Ships DARK + backend-only. moat-loop verdict pre-build: "no loop (system-side)".
-- This PR adds the loop's memory + the lift estimator. PR2 adds the generator+cron, PR3 the verdict UI.

-- ── 1. Loop spine: one row per (institution, tier, meal, week) ────────────────
-- Stores baseline (at action time) → action → chairperson verdict → measured outcome → lineage.
CREATE TABLE IF NOT EXISTS public.mess_menu_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  tier_key text NOT NULL,
  meal_type text NOT NULL,                       -- breakfast|lunch|dinner
  week_start_date date NOT NULL,                 -- the week this recommendation is FOR

  -- PART 4 baseline — captured AT action time, SAME estimator as the outcome below
  baseline_window_weeks int NOT NULL DEFAULT 4,
  baseline_avg_rating numeric,                   -- avg(rating) over trailing window, slots w/ >= k ratings
  baseline_waste_pct numeric,
  baseline_rating_n int,                         -- sample size (de-noise)

  -- PART 3 action — items promoted/demoted vs prior, with per-item reasons (filled by PR2 generator)
  recommended_item_ids uuid[] NOT NULL DEFAULT '{}',
  demoted_item_ids uuid[] NOT NULL DEFAULT '{}',
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Chairperson verdict — control label for the causal-validity check + revives the dead channel (PR3 UI)
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','rejected','edited')),  -- state machine, not a CRUDable value list
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text,

  -- PART 4 outcome + lift — measured AFTER the cycle, SAME estimator as baseline
  outcome_avg_rating numeric,
  outcome_waste_pct numeric,
  outcome_rating_n int,
  rating_lift numeric,                           -- outcome_avg_rating - baseline_avg_rating
  waste_lift numeric,                            -- baseline_waste_pct - outcome_waste_pct (positive = improvement)
  measured_at timestamptz,

  -- PART 5 feed-forward — the prior cycle this recommendation learned from
  prior_recommendation_id uuid REFERENCES public.mess_menu_recommendations(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, tier_key, meal_type, week_start_date)
);

COMMENT ON TABLE public.mess_menu_recommendations IS
  'Choose Your Menu self-improving loop spine. One row per (institution,tier,meal,week): baseline → action → verdict → measured outcome → lineage. Added 2026-06-28 (loop PR1).';

CREATE INDEX IF NOT EXISTS idx_mmr_slot ON public.mess_menu_recommendations (institution_id, tier_key, meal_type, week_start_date);
CREATE INDEX IF NOT EXISTS idx_mmr_prior ON public.mess_menu_recommendations (prior_recommendation_id);

-- ── 2. Lineage column on the menu → makes Part-5 feed-forward PROVABLE ────────
ALTER TABLE public.mess_menus
  ADD COLUMN IF NOT EXISTS recommended_from uuid REFERENCES public.mess_menu_recommendations(id) ON DELETE SET NULL;

-- ── 3. RLS — manage-permission + institution scope (writes go through the DEFINER RPC) ──
ALTER TABLE public.mess_menu_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mmr_select" ON public.mess_menu_recommendations;
CREATE POLICY "mmr_select" ON public.mess_menu_recommendations
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.mess.menu.manage')
      AND role_has_institution_access(institution_id))
);

-- ── 4. Dark config — triple-dark master switch + the de-noise floor k (every decision = a config row) ──
-- Shape mirrors existing mess.choose.* rows: scope_type='global', data_type per value,
-- conflict target = the composite unique index uq_platform_policies_key_scope.
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('mess.choose.loop.master_enabled', 'global', 'false'::jsonb, 'boolean', 'major', 'published', true,
   'Choose Your Menu self-improving loop master switch. DARK until a pilot hostel is fueled + the 2-cycle sim certifies the loop.'),
  ('mess.choose.loop.min_ratings_k', 'global', '3'::jsonb, 'number', 'major', 'published', true,
   'Minimum ratings in a slot-week before a lift is computed (de-noise floor). Below this, rating_lift stays NULL.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 5. PART 4 measure RPC — the metric the 2-cycle sim will attack ───────────
-- INVARIANT: baseline and outcome use the SAME per-slot avg estimator + SAME >= k floor.
--   A no-change cycle (baseline 2.0 → outcome 2.0) MUST yield rating_lift = 0.00.
--   Never sum()/sum() (response-weighted double-count) — always avg(rating).
CREATE OR REPLACE FUNCTION public.fn_mess_measure_menu_lift(p_recommendation_id uuid)
RETURNS TABLE (rating_lift numeric, waste_lift numeric, outcome_rating_n integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec            public.mess_menu_recommendations%ROWTYPE;
  v_k              int;
  v_outcome_rating numeric;
  v_outcome_n      int;
  v_outcome_waste  numeric;
  v_rating_lift    numeric;
  v_waste_lift     numeric;
BEGIN
  SELECT * INTO v_rec FROM public.mess_menu_recommendations WHERE id = p_recommendation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation % not found', p_recommendation_id;
  END IF;

  v_k := COALESCE((SELECT (value #>> '{}')::int
                   FROM public.platform_policies
                   WHERE policy_key = 'mess.choose.loop.min_ratings_k'), 3);

  -- OUTCOME satisfaction: avg(rating) for this slot's week (same estimator as the stored baseline)
  SELECT round(avg(r.rating)::numeric, 2), count(*)::int
    INTO v_outcome_rating, v_outcome_n
  FROM public.mess_meal_ratings r
  JOIN public.mess_menus m ON m.id = r.menu_id
  WHERE m.institution_id  = v_rec.institution_id
    AND m.tier_key        = v_rec.tier_key
    AND m.meal_type::text  = v_rec.meal_type
    AND m.week_start_date = v_rec.week_start_date;

  -- OUTCOME waste: avg(waste_percentage) for institution+meal over the week (waste_log has no tier)
  SELECT round(avg(w.waste_percentage)::numeric, 2)
    INTO v_outcome_waste
  FROM public.mess_waste_log w
  WHERE w.institution_id = v_rec.institution_id
    AND w.meal_type::text = v_rec.meal_type
    AND w.date >= v_rec.week_start_date
    AND w.date <  v_rec.week_start_date + 7;

  -- LIFT — de-noised: only when >= k ratings AND a baseline was stored. NULL otherwise (never feed noise forward).
  v_rating_lift := CASE
    WHEN v_outcome_n >= v_k AND v_rec.baseline_avg_rating IS NOT NULL
    THEN round(v_outcome_rating - v_rec.baseline_avg_rating, 2) END;
  v_waste_lift := CASE
    WHEN v_rec.baseline_waste_pct IS NOT NULL AND v_outcome_waste IS NOT NULL
    THEN round(v_rec.baseline_waste_pct - v_outcome_waste, 2) END;

  UPDATE public.mess_menu_recommendations
     SET outcome_avg_rating = v_outcome_rating,
         outcome_waste_pct  = v_outcome_waste,
         outcome_rating_n   = v_outcome_n,
         rating_lift        = v_rating_lift,
         waste_lift         = v_waste_lift,
         measured_at        = now(),
         updated_at         = now()
   WHERE id = p_recommendation_id;

  RETURN QUERY SELECT v_rating_lift, v_waste_lift, v_outcome_n;
END;
$$;

-- Anon-lock (Supabase default-grants anon EXECUTE on every new function — revoke explicitly)
REVOKE EXECUTE ON FUNCTION public.fn_mess_measure_menu_lift(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_measure_menu_lift(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
