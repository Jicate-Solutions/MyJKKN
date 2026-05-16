-- 20260428_routing_engine_v2_phase3.sql
-- Phase 3 of admission counselor rules-engine spec (PR #537)
-- Ships: fn_is_counselor_on_duty + fn_auto_assign_counselor_v2
--        + fn_cascade_off_duty_counselors + fn_flush_queued_leads
-- Replaces trg_admission_leads_auto_assign_counselor with v2 binding.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER. Re-runnable.
-- Reversibility: re-deploy original fn_auto_assign_counselor body from supabase/setup/02_functions.sql.
--
-- TIER-3 LEGACY FALLBACK: Preserves current ~100% routing rate when junction tables
-- (admission_counselor_institutions, admission_counselor_sources, admission_counselor_schedules)
-- are empty (current prod state). As Phase 7 seeds those tables, Tiers 1+2 activate organically.
--
-- SCHEMA REALITY (verified against prod 2026-04-28):
--   - admission_counselors already has: emergency_off_today (boolean), emergency_off_set_at (timestamptz)
--     Phase 2 migration already applied these. No ALTER needed.
--   - admission_leads.source is a lead_source enum (text-castable). No source_id UUID column.
--   - Tier 1 source match: JOIN admission_lead_sources_master ON key = NEW.source::text
--   - hr_leave_applications.employee_id → hr_employees.id; hr_employees.email = admission_counselors.email
--   - admission_lead_cascade_history exists from Phase 2 schema.
-- ============================================================================

-- ============================================================================
-- FUNCTION 1: fn_is_counselor_on_duty
-- Returns FALSE if counselor is off-duty for any of 4 reasons:
--   (a) is_active = FALSE
--   (b) schedule says off-day today (is_working = FALSE, date in effective window)
--   (c) approved HR leave covers today (linked via email → hr_employees → hr_leave_applications)
--   (d) emergency_off_today flag is set
-- Fails OPEN (returns TRUE) on any exception to never block routing.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_is_counselor_on_duty(
  p_counselor_id UUID,
  p_check_date   DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active         BOOLEAN;
  v_emergency_off     BOOLEAN;
  v_schedule_off      BOOLEAN;
  v_on_leave          BOOLEAN;
  v_dow               SMALLINT;
BEGIN
  -- Fail-open wrapper: routing must never block lead creation
  BEGIN
    -- (a) Active check
    SELECT is_active, emergency_off_today
      INTO v_is_active, v_emergency_off
    FROM admission_counselors
    WHERE id = p_counselor_id;

    -- Counselor not found → treat as off-duty (no one to assign to)
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    IF v_is_active = FALSE THEN
      RETURN FALSE;
    END IF;

    -- (d) Emergency-off flag (set by admin, auto-clears at midnight)
    IF v_emergency_off = TRUE THEN
      RETURN FALSE;
    END IF;

    -- (b) Schedule check — day_of_week uses EXTRACT(dow) convention (0=Sun, 6=Sat)
    v_dow := EXTRACT(dow FROM p_check_date)::SMALLINT;

    SELECT EXISTS (
      SELECT 1
      FROM admission_counselor_schedules s
      WHERE s.counselor_id   = p_counselor_id
        AND s.day_of_week    = v_dow
        AND s.is_working     = FALSE
        AND s.effective_from <= p_check_date
        AND (s.effective_to IS NULL OR s.effective_to >= p_check_date)
    ) INTO v_schedule_off;

    IF v_schedule_off THEN
      RETURN FALSE;
    END IF;

    -- (c) HR leave check: counselor.email → hr_employees.id → hr_leave_applications.employee_id
    --     Simplified join; counselors may not have HR employee records — hence LEFT + IS NOT NULL guard.
    SELECT EXISTS (
      SELECT 1
      FROM hr_employees he
      JOIN hr_leave_applications hla ON hla.employee_id = he.id
      JOIN admission_counselors c    ON c.email = he.email
      WHERE c.id        = p_counselor_id
        AND hla.status  = 'approved'
        AND p_check_date BETWEEN hla.start_date AND hla.end_date
    ) INTO v_on_leave;

    IF v_on_leave THEN
      RETURN FALSE;
    END IF;

    RETURN TRUE;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: any unexpected error → assume on-duty so routing continues
    RETURN TRUE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION fn_is_counselor_on_duty(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_is_counselor_on_duty(UUID, DATE) TO service_role;

-- ============================================================================
-- FUNCTION 2: fn_auto_assign_counselor_v2
-- Trigger function (BEFORE INSERT on admission_leads). 3-tier routing:
--   Tier 1: Match institution AND source (both junction tables)
--   Tier 2: Match institution only (admission_counselor_institutions)
--   Tier 3: LEGACY — single-FK admission_counselors.institution_id (current prod behavior)
-- Tie-break: least open leads, then RANDOM().
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auto_assign_counselor_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counselor_id UUID;
BEGIN
  -- Guard 1: Respect explicit assignments (CRM imports, manual overrides)
  IF NEW.counselor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: Can't route without institution
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3-tier routing wrapped in EXCEPTION so routing failures never block lead creation
  BEGIN
    WITH

    -- Tier 1: counselor maps to BOTH this institution AND this lead's source
    -- Source match: map lead_source enum value to sources_master key
    tier1_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
      JOIN admission_counselor_sources cs      ON cs.counselor_id = c.id
      -- Match source via master table key (lead_source enum casts to text matching master.key)
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

    -- Tier 2: counselor maps to this institution (ignores source)
    tier2_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE ci.institution_id = NEW.institution_id
        AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
      GROUP BY c.id
    ),

    -- Tier 3: LEGACY — uses single-FK institution_id on admission_counselors directly
    -- This is IDENTICAL to fn_auto_assign_counselor (pre-v2).
    -- Activates when both junction tables are empty (current prod state).
    tier3_candidates AS (
      SELECT
        c.id,
        COUNT(al.id) AS open_load
      FROM admission_counselors c
      LEFT JOIN admission_leads al ON al.counselor_id = c.id
        AND al.funnel_stage NOT IN (
          'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
        )
      WHERE c.institution_id = NEW.institution_id
        AND c.is_active = TRUE
        -- Note: fn_is_counselor_on_duty not called here for legacy parity.
        -- Schedule/leave constraints only activate via Tiers 1+2 (junction-table path).
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

      -- Tier 3 (legacy): only if both Tier 1 and Tier 2 yielded nothing
      SELECT id, open_load, 3 AS tier FROM tier3_candidates
      WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
        AND NOT EXISTS (SELECT 1 FROM tier2_candidates)

    ) all_tiers
    ORDER BY tier ASC, open_load ASC, RANDOM()
    LIMIT 1;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: routing error → NULL counselor (queue surface)
    v_counselor_id := NULL;
  END;

  IF v_counselor_id IS NOT NULL THEN
    NEW.counselor_id := v_counselor_id;
  END IF;

  -- If still NULL: lead lands in queue (counselor_id IS NULL, funnel_stage='new').
  -- v_institutions_needing_admission_counselors surfaces these for Director.
  -- fn_flush_queued_leads (below) re-routes them every 15 min.

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_auto_assign_counselor_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_auto_assign_counselor_v2() TO service_role;

-- ============================================================================
-- TRIGGER SWAP: Replace v1 binding with v2
-- ============================================================================
DROP TRIGGER IF EXISTS trg_admission_leads_auto_assign_counselor ON admission_leads;

CREATE TRIGGER trg_admission_leads_auto_assign_counselor
  BEFORE INSERT ON admission_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_counselor_v2();

-- ============================================================================
-- FUNCTION 3: fn_cascade_off_duty_counselors
-- Called by cron every 15 min. Finds open leads assigned to counselors who have
-- been off-duty long enough (default 60 min, configurable via app.counselor_cascade_threshold_min).
-- Re-routes them using the same 3-tier logic (excluding the off-duty counselor).
-- Logs each reassignment to admission_lead_cascade_history.
--
-- SIMPLIFICATION NOTE (flagged for Phase 8 follow-up):
--   "Off-duty since" is approximated as: counselor is CURRENTLY off-duty
--   AND the lead was last assigned/updated more than threshold minutes ago
--   AND the lead has had no admission_call_logs activity since assignment.
--   True "off-duty start time" tracking requires a duty-log table (deferred).
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_cascade_off_duty_counselors()
RETURNS TABLE(
  lead_id          UUID,
  from_counselor_id UUID,
  to_counselor_id   UUID,
  reassigned_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold_min    INT;
  v_lead             RECORD;
  v_new_counselor_id UUID;
BEGIN
  -- Read threshold from session setting; default 60 min (spec decision #5)
  v_threshold_min := COALESCE(
    current_setting('app.counselor_cascade_threshold_min', true)::INT,
    60
  );

  -- Find open leads whose assigned counselor is currently off-duty AND
  -- the lead has been idle (no call log activity) for >= threshold minutes.
  -- "Idle since" = GREATEST(al.assigned_at, last_call.created_at); if no calls → al.assigned_at.
  FOR v_lead IN
    SELECT
      al.id              AS lead_id,
      al.institution_id,
      al.source,
      al.counselor_id    AS from_counselor_id,
      COALESCE(
        (SELECT MAX(acl.created_at)
         FROM admission_call_logs acl
         WHERE acl.lead_id = al.id),
        al.assigned_at,
        al.created_at
      )                  AS last_activity
    FROM admission_leads al
    WHERE al.counselor_id IS NOT NULL
      AND al.funnel_stage NOT IN (
        'enrolled','confirmed','declined','withdrew','expired','lost','dormant'
      )
      -- Current counselor is off-duty right now
      AND NOT fn_is_counselor_on_duty(al.counselor_id, CURRENT_DATE)
      -- Lead has been idle for at least threshold minutes
      AND COALESCE(
        (SELECT MAX(acl.created_at)
         FROM admission_call_logs acl
         WHERE acl.lead_id = al.id),
        al.assigned_at,
        al.created_at
      ) < (now() - (v_threshold_min || ' minutes')::INTERVAL)
    ORDER BY last_activity ASC  -- oldest first
  LOOP
    -- Find replacement counselor using same 3-tier logic,
    -- EXCLUDING the current off-duty counselor
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

    -- Only cascade if a replacement was found
    IF v_new_counselor_id IS NOT NULL THEN
      UPDATE admission_leads
        SET counselor_id = v_new_counselor_id,
            assigned_at  = now()
      WHERE id = v_lead.lead_id;

      -- Audit log: record the cascade event
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
        NULL,  -- NULL = system/cron trigger
        jsonb_build_object(
          'threshold_min', v_threshold_min,
          'source',        v_lead.source::text,
          'institution_id', v_lead.institution_id
        )
      );

      -- Also log to admission_counselors_audit_log per spec decision O3
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
        'Off-duty cascade: lead reassigned after ' || v_threshold_min || ' min threshold',
        jsonb_build_object('threshold_min', v_threshold_min)
      );

      -- Return this reassignment to the cron caller
      lead_id           := v_lead.lead_id;
      from_counselor_id := v_lead.from_counselor_id;
      to_counselor_id   := v_new_counselor_id;
      reassigned_at     := now();
      RETURN NEXT;
    END IF;
    -- If no replacement found → lead stays with off-duty counselor until someone returns
    -- (or admin manually reassigns). This is intentional — cross-institution cascade is out of scope.

  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_cascade_off_duty_counselors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cascade_off_duty_counselors() TO service_role;

-- ============================================================================
-- FUNCTION 4: fn_flush_queued_leads
-- Called by cron every 15 min. Finds queued leads (counselor_id IS NULL, open stage)
-- and re-routes them now that counselors may have come on-duty.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_flush_queued_leads()
RETURNS TABLE(
  lead_id              UUID,
  assigned_counselor_id UUID,
  assigned_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead             RECORD;
  v_new_counselor_id UUID;
BEGIN
  FOR v_lead IN
    SELECT al.id AS lead_id, al.institution_id, al.source
    FROM admission_leads al
    WHERE al.counselor_id IS NULL
      AND al.funnel_stage IN ('new','contacted','not_reachable','interested','follow_up_scheduled')
      AND al.institution_id IS NOT NULL
    ORDER BY al.created_at ASC  -- FIFO: oldest queued leads get counselors first
    LIMIT 500  -- safety cap per cron run; next run handles remainder
  LOOP
    -- 3-tier routing (same logic as trigger; extracted inline for clarity)
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
        SET counselor_id = v_new_counselor_id,
            assigned_at  = now()
      WHERE id = v_lead.lead_id;

      -- Log queue flush to cascade history table
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
        NULL,  -- was unassigned
        v_new_counselor_id,
        'queue_flush',
        now(),
        NULL,
        jsonb_build_object('source', v_lead.source::text, 'institution_id', v_lead.institution_id)
      );

      lead_id               := v_lead.lead_id;
      assigned_counselor_id := v_new_counselor_id;
      assigned_at           := now();
      RETURN NEXT;
    END IF;
    -- No counselor available → lead stays queued until next cron run

  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_flush_queued_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_flush_queued_leads() TO service_role;

-- ============================================================================
-- Deprecation comment on max_leads (spec decision #11)
-- ============================================================================
COMMENT ON COLUMN admission_counselors.max_leads IS
  'DEPRECATED 2026-04-28 — no longer used as a routing gate. Kept for display in UI dashboards. See specs/admission-counselor-rules-engine-spec.md decision #11.';
