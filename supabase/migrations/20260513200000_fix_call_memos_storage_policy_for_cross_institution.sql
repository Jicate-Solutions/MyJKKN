-- =====================================================================
-- 2026-05-11  Allow cross-institution counselors to upload + view voice memos
--
-- Bug: a counselor assigned to a lead at a DIFFERENT institution from
-- their own profile cannot save voice memos. The existing
-- storage.objects RLS policies for the 'call-memos' bucket compare
-- profiles.institution_id to the folder name (storage.foldername(name)[1]),
-- which is the LEAD's institution. When those diverge, the upload returns
-- 403 RLS denial → client surfaces "Unable to save the voice note".
--
-- Repro: lead e28f3524-c8bc-4dd2-9221-86cb9360d01f is at "Jicate Solutions";
-- assigned counselor MR. KRISHNAN R is at "JKKN College of Pharmacy".
-- He clicks Save in Log Call dialog → call_log row inserts → storage
-- upload to `{Jicate}/{call_log_id}.webm` is denied.
--
-- Fix: widen INSERT + SELECT policies with a third disjunct: the user is
-- the counselor on the call_log row whose ID matches the filename. The
-- existing super_admin + same-institution branches are preserved, so
-- nothing that worked before stops working.
-- =====================================================================

DROP POLICY IF EXISTS "Counselors upload voice memos to own institution" ON storage.objects;
DROP POLICY IF EXISTS "Counselors view voice memos of own institution"  ON storage.objects;

CREATE POLICY "Counselors upload voice memos for own call logs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'call-memos'
    AND (
      -- Super admin
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_super_admin = true OR profiles.role = 'super_admin')
      )
      -- Same institution as the upload folder
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.institution_id::text = (storage.foldername(objects.name))[1]
      )
      -- User owns the call_log row identified by the filename. Path shape
      -- is `{institution_id}/{call_log_id}.webm`; split_part on '.' isolates
      -- the call_log_id portion, compared as text to avoid uuid-cast errors
      -- on any non-uuid filename (the EXISTS just returns empty in that case).
      OR EXISTS (
        SELECT 1 FROM public.admission_call_logs cl
        WHERE cl.id::text = split_part(storage.filename(objects.name), '.', 1)
          AND cl.counselor_id = auth.uid()
      )
    )
  );

CREATE POLICY "Counselors view voice memos for own call logs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'call-memos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_super_admin = true OR profiles.role = 'super_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.institution_id::text = (storage.foldername(objects.name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.admission_call_logs cl
        WHERE cl.id::text = split_part(storage.filename(objects.name), '.', 1)
          AND cl.counselor_id = auth.uid()
      )
    )
  );

-- DELETE policy unchanged (super_admin only).
