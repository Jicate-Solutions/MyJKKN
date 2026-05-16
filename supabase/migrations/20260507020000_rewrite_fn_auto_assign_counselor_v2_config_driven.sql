-- ============================================================================
-- fn_auto_assign_counselor_v2 — config-row driven tier order + named-exception logging
-- ============================================================================
-- Created: 2026-05-07 (Part 2 of the standing-rule remediation wave)
--
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row read at runtime + super-admin UI to
-- write + reader fn that materialises the policy.
--
-- This PR rewrites the routing engine to honour two pieces of substrate that
-- already shipped today:
--
--   1) `counselor_tier_policy` table + `fn_get_counselor_tier_policy(institution)`
--      reader fn (PR #736). Tier 1/2/3/4 fallback ORDER is now driven by config
--      rows, not hardcoded SQL. Director can disable Tier 3 (legacy FK) or
--      switch the on_duty filter per tier without a code deploy.
--
--   2) `counselor_routing_errors` observability table + `fn_routing_errors_recent`
--      reader fn (PR #735). The legendary `EXCEPTION WHEN OTHERS THEN
--      v_counselor_id := NULL` silent-swallow anti-pattern (memory
--      feedback_silent_exception_swallow_pattern.md) is replaced with named
--      per-tier catches that INSERT INTO counselor_routing_errors with
--      tier_order, sqlstate, message, and a context jsonb. Routing failures
--      stop being invisible.
--
-- Behavioural compatibility on day one
-- ------------------------------------
-- The 4 global seed rows in counselor_tier_policy mirror today's hardcoded SQL
-- behaviour 1:1 (institution_and_source → institution_only → institution_legacy_fk
-- → cross_institution_fallback, with on_duty_required matching). So the
-- behaviour on apply is identical to the prior function — the rewrite is
-- substrate-driven without changing the routing decisions. Tweakability is
-- the new capability; behaviour preservation is the safety net.
--
-- The "criteria_fields_used" / "action_types_used" hardcoded-enum surface
-- continues to be presentation-only at the rule-form layer (governed by PR #738's
-- assignment_rule_type_registry). The router itself does NOT read rule.type;
-- it only reads rule.criteria + rule.action via fn_resolve_rules_for. So this
-- PR does NOT need to integrate with the rule-type-registry — that registry
-- governs the picker UI alone.
--
-- Reversibility: CREATE OR REPLACE FUNCTION. Reverting to the prior version
-- means re-applying the 02_functions.sql definition. No DDL changes — this
-- migration mutates only the function body.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_assign_counselor_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counselor_id     UUID;

  -- Active tier policy iterator
  v_policy           RECORD;
  v_strategy         TEXT;
  v_on_duty          BOOLEAN;

  -- Rule-resolved values (all NULL when no active rules — preserves PR #549 default)
  v_tf_active        BOOLEAN;
  v_tf_allowed_roles TEXT[];
  v_cif_active       BOOLEAN;
  v_cif_enabled      BOOLEAN;
  v_cif_max_overflow INT;
BEGIN
  -- Guard 1: respect explicit assignments (CRM imports, manual overrides, bulk import)
  IF NEW.counselor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: can't route without an institution
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Outer block: catches anything the per-tier inner blocks don't catch.
  -- The inner per-tier blocks are the primary error-handling site; this outer
  -- catch is a defensive last resort that logs (instead of silently swallowing).
  BEGIN
    -- -------------------------------------------------------------------------
    -- Step A: Resolve active rules for this institution
    -- (taxonomy_filter, cross_institution_fallback). Identical to prior version.
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
    -- Step B: Loop over the active tier policy. Each iteration tries one
    -- candidate strategy. EXIT as soon as a counselor is found. The order
    -- comes from fn_get_counselor_tier_policy — no longer hardcoded.
    -- -------------------------------------------------------------------------
    FOR v_policy IN
      SELECT tier_order, tier_strategy, on_duty_required
        FROM fn_get_counselor_tier_policy(NEW.institution_id)
       ORDER BY tier_order
    LOOP
      -- Per-tier inner block: catches SQL errors at THIS tier so we can log
      -- them and still try the next tier. Replaces the prior outer-only
      -- WHEN OTHERS that swallowed everything silently.
      BEGIN
        v_strategy := v_policy.tier_strategy;
        v_on_duty  := v_policy.on_duty_required;

        IF v_strategy = 'institution_and_source' THEN
          -- Junction-mapped counselors at this institution + this lead source
          SELECT c.id
            INTO v_counselor_id
            FROM admission_counselors c
            JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
            JOIN admission_counselor_sources cs       ON cs.counselor_id = c.id
            JOIN admission_lead_sources_master slm    ON slm.id = cs.source_id
                                                      AND slm.key = NEW.source::text
            LEFT JOIN admission_leads al ON al.counselor_id = c.id
              AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
           WHERE ci.institution_id = NEW.institution_id
             AND c.is_active = TRUE
             AND (NOT v_on_duty OR fn_is_counselor_on_duty(c.id, CURRENT_DATE))
             AND (
               v_tf_active IS NULL
               OR EXISTS (
                 SELECT 1 FROM profiles p
                  WHERE p.email = c.email AND p.role = ANY(v_tf_allowed_roles)
               )
             )
           GROUP BY c.id
           ORDER BY COUNT(al.id) ASC, RANDOM()
           LIMIT 1;

        ELSIF v_strategy = 'institution_only' THEN
          -- Junction-mapped counselors at this institution (no source filter)
          SELECT c.id
            INTO v_counselor_id
            FROM admission_counselors c
            JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
            LEFT JOIN admission_leads al ON al.counselor_id = c.id
              AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
           WHERE ci.institution_id = NEW.institution_id
             AND c.is_active = TRUE
             AND (NOT v_on_duty OR fn_is_counselor_on_duty(c.id, CURRENT_DATE))
             AND (
               v_tf_active IS NULL
               OR EXISTS (
                 SELECT 1 FROM profiles p
                  WHERE p.email = c.email AND p.role = ANY(v_tf_allowed_roles)
               )
             )
           GROUP BY c.id
           ORDER BY COUNT(al.id) ASC, RANDOM()
           LIMIT 1;

        ELSIF v_strategy = 'institution_legacy_fk' THEN
          -- Legacy: counselors.institution_id FK fallback. Default seed has
          -- on_duty_required=false here for parity with the prior hardcoded
          -- behaviour (Tier 3 didn't call fn_is_counselor_on_duty).
          SELECT c.id
            INTO v_counselor_id
            FROM admission_counselors c
            LEFT JOIN admission_leads al ON al.counselor_id = c.id
              AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
           WHERE c.institution_id = NEW.institution_id
             AND c.is_active = TRUE
             AND (NOT v_on_duty OR fn_is_counselor_on_duty(c.id, CURRENT_DATE))
             AND (
               v_tf_active IS NULL
               OR EXISTS (
                 SELECT 1 FROM profiles p
                  WHERE p.email = c.email AND p.role = ANY(v_tf_allowed_roles)
               )
             )
           GROUP BY c.id
           ORDER BY COUNT(al.id) ASC, RANDOM()
           LIMIT 1;

        ELSIF v_strategy = 'cross_institution_fallback' THEN
          -- Tier-4 cross-institution overflow. Rules-gated: only fires when
          -- the cross_institution_fallback rule is active AND enabled. Default
          -- seed has is_active=false to preserve PR #549's "off by default" stance.
          IF v_cif_active IS TRUE AND v_cif_enabled IS TRUE THEN
            SELECT c.id
              INTO v_counselor_id
              FROM admission_counselors c
              LEFT JOIN admission_leads al ON al.counselor_id = c.id
                AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
             WHERE c.is_active = TRUE
               AND (NOT v_on_duty OR fn_is_counselor_on_duty(c.id, CURRENT_DATE))
               AND (
                 v_tf_active IS NULL
                 OR EXISTS (
                   SELECT 1 FROM profiles p
                    WHERE p.email = c.email AND p.role = ANY(v_tf_allowed_roles)
                 )
               )
             GROUP BY c.id
             ORDER BY COUNT(al.id) ASC, RANDOM()
             LIMIT 1;
          END IF;

        ELSE
          -- Unknown tier_strategy — log it and skip. Prevents silent failure
          -- if a future migration adds a strategy this function doesn't yet
          -- understand. The error surfaces in /admin/counselors/routing-errors.
          INSERT INTO counselor_routing_errors (
            lead_id, institution_id, tier_order,
            error_message, context, resulted_in_unassigned
          ) VALUES (
            NEW.id, NEW.institution_id, v_policy.tier_order,
            format('Unknown tier_strategy in counselor_tier_policy: %s', v_strategy),
            jsonb_build_object(
              'source',         NEW.source::text,
              'institution_id', NEW.institution_id,
              'tier_strategy',  v_strategy,
              'phase',          'tier_dispatch'
            ),
            TRUE
          );
        END IF;

        EXIT WHEN v_counselor_id IS NOT NULL;

      EXCEPTION WHEN OTHERS THEN
        -- Per-tier failure: log + continue to next tier.
        -- Replaces the prior outer-only `WHEN OTHERS THEN v_counselor_id := NULL`
        -- which silently swallowed every routing failure.
        BEGIN
          INSERT INTO counselor_routing_errors (
            lead_id, institution_id, tier_order, sqlstate, error_message,
            context, resulted_in_unassigned
          ) VALUES (
            NEW.id, NEW.institution_id, v_policy.tier_order, SQLSTATE, SQLERRM,
            jsonb_build_object(
              'source',           NEW.source::text,
              'institution_id',   NEW.institution_id,
              'tier_strategy',    v_strategy,
              'on_duty_required', v_on_duty,
              'phase',            'tier_query'
            ),
            TRUE
          );
        EXCEPTION WHEN OTHERS THEN
          -- If even the error-log INSERT fails, swallow rather than block
          -- lead creation. This is the only place silent-swallow is acceptable
          -- (defensive against an unreachable error_log table).
          NULL;
        END;
        v_counselor_id := NULL; -- explicit reset; loop continues
      END;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    -- Outer catch — should rarely fire if per-tier blocks work. Logs the
    -- top-level failure so it's visible in /admin/counselors/routing-errors
    -- instead of vanishing.
    BEGIN
      INSERT INTO counselor_routing_errors (
        lead_id, institution_id, tier_order, sqlstate, error_message,
        context, resulted_in_unassigned
      ) VALUES (
        NEW.id, NEW.institution_id, NULL, SQLSTATE, SQLERRM,
        jsonb_build_object(
          'source',         NEW.source::text,
          'institution_id', NEW.institution_id,
          'phase',          'outer'
        ),
        TRUE
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- defensive: don't block lead creation if logging itself fails
    END;
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
$function$;

COMMENT ON FUNCTION public.fn_auto_assign_counselor_v2() IS
  'BEFORE INSERT trigger: assigns counselor_id by iterating tier policy from fn_get_counselor_tier_policy(institution). Logs failures to counselor_routing_errors. Behaviour identical to prior hardcoded version on day one (seed mirrors hardcoded order); tweakable post-deploy via /admin/counselors/tier-policy.';
