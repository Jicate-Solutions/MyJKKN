-- =====================================================================
-- Meta Subscription Audit table
-- Receipt: feedback_meta_2_level_webhook_subscription_required +
--          feedback_meta_system_user_app_must_match_webhook_app.
-- Purpose: cron-written snapshots of subscribed_apps state per Page and
--          per linked IG account, plus App-level subscription state and
--          /debug_token snapshot. Powers drift alerts + the /admin/social
--          Subscribed Assets panel "last drift check" badge.
--
-- Written by: feat/meta-subscription-drift-cron (2026-06-08)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meta_subscription_audit (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                      UUID NOT NULL,
  checked_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  asset_type                  TEXT NOT NULL CHECK (asset_type IN ('page','ig')),
  asset_id                    TEXT NOT NULL,
  asset_name                  TEXT NULL,
  subscribed_app_ids          TEXT[] NOT NULL DEFAULT '{}',
  subscribed_app_names        TEXT[] NOT NULL DEFAULT '{}',
  verdict                     TEXT NOT NULL CHECK (verdict IN ('healthy','drift','empty')),
  drift_reason                TEXT NULL,
  app_subscription_active     BOOLEAN NULL,
  token_debug_app_id          TEXT NULL,
  token_debug_is_valid        BOOLEAN NULL,
  token_debug_expires_at      TIMESTAMPTZ NULL,
  raw                         JSONB NULL,
  error                       TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_subscription_audit_run_id
  ON public.meta_subscription_audit (run_id);
CREATE INDEX IF NOT EXISTS idx_meta_subscription_audit_checked_at
  ON public.meta_subscription_audit (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_subscription_audit_asset_time
  ON public.meta_subscription_audit (asset_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_subscription_audit_drift
  ON public.meta_subscription_audit (checked_at DESC) WHERE verdict = 'drift';

COMMENT ON TABLE public.meta_subscription_audit IS
  'Snapshot per asset (Facebook Page or linked IG) per cron run of Meta-side '
  'subscribed_apps state, App-level subscription state, and /debug_token. '
  'Drives /api/cron/meta-subscription-drift-check alerting.';

ALTER TABLE public.meta_subscription_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_subscription_audit_select ON public.meta_subscription_audit;
CREATE POLICY meta_subscription_audit_select ON public.meta_subscription_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.role IN ('super_admin','administrator'))
    )
  );

-- Writes via service_role only (bypasses RLS). No INSERT/UPDATE/DELETE
-- policies (would shadow service-role bypass — see fb_pages substrate
-- 20260530160000 comments).
