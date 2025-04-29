-- Create student-photos bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for student-photos bucket
-- Allow public read access to all items in the bucket
CREATE POLICY "Student photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'student-photos');

-- Allow authenticated users to upload to student-photos bucket
CREATE POLICY "Authenticated users can upload student photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'student-photos');

-- Allow users to update and delete their own uploads
CREATE POLICY "Users can update their own student photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'student-photos' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own student photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'student-photos' AND auth.uid() = owner);

-- Add admin policies
CREATE POLICY "Admins can manage all student photos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'student-photos' AND
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth.uid() = id AND role = 'super_admin'
  )
)
WITH CHECK (
  bucket_id = 'student-photos' AND
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth.uid() = id AND role = 'super_admin'
  )
); 