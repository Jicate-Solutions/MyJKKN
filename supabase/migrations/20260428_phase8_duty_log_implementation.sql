-- 20260428_phase8_duty_log_implementation.sql
-- Phase 8 of admission counselor rules-engine spec (#559)
-- Ships:
--   1. NEW TABLE admission_counselor_duty_log
--   2. TRIGGER trg_admission_counselors_duty_log_on_active_flip (on admission_counselors AFTER UPDATE)
--   3. TRIGGER trg_admission_counselor_schedules_duty_log (on admission_counselor_schedules AFTER INSERT/UPDATE)
--   4. TRIGGER trg_hr_leave_applications_duty_log (on hr_leave_applications AFTER INSERT/UPDATE)
--   5. NEW FUNCTION fn_get_off_duty_since(p_counselor_id UUID) RETURNS TIMESTAMPTZ
--   6. REFACTORED fn_cascade_off_duty_counselors — replaces idle-time approximation with duty-log precision
--   7. BACKFILL: synthetic 'on_duty' rows for all currently active counselors
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--             DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- TODO (next session): 90-day retention cron with most-recent-per-counselor carve-out.
--   Pattern: DELETE FROM admission_counselor_duty_log
--             WHERE event_at < now() - interval '90 days'
--               AND id NOT IN (
--                 SELECT DISTINCT ON (counselor_id) id
--                 FROM admission_counselor_duty_log
--                 ORDER BY counselor_id, event_at DESC
--               );
-- ============================================================================

-- ============================================================================
-- SECTION 1: TABLE admission_counselor_duty_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_counselor_duty_log (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counselor_id    UUID        NOT NULL REFERENCES public.admission_counselors(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('on_duty', 'off_duty')),
  event_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT        NOT NULL CHECK (reason IN (
    'schedule_change',
    'emergency_off',
    'hr_leave',
    'is_active_flip',
    'backfill_init'
  )),
  source_user_id  UUID        NULL REFERENCES auth.users(id),
  metadata        JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index: primary lookup path for fn_get_off_duty_since
CREATE INDEX IF NOT EXISTS admission_counselor_duty_log_counselor_event_at_idx
  ON public.admission_counselor_duty_log (counselor_id, event_at DESC);

-- ============================================================================
-- SECTION 2: RLS on admission_counselor_duty_log
-- ============================================================================

ALTER TABLE public.admission_counselor_duty_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "duty_log_select_admin_or_perm" ON public.admission_counselor_duty_log;
CREATE POLICY "duty_log_select_admin_or_perm"
  ON public.admission_counselor_duty_log FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.counselors.duty_log.view')
    OR user_has_permission('admission.counselors.view')
  );

-- Service role handles inserts from triggers (SECURITY DEFINER bypasses RLS anyway)
DROP POLICY IF EXISTS "duty_log_insert_service_role" ON public.admission_counselor_duty_log;
CREATE POLICY "duty_log_insert_service_role"
  ON public.admission_counselor_duty_log FOR INSERT
  WITH CHECK (true);  -- trigger functions are SECURITY DEFINER; additional gate at function level

-- ============================================================================
-- SECTION 3: TRIGGER FUNCTION — admission_counselors IS_ACTIVE / EMERGENCY_OFF flips
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_trg_counselors_duty_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: avoid recursion from nested triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- is_active flipped FALSE → off_duty
    IF (TG_OP = 'UPDATE')
       AND (OLD.is_active IS DISTINCT FROM NEW.is_active)
       AND NEW.is_active = FALSE THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.id, 'off_duty', now(), 'is_active_flip', auth.uid(),
         jsonb_build_object('previous_is_active', OLD.is_active));
    END IF;

    -- is_active flipped TRUE → on_duty
    IF (TG_OP = 'UPDATE')
       AND (OLD.is_active IS DISTINCT FROM NEW.is_active)
       AND NEW.is_active = TRUE THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.id, 'on_duty', now(), 'is_active_flip', auth.uid(),
         jsonb_build_object('previous_is_active', OLD.is_active));
    END IF;

    -- emergency_off_today flipped TRUE → off_duty
    IF (TG_OP = 'UPDATE')
       AND (OLD.emergency_off_today IS DISTINCT FROM NEW.emergency_off_today)
       AND NEW.emergency_off_today = TRUE THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.id, 'off_duty', now(), 'emergency_off', auth.uid(),
         jsonb_build_object(
           'emergency_off_set_at', NEW.emergency_off_set_at
         ));
    END IF;

    -- emergency_off_today flipped FALSE → on_duty
    IF (TG_OP = 'UPDATE')
       AND (OLD.emergency_off_today IS DISTINCT FROM NEW.emergency_off_today)
       AND NEW.emergency_off_today = FALSE THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.id, 'on_duty', now(), 'emergency_off', auth.uid(),
         jsonb_build_object(
           'cleared_at', now()
         ));
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: duty_log insert must NEVER break an admission_counselors UPDATE
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admission_counselors_duty_log_on_active_flip ON public.admission_counselors;
CREATE TRIGGER trg_admission_counselors_duty_log_on_active_flip
  AFTER UPDATE OF is_active, emergency_off_today
  ON public.admission_counselors
  FOR EACH ROW
  EXECUTE FUNCTION fn_trg_counselors_duty_log();

-- ============================================================================
-- SECTION 4: TRIGGER FUNCTION — admission_counselor_schedules is_working flips
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_trg_schedules_duty_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_dow SMALLINT;
BEGIN
  -- Guard: avoid recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_today_dow := EXTRACT(dow FROM CURRENT_DATE)::SMALLINT;

    -- Only act if this schedule row is for today's day_of_week
    IF NEW.day_of_week != v_today_dow THEN
      RETURN NEW;
    END IF;

    -- Check effective window covers today
    IF NOT (
      NEW.effective_from <= CURRENT_DATE
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= CURRENT_DATE)
    ) THEN
      RETURN NEW;
    END IF;

    -- is_working changed or newly inserted as FALSE → off_duty
    IF (TG_OP = 'INSERT' AND NEW.is_working = FALSE)
       OR (TG_OP = 'UPDATE' AND OLD.is_working IS DISTINCT FROM NEW.is_working AND NEW.is_working = FALSE) THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.counselor_id, 'off_duty', now(), 'schedule_change', auth.uid(),
         jsonb_build_object(
           'schedule_id',    NEW.id,
           'day_of_week',    NEW.day_of_week,
           'effective_from', NEW.effective_from,
           'effective_to',   NEW.effective_to
         ));
    END IF;

    -- is_working changed or newly inserted as TRUE → on_duty
    IF (TG_OP = 'INSERT' AND NEW.is_working = TRUE)
       OR (TG_OP = 'UPDATE' AND OLD.is_working IS DISTINCT FROM NEW.is_working AND NEW.is_working = TRUE) THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (NEW.counselor_id, 'on_duty', now(), 'schedule_change', auth.uid(),
         jsonb_build_object(
           'schedule_id',    NEW.id,
           'day_of_week',    NEW.day_of_week,
           'effective_from', NEW.effective_from,
           'effective_to',   NEW.effective_to
         ));
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: schedule writes must never fail due to duty_log errors
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admission_counselor_schedules_duty_log ON public.admission_counselor_schedules;
CREATE TRIGGER trg_admission_counselor_schedules_duty_log
  AFTER INSERT OR UPDATE OF is_working
  ON public.admission_counselor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION fn_trg_schedules_duty_log();

-- ============================================================================
-- SECTION 5: TRIGGER FUNCTION — hr_leave_applications status changes
-- Only fires for counselors (guards against non-counselor leaves via email join)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_trg_hr_leave_applications_duty_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counselor_id UUID;
BEGIN
  -- Guard: avoid recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Resolve counselor_id from the HR employee's email
    -- Only proceeds if this employee is a registered counselor
    SELECT ac.id INTO v_counselor_id
    FROM admission_counselors ac
    JOIN hr_employees he ON he.email = ac.email
    WHERE he.id = NEW.employee_id
    LIMIT 1;

    -- Not a counselor → no-op (most leaves won't match)
    IF v_counselor_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Status newly set to 'approved' → off_duty
    IF NEW.status = 'approved'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (v_counselor_id, 'off_duty', now(), 'hr_leave', auth.uid(),
         jsonb_build_object(
           'leave_application_id', NEW.id,
           'start_date',           NEW.start_date,
           'end_date',             NEW.end_date,
           'leave_type_id',        NEW.leave_type_id
         ));
    END IF;

    -- Status changed away from 'approved' (cancelled/rejected after approval) → on_duty
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'approved'
       AND NEW.status != 'approved' THEN
      INSERT INTO admission_counselor_duty_log
        (counselor_id, event_type, event_at, reason, source_user_id, metadata)
      VALUES
        (v_counselor_id, 'on_duty', now(), 'hr_leave', auth.uid(),
         jsonb_build_object(
           'leave_application_id', NEW.id,
           'reverted_from_status', OLD.status,
           'new_status',           NEW.status
         ));
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: HR leave writes must never fail due to duty_log errors
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_leave_applications_duty_log ON public.hr_leave_applications;
CREATE TRIGGER trg_hr_leave_applications_duty_log
  AFTER INSERT OR UPDATE OF status
  ON public.hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION fn_trg_hr_leave_applications_duty_log();

-- ============================================================================
-- SECTION 6: HELPER fn_get_off_duty_since
-- Returns event_at of most recent off_duty event for counselor,
-- or NULL if the most recent event is on_duty (i.e., currently on-duty).
-- SECURITY DEFINER so cascade cron (service_role) can call it.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_off_duty_since(p_counselor_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_type TEXT;
  v_latest_at   TIMESTAMPTZ;
BEGIN
  SELECT event_type, event_at
    INTO v_latest_type, v_latest_at
  FROM admission_counselor_duty_log
  WHERE counselor_id = p_counselor_id
  ORDER BY event_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- No log rows → no duty history → treat as on-duty (fail-open)
    RETURN NULL;
  END IF;

  IF v_latest_type = 'off_duty' THEN
    RETURN v_latest_at;
  ELSE
    -- Latest event is on_duty → counselor is currently on-duty
    RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_get_off_duty_since(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_get_off_duty_since(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_get_off_duty_since(UUID) TO authenticated;

-- ============================================================================
-- SECTION 7: REFACTOR fn_cascade_off_duty_counselors
-- Replaces idle-time approximation with duty-log precision.
-- Predicate changes:
--   OLD: NOT fn_is_counselor_on_duty() AND lead_idle >= threshold
--   NEW: fn_get_off_duty_since(counselor_id) IS NOT NULL
--        AND fn_get_off_duty_since(counselor_id) < (now() - threshold_min)
-- Keeps fn_is_counselor_on_duty() as belt-and-suspenders guard on replacement candidates.
-- Drops admission_call_logs idle-time heuristic.
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
  v_off_duty_since   TIMESTAMPTZ;
BEGIN
  -- Read threshold from session setting; default 60 min (spec decision #5)
  v_threshold_min := COALESCE(
    current_setting('app.counselor_cascade_threshold_min', true)::INT,
    60
  );

  -- Find open leads whose assigned counselor has been off-duty for >= threshold minutes
  -- per the duty-log (precise timestamp, not the idle-lead heuristic).
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
      -- Counselor must have an off_duty event as their most recent duty-log entry
      AND fn_get_off_duty_since(al.counselor_id) IS NOT NULL
      -- And that off-duty timestamp must be older than the threshold
      AND fn_get_off_duty_since(al.counselor_id) < (now() - (v_threshold_min || ' minutes')::INTERVAL)
    ORDER BY fn_get_off_duty_since(al.counselor_id) ASC  -- earliest off-duty first
  LOOP
    -- Capture off_duty_since for audit metadata
    v_off_duty_since := fn_get_off_duty_since(v_lead.from_counselor_id);

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

      -- Audit log: record the cascade event with precise off-duty timestamp
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
          'threshold_min',   v_threshold_min,
          'off_duty_since',  v_off_duty_since,
          'source',          v_lead.source::text,
          'institution_id',  v_lead.institution_id
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
        'Off-duty cascade: lead reassigned after ' || v_threshold_min || ' min threshold (duty-log precise)',
        jsonb_build_object(
          'threshold_min',  v_threshold_min,
          'off_duty_since', v_off_duty_since
        )
      );

      -- Return this reassignment to the cron caller
      lead_id           := v_lead.lead_id;
      from_counselor_id := v_lead.from_counselor_id;
      to_counselor_id   := v_new_counselor_id;
      reassigned_at     := now();
      RETURN NEXT;
    END IF;
    -- If no replacement found → lead stays with off-duty counselor until someone returns
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_cascade_off_duty_counselors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cascade_off_duty_counselors() TO service_role;

-- ============================================================================
-- SECTION 8: BACKFILL — synthetic on_duty rows for currently active counselors
-- Gives fn_get_off_duty_since a baseline so first cascade tick after migration
-- doesn't cascade everyone (NULL = no log history = on-duty, which is correct).
-- Per spec: no historic backfill, only forward-looking.
-- ============================================================================

INSERT INTO admission_counselor_duty_log
  (counselor_id, event_type, event_at, reason, source_user_id, metadata)
SELECT
  ac.id,
  'on_duty',
  now(),
  'backfill_init',
  NULL,
  jsonb_build_object(
    'backfill_reason', 'Phase 8 migration baseline — counselor was active at migration time',
    'migrated_at',     now()
  )
FROM admission_counselors ac
WHERE ac.is_active = TRUE
  AND ac.emergency_off_today = FALSE
  -- Only insert if no duty_log rows exist yet for this counselor
  AND NOT EXISTS (
    SELECT 1
    FROM admission_counselor_duty_log dl
    WHERE dl.counselor_id = ac.id
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
