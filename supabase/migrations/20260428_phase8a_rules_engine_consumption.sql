-- =============================================================================
-- 20260428_phase8a_rules_engine_consumption.sql
-- Phase 8a-Full PR-A: fn_auto_assign_counselor_v2 consumes admission_assignment_rules
-- Spec: specs/admission-counselor-rules-engine-phase8a-routing-rules-config.md (PR #561)
-- Locked decisions: D1–D9 from 9-thrash session 2026-04-28
-- =============================================================================
--
-- WHAT THIS MIGRATION SHIPS:
--   1. fn_resolve_rules_for(institution_id uuid)
--         → Returns the effective rule set for a given institution by evaluating
--           all active rows in admission_assignment_rules ordered by priority DESC.
--         → Each rule type's highest-priority row wins (lower-priority rows of
--           same type are shadowed).
--         → Returns a composite record with one field per rule type; missing rule
--           types are represented as NULL / default fallback values.
--         → Default-safe-when-empty: if 0 active rules match, all fields come back
--           as NULL → callers must treat NULL as "use hardcoded PR #549 default".
--
--   2. fn_auto_assign_counselor_v2() — REWRITE
--         → Consumes fn_resolve_rules_for() at the start of every invocation.
--         → If 0 active rules: identical behavior to PR #549 (Tier 1/2/3, fail-open).
--         → If taxonomy_filter rule active: restricts pool to counselors whose
--           profiles.role IS IN rule.action->>'allowed_roles' JSON array.
--         → If cross_institution_fallback rule active (enabled=true): adds Tier 4
--           when Tiers 1–3 yield nothing.
--         → cap_per_run is CRON-ONLY (see decision below).
--         → cascade_threshold rule: ignored by trigger (cron-consumed only).
--         → notification rule: cap-hit notification only fires from cron paths
--           (not trigger path — trigger has no "run" concept).
--
-- CAP_PER_RUN SCOPE DECISION (documented per spec instruction):
--   Decision: cap_per_run is CRON-ONLY. The trigger path ignores it entirely.
--   Rationale:
--     (a) Spec D1 says "max NEW assignments per counselor per CRON RUN". The word
--         "run" is cron-specific. A BEFORE INSERT trigger fires once per lead, with
--         no shared batch context across concurrent inserts.
--     (b) Implementing a per-batch counter in trigger context requires either a temp
--         table (unavailable across concurrent trigger invocations), a session variable
--         (lost between connections in a pool), or an advisory lock + ephemeral table
--         (serializes all inserts — unacceptable for high-volume admission peaks).
--     (c) PR #549 explicitly deprecated max_leads as a routing gate. cap_per_run
--         is the successor, but it belongs to the cron layer.
--     (d) Cron functions (fn_flush_queued_leads, fn_cascade_off_duty_counselors)
--         CAN safely use a per-run CTE counter because they process leads in a
--         single sequential loop inside one transaction.
--     Consequence: trigger assigns leads greedily (best-fit, no per-run cap).
--     The cron cap prevents a single counselor from being flooded in a batch run.
--     cap_per_run consumption will be added to fn_flush_queued_leads in PR-B.
--
-- SENTINEL UUID for system-wide rules (applies_to:"all"):
--   institution_id NOT NULL constraint requires a sentinel. Per spec risk table:
--   '00000000-0000-0000-0000-000000000000' = system-wide rule.
--   fn_resolve_rules_for() checks institution-specific rules FIRST (higher effective
--   priority than system-wide rules at the same numeric priority), then falls back
--   to the sentinel.
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION — re-runnable.
-- REVERSIBILITY: Re-deploy PR #549's fn_auto_assign_counselor_v2 body.
-- =============================================================================

-- =============================================================================
-- HELPER TYPE: Effective rule configuration for one institution
-- We use a record returned from fn_resolve_rules_for rather than a composite
-- type to avoid CREATE TYPE idempotency issues. Callers destructure via INTO.
-- =============================================================================

-- =============================================================================
-- FUNCTION 0: fn_resolve_rules_for
-- Evaluates admission_assignment_rules for a given institution.
-- Returns effective values for each of the 5 rule types.
-- NULL return fields = "no rule configured → use hardcoded default".
--
-- Rule resolution order (per spec):
--   1. institution-specific active rules (criteria.applies_to = 'specific_institution'
--      AND criteria.institution_id = p_institution_id) — highest specificity.
--   2. system-wide active rules (institution_id = sentinel UUID '00000000-...')
--      OR (criteria.applies_to = 'all').
--   3. Within same type + same scope level: highest priority wins.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_resolve_rules_for(
  p_institution_id UUID
)
RETURNS TABLE (
  -- taxonomy_filter fields
  tf_active        BOOLEAN,
  tf_allowed_roles TEXT[],

  -- cap_per_run fields (cron-layer only — trigger ignores)
  cap_active       BOOLEAN,
  cap_value        INT,
  cap_scope        TEXT,   -- 'counselor' | 'institution'

  -- cross_institution_fallback fields
  cif_active       BOOLEAN,
  cif_enabled      BOOLEAN,
  cif_max_overflow INT,

  -- cascade_threshold (cron-only)
  ct_active        BOOLEAN,
  ct_minutes       INT,

  -- notification (cron-only)
  notif_active     BOOLEAN,
  notif_trigger    TEXT,
  notif_debounce   INT,
  notif_recipient  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  SENTINEL_UUID CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- taxonomy_filter: highest-priority active rule for this institution or system-wide
  SELECT
    TRUE,
    ARRAY(
      SELECT jsonb_array_elements_text(r.action->'allowed_roles')
    )
  INTO tf_active, tf_allowed_roles
  FROM admission_assignment_rules r
  WHERE r.is_active = TRUE
    AND r.action->>'type' = 'taxonomy_filter'
    AND (
      r.institution_id = p_institution_id
      OR r.institution_id = SENTINEL_UUID
      OR (r.criteria->>'applies_to' = 'all')
    )
  ORDER BY
    -- institution-specific beats system-wide at same numeric priority
    CASE WHEN r.institution_id = p_institution_id THEN 0 ELSE 1 END ASC,
    r.priority DESC
  LIMIT 1;

  -- cap_per_run: highest-priority active rule
  SELECT
    TRUE,
    (r.action->>'value')::INT,
    COALESCE(r.action->>'scope', 'counselor')
  INTO cap_active, cap_value, cap_scope
  FROM admission_assignment_rules r
  WHERE r.is_active = TRUE
    AND r.action->>'type' = 'cap_per_run'
    AND (
      r.institution_id = p_institution_id
      OR r.institution_id = SENTINEL_UUID
      OR (r.criteria->>'applies_to' = 'all')
    )
  ORDER BY
    CASE WHEN r.institution_id = p_institution_id THEN 0 ELSE 1 END ASC,
    r.priority DESC
  LIMIT 1;

  -- cross_institution_fallback
  SELECT
    TRUE,
    (r.action->>'enabled')::BOOLEAN,
    COALESCE((r.action->>'max_overflow_per_run')::INT, 10)
  INTO cif_active, cif_enabled, cif_max_overflow
  FROM admission_assignment_rules r
  WHERE r.is_active = TRUE
    AND r.action->>'type' = 'cross_institution_fallback'
    AND (
      r.institution_id = p_institution_id
      OR r.institution_id = SENTINEL_UUID
      OR (r.criteria->>'applies_to' = 'all')
    )
  ORDER BY
    CASE WHEN r.institution_id = p_institution_id THEN 0 ELSE 1 END ASC,
    r.priority DESC
  LIMIT 1;

  -- cascade_threshold
  SELECT
    TRUE,
    COALESCE((r.action->>'minutes')::INT, 60)
  INTO ct_active, ct_minutes
  FROM admission_assignment_rules r
  WHERE r.is_active = TRUE
    AND r.action->>'type' = 'cascade_threshold'
    AND (
      r.institution_id = p_institution_id
      OR r.institution_id = SENTINEL_UUID
      OR (r.criteria->>'applies_to' = 'all')
    )
  ORDER BY
    CASE WHEN r.institution_id = p_institution_id THEN 0 ELSE 1 END ASC,
    r.priority DESC
  LIMIT 1;

  -- notification rule
  SELECT
    TRUE,
    r.action->>'trigger',
    COALESCE((r.action->>'debounce_minutes')::INT, 1440),
    COALESCE(r.action->>'recipient_role', 'super_admin')
  INTO notif_active, notif_trigger, notif_debounce, notif_recipient
  FROM admission_assignment_rules r
  WHERE r.is_active = TRUE
    AND r.action->>'type' = 'notification'
    AND (r.action->>'trigger' = 'cap_hit')
    AND (
      r.institution_id = p_institution_id
      OR r.institution_id = SENTINEL_UUID
      OR (r.criteria->>'applies_to' = 'all')
    )
  ORDER BY
    CASE WHEN r.institution_id = p_institution_id THEN 0 ELSE 1 END ASC,
    r.priority DESC
  LIMIT 1;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_resolve_rules_for(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_resolve_rules_for(UUID) TO service_role;

-- =============================================================================
-- FUNCTION 1: fn_auto_assign_counselor_v2 — RULES-CONSUMING REWRITE
--
-- Trigger function (BEFORE INSERT on admission_leads).
--
-- DEFAULT-SAFE-WHEN-EMPTY guarantee:
--   If admission_assignment_rules WHERE is_active=true returns 0 rows for this
--   institution (and no system-wide rules either), fn_resolve_rules_for() returns
--   a row with all NULL fields. All NULL-checks below fall through to hardcoded
--   PR #549 behavior:
--     - No taxonomy_filter → all active counselors in pool
--     - No cross_institution_fallback → no Tier 4
--     - Tiers 1/2/3 unchanged from PR #549
--   Zero behavior change on production with 0 active rules. This is the keystone
--   safety property.
--
-- RULES CONSUMED (trigger path only — cap_per_run and cascade_threshold are cron):
--   1. taxonomy_filter  → narrows counselor pool
--   2. cross_institution_fallback → adds Tier 4 when Tiers 1–3 empty
-- =============================================================================
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
    -- Cap: limited to cif_max_overflow counselors (LIMIT prevents one counselor
    --       absorbing all overflow — we pick 1 with RANDOM() from the pool).
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

-- =============================================================================
-- TRIGGER SWAP: Re-bind trigger to new function body
-- (DROP + CREATE is idempotent — same name, same table, just refreshes binding)
-- =============================================================================
DROP TRIGGER IF EXISTS trg_admission_leads_auto_assign_counselor ON admission_leads;

CREATE TRIGGER trg_admission_leads_auto_assign_counselor
  BEFORE INSERT ON admission_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_counselor_v2();

-- =============================================================================
-- NOTIFY trigger: fire NOTIFY when rules change so future cache layers can
-- subscribe cheaply. No current subscriber — wires the channel for Phase 8b.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_notify_admission_rules_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('admission_rules_changed', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_notify_admission_rules_changed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_notify_admission_rules_changed() TO service_role;

DROP TRIGGER IF EXISTS trg_admission_rules_notify ON admission_assignment_rules;

CREATE TRIGGER trg_admission_rules_notify
  AFTER INSERT OR UPDATE OR DELETE ON admission_assignment_rules
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_admission_rules_changed();
