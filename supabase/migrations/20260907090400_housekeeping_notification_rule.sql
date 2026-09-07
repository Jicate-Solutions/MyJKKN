-- Housekeeping rebuild, follow-up: the feedback-pending notification.
--
-- Learners are told the evening a cleaning finishes, BEFORE the attendance
-- hold lands the next morning. A block nobody was warned about is just a
-- mystery to the person hitting it, so this notification is what makes the
-- gate fair rather than punitive.
--
-- Delivery itself goes through the platform notification service
-- (sendNotification), which reads each user's own notification_preferences.
-- The row seeded here is the per-institution CHANNEL MATRIX entry that
-- /campus-living/settings/notification-rules renders, so a Director can turn
-- email/SMS/push on or off for this event.
--
-- The category CHECK has to widen first: it allowed only
-- leave/maintenance/safety/mess/fees. Housekeeping is deliberately NOT filed
-- under 'maintenance' — maintenance is broken things, housekeeping is
-- cleaning, and merging them would mislabel the toggle in the settings UI.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md section 5.5
--
-- APPLIED over a direct SQL connection, not scripts/apply-migration-file.mjs.
-- See the header of 20260907085000_housekeeping_teardown.sql for why.

ALTER TABLE public.hostel_notification_rules
  DROP CONSTRAINT IF EXISTS chk_hostel_notification_rules_category;

ALTER TABLE public.hostel_notification_rules
  ADD CONSTRAINT chk_hostel_notification_rules_category
  CHECK (category = ANY (ARRAY[
    'leave'::text,
    'maintenance'::text,
    'safety'::text,
    'mess'::text,
    'fees'::text,
    'housekeeping'::text
  ]));

-- Seed the event for every institution that already has notification rules,
-- so the toggle appears wherever the matrix is already in use. Push on,
-- email/SMS off: this is a same-day nudge, not correspondence.
INSERT INTO public.hostel_notification_rules
  (institution_id, category, event_key, event_label,
   channel_email, channel_sms, channel_push, is_active)
SELECT DISTINCT r.institution_id,
       'housekeeping',
       'housekeeping_feedback_pending',
       'Room cleaning awaiting rating',
       false, false, true, true
FROM public.hostel_notification_rules r
ON CONFLICT (institution_id, event_key) DO NOTHING;
