-- 20260511000002_consume_lead_active_stage_policy.sql
-- Phase 2: consumer rewrite for lead-active-stage-policy substrate (PR #750)
--
-- WHY: fn_auto_assign_counselor_v2 (trigger, 4 sites) and fn_flush_queued_leads
-- (cron flusher, 3 sites) had hardcoded `funnel_stage NOT IN ('enrolled',
-- 'confirmed','declined','withdrew','expired','lost','dormant')` filters.
-- This migration replaces all 7 sites with calls to fn_get_terminal_stages(institution_id)
-- so future tweaks become UI clicks via /admin/lead-stages-policy with zero deploy.
--
-- BEHAVIORAL PARITY: fn_get_terminal_stages(NULL) returns
-- {confirmed,declined,dormant,enrolled,expired,lost,withdrew} (alphabetized) —
-- exactly the 7-element hardcoded literal. `<> ALL(array)` is mathematically
-- identical to `NOT IN (literal_list)` when the array contains the same elements.
--
-- SITES REWRITTEN:
--   fn_auto_assign_counselor_v2 (trigger):
--     1. institution_and_source tier — LEFT JOIN admission_leads (line ~127)
--     2. institution_only tier       — LEFT JOIN admission_leads (line ~149)
--     3. institution_legacy_fk tier  — LEFT JOIN admission_leads (line ~172)
--     4. cross_institution_fallback  — LEFT JOIN admission_leads (line ~196)
--   fn_flush_queued_leads (cron flusher):
--     5. tier1_candidates CTE        — LEFT JOIN admission_leads al2
--     6. tier2_candidates CTE        — LEFT JOIN admission_leads al2
--     7. tier3_candidates CTE        — LEFT JOIN admission_leads al2
--
-- SOURCE: fn bodies taken from last-defining migrations:
--   fn_auto_assign_counselor_v2  → 20260507020000_rewrite_fn_auto_assign_counselor_v2_config_driven.sql
--   fn_flush_queued_leads        → 20260502_phase7c_fn_flush_skip_zero_counselor_institutions.sql
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION. Re-runnable.
-- REVERSIBILITY: Re-apply prior migration bodies to revert.
-- ============================================================================

-- ============================================================================
-- FUNCTION 1 of 2: fn_auto_assign_counselor_v2
-- 4 NOT IN sites → 4 <> ALL(fn_get_terminal_stages(NEW.institution_id)) sites
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
              AND al.funnel_stage <> ALL(fn_get_terminal_stages(NEW.institution_id))
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
              AND al.funnel_stage <> ALL(fn_get_terminal_stages(NEW.institution_id))
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
              AND al.funnel_stage <> ALL(fn_get_terminal_stages(NEW.institution_id))
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
                AND al.funnel_stage <> ALL(fn_get_terminal_stages(NEW.institution_id))
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
  'BEFORE INSERT trigger: assigns counselor_id by iterating tier policy from fn_get_counselor_tier_policy(institution). Logs failures to counselor_routing_errors. Terminal-stage exclusion via fn_get_terminal_stages(institution_id) — tweakable via /admin/lead-stages-policy without deploy.';

-- ============================================================================
-- FUNCTION 2 of 2: fn_flush_queued_leads
-- 3 NOT IN sites → 3 <> ALL(fn_get_terminal_stages(v_lead.institution_id)) sites
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_flush_queued_leads()
 RETURNS TABLE(lead_id uuid, assigned_counselor_id uuid, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cap              INT;
  v_lead             RECORD;
  v_new_counselor_id UUID;
BEGIN
  v_cap := COALESCE((get_routing_config('cap_per_run')->>'max_assignments')::INT, 500);

  FOR v_lead IN
    SELECT al.id AS lead_id, al.institution_id, al.source
    FROM admission_leads al
    WHERE al.counselor_id IS NULL
      AND al.funnel_stage IN ('new','contacted','not_reachable','interested','follow_up_scheduled')
      AND al.institution_id IS NOT NULL
      -- Phase 7c fix: skip leads at institutions with 0 active admission_counselors —
      -- otherwise the LIMIT cap exhausts on unroutable leads at unstaffed institutions
      -- and the cron never reaches newer leads at staffed institutions.
      AND EXISTS (
        SELECT 1 FROM admission_counselors c
        WHERE c.institution_id = al.institution_id AND c.is_active = TRUE
      )
    ORDER BY al.created_at ASC
    LIMIT v_cap
  LOOP
    BEGIN
      WITH
      tier1_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        JOIN admission_counselor_sources cs      ON cs.counselor_id = c.id
        JOIN admission_lead_sources_master slm   ON slm.id = cs.source_id
                                               AND slm.key = v_lead.source::text
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage <> ALL(fn_get_terminal_stages(v_lead.institution_id))
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier2_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage <> ALL(fn_get_terminal_stages(v_lead.institution_id))
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier3_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage <> ALL(fn_get_terminal_stages(v_lead.institution_id))
        WHERE c.institution_id = v_lead.institution_id
          AND c.is_active = TRUE
        GROUP BY c.id
      )
      SELECT id INTO v_new_counselor_id
      FROM (
        SELECT id, open_load, 1 AS tier FROM tier1_candidates
        UNION ALL
        SELECT id, open_load, 2 AS tier FROM tier2_candidates WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
        UNION ALL
        SELECT id, open_load, 3 AS tier FROM tier3_candidates
          WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
            AND NOT EXISTS (SELECT 1 FROM tier2_candidates)
      ) all_tiers
      ORDER BY tier ASC, open_load ASC, RANDOM()
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_new_counselor_id := NULL;
    END;

    IF v_new_counselor_id IS NOT NULL THEN
      UPDATE admission_leads
        SET counselor_id = v_new_counselor_id, assigned_at = now()
      WHERE id = v_lead.lead_id;

      INSERT INTO admission_lead_cascade_history (
        lead_id, from_counselor_id, to_counselor_id, reason, cascaded_at, triggered_by, metadata
      ) VALUES (
        v_lead.lead_id, NULL, v_new_counselor_id, 'queue_flush', now(), NULL,
        jsonb_build_object('source', v_lead.source::text, 'institution_id', v_lead.institution_id)
      );

      lead_id               := v_lead.lead_id;
      assigned_counselor_id := v_new_counselor_id;
      assigned_at           := now();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_flush_queued_leads() IS
  'Cron flusher: routes up to cap_per_run unassigned leads. Terminal-stage exclusion via fn_get_terminal_stages(institution_id) — tweakable via /admin/lead-stages-policy without deploy. Phase 7c fix: skips zero-counselor institutions to prevent cap exhaustion.';
