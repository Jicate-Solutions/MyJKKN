-- =====================================================================
-- Migration: callback_queue_expiry_policy (M-3 — Brand integrity recovery)
-- Created:   2026-05-03
-- Purpose:   The 528+ pending callbacks in admission_callback_queue have
--            ZERO closures since the system began (per probe-pipeline-2026-05-03.md
--            F5 finding). 370+ are SLA-breached. This is the "we'll call you
--            back" promise with no follow-through mechanism.
--
-- This migration:
--   1. Adds a Director-tunable expiry-days policy to platform_policies
--      (extends the existing pattern — does NOT reinvent).
--   2. Creates fn_expire_stale_callbacks() — single-statement bulk-update
--      that closes pending callbacks past their callback_due_by OR older
--      than the policy-window if no due-by was set.
--   3. Runs a one-shot reconciliation: closes the existing 370+ SLA-breached
--      pending rows so they're not stuck forever. Cron handles the steady
--      state going forward (vercel.json adds /api/cron/callback-queue-expire).
--
-- Director's standing rule (2026-04-29): policy decisions = config rows.
-- The "7-day expiry" lives in platform_policies, not in the function body.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Policy: telephony.callback_queue.expiry_days
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, description)
VALUES (
  'telephony.callback_queue.expiry_days',
  'global',
  NULL,
  to_jsonb(7),
  'Days after creation a pending admission_callback_queue row is auto-expired by fn_expire_stale_callbacks() if no callback_due_by was set OR callback_due_by has passed. Director-tunable — no deploy needed.'
)
ON CONFLICT (policy_key, scope_type, scope_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- fn_expire_stale_callbacks(): bulk-close stale pending entries.
-- Returns a JSON summary so the cron route can log it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_expire_stale_callbacks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expiry_days int;
  v_now timestamptz := now();
  v_cutoff timestamptz;
  v_expired_count int;
BEGIN
  -- Pull policy with safe default. Falls back to 7 if policy missing/invalid.
  SELECT COALESCE((value)::text::int, 7) INTO v_expiry_days
  FROM public.platform_policies
  WHERE policy_key = 'telephony.callback_queue.expiry_days'
    AND scope_type = 'global'
    AND scope_id IS NULL
  LIMIT 1;

  IF v_expiry_days IS NULL OR v_expiry_days <= 0 THEN
    v_expiry_days := 7;
  END IF;

  v_cutoff := v_now - make_interval(days => v_expiry_days);

  -- Two expiry conditions:
  --   (a) callback_due_by IS NOT NULL AND callback_due_by < now()  → SLA breach already past
  --   (b) callback_due_by IS NULL AND created_at < (now() - expiry_days)  → no due-by, fall back to age
  UPDATE public.admission_callback_queue
  SET
    status = 'expired',
    resolution_notes = COALESCE(
      resolution_notes,
      'auto-expired by cron — never resolved (callback_due_by passed or row older than '
        || v_expiry_days::text || ' days)'
    ),
    resolved_at = v_now,
    updated_at = v_now
  WHERE status = 'pending'
    AND (
      (callback_due_by IS NOT NULL AND callback_due_by < v_now)
      OR (callback_due_by IS NULL AND created_at < v_cutoff)
    );

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_count', v_expired_count,
    'expiry_days_used', v_expiry_days,
    'cutoff_used', v_cutoff,
    'ran_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.fn_expire_stale_callbacks() IS
  'Bulk-close pending admission_callback_queue rows that are SLA-breached (callback_due_by < now) OR older than telephony.callback_queue.expiry_days policy. Idempotent. Called by /api/cron/callback-queue-expire hourly. Brand integrity recovery — see probe-pipeline-2026-05-03.md F5.';

GRANT EXECUTE ON FUNCTION public.fn_expire_stale_callbacks() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- One-shot reconciliation: close the existing 370+ SLA-breached rows
-- so they're not stuck forever. Idempotent — re-running is safe.
-- ---------------------------------------------------------------------
SELECT public.fn_expire_stale_callbacks();
