-- =====================================================================================
-- Grouped pipeline counts for the job-first approvals overview
-- (/hr/recruitment/approvals). SECURITY INVOKER on purpose: RLS on
-- hr_job_applications / hr_recruitment_candidates bounds the rows each viewer
-- can count, so this needs no self-authorization. Grouping server-side avoids
-- the PostgREST 1000-row transfer cap that a client-side GROUP BY would hit.
-- kind = 'application' rows count hr_job_applications by (job_id, status);
-- kind = 'candidate' rows count promoted candidates via the soft
-- role_specific_details->>'job_id' link stamped at promote-time.
-- =====================================================================================

CREATE OR REPLACE FUNCTION fn_recruitment_approvals_counts()
RETURNS TABLE(kind text, job_id uuid, status text, cnt bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT 'application'::text, a.job_id, a.status::text, count(*)::bigint
  FROM hr_job_applications a
  GROUP BY a.job_id, a.status
  UNION ALL
  SELECT 'candidate'::text,
         (c.role_specific_details->>'job_id')::uuid,
         c.status::text,
         count(*)::bigint
  FROM hr_recruitment_candidates c
  WHERE c.role_specific_details ? 'job_id'
  GROUP BY (c.role_specific_details->>'job_id')::uuid, c.status;
$$;

REVOKE EXECUTE ON FUNCTION fn_recruitment_approvals_counts() FROM anon;
GRANT EXECUTE ON FUNCTION fn_recruitment_approvals_counts() TO authenticated;
