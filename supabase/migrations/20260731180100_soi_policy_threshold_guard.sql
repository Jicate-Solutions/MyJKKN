-- ============================================================================
-- Migration: 20260731180100_soi_policy_threshold_guard
-- School of Influence — S1 · config substrate, validation guards
-- Spec: specs/school-of-influence-batches-2026-07-30.md §4 (last paragraph), §7 (S1)
-- ============================================================================
-- Enforces, in the DATABASE, the three rules spec §4 states:
--     soi.inactivity.nudge_days < soi.inactivity.pause_days < soi.inactivity.remove_days
--     0 < soi.completion.min_attendance_pct <= 100
--     soi.batch_capacity >= 1
--
-- WHY A TRIGGER AND NOT ONLY validation_schema
--   validation_schema is carried on the seeded rows (see the seed migration) so
--   the S2 editor can render client-side hints, but NOTHING in the repository
--   reads that column today (grepped 2026-07-30: zero readers). A rule that only
--   lives in an unread JSON column is decoration. The trigger below is the part
--   that actually cannot be bypassed — including by a direct SQL edit or a
--   service-role write.
--
-- WHY *AFTER* AND NOT *BEFORE*
--   nudge < pause < remove is a CROSS-ROW rule. A BEFORE ... FOR EACH ROW
--   trigger cannot see the sibling rows inserted by the same statement, so the
--   15-row seed would trip on its own first row. PostgreSQL queues AFTER ROW
--   triggers until the statement completes, so every sibling is visible. The
--   guard additionally SKIPS whenever a sibling is absent, which makes the seed
--   insert-order-independent and lets a partially-configured programme fall back
--   to the caller's code default without a spurious failure.
--
-- WHY IT RESOLVES THE *EFFECTIVE* VALUE
--   A per-batch override may set only pause_days while nudge_days stays at the
--   programme-wide default (scope_id IS NULL). Comparing only same-scope rows
--   would let batch pause=3 sit under default nudge=7 and never complain. The
--   guard therefore mirrors fn_get_policy's cohort precedence: exact scope first,
--   programme-wide cohort default as fallback.
--
-- SECURITY DEFINER is required: the guard must see the true sibling rows even
-- when the editing session's RLS would hide them, otherwise a hidden sibling
-- would make the rule silently pass. Trigger functions are exempt from the
-- anon-revoke CI gate (they cannot be invoked over PostgREST), but the revoke is
-- asserted anyway per CLAUDE.md's mandatory template.
--
-- Idempotent. Safe to re-apply. No data is written or deleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_soi_policy_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nudge   numeric;
  v_pause   numeric;
  v_remove  numeric;
  v_value   numeric;
BEGIN
  -- Only School of Influence rows are governed here. Everything else passes
  -- straight through, so this trigger cannot affect the other 544 policy rows.
  IF COALESCE(NEW.policy_key, '') NOT LIKE 'soi.%' THEN
    RETURN NULL;
  END IF;

  -- ---- rule 3: soi.batch_capacity >= 1 -----------------------------------
  IF NEW.policy_key = 'soi.batch_capacity' THEN
    v_value := (NEW.value #>> '{}')::numeric;
    IF v_value IS NULL OR v_value < 1 THEN
      RAISE EXCEPTION
        'soi.batch_capacity must be at least 1 (got %). A batch that holds nobody cannot be applied to.',
        COALESCE(v_value::text, 'null')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- ---- rule 2: 0 < soi.completion.min_attendance_pct <= 100 --------------
  IF NEW.policy_key = 'soi.completion.min_attendance_pct' THEN
    v_value := (NEW.value #>> '{}')::numeric;
    IF v_value IS NULL OR v_value <= 0 OR v_value > 100 THEN
      RAISE EXCEPTION
        'soi.completion.min_attendance_pct must be greater than 0 and at most 100 (got %).',
        COALESCE(v_value::text, 'null')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- ---- rule 1: nudge_days < pause_days < remove_days ----------------------
  -- Fires for any of the three keys, and re-derives all three EFFECTIVE values
  -- with fn_get_policy's cohort precedence (exact scope, else cohort default).
  IF NEW.policy_key IN ('soi.inactivity.nudge_days',
                        'soi.inactivity.pause_days',
                        'soi.inactivity.remove_days') THEN

    WITH candidate AS (
      SELECT p.policy_key,
             (p.value #>> '{}')::numeric AS num,
             ROW_NUMBER() OVER (
               PARTITION BY p.policy_key
               ORDER BY (p.scope_type = NEW.scope_type
                         AND p.scope_id IS NOT DISTINCT FROM NEW.scope_id) DESC
             ) AS rnk
      FROM platform_policies p
      WHERE p.is_active = true
        AND p.policy_key IN ('soi.inactivity.nudge_days',
                             'soi.inactivity.pause_days',
                             'soi.inactivity.remove_days')
        AND (
          (p.scope_type = NEW.scope_type AND p.scope_id IS NOT DISTINCT FROM NEW.scope_id)
          OR (p.scope_type = 'cohort' AND p.scope_id IS NULL)
        )
    )
    SELECT max(num) FILTER (WHERE policy_key = 'soi.inactivity.nudge_days'),
           max(num) FILTER (WHERE policy_key = 'soi.inactivity.pause_days'),
           max(num) FILTER (WHERE policy_key = 'soi.inactivity.remove_days')
      INTO v_nudge, v_pause, v_remove
      FROM candidate
     WHERE rnk = 1;

    -- Skip silently while a sibling is absent: the reader falls back to the
    -- caller's code default and there is nothing to compare yet.
    IF v_nudge IS NOT NULL AND v_pause IS NOT NULL AND v_nudge >= v_pause THEN
      RAISE EXCEPTION
        'soi.inactivity.nudge_days (%) must be smaller than soi.inactivity.pause_days (%). '
        'The reminder has to arrive before access is paused.',
        v_nudge, v_pause
        USING ERRCODE = '23514';
    END IF;

    IF v_pause IS NOT NULL AND v_remove IS NOT NULL AND v_pause >= v_remove THEN
      RAISE EXCEPTION
        'soi.inactivity.pause_days (%) must be smaller than soi.inactivity.remove_days (%). '
        'Access has to be paused before anyone is removed from the batch.',
        v_pause, v_remove
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL; -- AFTER ROW trigger: the return value is ignored.
END;
$function$;

COMMENT ON FUNCTION public.fn_guard_soi_policy_thresholds() IS
  'AFTER-row guard on platform_policies enforcing the School of Influence §4 rules: '
  'nudge_days < pause_days < remove_days, 0 < min_attendance_pct <= 100, batch_capacity >= 1. '
  'Only inspects policy_key LIKE ''soi.%''.';

REVOKE EXECUTE ON FUNCTION public.fn_guard_soi_policy_thresholds() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_guard_soi_policy_thresholds() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_soi_policy_thresholds ON public.platform_policies;

CREATE TRIGGER trg_guard_soi_policy_thresholds
  AFTER INSERT OR UPDATE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_soi_policy_thresholds();

-- ROLLBACK (down migration):
--   DROP TRIGGER IF EXISTS trg_guard_soi_policy_thresholds ON public.platform_policies;
--   DROP FUNCTION IF EXISTS public.fn_guard_soi_policy_thresholds();
