-- ============================================================================
-- Maintain admission_counselors.current_leads — trigger + one-shot backfill
--
-- Why this migration exists:
--   The current_leads column has been on admission_counselors since the table
--   was created, but no trigger ever maintained it. Every counselor row had
--   current_leads = 0 even when they held thousands of active leads. This
--   silently fed incorrect data into:
--     - Counselors-tab UI ("Load 0/500" lying to admins)
--     - DistributePanel picker (load preview useless)
--     - fn_auto_assign_counselor_v3 routing engine (cap enforcement broken
--       because current_leads always 0)
--     - bulk_round_robin_assign cap probe (same)
--     - _pick_counselor_for_source weight-load ordering (always 0/weight)
--
--   "Active" = funnel_stage NOT IN ('lost', 'enrolled', 'confirmed',
--   'not_reachable'). Hardcoded rather than per-institution dynamic for
--   trigger performance and to match what most non-trigger code assumes.
--
-- Approach:
--   - SECURITY DEFINER trigger fires AFTER INSERT/UPDATE OF counselor_id,
--     funnel_stage / DELETE on admission_leads. Recomputes the counter for
--     any counselor referenced in OLD or NEW.
--   - One-shot backfill at the end recomputes every counselor's
--     current_leads from actual admission_leads rows.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Trigger function: recompute current_leads for the affected counselor(s)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_counselor_current_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_ids uuid[] := ARRAY[]::uuid[];
  v_counselor    uuid;
BEGIN
  -- Collect counselor IDs that need recompute (NEW side for INSERT/UPDATE,
  -- OLD side for UPDATE/DELETE). Dedup via DISTINCT.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.counselor_id IS NOT NULL THEN
    v_affected_ids := array_append(v_affected_ids, NEW.counselor_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.counselor_id IS NOT NULL THEN
    v_affected_ids := array_append(v_affected_ids, OLD.counselor_id);
  END IF;

  -- Dedup
  SELECT array_agg(DISTINCT x) INTO v_affected_ids
  FROM unnest(v_affected_ids) x WHERE x IS NOT NULL;

  -- Nothing to do if no counselor was on either side
  IF v_affected_ids IS NULL OR array_length(v_affected_ids, 1) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recompute for each affected counselor
  FOREACH v_counselor IN ARRAY v_affected_ids LOOP
    UPDATE admission_counselors c
       SET current_leads = (
         SELECT COUNT(*)
         FROM admission_leads l
         WHERE l.counselor_id = v_counselor
           AND l.funnel_stage NOT IN ('lost', 'enrolled', 'confirmed', 'not_reachable')
       )
     WHERE c.id = v_counselor;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.update_counselor_current_leads() IS
  'Maintains admission_counselors.current_leads as a denormalized count of non-terminal-stage leads per counselor. SECURITY DEFINER so RLS does not strangle the COUNT(*) (per project memory feedback_denormalized_counter_triggers_need_security_definer.md).';

-- ----------------------------------------------------------------------------
-- Trigger: fire only when relevant columns change (perf optimization)
-- Two separate triggers because Postgres requires the OF column-list to live
-- on the same trigger as a single-event spec; INSERT/DELETE don't take OF.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_maintain_counselor_current_leads ON admission_leads;
DROP TRIGGER IF EXISTS trg_maintain_counselor_current_leads_update ON admission_leads;

CREATE TRIGGER trg_maintain_counselor_current_leads
AFTER INSERT OR DELETE ON admission_leads
FOR EACH ROW EXECUTE FUNCTION update_counselor_current_leads();

CREATE TRIGGER trg_maintain_counselor_current_leads_update
AFTER UPDATE OF counselor_id, funnel_stage ON admission_leads
FOR EACH ROW EXECUTE FUNCTION update_counselor_current_leads();

-- ----------------------------------------------------------------------------
-- One-shot backfill: recompute every counselor's current_leads now.
-- Safe to re-run; idempotent.
-- ----------------------------------------------------------------------------
UPDATE admission_counselors c
   SET current_leads = COALESCE((
     SELECT COUNT(*)
     FROM admission_leads l
     WHERE l.counselor_id = c.id
       AND l.funnel_stage NOT IN ('lost', 'enrolled', 'confirmed', 'not_reachable')
   ), 0);

COMMIT;
