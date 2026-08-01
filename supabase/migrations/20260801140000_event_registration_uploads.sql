-- Real file/image uploads on event registration forms.
--
-- THE BUG THIS FIXES: 'file' has been a selectable field type all along — it is
-- in the field_type CHECK below and renders an <input type="file"> — but
-- dynamic-field-input.tsx stored `e.target.files[0].name` and nothing else. A
-- registrant uploaded a certificate, the DB recorded the TEXT "certificate.pdf",
-- and the file was discarded when the tab closed. It looked like it worked,
-- which is worse than obviously not existing.
--
-- 1. 'image' joins the field_type allow-list — a registrant-uploaded picture
--    with a thumbnail preview, restricted to image MIME types. Distinct from
--    'file' so the UI can preview it and so the upload route can refuse a PDF
--    for a field that asked for a photo.
--
-- 2. A PRIVATE bucket holds the objects. Private matters: these are ID proofs,
--    certificates and photographs of real people. A public bucket hands out a
--    permanent unauthenticated URL that survives the event and cannot be
--    revoked without deleting the file. Organizers read through short-lived
--    signed URLs minted server-side instead.
--
-- NO storage RLS policies are created on purpose. Every write goes through
-- /api/events/[eventId]/registration-upload and every read through a signed URL,
-- both service-role (which bypasses RLS). With no policy, `anon` and
-- `authenticated` can do NOTHING against this bucket directly — the routes are
-- the only door, so the event-open / form-open / field-exists checks they run
-- cannot be side-stepped by talking to storage directly.

-- ── 1. 'image' field type ────────────────────────────────────────────────────

ALTER TABLE public.event_registration_form_fields
  DROP CONSTRAINT IF EXISTS event_registration_form_fields_field_type_check;

ALTER TABLE public.event_registration_form_fields
  ADD CONSTRAINT event_registration_form_fields_field_type_check
  CHECK (field_type = ANY (ARRAY[
    'text', 'number', 'phone', 'email', 'select', 'multi_select',
    'date', 'textarea', 'file', 'image', 'checkbox', 'radio'
  ]));

-- ── 2. private bucket ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-registration-uploads',
  'event-registration-uploads',
  false,
  10485760, -- 10 MB; the route enforces a tighter 5 MB cap for image fields
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
