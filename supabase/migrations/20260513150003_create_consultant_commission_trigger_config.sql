-- ============================================================================
-- Consultant Commission Trigger Config — config-row substrate
-- ============================================================================
-- Created: 2026-05-13
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write + reader fn.
-- Zero deploys for future tweaks.
--
-- Purpose
-- -------
-- Today, the decision of WHEN a consultant_commission_transactions row is
-- created lives in TWO places:
--   1. The service-layer method ConsultantService.createCommissionTransaction
--      (lib/services/admission/consultant-service.ts) — manually invoked.
--   2. The call sites in app/(routes)/admission/* that decide which stage
--      transitions on a lead/admission/learner should fire the call.
--
-- Researcher risk #3: if a conversion code path forgets to call the service,
-- the commission row is silently never recorded — there's no DB-side safety net.
--
-- This migration ships the SUBSTRATE that lets a future engine PR (or the
-- optional safety-net trigger below) read trigger policy from a config table
-- instead of code constants. Trigger policy = which lead/admission stage
-- transitions fire commission creation, at what TDS rate, with what
-- auto-approve threshold and clawback grace window.
--
-- Day-1 behavior is UNCHANGED. Seed rows mirror today's manual-only behavior:
--   - `manual` row is the only one with creates_commission=true (used by the
--     service-layer as the source of TDS/auto-approve defaults).
--   - All auto-trigger rows are seeded with creates_commission=false, so no
--     automatic commission rows fire. Director toggles them ON later from UI.
--
-- Optional DB safety-net trigger: not shipped in this migration (deferred to
-- a follow-up PR for clean ownership). The substrate is forward-compatible.
--
-- Companion service:  lib/services/admission/consultant-commission-trigger-service.ts
-- Companion admin UI: app/(routes)/admin/consultants/commission-triggers/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_commission_trigger_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable enum-like key the engine code looks up by. Unique across the table.
  trigger_key                 text NOT NULL,
  display_label               text NOT NULL,
  -- Which entity's status transition fires this trigger.
  source_entity               text NOT NULL CHECK (source_entity IN (
    'admission_lead',
    'learners_profile',
    'manual'
  )),
  -- NULL = any prior status. Specific value = only fire when previous status
  -- matches (e.g. fire 'lead_enrolled' only when prior status was 'admitted').
  source_status_from          text,
  -- Terminal status that fires the trigger. For source_entity='manual', store
  -- a sentinel value like 'manual' (kept NOT NULL for shape consistency).
  source_status_to            text NOT NULL,
  -- Master switch. When false, this row is documented intent but does not
  -- fire automatic commission creation. All auto-trigger rows seed with FALSE
  -- to preserve current manual-only behavior.
  creates_commission          boolean NOT NULL DEFAULT false,
  -- Commission rows below this gross amount auto-flip to status='approved'.
  -- NULL = manual approval always required.
  auto_approve_below_amount   numeric(12, 2),
  -- Default TDS percentage applied at row-creation time. The
  -- consultant_commission_transactions table currently defaults tds_percentage
  -- to 0 (raw DDL in supabase/migrations/admission/003_consultant_tables.sql
  -- :96) — that is today's prevailing behavior. We expose 0.00 as the default
  -- on this config table so seed rows match the current per-row default;
  -- Director can raise it later from the admin UI without a code deploy.
  tds_rate_percent            numeric(5, 2) NOT NULL DEFAULT 0.00,
  -- Clawback grace window: commissions can be reversed for this many days
  -- after creation if the underlying conversion is itself reversed.
  clawback_grace_days         integer NOT NULL DEFAULT 30,
  is_active                   boolean NOT NULL DEFAULT true,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES public.profiles(id),
  CONSTRAINT tds_rate_percent_range CHECK (tds_rate_percent >= 0 AND tds_rate_percent <= 100),
  CONSTRAINT clawback_grace_days_nonneg CHECK (clawback_grace_days >= 0),
  CONSTRAINT auto_approve_nonneg CHECK (auto_approve_below_amount IS NULL OR auto_approve_below_amount >= 0)
);

COMMENT ON TABLE public.consultant_commission_trigger_config IS
  'Director config: WHEN a consultant_commission_transactions row gets created (which entity stage transitions fire it), at what TDS rate, with what auto-approve threshold and clawback grace. Today seeded with all auto-triggers OFF — manual row is the only active source. See migration 20260513150003.';

COMMENT ON COLUMN public.consultant_commission_trigger_config.trigger_key IS
  'Stable lookup key the engine code uses. Unique. Examples: manual, lead_admitted, lead_enrolled, learner_first_payment.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.source_entity IS
  'admission_lead | learners_profile | manual. Determines which table the optional safety-net trigger watches.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.source_status_from IS
  'NULL = any prior status. Set this to scope the trigger to a specific previous-status, e.g. admitted -> enrolled.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.source_status_to IS
  'Terminal status that fires the trigger. For manual rows store ''manual''.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.creates_commission IS
  'Master switch. false = documented intent only, no auto-fire. true = engine/trigger creates a commission row on matching transition. All auto-rows seed false; Director toggles to true from UI to enable.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.auto_approve_below_amount IS
  'Commission rows below this gross amount auto-flip to status=approved on creation. NULL = always require manual approval.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.tds_rate_percent IS
  'Default TDS percent applied when a commission row is created via this trigger. Seeded to 0 to match today''s per-row default; Director raises from UI when ready.';
COMMENT ON COLUMN public.consultant_commission_trigger_config.clawback_grace_days IS
  'Number of days after creation during which a commission can be reversed if the underlying conversion is reversed.';

-- trigger_key must be unique across the table — it's the canonical lookup key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultant_commission_trigger_key
  ON public.consultant_commission_trigger_config (trigger_key);

-- Covering index for the reader fn's hot path: WHERE creates_commission=true AND is_active=true.
CREATE INDEX IF NOT EXISTS idx_consultant_commission_trigger_active
  ON public.consultant_commission_trigger_config (creates_commission, is_active);

-- ---------------------------------------------------------------------------
-- 2) RLS
--    SELECT: any authenticated user (engine code on server reads via service role;
--            UI on client reads via authenticated user).
--    INSERT/UPDATE/DELETE: super_admin only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.consultant_commission_trigger_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_commission_trigger_config_select
  ON public.consultant_commission_trigger_config;
CREATE POLICY consultant_commission_trigger_config_select
  ON public.consultant_commission_trigger_config
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS consultant_commission_trigger_config_write
  ON public.consultant_commission_trigger_config;
CREATE POLICY consultant_commission_trigger_config_write
  ON public.consultant_commission_trigger_config
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- 3) Auto-update updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_consultant_commission_trigger_config_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultant_commission_trigger_config_touch
  ON public.consultant_commission_trigger_config;
CREATE TRIGGER consultant_commission_trigger_config_touch
  BEFORE UPDATE ON public.consultant_commission_trigger_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_consultant_commission_trigger_config_touch();

-- ---------------------------------------------------------------------------
-- 4) Reader fn — resolve the (single) active trigger row for a status transition.
--    Returns the most-specific match: rows with a non-NULL source_status_from
--    that matches `p_from_status` win over rows with source_status_from IS NULL
--    (the wildcard). Returns NULL row when nothing matches OR creates_commission
--    is false (caller treats both the same: do nothing).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_consultant_commission_trigger(
  p_source_entity text,
  p_from_status   text,
  p_to_status     text
)
RETURNS TABLE (
  trigger_key               text,
  creates_commission        boolean,
  auto_approve_below_amount numeric,
  tds_rate_percent          numeric,
  clawback_grace_days       integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    cfg.trigger_key,
    cfg.creates_commission,
    cfg.auto_approve_below_amount,
    cfg.tds_rate_percent,
    cfg.clawback_grace_days
  FROM public.consultant_commission_trigger_config cfg
  WHERE cfg.is_active = true
    AND cfg.creates_commission = true
    AND cfg.source_entity = p_source_entity
    AND cfg.source_status_to = p_to_status
    AND (cfg.source_status_from IS NULL OR cfg.source_status_from = p_from_status)
  ORDER BY
    -- Specific source_status_from beats wildcard NULL.
    CASE WHEN cfg.source_status_from IS NOT NULL THEN 0 ELSE 1 END,
    cfg.updated_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_consultant_commission_trigger(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_consultant_commission_trigger(text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_get_consultant_commission_trigger(text, text, text) IS
  'Returns the active, creates_commission=true trigger row matching (source_entity, from_status, to_status). Specific source_status_from beats wildcard NULL. Empty result = no auto-fire (today''s default).';

-- ---------------------------------------------------------------------------
-- 5) Seed rows — mirror current behavior (manual entry only; auto-triggers OFF)
--    Idempotent: only seeds when the table is empty.
-- ---------------------------------------------------------------------------
INSERT INTO public.consultant_commission_trigger_config (
  trigger_key, display_label, source_entity, source_status_from, source_status_to,
  creates_commission, auto_approve_below_amount, tds_rate_percent, clawback_grace_days,
  is_active, notes
)
SELECT * FROM (VALUES
  (
    'manual', 'Manual entry by staff', 'manual', NULL::text, 'manual',
    true, NULL::numeric, 0.00::numeric, 30,
    true,
    'Default behaviour today: commission rows are created only when staff explicitly invokes ConsultantService.createCommissionTransaction. The tds_rate_percent / auto_approve_below_amount on this row are the defaults the service layer can read instead of hardcoding.'
  ),
  (
    'lead_admitted', 'Lead → Admitted', 'admission_lead', NULL::text, 'admitted',
    false, NULL::numeric, 0.00::numeric, 30,
    true,
    'Seeded OFF to preserve today''s manual-only behavior. Toggle creates_commission ON to auto-fire a commission row when a lead transitions to admitted.'
  ),
  (
    'lead_enrolled', 'Lead → Enrolled', 'admission_lead', 'admitted', 'enrolled',
    false, NULL::numeric, 0.00::numeric, 30,
    true,
    'Seeded OFF. Toggle creates_commission ON to auto-fire when an admitted lead becomes enrolled.'
  ),
  (
    'learner_first_payment', 'Learner first fee paid', 'learners_profile', NULL::text, 'active',
    false, NULL::numeric, 0.00::numeric, 30,
    true,
    'Seeded OFF. Toggle creates_commission ON to auto-fire when a learner profile first becomes active (i.e. first fee paid).'
  )
) AS r(
  trigger_key, display_label, source_entity, source_status_from, source_status_to,
  creates_commission, auto_approve_below_amount, tds_rate_percent, clawback_grace_days,
  is_active, notes
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.consultant_commission_trigger_config
);
