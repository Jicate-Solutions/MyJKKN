-- Create storage bucket for solutions documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'solutions-documents',
  'solutions-documents',
  false,
  10485760,  -- 10MB
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp']
);

-- RLS policies for the bucket
CREATE POLICY "Authenticated users can upload solutions documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'solutions-documents');

CREATE POLICY "Authenticated users can view solutions documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'solutions-documents');

CREATE POLICY "Authenticated users can delete their own solutions documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'solutions-documents');

-- Add document columns to sh_prospects
ALTER TABLE sh_prospects
ADD COLUMN IF NOT EXISTS proposal_url text,
ADD COLUMN IF NOT EXISTS proposal_filename text;
