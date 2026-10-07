-- Migration: 20271007121700_procurement_my_approvals_super_admin
-- ci:allow-secdef-authenticated answers only about the caller: chain rows filter on
-- auth.uid() = ANY(approver_ids); the Super Admin rows are returned only when is_super_admin().
-- Purpose:   "Waiting for my approval" now includes the Super Admin's own final approvals.
--            A category with no final approvers has no step row — the RFQ simply sits in
--            pending_award_approval for any Super Admin — so procurement_my_approvals()
--            never listed it. Super Admins now see those awards in their own list.
--            Return shape is unchanged.

CREATE OR REPLACE FUNCTION public.procurement_my_approvals()
RETURNS TABLE (request_id uuid, request_number text, title text, institution_name text,
               category_name text, step_label text, step_order int, steps_total int,
               requested_by_name text, submitted_at timestamptz, stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    -- Category approval steps that are mine right now
    SELECT r.id AS request_id, r.request_number, r.title, i.name AS institution_name,
           c.name AS category_name, a.label AS step_label, a.step_order,
           (SELECT count(*)::int FROM procurement_request_approvals x
             WHERE x.request_id = r.id AND x.stage = a.stage AND x.round = a.round) AS steps_total,
           pr.full_name AS requested_by_name, r.submitted_at, a.stage
    FROM procurement_request_approvals a
    JOIN procurement_purchase_requests r ON r.id = a.request_id
    LEFT JOIN institutions i ON i.id = r.institution_id
    LEFT JOIN procurement_categories c ON c.id = r.category_id
    LEFT JOIN profiles pr ON pr.id = r.requested_by
    WHERE a.status = 'pending' AND (SELECT auth.uid()) = ANY (a.approver_ids)

    UNION ALL

    -- Super Admin only: chosen vendors waiting on a Super Admin because the
    -- category has no final approvers of its own
    SELECT r.id, r.request_number, r.title, i.name, c.name, 'Super Admin', 1, 1,
           pr.full_name, coalesce(f.award_submitted_at, r.submitted_at), 'final'
    FROM procurement_rfqs f
    JOIN procurement_purchase_requests r ON r.id = f.source_request_id
    LEFT JOIN institutions i ON i.id = r.institution_id
    LEFT JOIN procurement_categories c ON c.id = r.category_id
    LEFT JOIN profiles pr ON pr.id = r.requested_by
    WHERE public.is_super_admin()
      AND f.status = 'pending_award_approval'
      AND NOT EXISTS (SELECT 1 FROM procurement_category_approval_steps s
                       WHERE s.category_id = r.category_id AND s.stage = 'final')
  ) m
  ORDER BY m.submitted_at;
$$;
REVOKE ALL ON FUNCTION public.procurement_my_approvals() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_my_approvals() TO authenticated;
