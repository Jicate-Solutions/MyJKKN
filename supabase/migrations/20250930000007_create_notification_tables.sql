-- Migration: Create Notification System Tables
-- Created: 2025-09-30
-- Description: Notification tables for in-app, email, SMS, and push notifications

-- =====================================================
-- 1. NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error', 'reminder')),
  category TEXT NOT NULL CHECK (category IN ('reservation', 'approval', 'maintenance', 'resource', 'system')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  action_url TEXT,
  action_label TEXT,
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_category ON notifications(category);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_is_archived ON notifications(is_archived);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- =====================================================
-- 2. NOTIFICATION PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('reservation', 'approval', 'maintenance', 'resource', 'system')),
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category)
);

-- Indexes for notification_preferences
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_category ON notification_preferences(category);
CREATE INDEX idx_notification_preferences_enabled ON notification_preferences(enabled);

-- =====================================================
-- 3. NOTIFICATION TEMPLATES TABLE (OPTIONAL)
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('reservation', 'approval', 'maintenance', 'resource', 'system')),
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error', 'reminder')),
  title_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  default_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for notification_templates
CREATE INDEX idx_notification_templates_name ON notification_templates(name);
CREATE INDEX idx_notification_templates_category ON notification_templates(category);
CREATE INDEX idx_notification_templates_is_active ON notification_templates(is_active);

-- =====================================================
-- 4. UPDATE TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

CREATE TRIGGER trigger_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

CREATE TRIGGER trigger_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Notifications Policies
CREATE POLICY "Users can view their own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create notifications"
  ON notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Notification Preferences Policies
CREATE POLICY "Users can view their own preferences"
  ON notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
  ON notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON notification_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- Notification Templates Policies (Public Read, Admin Write)
CREATE POLICY "Anyone can view active templates"
  ON notification_templates
  FOR SELECT
  USING (is_active = TRUE);

-- =====================================================
-- 6. SEED DATA (OPTIONAL TEMPLATES)
-- =====================================================

INSERT INTO notification_templates (name, category, type, title_template, message_template, default_channels, variables) VALUES
  ('reservation_approved', 'reservation', 'success', 'Reservation Approved', 'Your reservation for "{{resource_name}}" has been approved!', ARRAY['in_app', 'email']::TEXT[], ARRAY['resource_name', 'reservation_id']::TEXT[]),
  ('reservation_rejected', 'reservation', 'error', 'Reservation Rejected', 'Your reservation for "{{resource_name}}" has been rejected. Reason: {{reason}}', ARRAY['in_app', 'email']::TEXT[], ARRAY['resource_name', 'reservation_id', 'reason']::TEXT[]),
  ('approval_pending', 'approval', 'warning', 'Approval Required', '{{requester_name}} has requested to reserve "{{resource_name}}". Your approval is required.', ARRAY['in_app', 'email']::TEXT[], ARRAY['requester_name', 'resource_name', 'reservation_id']::TEXT[]),
  ('maintenance_reminder', 'maintenance', 'reminder', 'Maintenance Reminder', 'Reminder: Maintenance for "{{resource_name}}" is due on {{scheduled_date}}.', ARRAY['in_app', 'email']::TEXT[], ARRAY['resource_name', 'scheduled_date', 'maintenance_id']::TEXT[]),
  ('maintenance_scheduled', 'maintenance', 'info', 'Maintenance Scheduled', 'Maintenance for "{{resource_name}}" is scheduled for {{scheduled_date}}.', ARRAY['in_app']::TEXT[], ARRAY['resource_name', 'scheduled_date', 'maintenance_id']::TEXT[])
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE notifications IS 'Stores all user notifications across the system';
COMMENT ON TABLE notification_preferences IS 'User-specific notification channel and timing preferences';
COMMENT ON TABLE notification_templates IS 'Reusable notification templates with variable placeholders';

COMMENT ON COLUMN notifications.metadata IS 'JSON metadata containing resource_id, reservation_id, etc.';
COMMENT ON COLUMN notifications.channels IS 'Array of delivery channels: in_app, email, sms, push';
COMMENT ON COLUMN notification_preferences.quiet_hours_start IS 'Start time for quiet hours (no notifications)';
COMMENT ON COLUMN notification_preferences.quiet_hours_end IS 'End time for quiet hours (no notifications)';
