export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/policies/publish — publish a draft policy.
 *
 * Body: { policy_key, scope_type, scope_id, reason }
 *
 * Copies draft_value → value, sets publication_state='published',
 * records published_at/published_by, logs 'publish' audit entry with reason.
 *
 * Permission: withAuth (session-based). Super admin or admin only.
 * Director-only for major-classified policies (enforced at service layer).
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PolicyAuditService } from '@/lib/services/hr/policy-audit-service';

export const POST = withAuth(
  async (request, auth) => {
    await connection();

    let body: {
      policy_key?: string;
      scope_type?: string;
      scope_id?: string | null;
      reason?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { policy_key, scope_type, scope_id, reason } = body;

    if (!policy_key || typeof policy_key !== 'string') {
      return NextResponse.json({ error: 'policy_key is required' }, { status: 400 });
    }
    if (!scope_type || typeof scope_type !== 'string') {
      return NextResponse.json({ error: 'scope_type is required' }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'reason is required (mandatory for audit trail)' },
        { status: 400 }
      );
    }

    try {
      const result = await PolicyAuditService.publishPolicy(auth.supabase, {
        policy_key,
        scope_type,
        scope_id: scope_id ?? null,
        user_id: auth.user.id,
        reason: reason.trim(),
      });

      return NextResponse.json({ data: result, message: 'Policy published' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      const status = message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  },
  { requiredPermission: 'write' }
);
