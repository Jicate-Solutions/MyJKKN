-- Migration: Personal WhatsApp Auto-Trigger System
-- Date: 2026-04-02
-- Description: Adds message templates, auto-trigger rules, and personal WA queue
--              for automated messaging via personal WhatsApp (BYOW)
-- Dependencies: wa_personal_connections, wa_personal_message_logs, expo_events, admission_leads

-- =============================================================================
-- 1. Add channel preference to expo_events
-- =============================================================================

ALTER TABLE expo_events
    ADD COLUMN IF NOT EXISTS wa_channel_preference TEXT NOT NULL DEFAULT 'meta_waba'
        CHECK (wa_channel_preference IN ('personal', 'meta_waba', 'both', 'none'));

ALTER TABLE expo_events
    ADD COLUMN IF NOT EXISTS wa_personal_template_id UUID;

-- =============================================================================
-- 2. Personal WhatsApp Message Templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'expo_welcome'
        CHECK (category IN ('expo_welcome', 'followup', 'reminder', 'general')),
    content TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_templates_institution
    ON wa_personal_message_templates(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_templates_category
    ON wa_personal_message_templates(institution_id, category);

ALTER TABLE wa_personal_message_templates ENABLE ROW LEVEL SECURITY;

-- FK from expo_events → templates
ALTER TABLE expo_events
    ADD CONSTRAINT fk_expo_events_wa_template
    FOREIGN KEY (wa_personal_template_id) REFERENCES wa_personal_message_templates(id) ON DELETE SET NULL;

-- =============================================================================
-- 3. Auto-Trigger Rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_auto_trigger_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('lead_created', 'stage_changed', 'followup_due', 'expo_lead_captured')),
    conditions JSONB DEFAULT '{}'::jsonb,
    channel_priority TEXT[] DEFAULT ARRAY['personal', 'meta_waba'],
    template_id UUID REFERENCES wa_personal_message_templates(id) ON DELETE SET NULL,
    delay_seconds INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    daily_limit INT NOT NULL DEFAULT 500,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_auto_trigger_institution
    ON wa_auto_trigger_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_auto_trigger_event
    ON wa_auto_trigger_rules(institution_id, event_type)
    WHERE is_active = true;

ALTER TABLE wa_auto_trigger_rules ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. Personal WhatsApp Message Queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    message_content TEXT NOT NULL,
    trigger_rule_id UUID REFERENCES wa_auto_trigger_rules(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'personal'
        CHECK (channel IN ('personal', 'meta_waba')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'permanently_failed', 'skipped')),
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    wa_message_id TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_institution
    ON wa_personal_message_queue(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_lead
    ON wa_personal_message_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_retry
    ON wa_personal_message_queue(status, next_retry_at)
    WHERE status IN ('queued', 'failed');

ALTER TABLE wa_personal_message_queue ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. RLS Policies (institution_id match + super_admin + admission role)
-- =============================================================================

CREATE POLICY "wa_personal_templates_select" ON wa_personal_message_templates FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_personal_templates_insert" ON wa_personal_message_templates FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_personal_templates_update" ON wa_personal_message_templates FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_personal_templates_delete" ON wa_personal_message_templates FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

CREATE POLICY "wa_auto_trigger_rules_select" ON wa_auto_trigger_rules FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_auto_trigger_rules_insert" ON wa_auto_trigger_rules FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_auto_trigger_rules_update" ON wa_auto_trigger_rules FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_auto_trigger_rules_delete" ON wa_auto_trigger_rules FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

CREATE POLICY "wa_personal_queue_select" ON wa_personal_message_queue FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_personal_queue_insert" ON wa_personal_message_queue FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);
CREATE POLICY "wa_personal_queue_update" ON wa_personal_message_queue FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id WHERE ur.user_id = auth.uid() AND cr.role_key = 'admission')
);

-- =============================================================================
-- 6. Triggers
-- =============================================================================

CREATE TRIGGER wa_personal_templates_updated_at
    BEFORE UPDATE ON wa_personal_message_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER wa_auto_trigger_rules_updated_at
    BEFORE UPDATE ON wa_auto_trigger_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER wa_personal_queue_updated_at
    BEFORE UPDATE ON wa_personal_message_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. Seed default templates
-- =============================================================================

-- Default expo welcome template (will be institution-specific at runtime)
-- This is a reference; actual seeding happens per-institution via the UI
COMMENT ON TABLE wa_personal_message_templates IS
    'Default expo_welcome template content example:
     "Hello {{lead_name}}! Thank you for visiting us at {{event_name}}. We are excited about your interest in {{institution_name}}. Our counselor will reach out to you shortly to guide you through the admission process. Reply STOP to opt out."';
