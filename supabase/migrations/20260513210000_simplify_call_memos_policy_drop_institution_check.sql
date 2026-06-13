-- =====================================================================
-- 2026-05-11 (v2)  Drop institution matching from call-memo storage policy
--
-- Supersedes 20260513200000_fix_call_memos_storage_policy_for_cross_institution.sql.
--
-- Per user requirement: "sometimes counselors are assigned to other
-- institutions also, so don't match for the institution — only check if
-- the lead is assigned (across any institution), allow voice memo
-- upload."
--
-- The previous migration kept three OR'd branches: super_admin, same-
-- institution, and call-log-ownership. The same-institution branch is
-- now removed entirely. Permission gates flow ONLY through counselor
-- assignment:
--   1. super_admin
--   2. user is the counselor on the call_log row (creator)
--   3. user is assigned to the LEAD that owns the call_log — covers any
--      counselor on that lead even if they didn't create the specific
--      call_log row. Matches against both lead.assigned_counselor_id
--      (profiles.id) and admission_counselors.user_id mapped to
--      lead.counselor_id.
--
-- This means admission office staff who aren't directly assigned to a
-- lead can no longer upload memos to its call logs. If they need that
-- access they should either be assigned to the lead via the assignment
-- flow, or use super_admin.
-- =====================================================================

DROP POLICY IF EXISTS "Counselors upload voice memos for own call logs" ON storage.objects;
DROP POLICY IF EXISTS "Counselors view voice memos for own call logs"  ON storage.objects;

CREATE POLICY "Counselors upload voice memos for assigned leads"
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
      -- Path shape: `{institution_id}/{call_log_id}.webm`
      OR EXISTS (
        SELECT 1 FROM public.admission_call_logs cl
        WHERE cl.id::text = split_part(storage.filename(objects.name), '.', 1)
          AND (
            cl.counselor_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.admission_leads l
              WHERE l.id = cl.lead_id
                AND (
                  l.assigned_counselor_id = auth.uid()
                  OR EXISTS (
                    SELECT 1 FROM public.admission_counselors ac
                    WHERE ac.id = l.counselor_id
                      AND ac.user_id = auth.uid()
                  )
                )
            )
          )
      )
    )
  );

CREATE POLICY "Counselors view voice memos for assigned leads"
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
        SELECT 1 FROM public.admission_call_logs cl
        WHERE cl.id::text = split_part(storage.filename(objects.name), '.', 1)
          AND (
            cl.counselor_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.admission_leads l
              WHERE l.id = cl.lead_id
                AND (
                  l.assigned_counselor_id = auth.uid()
                  OR EXISTS (
                    SELECT 1 FROM public.admission_counselors ac
                    WHERE ac.id = l.counselor_id
                      AND ac.user_id = auth.uid()
                  )
                )
            )
          )
      )
    )
  );
