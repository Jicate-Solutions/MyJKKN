-- 20260429000012_consume_counselor_max_assignments_policy.sql
-- Closes spec PR #561 gap: MAX_NEW_ASSIGNMENTS_PER_RUN was intended as a runtime
-- config read but shipped hardcoded. Replaces the hardcoded default with a
-- fn_get_policy_int() read from platform_policies at every trigger invocation.
--
-- Policy key: admission.counselor.max_assignments_per_run (number, global, default 50)
-- Seeded below with idempotent INSERT (WHERE NOT EXISTS pattern, per substrate convention).
--
-- Behavior unchanged at deploy: prod value is 50 (matches prior hardcoded default).
-- Director can now update the row via the platform_policies admin UI — no deploy needed.
--
-- Owned files (diff guard):
--   supabase/migrations/20260429000012_consume_counselor_max_assignments_policy.sql (this file)
--   supabase/setup/02_functions.sql (mirror — see Commit 2)
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION + INSERT ... WHERE NOT EXISTS. Re-runnable.
-- REVERSIBILITY: Re-deploy phase8a body (20260428_phase8a_rules_engine_consumption.sql).
-- ============================================================================

-- ============================================================================
-- SEED ROW (idempotent)
-- Ensures the policy key exists before the function tries to read it.
-- The task spec states this row is already on prod; this INSERT is a safety net
-- for any environment that ran the substrate migration without the prod seed.
-- ============================================================================
INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
)
SELECT
  'admission.counselor.max_assignments_per_run',
  'global',
  NULL,
  '50'::jsonb,
  'Maximum new lead assignments per counselor per cron run (fn_auto_assign_counselor_v2 / fn_flush_queued_leads). Director-tweakable via platform_policies UI — no deploy needed.',
  'number',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'admission.counselor.max_assignments_per_run'
    AND scope_type  = 'global'
    AND scope_id    IS NULL
);

-- ============================================================================
-- fn_auto_assign_counselor_v2 — policy-aware rewrite
-- Source: 20260428_phase8a_rules_engine_consumption.sql (rules-consuming rewrite)
-- Change: adds v_max_assignments read from platform_policies via fn_get_policy_int().
--         Used as the LIMIT cap for the Tier 4 cross-institution overflow path,
--         replacing the formerly hardcoded default of 50.
--
-- All other logic (Tiers 1–3, taxonomy_filter, fail-open EXCEPTION) is unchanged.
-- Function signature is unchanged (RETURNS TRIGGER).
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auto_assign_counselor_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counselor_id     UUID;

  -- Rule-resolved values (all NULL when no active rules)
  v_tf_active        BOOLEAN;
  v_tf_allowed_roles TEXT[];
  v_cif_active       BOOLEAN;
  v_cif_enabled      BOOLEAN;
  v_cif_max_overflow INT;

  -- Policy-driven cap: read once per invocation from platform_policies.
  -- Replaces the formerly hardcoded MAX_NEW_ASSIGNMENTS_PER_RUN = 50.
  -- Fallback: 50 (matches prior default; safe if policy row is missing).
  v_max_assignments  INT;

BEGIN
  -- Guard 1: Respect explicit assignments (CRM imports, manual overrides)
  IF NEW.counselor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: Can't route without institution
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 4-tier routing wrapped in EXCEPTION so failures never block lead creation
  BEGIN

    -- -------------------------------------------------------------------------
    -- Step A: Resolve active rules for this institution
    -- Default-safe: if 0 active rules, all v_* vars stay NULL
    -- -------------------------------------------------------------------------
    SELECT
      r.tf_active,
      r.tf_allowed_roles,
      r.cif_active,
      r.cif_enabled,
      r.cif_max_overflow
    INTO
      v_tf_active,
      v_tf_allowed_roles,
      v_cif_active,
      v_cif_enabled,
      v_cif_max_overflow
    FROM fn_resolve_rules_for(NEW.institution_id) r;

    -- Read max-assignments cap from platform_policies (Director-tweakable).
    -- fn_get_policy_int handles NULL return (missing row) → returns the default.
    -- cif_max_overflow from the rules engine takes precedence when a
    -- cross_institution_fallback rule is active; this policy is the global
    -- fallback when no per-institution rule overrides it.
    v_max_assignments := fn_get_policy_int(
      'admission.counselor.max_assignments_per_run',
      50,
      NULL
    );

    -- -------------------------------------------------------------------------
    -- Step B: 3-tier query with optional taxonomy_filter applied
    --
    -- When taxonomy_filter rule IS active:
    --   - Join admission_counselors → profiles (via email) → check profiles.role
    --     IN v_tf_allowed_roles
    --   - Counselors without a matching profile.role are excluded from ALL tiers
    --
    -- When taxonomy_filter rule is NOT active (v_tf_active IS NULL):
    --   - No taxonomy join, identical to PR #549 Tier 3 (all active counselors)
    --
    -- Tier 1: counselor maps to BOTH institution AND source (junction tables)
    -- Tier 2: counselor maps to institution only (junction table)
    -- Tier 3: LEGACY — counselors.institution_id FK (current prod behavior)
    -- -------------------------------------------------------------------------
    WITH

    -- Pre-filter: counselor eligibility after taxonomy check
    -- When no taxonomy rule: eligible_counselors = ALL active counselors
    eligible_counselors AS (
      SELECT c.id AS counselor_id
      FROM admission_counselors c
      WHERE c.is_active = TRUE
        AND (
          -- No taxonomy rule → all counselors eligible
          v_tf_active IS NULL
          OR
          -- Taxonomy rule active → filter by profiles.role
          EXISTS (
            SELECT 1
            FROM profiles p
            WHERE p.email = c.email
              AND p.role = ANY(v_tf_allowed_roles)
          )
        )
    ),

    -- Tier 1: institution + source junction match (on-duty counselors only)
    tier1_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      JOIN eligible_counselors ec          ON ec.counselor_id = c.id
      JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
      JOIN admission_counselor_sources cs      ON cs.counselor_id = c.id
      JOIN admission_lead_sources_master slm   ON slm.id = cs.source_id
                                             AND slm.key = NEW.source::text
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE ci.institution_id = NEW.institution_id
        AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
      GROUP BY c.id
    ),

    -- Tier 2: institution junction match (on-duty counselors only)
    tier2_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      JOIN eligible_counselors ec          ON ec.counselor_id = c.id
      JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE ci.institution_id = NEW.institution_id
        AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
      GROUP BY c.id
    ),

    -- Tier 3: LEGACY — counselors.institution_id FK (current prod behavior)
    -- Note: fn_is_counselor_on_duty intentionally NOT called here for legacy parity.
    -- Schedule/leave constraints only activate via Tiers 1+2 (junction-table path).
    -- Taxonomy filter DOES apply to Tier 3 when rule is active (key improvement
    -- over PR #549 which had no taxonomy gate at all).
    tier3_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      JOIN eligible_counselors ec ON ec.counselor_id = c.id
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE c.institution_id = NEW.institution_id
        AND c.is_active = TRUE
      GROUP BY c.id
    )

    SELECT id INTO v_counselor_id
    FROM (
      -- Tier 1 wins if any match
      SELECT id, open_load, 1 AS tier FROM tier1_candidates

      UNION ALL

      -- Tier 2: only if Tier 1 yielded nothing
      SELECT id, open_load, 2 AS tier FROM tier2_candidates
      WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)

      UNION ALL

      -- Tier 3 (legacy): only if Tiers 1+2 yielded nothing
      SELECT id, open_load, 3 AS tier FROM tier3_candidates
      WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
        AND NOT EXISTS (SELECT 1 FROM tier2_candidates)

    ) all_tiers
    ORDER BY tier ASC, open_load ASC, RANDOM()
    LIMIT 1;

    -- -------------------------------------------------------------------------
    -- Step C: Tier 4 — cross-institution fallback (rules-gated)
    --
    -- Fires ONLY when:
    --   (a) Tiers 1–3 yielded nothing (v_counselor_id IS NULL after Step B)
    --   (b) cross_institution_fallback rule is active AND enabled=true
    --
    -- Pool: any on-duty, active counselor in the system (all institutions).
    -- Taxonomy filter applied here too if active.
    -- Cap: COALESCE(v_cif_max_overflow, v_max_assignments) — rule-level override
    --      wins; policy-level value is the fallback when no per-institution rule
    --      is configured. v_max_assignments replaces the formerly hardcoded 50.
    --
    -- DEFAULT-SAFE: when no cross_institution_fallback rule → v_cif_active IS NULL
    --               → this block is skipped → behavior identical to PR #549.
    -- -------------------------------------------------------------------------
    IF v_counselor_id IS NULL
       AND v_cif_active IS TRUE
       AND v_cif_enabled IS TRUE
    THEN
      SELECT c.id INTO v_counselor_id
      FROM admission_counselors c
      JOIN eligible_counselors ec ON ec.counselor_id = c.id
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE c.is_active = TRUE
        AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
      GROUP BY c.id
      HAVING COUNT(al.id) < COALESCE(v_cif_max_overflow, v_max_assignments)
      ORDER BY COUNT(al.id) ASC, RANDOM()
      LIMIT 1;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: routing error → NULL counselor (queue surface)
    -- This is identical to PR #549 behavior.
    v_counselor_id := NULL;
  END;

  IF v_counselor_id IS NOT NULL THEN
    NEW.counselor_id := v_counselor_id;
  END IF;

  -- If still NULL: lead lands in queue (counselor_id IS NULL, funnel_stage='new').
  -- v_institutions_needing_admission_counselors surfaces these for Director.
  -- fn_flush_queued_leads (cron) re-routes them every 15 min.

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_auto_assign_counselor_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_auto_assign_counselor_v2() TO service_role;
