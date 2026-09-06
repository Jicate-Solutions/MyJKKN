-- Migration: project_change_requests — RLS lockdown (PART 2 of 2)
-- Date: 2026-07-25
-- Apply ONLY AFTER the RPC-based application code (which calls
-- fn_create/update/decide/delete_change_request) is deployed to production.
-- Applying this before that deploy would deny the currently-live direct-insert
-- path and break "New Request" during the deploy gap.
--
-- Effect: the base table becomes read-only for project members & admins. Every
-- write now goes through the SECURITY DEFINER RPCs from
-- 20260725000000_project_change_requests_rpcs.sql, which bypass RLS as the
-- function owner and enforce the agreed authorization rules.
-- Replaces the wide-open `project_change_requests_write` (FOR ALL USING
-- auth.uid() IS NOT NULL) that let any logged-in user write any row.

ALTER TABLE public.project_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_change_requests_write  ON public.project_change_requests;
DROP POLICY IF EXISTS project_change_requests_select ON public.project_change_requests;

CREATE POLICY project_change_requests_select ON public.project_change_requests
  FOR SELECT
  USING (public.fn_is_project_member(project_id) OR public.is_admin());

-- Deliberately NO INSERT / UPDATE / DELETE policies: direct writes from the
-- `authenticated` role are denied. The only write path is the SECDEF RPCs.
