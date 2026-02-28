-- supabase/migrations/20260228_whatsapp_template_attachments.sql
-- Add WhatsApp media attachment support to communication templates

ALTER TABLE admission_communication_templates
  ADD COLUMN IF NOT EXISTS attachment_type TEXT
    CHECK (attachment_type IN ('image', 'video', 'document')),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN admission_communication_templates.attachment_type IS
  'WhatsApp media type: image | video | document. NULL = text-only template.';
COMMENT ON COLUMN admission_communication_templates.attachment_url IS
  'Public URL of the attached media. NULL when no attachment.';
