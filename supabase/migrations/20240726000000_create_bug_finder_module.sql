-- Create a helper function to check for admin roles.
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id AND role IN ('super_admin', 'administrator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the table for bug reports.
CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  console_logs JSONB,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'seen', 'in_progress', 'resolved', 'wont_fix')),
  metadata JSONB,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for bug report screenshots
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES 
  ('bug-reports', 'Bug Reports', true, false, 10485760, -- 10MB limit
   '{image/png,image/jpeg,image/gif,image/webp}')
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for bug-reports bucket
-- Allow public read access to bug report screenshots
CREATE POLICY "Bug report screenshots are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'bug-reports');

-- Allow authenticated users to upload bug report screenshots
CREATE POLICY "Authenticated users can upload bug report screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bug-reports');

-- Allow users to update their own bug report screenshots
CREATE POLICY "Users can update their own bug report screenshots"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'bug-reports' AND auth.uid() = owner);

-- Allow users to delete their own bug report screenshots
CREATE POLICY "Users can delete their own bug report screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'bug-reports' AND auth.uid() = owner);

-- Add admin policies for bug report screenshots
CREATE POLICY "Admins can manage all bug report screenshots"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'bug-reports' AND
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth.uid() = id AND role = 'super_admin'
  )
)
WITH CHECK (
  bucket_id = 'bug-reports' AND
  EXISTS (
    SELECT 1 FROM public.users
    WHERE auth.uid() = id AND role = 'super_admin'
  )
);

COMMENT ON TABLE public.bug_reports IS 'Stores bug reports submitted by users.';
COMMENT ON COLUMN public.bug_reports.reporter_user_id IS 'The user who reported the bug.';
COMMENT ON COLUMN public.bug_reports.screenshot_url IS 'URL to the screenshot in Supabase Storage.';
COMMENT ON COLUMN public.bug_reports.metadata IS 'For storing browser, OS info, etc.';

-- Add RLS policies for bug_reports
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to view their own reports"
ON public.bug_reports FOR SELECT
USING (auth.uid() = reporter_user_id);

CREATE POLICY "Allow users to create reports"
ON public.bug_reports FOR INSERT
WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "Allow admins to manage all reports"
ON public.bug_reports FOR ALL
USING (public.is_admin(auth.uid()));

-- Create the view for the gamified leaderboard.
CREATE OR REPLACE VIEW public.bug_reporters_leaderboard AS
SELECT
    p.id as user_id,
    p.full_name as user_name,
    p.avatar_url as avatar_url,
    COUNT(br.id) AS resolved_bugs_count
FROM
    public.profiles p
JOIN
    public.bug_reports br ON p.id = br.reporter_user_id
WHERE
    br.status = 'resolved'
GROUP BY
    p.id, p.full_name, p.avatar_url
ORDER BY
    resolved_bugs_count DESC;
    
COMMENT ON VIEW public.bug_reporters_leaderboard IS 'Leaderboard for users who have reported resolved bugs.';

-- RLS for views is inherited from the underlying tables (`bug_reports` and `profiles`).
-- A separate policy on the view is not needed and causes an error.
-- The following lines have been removed.
-- CREATE POLICY "Allow all users to view leaderboard"
-- ON public.bug_reporters_leaderboard FOR SELECT
-- TO authenticated; 