-- =====================================================================
-- Migration: 20260530104123_meta_lead_ads
-- Agent γ — Meta Lead Ads substrate (forms / events / field mappings)
-- =====================================================================
-- Adds the persistence layer for the Meta Lead Ads integration:
--   1. meta_lead_forms          — synced Lead Gen form catalog
--   2. meta_leadgen_events      — raw webhook payloads (audit trail)
--   3. meta_lead_field_mappings — form_field → MyJKKN lead column rules
--
-- Plus 3 platform_policies rows so Director / super_admin can toggle the
-- receiver and rotate the verify token without redeploying.
--
-- Existing `leads` / `admission_leads` tables are NOT altered — the
-- importer (services/admission/meta-lead-importer) maps via existing
-- LeadService.captureLead() and stuffs unmapped Meta fields into the
-- capture row's raw_payload + (optionally) the lead's metadata jsonb.
--
-- RLS:
--   - meta_lead_forms / meta_lead_field_mappings:
--       SELECT for any authenticated user, mutations for super_admin/admin.
--   - meta_leagen_events: SELECT for admin only (raw PII payloads).
--   - All writes done by service_role (webhook / cron / sync action).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- =====================================================================

-- ── 1. meta_lead_forms ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_form_id TEXT NOT NULL UNIQUE,
  fb_page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  locale TEXT NULL,
  leads_count INTEGER NOT NULL DEFAULT 0,
  -- Default destination for leads from this form. NULL means the importer
  -- falls back to the global `meta.leadgen.default_institution_id` policy.
  institution_id UUID NULL REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- Stable copy of the question array {key,label,type}[] from the last
  -- sync. Used to render the admin mapping table even when Meta is down.
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  fb_created_time TIMESTAMPTZ NULL,
  last_synced_at TIMESTAMPTZ NULL,
  last_backfilled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_page ON public.meta_lead_forms (fb_page_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_institution
  ON public.meta_lead_forms (institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_active
  ON public.meta_lead_forms (is_active) WHERE is_active = true;

COMMENT ON TABLE public.meta_lead_forms IS
  'Synced Meta Lead Gen form catalog. Populated by /api/admin/social/lead-ads/forms POST sync. One row per FB form_id.';
COMMENT ON COLUMN public.meta_lead_forms.questions IS
  'Frozen copy of the form questions [{key,label,type}]. Re-synced on POST /forms.';
COMMENT ON COLUMN public.meta_lead_forms.institution_id IS
  'Default destination institution for leads from this form. NULL → falls back to meta.leadgen.default_institution_id policy.';

-- ── 2. meta_leadgen_events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_leadgen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The webhook may arrive before the form is synced. Both columns are
  -- nullable to record the raw payload regardless.
  form_id UUID NULL REFERENCES public.meta_lead_forms(id) ON DELETE SET NULL,
  fb_form_id TEXT NULL,
  fb_page_id TEXT NULL,
  fb_leadgen_id TEXT NOT NULL UNIQUE,
  -- Result of import attempt: 'pending' → 'imported' / 'merged' / 'failed' / 'skipped'.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','imported','merged','failed','skipped')),
  -- When status='imported' or 'merged', this points back at admission_leads.id.
  lead_id UUID NULL,
  -- Raw webhook payload (the entry[].changes[].value object).
  raw_payload JSONB NOT NULL,
  -- Hydrated lead body fetched via /{leadgen-id}. NULL until the importer runs.
  hydrated_payload JSONB NULL,
  error_message TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_form
  ON public.meta_leadgen_events (form_id) WHERE form_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_fb_form
  ON public.meta_leadgen_events (fb_form_id);
CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_status_received
  ON public.meta_leadgen_events (status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_lead
  ON public.meta_leadgen_events (lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE public.meta_leadgen_events IS
  'Raw Meta Lead Ads webhook events. One row per fb_leadgen_id. Backfill cron inserts here too. Importer reads pending rows.';

-- ── 3. meta_lead_field_mappings ────────────────────────────────────────
-- Per-form rule: "Meta question key X maps to MyJKKN lead column Y".
-- If a target column is missing from this table for a question, the
-- importer drops the value into the capture row's raw_payload metadata.
CREATE TABLE IF NOT EXISTS public.meta_lead_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.meta_lead_forms(id) ON DELETE CASCADE,
  fb_field_key TEXT NOT NULL,
  -- Target column on admission_leads. Whitelist enforced at the application
  -- layer (importer) to avoid SQL-injection-style misuse. Values are simple
  -- lower-snake-case names matching CreateLeadInput fields.
  lead_column TEXT NOT NULL,
  -- Optional transform: 'trim' / 'lowercase' / 'phone_e164' / 'split_first_name'.
  -- NULL = pass through. Reserved for future use; importer ignores unknown values.
  transform TEXT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_lead_field_mappings_form_field
  ON public.meta_lead_field_mappings (form_id, fb_field_key);

COMMENT ON TABLE public.meta_lead_field_mappings IS
  'Per-form rule mapping a Meta question key to a MyJKKN lead column. Missing rules → value stored in raw_payload only.';

-- ── 4. RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.meta_lead_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_leadgen_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_lead_field_mappings ENABLE ROW LEVEL SECURITY;

-- meta_lead_forms — read for all auth; mutate for admin
DROP POLICY IF EXISTS meta_lead_forms_select ON public.meta_lead_forms;
CREATE POLICY meta_lead_forms_select ON public.meta_lead_forms
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meta_lead_forms_mutate ON public.meta_lead_forms;
CREATE POLICY meta_lead_forms_mutate ON public.meta_lead_forms
  FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- meta_leadgen_events — admin-only read (raw PII); writes via service_role
DROP POLICY IF EXISTS meta_leadgen_events_select ON public.meta_leadgen_events;
CREATE POLICY meta_leadgen_events_select ON public.meta_leadgen_events
  FOR SELECT USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meta_leadgen_events_mutate ON public.meta_leadgen_events;
CREATE POLICY meta_leadgen_events_mutate ON public.meta_leadgen_events
  FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- meta_lead_field_mappings — read for all auth; mutate for admin
DROP POLICY IF EXISTS meta_lead_field_mappings_select ON public.meta_lead_field_mappings;
CREATE POLICY meta_lead_field_mappings_select ON public.meta_lead_field_mappings
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meta_lead_field_mappings_mutate ON public.meta_lead_field_mappings;
CREATE POLICY meta_lead_field_mappings_mutate ON public.meta_lead_field_mappings
  FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ── 5. updated_at triggers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_meta_lead_ads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_lead_forms_updated_at ON public.meta_lead_forms;
CREATE TRIGGER trg_meta_lead_forms_updated_at
  BEFORE UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.touch_meta_lead_ads_updated_at();

DROP TRIGGER IF EXISTS trg_meta_lead_field_mappings_updated_at ON public.meta_lead_field_mappings;
CREATE TRIGGER trg_meta_lead_field_mappings_updated_at
  BEFORE UPDATE ON public.meta_lead_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_meta_lead_ads_updated_at();

-- ── 6. platform_policies seeds ─────────────────────────────────────────
-- Three Director-toggleable settings. Idempotent via ON CONFLICT.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
  (
    'meta.leadgen.verify_token',
    'global',
    NULL,
    '"9f56f9a67354ae0f21d278ba2fb6b1e9feb6a5cdb540dc13fdb0b1ce71999aff"'::jsonb,
    'Verify token Meta echoes during webhook handshake (?hub.verify_token). Rotate by updating this row + re-saving on the Meta App webhook config.',
    'string',
    true
  ),
  (
    'meta.leadgen.signing_secret_key',
    'global',
    NULL,
    '"META_APP_SECRET"'::jsonb,
    'Name of the process.env key that holds the Meta App Secret used to verify the X-Hub-Signature-256 HMAC on inbound webhooks. The secret itself is NOT stored in the database — only the env-var name is referenced here.',
    'string',
    true
  ),
  (
    'meta.leadgen.is_enabled',
    'global',
    NULL,
    'false'::jsonb,
    'Master switch for the Meta Lead Ads receiver. When false, the webhook returns 200 but skips importer; backfill cron is a no-op. Flip to true after the Meta App + webhook subscription are registered.',
    'boolean',
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ── 7. Grants ──────────────────────────────────────────────────────────
GRANT SELECT ON public.meta_lead_forms          TO authenticated;
GRANT SELECT ON public.meta_lead_field_mappings TO authenticated;
-- meta_leadgen_events purposefully NOT granted broadly (raw PII).
GRANT ALL ON public.meta_lead_forms          TO service_role;
GRANT ALL ON public.meta_leadgen_events      TO service_role;
GRANT ALL ON public.meta_lead_field_mappings TO service_role;
