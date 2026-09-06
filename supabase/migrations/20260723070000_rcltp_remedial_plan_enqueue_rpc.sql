-- ============================================================================
-- RCLTP remedial-plan draft loop — Slice 2: enqueue placeholder RPC
-- 2026-07-23 — the Senior-Learner "Draft remedial plan" click path.
-- ----------------------------------------------------------------------------
-- When a Senior Learner asks for a remedial plan, the API route enqueues an AI
-- job on the ₹0 Max lane (async) and writes a durable 'queued' placeholder row
-- so the review console can show "requested — pending" (survives a page reload,
-- prevents a confusing double-request). This function is the ONLY writer of
-- status='queued'; the collect handler flips queued→draft via the existing
-- fn_rcltp_remedial_plan_ai_draft_upsert (whose ON CONFLICT target is the same
-- active-plan partial unique index, so the two compose cleanly).
--
-- Service-role only: the enqueue API route calls it AFTER verifying the caller
-- holds rcltp.review + institution access. Idempotent — a second request while a
-- plan already exists (queued/draft/approved) returns the existing plan id and
-- never clobbers a draft or an approved plan.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_rcltp_remedial_plan_enqueue(
  p_institution_id uuid,
  p_learner_id     uuid,
  p_assessment_id  uuid,
  p_cycle_no       integer,
  p_trigger_reason text,
  p_band           text,
  p_overall        numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.rcltp_remedial_plans AS rp (
    institution_id, learner_id, assessment_id, cycle_no, trigger_reason,
    band_at_trigger, overall_at_trigger, status
  ) VALUES (
    p_institution_id, p_learner_id, p_assessment_id, p_cycle_no, p_trigger_reason,
    p_band, p_overall, 'queued'
  )
  ON CONFLICT (learner_id, cycle_no) WHERE status <> 'archived'
  DO NOTHING
  RETURNING rp.id INTO v_id;

  -- ON CONFLICT DO NOTHING returns no row when a non-archived plan already
  -- exists — fetch its id so the caller (and the enqueued job's _ctx) still
  -- reference the right plan row.
  IF v_id IS NULL THEN
    SELECT rp2.id INTO v_id
      FROM public.rcltp_remedial_plans rp2
     WHERE rp2.learner_id = p_learner_id
       AND rp2.cycle_no = p_cycle_no
       AND rp2.status <> 'archived'
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_enqueue(uuid,uuid,uuid,integer,text,text,numeric) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_remedial_plan_enqueue(uuid,uuid,uuid,integer,text,text,numeric) TO service_role;

COMMIT;
