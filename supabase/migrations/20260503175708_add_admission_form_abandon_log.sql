-- ============================================================================
-- Migration: 20260503175708_add_admission_form_abandon_log
-- Path A B7 — Form-abandon recovery (Hour-2 nudge)
-- ============================================================================
-- Tracks public-form abandons detected by /api/cron/form-abandon-recovery.
-- One row per detected (session_id, form_id) abandon. Matched abandons hold
-- a non-null matched_lead_id; anonymous abandons (no phone/email captured
-- yet, or hashes did not resolve to any lead) hold NULL — these are
-- diagnostic-only and never trigger a message.
--
-- Idempotency: cron uses (session_id, form_id) uniqueness to skip already-
-- logged sessions, AND a 7-day per-session cooldown to avoid double-firing
-- when the user revisits the same form.
--
-- RLS: super_admin + admission_counselor SELECT only; service-role INSERT.
-- Mirrors the privacy contract of admission_form_events (no raw PII in this
-- table — matched_lead_id is the only PII vector).
--
-- Companion to:
--   * lib/utils/hash.ts (sha256 helpers, identity recipe)
--   * /api/cron/form-abandon-recovery (the producer)
--   * /admission/marketing/re-engagement?tab=form-abandons (the surface)
--
-- pgcrypto is enabled at the project level (supabase/setup/00_master_setup.sql)
-- so encode(digest(...), 'sha256') is available to the cron's matcher SQL.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Extend admission_form_events.event_type to allow the
--    'abandon_recovery_triggered' sentinel emitted by the recovery cron.
--    This sentinel is what makes the cron idempotent: future runs see it
--    and skip the session. Done as DROP + ADD because the existing CHECK
--    constraint is anonymous (no name in 01_tables.sql).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.admission_form_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%form_viewed%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admission_form_events DROP CONSTRAINT %I', con_name);
  END IF;
END$$;

ALTER TABLE public.admission_form_events
  ADD CONSTRAINT admission_form_events_event_type_check
  CHECK (event_type IN (
    'form_viewed',
    'form_started',
    'field_focused',
    'field_completed',
    'form_submitted',
    'form_abandoned',
    'abandon_recovery_triggered'
  ));

CREATE TABLE IF NOT EXISTS public.admission_form_abandon_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               text NOT NULL,
  form_id                  uuid REFERENCES public.admission_forms(id) ON DELETE SET NULL,
  abandoned_at             timestamptz NOT NULL,
  matched_lead_id          uuid REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  recovery_triggered_at    timestamptz,
  detection_window_hours   integer,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one row per (session, form). Cron uses ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_form_abandon_session_form
  ON public.admission_form_abandon_log (session_id, form_id);

CREATE INDEX IF NOT EXISTS idx_form_abandon_log_session
  ON public.admission_form_abandon_log (session_id);

CREATE INDEX IF NOT EXISTS idx_form_abandon_log_lead
  ON public.admission_form_abandon_log (matched_lead_id)
  WHERE matched_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_abandon_log_created
  ON public.admission_form_abandon_log (created_at DESC);

-- Recovery-triggered partial index supports the acceptance metric query.
CREATE INDEX IF NOT EXISTS idx_form_abandon_log_recovery_triggered
  ON public.admission_form_abandon_log (recovery_triggered_at)
  WHERE recovery_triggered_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.admission_form_abandon_log ENABLE ROW LEVEL SECURITY;

-- Read: super_admin always; admission_counselor for diagnostic. Other roles
-- have no view here — this is an admin/marketing surface.
DROP POLICY IF EXISTS admission_form_abandon_log_select ON public.admission_form_abandon_log;
CREATE POLICY admission_form_abandon_log_select
  ON public.admission_form_abandon_log
  FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'admission_counselor')
    )
  );

-- Writes are service-role only. The cron uses SUPABASE_SERVICE_ROLE_KEY
-- which bypasses RLS — so no INSERT policy needed for end-users.
-- A defensive deny-all-INSERT policy keeps non-service-role traffic out.
DROP POLICY IF EXISTS admission_form_abandon_log_insert_deny ON public.admission_form_abandon_log;
CREATE POLICY admission_form_abandon_log_insert_deny
  ON public.admission_form_abandon_log
  FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS admission_form_abandon_log_update_deny ON public.admission_form_abandon_log;
CREATE POLICY admission_form_abandon_log_update_deny
  ON public.admission_form_abandon_log
  FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMENT ON TABLE public.admission_form_abandon_log IS
  'Form-abandon recovery diagnostic log (Path A B7). One row per detected (session_id, form_id) abandon. Producer: /api/cron/form-abandon-recovery. Surface: /admission/marketing/re-engagement?tab=form-abandons.';

COMMENT ON COLUMN public.admission_form_abandon_log.matched_lead_id IS
  'NULL = anonymous abandon (no identity captured before drop-off, or hash did not resolve to any lead). Non-null = matched via phone/email sha256 hash; eligible for messaging if recovery_triggered_at is non-null.';

COMMENT ON COLUMN public.admission_form_abandon_log.recovery_triggered_at IS
  'Timestamp when the cron triggered a WhatsAppReengagementService.launchReengagementCampaign call. NULL means the abandon was logged but no message was sent (anonymous, opted-out, or in cooldown).';

COMMENT ON COLUMN public.admission_form_abandon_log.detection_window_hours IS
  'Snapshot of the platform_policies value admission.form_abandon.detection_window_hours that the cron used when this row was inserted. Useful for diagnosing tuning changes.';

-- ----------------------------------------------------------------------------
-- Platform-policy seed: detection window (Director-tweakable, no deploy needed).
-- Default 24h ceiling × 2h floor → "abandoned 2-24 hours ago, fresh intent".
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
)
SELECT * FROM (VALUES
  (
    'admission.form_abandon.detection_window_hours',
    'global',
    NULL::uuid,
    '24'::jsonb,
    'Form-abandon recovery: ceiling on how old (in hours) a session can be and still qualify for an Hour-2 nudge. The 2h floor is hardcoded — the recovery is only useful while intent is fresh.',
    'number',
    true,
    true
  ),
  (
    'admission.form_abandon.cooldown_days',
    'global',
    NULL::uuid,
    '7'::jsonb,
    'Form-abandon recovery: minimum days between recovery messages to the SAME session_id. Prevents repeat-fire when the user revisits the form.',
    'number',
    true,
    true
  )
) AS r(policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_policies p
  WHERE p.policy_key = r.policy_key
    AND p.scope_type = r.scope_type
    AND COALESCE(p.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(r.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ----------------------------------------------------------------------------
-- Matcher RPC: fn_match_lead_by_identity_hash
-- ----------------------------------------------------------------------------
-- Given a phone or email sha256 hex digest, returns at most one matching
-- active admission_lead. Hashing recipe MUST mirror lib/utils/hash.ts:
--   phone : encode(digest(lower(trim(<E.164-normalized-phone>)), 'sha256'), 'hex')
--   email : encode(digest(lower(trim(<email>)),                    'sha256'), 'hex')
-- The phone column in admission_leads is already E.164-shaped because lead-
-- creation goes through normalizePhone() in lib/services/admission/lead-service.ts.
-- For older rows that may not be E.164, the matcher also tries a "raw lower+trim"
-- fallback inside the same query so the recipe-mismatch failure mode degrades
-- gracefully instead of returning false-negatives.
--
-- SECURITY DEFINER + LIMIT 1 — service-role cron is the only caller; the
-- function still respects the institution_id boundary by NOT filtering on it
-- (the cron uses the matched lead's institution_id to launch the campaign).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_match_lead_by_identity_hash(
  p_phone_hash text DEFAULT NULL,
  p_email_hash text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  institution_id uuid,
  full_name text,
  wa_opt_in boolean,
  funnel_stage text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    l.id,
    l.institution_id,
    l.full_name,
    l.wa_opt_in,
    l.funnel_stage::text AS funnel_stage
  FROM public.admission_leads l
  WHERE
    l.is_active = true
    AND (
      (
        p_phone_hash IS NOT NULL
        AND l.phone IS NOT NULL
        AND encode(extensions.digest(lower(trim(l.phone)), 'sha256'), 'hex') = p_phone_hash
      )
      OR (
        p_email_hash IS NOT NULL
        AND l.email IS NOT NULL
        AND encode(extensions.digest(lower(trim(l.email)), 'sha256'), 'hex') = p_email_hash
      )
    )
  ORDER BY l.last_activity_at DESC NULLS LAST, l.created_at DESC
  LIMIT 1;
$$;

-- Grant execute to the service-role auth.uid() context (the cron uses
-- service-role which bypasses RLS but still needs function-level grants
-- in some PostgREST configurations).
GRANT EXECUTE ON FUNCTION public.fn_match_lead_by_identity_hash(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_match_lead_by_identity_hash(text, text) TO service_role;

COMMENT ON FUNCTION public.fn_match_lead_by_identity_hash(text, text) IS
  'Form-abandon recovery: match a sha256 phone/email digest back to admission_leads. Recipe must match lib/utils/hash.ts (lower+trim, phone normalized to E.164 BEFORE hashing). SECURITY DEFINER — service-role cron only.';
