export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/policies/audit-log — paginated, filterable audit log.
 *
 * Query params:
 *   policy_key    — filter by policy key (exact match)
 *   institution_id — filter by scope_id (institution UUID)
 *   change_type   — filter by action (edit_draft | publish | unpublish | classify_change | promote_to_global)
 *   edited_by     — filter by editor profile id
 *   from_date     — ISO date lower bound on edited_at
 *   to_date       — ISO date upper bound on edited_at
 *   page          — 1-based page number (default 1)
 *   page_size     — rows per page (default 50, max 200)
 *
 * Permission: withAuth({ requirePermission: 'hr.policies.view' })
 * RLS on hr_policy_audit_log further scopes visibility.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PolicyAuditService } from '@/lib/services/hr/policy-audit-service';
import type { PolicyAuditFilters } from '@/types/hr-policy-audit';

export const GET = withAuth(
  async (request, auth) => {
    await connection();

    const url = new URL(request.url);
    const filters: PolicyAuditFilters = {};

    const policyKey = url.searchParams.get('policy_key');
    if (policyKey) filters.policy_key = policyKey;

    const institutionId = url.searchParams.get('institution_id');
    if (institutionId) filters.institution_id = institutionId;

    const changeType = url.searchParams.get('change_type');
    if (changeType) filters.change_type = changeType as PolicyAuditFilters['change_type'];

    const editedBy = url.searchParams.get('edited_by');
    if (editedBy) filters.edited_by = editedBy;

    const fromDate = url.searchParams.get('from_date');
    if (fromDate) filters.from_date = fromDate;

    const toDate = url.searchParams.get('to_date');
    if (toDate) filters.to_date = toDate;

    const page = url.searchParams.get('page');
    filters.page = page ? Math.max(1, parseInt(page, 10)) : 1;

    const pageSize = url.searchParams.get('page_size');
    filters.page_size = pageSize ? Math.min(200, Math.max(1, parseInt(pageSize, 10))) : 50;

    try {
      const result = await PolicyAuditService.getAuditLog(auth.supabase, filters);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audit log';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  { requiredPermission: 'read' }
);
