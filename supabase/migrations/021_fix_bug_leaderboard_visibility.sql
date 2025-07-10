-- Fix bug leaderboard visibility issue
-- The leaderboard needs to show all users' bug reports counts, not just the current user's

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow users to view their own reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Allow users to view detailed info of their own reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Allow authenticated users to view bug reports for leaderboard" ON public.bug_reports;

-- Create a single policy that allows all authenticated users to view bug reports
-- This is needed for the leaderboard to work properly
CREATE POLICY "Allow authenticated users to view all bug reports"
ON public.bug_reports FOR SELECT
TO authenticated
USING (true);

-- Update insert policy name for consistency
DROP POLICY IF EXISTS "Allow users to create reports" ON public.bug_reports;
CREATE POLICY "Allow authenticated users to create bug reports"
ON public.bug_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_user_id);

-- Admin policy remains unchanged (already allows all operations)
-- The "Allow admins to manage all reports" policy should stay as is

-- Ensure the leaderboard view can be accessed by all authenticated users
GRANT SELECT ON public.bug_reporters_leaderboard TO authenticated; 