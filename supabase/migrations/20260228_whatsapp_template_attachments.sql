-- supabase/migrations/20260228_whatsapp_template_attachments.sql
-- Add WhatsApp media attachment support to communication templates

-- 1. Add attachment columns to communication templates
ALTER TABLE admission_communication_templates
  ADD COLUMN IF NOT EXISTS attachment_type TEXT
    CHECK (attachment_type IN ('image', 'video', 'document')),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Enforce that attachment_type and attachment_url are either both set or both null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'admission_communication_templates'::regclass
    AND conname = 'chk_attachment_fields_paired'
  ) THEN
    ALTER TABLE admission_communication_templates
      ADD CONSTRAINT chk_attachment_fields_paired
      CHECK (
        (attachment_type IS NULL AND attachment_url IS NULL)
        OR
        (attachment_type IS NOT NULL AND attachment_url IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN admission_communication_templates.attachment_type IS
  'WhatsApp media type: image | video | document. NULL = text-only template.';
COMMENT ON COLUMN admission_communication_templates.attachment_url IS
  'Public URL of the attached media. NULL when no attachment.';

-- 2. Create public storage bucket for template media (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admission-template-media',
  'admission-template-media',
  true,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies for storage.objects scoped to uploader's institution
-- Upload: authenticated user can only upload to their own institution's folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can upload template media'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can upload template media"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'admission-template-media'
        AND (storage.foldername(name))[1] = (
          SELECT institution_id::text
          FROM profiles
          WHERE id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

-- Public read (bucket is public, so this is explicit documentation of intent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Public can read template media'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public can read template media"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'admission-template-media')
    $policy$;
  END IF;
END $$;

-- Delete: authenticated user can only delete their own institution's objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can delete template media'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can delete template media"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'admission-template-media'
        AND (storage.foldername(name))[1] = (
          SELECT institution_id::text
          FROM profiles
          WHERE id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

-- Update: authenticated user can only update their own institution's objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can update template media'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can update template media"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'admission-template-media'
        AND (storage.foldername(name))[1] = (
          SELECT institution_id::text
          FROM profiles
          WHERE id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;
