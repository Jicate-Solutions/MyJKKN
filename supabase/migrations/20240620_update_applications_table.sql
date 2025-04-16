-- Update applications table to add icon and screenshots
ALTER TABLE "public"."applications" 
  ADD COLUMN "icon_path" TEXT,
  ADD COLUMN "screenshots" TEXT[];

-- Create storage buckets for application assets
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES 
  ('applications', 'Applications', true, false, 52428800, -- 50MB limit
   '{image/png,image/jpeg,image/gif,image/webp,image/svg+xml}');

-- Set up storage policies for applications bucket
-- Allow authenticated users to read application images
CREATE POLICY "Allow public read access for applications" ON storage.objects
  FOR SELECT USING (bucket_id = 'applications');

-- Allow authenticated users to upload application images
-- (limited to users with proper permissions in application logic)
CREATE POLICY "Allow authenticated users to upload application images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'applications');

-- Allow users to update/delete their own objects
CREATE POLICY "Allow users to update their uploads" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'applications' AND 
   (auth.uid() = (storage.foldername(name))[4]::uuid)
  );

CREATE POLICY "Allow users to delete their uploads" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'applications' AND 
   (auth.uid() = (storage.foldername(name))[4]::uuid)
  );



-- Create function to check if user has access to an application based on their role
CREATE OR REPLACE FUNCTION public.user_has_application_access(app_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  app_roles TEXT[];
BEGIN
  -- Get the current user's role
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  -- Get the roles that have access to this application
  SELECT roles_access INTO app_roles FROM applications WHERE id = app_id;
  
  -- Check if the user's role is in the application's roles_access array
  RETURN user_role IS NOT NULL AND app_roles IS NOT NULL AND user_role = ANY(app_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a policy for applications to filter based on user's role
CREATE POLICY "Users can only view applications based on their role" ON applications
  FOR SELECT USING (
    -- Super admin can see all
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true)
    )
    OR
    -- Regular users can only see apps where their role is in roles_access
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = ANY(applications.roles_access)
    )
  );

-- Implement row level security
ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY; 