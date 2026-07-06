-- ============================================================================
-- COHORT CORE — M7.1: blended cohort-outcome score + baseline (Phase 7 · MOAT)
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 7 · M1/M3 → item 7.1)
-- ============================================================================
-- WHAT: The MEASUREMENT heart of the moat. Two things:
--   1. public.fn_cohort_blended_score(kind, member_type, member_ref) — a PURE,
--      VERSIONED estimator that computes an equal-weight blended score for a
--      cohort member at BOTH ends of its life:
--        • baseline  = the state AT ENROLLMENT (SF100 seed_* columns, t=0)
--        • outcome   = the state AT CLOSE      (active paid users / revenue / speed)
--      returns { blended_baseline, blended_outcome, lift, components,
--                estimator_version, scored }.
--   2. Upgrades public.fn_capture_cohort_outcome (the M2 capture trigger) to CALL
--      the estimator at close and MERGE its result into outcome_snapshot — so the
--      captured baseline is no longer a thin transition record but carries the
--      measurable LIFT that the feed-forward loop (7.3) reads.
--
-- WHY ONE VERSIONED ESTIMATOR, BOTH ENDS (PLAN.md M1): "same fixed estimator on
--   baseline AND outcome (no double-count)". If baseline and outcome used
--   different math, the "lift" would conflate a formula change with real
--   improvement. estimator_version pins the invariant: a future formula change
--   gets a NEW version and cannot silently re-score already-captured cohorts.
--
-- WHY COMPUTE AT CLOSE (not post-hoc enrich): the capture trigger is the single
--   chokepoint every close passes through (M2). Computing the score there means
--   the moat's fuel — the measured lift — is captured atomically with the close
--   and can never be stranded by a path that forgets to enrich. For SF100 the
--   inputs (seed_* baseline + final aggregates) are durable columns, so the score
--   is also reproducible; computing at close is correct AND future-proofs kinds
--   whose baseline is NOT durable.
--
-- ESTIMATOR v1 (SF100) — equal-weight mean of three components, each clamped [0,1]:
--   s_success = LEAST(paying_users / target_users, 1)          -- hit the target?
--   s_revenue = LEAST(revenue / (target_users*min_txn), 1)     -- verified MRR vs target
--   s_speed   = target_hit ? GREATEST(0, 1 - elapsed_fraction) -- hit it FAST?
--                          : 0                                  -- no finish = no speed credit
--   blended   = (s_success + s_revenue + s_speed) / 3
--   • BASELINE state: paying=seed_active_users, revenue=seed_mrr, elapsed=0,
--     target_hit=(seed_active_users >= target_users)  → usually low (they just started)
--   • OUTCOME  state: paying=active_paid_users (churn-adjusted, rule 1: "still
--     paying this month"), revenue=total_revenue, elapsed=(close-enroll)/round_len,
--     target_hit=(active_paid_users >= target_users AND graduated)
--   • lift = blended_outcome - blended_baseline
--   Non-SF100 kinds have no revenue/paying-user signal yet → { scored:false } and
--   a NULL lift (honest: those kinds are not part of the revenue moat SEED today).
--
-- TIER: TIER-1 (schema-additive fn + CREATE OR REPLACE of an existing fn;
--       IDEMPOTENT; NON-DESTRUCTIVE; DROPS-NOTHING).
-- ============================================================================

-- ── 1. estimator constants (documented; mirrored in TS lib/services/cohort-core) ─
-- Kept as an IMMUTABLE helper so the version string lives in exactly one place.
CREATE OR REPLACE FUNCTION public.fn_cohort_estimator_version()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'sf100.v1'::text $$;

REVOKE EXECUTE ON FUNCTION public.fn_cohort_estimator_version() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_estimator_version() TO authenticated;

-- ── 2. the blended-score estimator ────────────────────────────────────────────
-- STABLE (reads tables), SECURITY DEFINER (the capturing trigger runs as definer
-- and this must read sf100_* regardless of the closer's grants). Returns a jsonb
-- envelope; NEVER raises on missing data — a member with no resolvable extension
-- row yields { scored:false } so the trigger's best-effort capture still writes a
-- row (the transition metadata is always valuable even without a score).
-- p_institution_id is the CALLING COHORT's tenant (passed by the capture trigger).
-- The estimator refuses to score a member_ref whose resolved program belongs to a
-- DIFFERENT institution — member_ref is an untyped uuid with no DB-level tenant
-- binding, so without this a cohort in institution A could point a membership at
-- institution B's enrollment id and capture B's revenue into A's snapshot.
CREATE OR REPLACE FUNCTION public.fn_cohort_blended_score(
  p_kind           text,
  p_member_type    text,
  p_member_ref     uuid,
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e              record;
  p              record;
  v_target_users numeric;
  v_target_rev    numeric;
  v_round_secs    numeric;
  v_elapsed_secs  numeric;
  v_elapsed_frac  numeric;
  -- baseline components
  b_success numeric; b_revenue numeric; b_speed numeric; b_blended numeric;
  b_hit boolean;
  -- outcome components
  o_success numeric; o_revenue numeric; o_speed numeric; o_blended numeric;
  o_hit boolean;
BEGIN
  -- Only SF100 has a defined revenue/paying-user estimator today (the moat SEED).
  IF p_kind <> 'sf100' OR p_member_type <> 'team' THEN
    RETURN jsonb_build_object(
      'scored', false,
      'estimator_version', 'none',
      'reason', format('no blended-score estimator for kind=%s member_type=%s', p_kind, p_member_type),
      'lift', NULL
    );
  END IF;

  -- SF100: member_ref IS the sf100_enrollments.id (see 20260731060000 demote).
  SELECT * INTO e FROM public.sf100_enrollments WHERE id = p_member_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'scored', false, 'estimator_version', 'none',
      'reason', 'sf100_enrollments row not found for member_ref', 'lift', NULL
    );
  END IF;

  SELECT * INTO p FROM public.sf100_programs WHERE id = e.program_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'scored', false, 'estimator_version', 'none',
      'reason', 'sf100_programs row not found for enrollment', 'lift', NULL
    );
  END IF;

  -- TENANT GUARD (security): never score a member_ref whose program is in a
  -- DIFFERENT institution than the calling cohort. member_ref is an untyped uuid
  -- with no DB tenant binding, so this is the only thing stopping a cohort in
  -- institution A from reading institution B's revenue via a foreign enrollment id.
  IF p.institution_id IS DISTINCT FROM p_institution_id THEN
    RETURN jsonb_build_object(
      'scored', false, 'estimator_version', 'none',
      'reason', 'member_ref resolves to a program in a different institution', 'lift', NULL
    );
  END IF;

  v_target_users := NULLIF(COALESCE(p.paid_user_target, 0), 0);
  -- A program with no paid-user target is not meaningfully scorable — be honest
  -- rather than emit a partial/misleading score.
  IF v_target_users IS NULL THEN
    RETURN jsonb_build_object(
      'scored', false, 'estimator_version', 'none',
      'reason', 'sf100_programs.paid_user_target is 0/NULL — no target to score against', 'lift', NULL
    );
  END IF;

  -- proxy target revenue = target paying users × min qualifying txn. NULL when
  -- min_transaction_amount is 0/NULL → the revenue axis is DROPPED (averaged out
  -- of the blend), NOT silently fed a hard 0 into a /3 denominator.
  v_target_rev := NULLIF(COALESCE(p.paid_user_target,0)::numeric
                         * COALESCE(p.min_transaction_amount,0)::numeric, 0);

  v_round_secs := GREATEST(EXTRACT(EPOCH FROM (
      COALESCE(p.hard_deadline, p.enrollment_deadline, p.completed_at, now())
      - COALESCE(p.enrollment_start, p.started_at, e.enrolled_at, now()))), 1);
  v_elapsed_secs := GREATEST(EXTRACT(EPOCH FROM (
      COALESCE(e.graduated_at, now()) - COALESCE(e.enrolled_at, p.enrollment_start, now()))), 0);
  v_elapsed_frac := LEAST(GREATEST(v_elapsed_secs / v_round_secs, 0), 1);

  -- Every component clamped to [0,1] on BOTH bounds. The lower clamp matters:
  -- net revenue can go NEGATIVE (refunds/chargebacks against MRR), and without
  -- GREATEST(0, …) a negative revenue component would drag the blend below 0 and
  -- emit a spurious, unbounded-magnitude negative lift that poisons causal_lift.
  b_hit     := COALESCE(e.seed_active_users,0) >= v_target_users;
  b_success := GREATEST(0, LEAST(COALESCE(e.seed_active_users,0)::numeric / v_target_users, 1));
  b_revenue := CASE WHEN v_target_rev IS NULL THEN NULL
                    ELSE GREATEST(0, LEAST(COALESCE(e.seed_mrr,0)::numeric / v_target_rev, 1)) END;
  b_speed   := CASE WHEN b_hit THEN 1 ELSE 0 END;

  -- "hit" is a DATA fact (target met), independent of the sf100_enrollments.status
  -- enum; the graduate-vs-remove distinction is kept in outcome_snapshot.to_status.
  o_hit     := COALESCE(e.active_paid_users,0) >= v_target_users;
  o_success := GREATEST(0, LEAST(COALESCE(e.active_paid_users,0)::numeric / v_target_users, 1));
  o_revenue := CASE WHEN v_target_rev IS NULL THEN NULL
                    ELSE GREATEST(0, LEAST(COALESCE(e.total_revenue,0)::numeric / v_target_rev, 1)) END;
  o_speed   := CASE WHEN o_hit THEN GREATEST(0, 1 - v_elapsed_frac) ELSE 0 END;

  -- Dynamic denominator: success + speed always; revenue only when its target
  -- exists. Baseline and outcome share the SAME axis set (target_rev availability
  -- is a program property), so the lift comparison stays fair.
  IF v_target_rev IS NULL THEN
    b_blended := round(((b_success + b_speed) / 2.0)::numeric, 6);
    o_blended := round(((o_success + o_speed) / 2.0)::numeric, 6);
  ELSE
    b_blended := round(((b_success + b_revenue + b_speed) / 3.0)::numeric, 6);
    o_blended := round(((o_success + o_revenue + o_speed) / 3.0)::numeric, 6);
  END IF;

  RETURN jsonb_build_object(
    'scored', true,
    'estimator_version', public.fn_cohort_estimator_version(),
    'blended_baseline', b_blended,
    'blended_outcome',  o_blended,
    'lift', round((o_blended - b_blended)::numeric, 6),
    'axes', CASE WHEN v_target_rev IS NULL THEN 2 ELSE 3 END,
    'components', jsonb_build_object(
      'baseline', jsonb_build_object('success', round(b_success,6), 'revenue', round(b_revenue,6), 'speed', round(b_speed,6)),
      'outcome',  jsonb_build_object('success', round(o_success,6), 'revenue', round(o_revenue,6), 'speed', round(o_speed,6))
    ),
    -- inputs deliberately OMITS raw money (seed_mrr/total_revenue) — normalized
    -- components + counts are enough for debugging without persisting revenue
    -- figures into a row that other roles can read.
    'inputs', jsonb_build_object(
      'target_users', v_target_users, 'target_revenue', v_target_rev,
      'elapsed_fraction', round(v_elapsed_frac,6),
      'seed_active_users', COALESCE(e.seed_active_users,0),
      'active_paid_users', COALESCE(e.active_paid_users,0)
    )
  );
END;
$$;

-- SECURITY: this DEFINER estimator reads sf100_* revenue/paying-user data for an
-- ARBITRARY member_ref. Granting it to authenticated would let any user read any
-- enrollment's revenue numbers cross-tenant. It is called ONLY by the capture
-- trigger (which runs as the function owner and therefore retains EXECUTE), so we
-- revoke it from authenticated too. The app reads the SCORE from the RLS-gated
-- cohort_outcomes.outcome_snapshot, never by calling this estimator directly.
REVOKE EXECUTE ON FUNCTION public.fn_cohort_blended_score(text, text, uuid, uuid) FROM anon, PUBLIC, authenticated;

-- ── 3. upgrade the capture trigger to score at close ───────────────────────────
-- Reproduces ALL M2 guards (terminal-only, no-op skip, re-capture guard,
-- NULL-institution skip, best-effort exception wrap) and ADDS: call the estimator
-- and MERGE its envelope into outcome_snapshot. The estimator NEVER raises (it
-- returns {scored:false} on missing data), and the whole INSERT stays inside the
-- best-effort BEGIN…EXCEPTION so a scoring or capture failure degrades to a NOTICE
-- and NEVER rolls back the primary membership close.
CREATE OR REPLACE FUNCTION public.fn_capture_cohort_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind           text;
  v_institution_id uuid;
  v_score          jsonb;
BEGIN
  IF NEW.status NOT IN ('graduated','removed') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('graduated','removed') THEN RETURN NEW; END IF;

  SELECT c.kind, c.institution_id INTO v_kind, v_institution_id
    FROM public.cohorts c WHERE c.id = NEW.cohort_id;

  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'cohort_outcome capture skipped for membership % — parent cohort % has no institution', NEW.id, NEW.cohort_id;
    RETURN NEW;
  END IF;

  BEGIN
    -- Score at close. Best-effort: any estimator error → unscored snapshot.
    BEGIN
      -- pass the cohort's own institution so the estimator refuses a member_ref
      -- whose program belongs to a different tenant (cross-tenant read guard).
      v_score := public.fn_cohort_blended_score(v_kind, NEW.member_type, NEW.member_ref, v_institution_id);
    EXCEPTION WHEN OTHERS THEN
      v_score := jsonb_build_object('scored', false, 'estimator_version', 'none',
                                    'reason', 'estimator raised: ' || SQLERRM, 'lift', NULL);
    END;

    INSERT INTO public.cohort_outcomes (
      cohort_id, membership_id, member_ref, member_type, kind,
      captured_at, outcome_snapshot, source, institution_id
    ) VALUES (
      NEW.cohort_id, NEW.id, NEW.member_ref, NEW.member_type, v_kind,
      now(),
      jsonb_build_object(
        'from_status',       OLD.status,
        'to_status',         NEW.status,
        'role',              NEW.role,
        'joined_at',         NEW.joined_at,
        'membership_config', NEW.config,
        'captured_by',       'trigger'
      ) || COALESCE(v_score, '{}'::jsonb),   -- merge the score envelope
      'trigger', v_institution_id
    )
    ON CONFLICT (membership_id) WHERE membership_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cohort_outcome capture failed for membership % (kind %): %; close proceeds (best-effort M2)', NEW.id, v_kind, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_capture_cohort_outcome() FROM anon, PUBLIC;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
