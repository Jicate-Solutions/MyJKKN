-- ============================================================================
-- Phase 7: fn_auto_assign_counselor_v3
-- ============================================================================
-- Goal:
--   Upgrade the BEFORE INSERT auto-assignment trigger so the new junction
--   fields (priority_weight, max_leads_per_day, effective_from/to, is_paused)
--   actually steer routing — and switch the master-join from key→enum_value
--   so custom master rows (created via the Phase 2 UI) are routable.
--
-- What v3 changes vs v2:
--   ONLY the `institution_and_source` tier. Other tiers (institution_only,
--   institution_legacy_fk, cross_institution_fallback) are byte-identical.
--
-- Specifically in the institution_and_source tier:
--   1. JOIN to admission_lead_sources_master uses enum_value = NEW.source
--      (was: key = NEW.source::text — would miss custom master rows whose
--      key doesn't match the enum literal).
--   2. Filter cs.is_paused = false.
--   3. Filter cs.effective_from / effective_to window.
--   4. Filter slm.is_active = true.
--   5. Filter daily cap: cs.max_leads_per_day (today's count from this source
--      to this counselor must be below it).
--   6. ORDER BY weighted load: COUNT(active leads) / MAX(priority_weight),
--      so weight=2.0 counselors receive ~2x the volume of weight=1.0.
--
-- Atomic swap: BEGIN/COMMIT around DROP+CREATE TRIGGER. v2 stays defined so
-- it can be restored manually if v3 misbehaves in production.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_auto_assign_counselor_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counselor_id     UUID;
  v_policy           RECORD;
  v_strategy         TEXT;
  v_on_duty          BOOLEAN;
  v_tf_active        BOOLEAN;
  v_tf_allowed_roles TEXT[];
  v_cif_active       BOOLEAN;
  v_cif_enabled      BOOLEAN;
  v_cif_max_overflow INT;
BEGIN
  IF NEW.counselor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
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

    FOR v_policy IN
      SELECT tier_order, tier_strategy, on_duty_required
        FROM fn_get_counselor_tier_policy(NEW.institution_id)
       ORDER BY tier_order
    LOOP
      BEGIN
        v_strategy := v_policy.tier_strategy;
        v_on_duty  := v_policy.on_duty_required;

        IF v_strategy = 'institution_and_source' THEN
          -- ====================================================================
          -- v3 CHANGE: enum_value join + window/cap/pause + weighted load order
          -- ====================================================================
          SELECT c.id
            INTO v_counselor_id
            FROM admission_counselors c
            JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
            JOIN admission_counselor_sources cs       ON cs.counselor_id = c.id
            JOIN admission_lead_sources_master slm    ON slm.id = cs.source_id
                                                      AND slm.enum_value = NEW.source
                                                      AND slm.is_active = TRUE
            LEFT JOIN admission_leads al ON al.counselor_id = c.id
              AND al.funnel_stage <> ALL(fn_get_terminal_stages(NEW.institution_id))
           WHERE ci.institution_id = NEW.institution_id
             AND c.is_active = TRUE
             AND cs.is_paused = FALSE
             AND (cs.effective_from IS NULL OR cs.effective_from <= now())
             AND (cs.effective_to   IS NULL OR cs.effective_to   >  now())
             AND (NOT v_on_duty OR fn_is_counselor_on_duty(c.id, CURRENT_DATE))
             AND (
               v_tf_active IS NULL
               OR EXISTS (
                 SELECT 1 FROM profiles p
                  WHERE p.email = c.email AND p.role = ANY(v_tf_allowed_roles)
               )
             )
             AND (
               cs.max_leads_per_day IS NULL
               OR (
                 SELECT COUNT(*) FROM admission_leads al2
                  WHERE al2.counselor_id = c.id
                    AND al2.source = NEW.source
                    AND al2.assigned_at >= date_trunc('day', now())
                    AND al2.assigned_at <  date_trunc('day', now()) + interval '1 day'
               ) < cs.max_leads_per_day
             )
           GROUP BY c.id
           ORDER BY
             (COUNT(al.id)::numeric / NULLIF(MAX(cs.priority_weight), 0)) ASC NULLS LAST,
             RANDOM()
           LIMIT 1;

        ELSIF v_strategy = 'institution_only' THEN
          -- (unchanged from v2)
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
          -- (unchanged from v2)
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
          -- (unchanged from v2)
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
              'phase',          'tier_dispatch',
              'fn_version',     'v3'
            ),
            TRUE
          );
        END IF;

        EXIT WHEN v_counselor_id IS NOT NULL;

      EXCEPTION WHEN OTHERS THEN
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
              'phase',            'tier_query',
              'fn_version',       'v3'
            ),
            TRUE
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        v_counselor_id := NULL;
      END;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO counselor_routing_errors (
        lead_id, institution_id, tier_order, sqlstate, error_message,
        context, resulted_in_unassigned
      ) VALUES (
        NEW.id, NEW.institution_id, NULL, SQLSTATE, SQLERRM,
        jsonb_build_object(
          'source',         NEW.source::text,
          'institution_id', NEW.institution_id,
          'phase',          'outer',
          'fn_version',     'v3'
        ),
        TRUE
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    v_counselor_id := NULL;
  END;

  IF v_counselor_id IS NOT NULL THEN
    NEW.counselor_id := v_counselor_id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_auto_assign_counselor_v3() IS
  'BEFORE INSERT trigger for admission_leads. Routes via fn_get_counselor_tier_policy. v3 honors junction is_paused, effective_from/to window, max_leads_per_day daily cap, and priority_weight (weighted load order) in the institution_and_source tier. Other tiers identical to v2.';

-- Atomic trigger swap. v2 remains defined and can be re-pointed manually if needed.
DROP TRIGGER IF EXISTS trg_admission_leads_auto_assign_counselor ON admission_leads;
CREATE TRIGGER trg_admission_leads_auto_assign_counselor
  BEFORE INSERT ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION fn_auto_assign_counselor_v3();

DO $$
BEGIN
  RAISE NOTICE 'Phase 7 routing v3 applied. Trigger trg_admission_leads_auto_assign_counselor now points at fn_auto_assign_counselor_v3.';
END $$;

COMMIT;
