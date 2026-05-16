-- Phase 8a-Full follow-up to PR #593 (Agent G).
-- Wires fn_flush_queued_leads + fn_cascade_off_duty_counselors to consume
-- counselor_routing_config via get_routing_config(text). PR #593 shipped the
-- foundation but deferred the consumer rewrite; without this, Director's UI
-- edits at /admin/counselors/routing-config would update the table but the
-- routing engine would still use hardcoded constants.
--
-- After this migration:
--   - fn_flush_queued_leads reads cap_per_run.max_assignments (was hardcoded LIMIT 500)
--   - fn_cascade_off_duty_counselors reads cascade_after_minutes.minutes (was COALESCE current_setting fallback 60)
--
-- Behavior unchanged at deploy: seeds in PR #593 match prior hardcoded values
-- (cap_per_run.max_assignments=500, cascade_after_minutes.minutes=60).

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
  -- Read cap from counselor_routing_config (Director-tweakable via UI, no deploy).
  -- Fallback to 500 (prior hardcoded value) if config row missing.
  v_cap := COALESCE((get_routing_config('cap_per_run')->>'max_assignments')::INT, 500);

  FOR v_lead IN
    SELECT al.id AS lead_id, al.institution_id, al.source
    FROM admission_leads al
    WHERE al.counselor_id IS NULL
      AND al.funnel_stage IN ('new','contacted','not_reachable','interested','follow_up_scheduled')
      AND al.institution_id IS NOT NULL
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
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier2_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier3_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
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

CREATE OR REPLACE FUNCTION public.fn_cascade_off_duty_counselors()
 RETURNS TABLE(lead_id uuid, from_counselor_id uuid, to_counselor_id uuid, reassigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold_min    INT;
  v_lead             RECORD;
  v_new_counselor_id UUID;
  v_off_duty_since   TIMESTAMPTZ;
BEGIN
  -- Read cascade threshold from counselor_routing_config (Director-tweakable
  -- via UI, no deploy). Fallback to 60 (prior hardcoded fallback).
  v_threshold_min := COALESCE(
    (get_routing_config('cascade_after_minutes')->>'minutes')::INT,
    60
  );

  FOR v_lead IN
    SELECT
      al.id              AS lead_id,
      al.institution_id,
      al.source,
      al.counselor_id    AS from_counselor_id
    FROM admission_leads al
    WHERE al.counselor_id IS NOT NULL
      AND al.funnel_stage NOT IN (
        'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
      )
      AND fn_get_off_duty_since(al.counselor_id) IS NOT NULL
      AND fn_get_off_duty_since(al.counselor_id) < (now() - (v_threshold_min || ' minutes')::INTERVAL)
    ORDER BY fn_get_off_duty_since(al.counselor_id) ASC
  LOOP
    v_off_duty_since := fn_get_off_duty_since(v_lead.from_counselor_id);

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
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND c.id != v_lead.from_counselor_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier2_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND c.id != v_lead.from_counselor_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier3_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE c.institution_id = v_lead.institution_id
          AND c.id != v_lead.from_counselor_id
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
        SET counselor_id = v_new_counselor_id,
            assigned_at  = now()
      WHERE id = v_lead.lead_id;

      INSERT INTO admission_lead_cascade_history (
        lead_id,
        from_counselor_id,
        to_counselor_id,
        reason,
        cascaded_at,
        triggered_by,
        metadata
      ) VALUES (
        v_lead.lead_id,
        v_lead.from_counselor_id,
        v_new_counselor_id,
        'off_duty_' || v_threshold_min || 'min',
        now(),
        NULL,
        jsonb_build_object(
          'threshold_min',   v_threshold_min,
          'off_duty_since',  v_off_duty_since,
          'source',          v_lead.source::text,
          'institution_id',  v_lead.institution_id
        )
      );

      INSERT INTO admission_counselors_audit_log (
        action_type,
        actor_user_id,
        actor_name,
        counselor_id,
        old_value,
        new_value,
        description,
        metadata
      ) VALUES (
        'cascade_reassignment',
        NULL,
        'system_cron',
        v_lead.from_counselor_id,
        jsonb_build_object('counselor_id', v_lead.from_counselor_id, 'lead_id', v_lead.lead_id),
        jsonb_build_object('counselor_id', v_new_counselor_id,       'lead_id', v_lead.lead_id),
        'Off-duty cascade: lead reassigned after ' || v_threshold_min || ' min threshold (duty-log precise)',
        jsonb_build_object(
          'threshold_min',  v_threshold_min,
          'off_duty_since', v_off_duty_since
        )
      );

      lead_id           := v_lead.lead_id;
      from_counselor_id := v_lead.from_counselor_id;
      to_counselor_id   := v_new_counselor_id;
      reassigned_at     := now();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
