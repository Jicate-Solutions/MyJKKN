-- ============================================================================
-- ADMISSION MODULE: Activity Alert Tables
-- Created: 2026-02-27
-- Purpose: Stores per-institution alert rule configurations and a history log
--          of triggered alerts. Used by ActivityAlertService and the
--          Activity Alerts counselor page.
-- ============================================================================

-- ── 1. Alert Rules ───────────────────────────────────────────────────────────
-- One row per (institution, event_type). Counselors/admins configure which
-- events trigger notifications and through which channels.

CREATE TABLE IF NOT EXISTS public.activity_alert_rules (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id            uuid        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_type                text        NOT NULL,
  is_enabled                boolean     NOT NULL DEFAULT true,
  notify_assigned_counselor boolean     NOT NULL DEFAULT true,
  notify_additional_users   text[]      NOT NULL DEFAULT '{}',
  notification_channels     text[]      NOT NULL DEFAULT '{PUSH,IN_APP}',
  conditions                jsonb       NOT NULL DEFAULT '{}',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activity_alert_rules_institution_event_unique
    UNIQUE (institution_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_activity_alert_rules_institution
  ON public.activity_alert_rules (institution_id);

CREATE INDEX IF NOT EXISTS idx_activity_alert_rules_enabled
  ON public.activity_alert_rules (institution_id, is_enabled);

-- ── 2. Alert History ─────────────────────────────────────────────────────────
-- Append-only log of every triggered alert notification.

CREATE TABLE IF NOT EXISTS public.activity_alert_history (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id   uuid        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_type       text        NOT NULL,
  lead_id          uuid        REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  lead_name        text        NOT NULL DEFAULT '',
  message          text        NOT NULL DEFAULT '',
  notified_users   text[]      NOT NULL DEFAULT '{}',
  channels_used    text[]      NOT NULL DEFAULT '{}',
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_alert_history_institution
  ON public.activity_alert_history (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_alert_history_lead
  ON public.activity_alert_history (lead_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.activity_alert_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_alert_history  ENABLE ROW LEVEL SECURITY;

-- Helper: resolve caller's institution_id from their profile
-- (reused pattern from rest of admission module)

-- Alert Rules — institution members can read/write their own institution's rules
CREATE POLICY "activity_alert_rules_select"
  ON public.activity_alert_rules FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "activity_alert_rules_insert"
  ON public.activity_alert_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "activity_alert_rules_update"
  ON public.activity_alert_rules FOR UPDATE
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "activity_alert_rules_delete"
  ON public.activity_alert_rules FOR DELETE
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

-- Alert History — read-only for institution members; insert by authenticated users
CREATE POLICY "activity_alert_history_select"
  ON public.activity_alert_history FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "activity_alert_history_insert"
  ON public.activity_alert_history FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- Service validates institution ownership before inserting
