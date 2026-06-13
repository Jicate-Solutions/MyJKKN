-- Email Notification Queue for BoS Events
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
    'syllabus_revised',
    'syllabus_approved',
    'meeting_scheduled',
    'course_ready_review'
  )),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  html_body TEXT,

  -- Context for the notification
  related_syllabus_id UUID REFERENCES bos_course_syllabi(id) ON DELETE SET NULL,
  related_meeting_id UUID REFERENCES bos_meetings(id) ON DELETE SET NULL,
  related_board_id UUID REFERENCES bos_boards(id) ON DELETE SET NULL,

  -- Tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'failed',
    'bounced',
    'unsubscribed'
  )),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_notifications_institution ON email_notifications(institutions_id);
CREATE INDEX idx_email_notifications_status ON email_notifications(status);
CREATE INDEX idx_email_notifications_recipient ON email_notifications(recipient_email);
CREATE INDEX idx_email_notifications_created ON email_notifications(created_at DESC);
CREATE INDEX idx_email_notifications_syllabus ON email_notifications(related_syllabus_id);
CREATE INDEX idx_email_notifications_meeting ON email_notifications(related_meeting_id);

-- Email Notification Preferences (opt-in/out)
CREATE TABLE IF NOT EXISTS email_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Notification types enabled/disabled
  syllabi_revised BOOLEAN DEFAULT true,
  syllabi_approved BOOLEAN DEFAULT true,
  meeting_scheduled BOOLEAN DEFAULT true,
  course_ready_review BOOLEAN DEFAULT true,

  -- Email frequency
  email_frequency VARCHAR(20) DEFAULT 'immediate' CHECK (email_frequency IN (
    'immediate',
    'daily_digest',
    'weekly_digest',
    'never'
  )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, institutions_id)
);

-- Index
CREATE INDEX idx_email_prefs_user ON email_notification_preferences(user_id);
CREATE INDEX idx_email_prefs_institution ON email_notification_preferences(institutions_id);

-- RLS Policies
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON email_notifications FOR SELECT
  USING (
    related_syllabus_id IN (
      SELECT id FROM bos_course_syllabi
      WHERE institutions_id = auth.jwt() ->> 'institution_id'
    )
    OR
    related_meeting_id IN (
      SELECT id FROM bos_meetings
      WHERE institutions_id = auth.jwt() ->> 'institution_id'
    )
  );

CREATE POLICY "Service role can manage notifications"
  ON email_notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE email_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
  ON email_notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
