-- =====================================================================
-- Allow image attachments on notifications
-- Created: 2026-08-04
-- =====================================================================
-- BUG (reported 2026-08-04): "Attachments (Optional)" on
-- /notifications/admin/new could not accept images. Two independent layers
-- both omitted image types:
--   1. notification-form.tsx ALLOWED_FILE_TYPES / ALLOWED_EXTENSIONS — the
--      file picker greyed images out and the validator rejected them.
--      (Fixed in the companion code change.)
--   2. THIS: storage.buckets.allowed_mime_types for 'notification-attachments'
--      listed only pdf/office/mp4/mp3, so Supabase Storage would reject an
--      image upload even if the form permitted the selection.
--
-- Fixing only the form would have produced a worse failure — the file appears
-- attached, then the send fails at upload time. Both layers change together.
--
-- Set (not appended) to an explicit list so re-running is idempotent and the
-- permitted set is readable in one place. Non-image entries are unchanged.
-- file_size_limit is left at its existing 25MB.
-- =====================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'video/mp4',
     'audio/mpeg',
     'audio/mp3',
     -- added 2026-08-04
     'image/png',
     'image/jpeg',
     'image/jpg',
     'image/gif',
     'image/webp'
   ]
 WHERE id = 'notification-attachments';
