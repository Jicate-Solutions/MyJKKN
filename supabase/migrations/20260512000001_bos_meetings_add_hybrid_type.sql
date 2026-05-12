-- Add 'hybrid' to bos_meetings meeting_type CHECK constraint
ALTER TABLE bos_meetings
  DROP CONSTRAINT IF EXISTS bos_meetings_meeting_type_check;

ALTER TABLE bos_meetings
  ADD CONSTRAINT bos_meetings_meeting_type_check
  CHECK (meeting_type IN ('regular', 'special', 'emergency', 'online', 'hybrid'));
