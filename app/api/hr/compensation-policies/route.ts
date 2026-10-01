export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/compensation-policies?key=<policy key>&institutionId=<uuid>
 *
 * One college's compensation policy row, for the Pay Scales, Allowances and
 * Motivation Fund editors (/hr/admin/policies/*). Returns `{ row }`, where
 * `row` is null when the college has no row yet.
 *
 * Gated on hr.payroll.salary.view — the key Employee Salaries, Pay Band Check
 * and Annual Increments use. No new key: a key does nothing until it is in a
 * role's JSONB, and putting one there is a live change. The pay rows are also
 * restricted to the same key at the database (migration 20270506090000), so
 * this check and RLS agree.
 *
 * COLLEGE SCOPING: institutionId is never trusted. The row comes from
 * hr_compensation_policies(p_key), run as the caller, which returns only the
 * colleges role_has_institution_access() lets them see (admins: every college).
 * A college outside that list gets 403, not an empty row.
 *
 * allowApiKey: false — this is a browser screen's data, not an integration
 * endpoint, and an API key skips withAuth's permission check.
 *
 * READ ONLY. The editors save through the existing browser path.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  CompensationPolicyAccessError,
  CompensationPolicyReadService,
  COMPENSATION_POLICY_READ_KEYS,
  isCompensationPolicyReadKey,
  isUuid,
} from '@/lib/services/hr/compensation-policies/compensation-policy-read-service';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const institutionId = url.searchParams.get('institutionId');

    if (!isCompensationPolicyReadKey(key)) {
      return NextResponse.json(
        { error: `key must be one of: ${COMPENSATION_POLICY_READ_KEYS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!isUuid(institutionId)) {
      return NextResponse.json({ error: 'institutionId must be a college id' }, { status: 400 });
    }

    try {
      const body = await CompensationPolicyReadService.load(auth.supabase, key, institutionId);
      return NextResponse.json(body);
    } catch (err: unknown) {
      if (err instanceof CompensationPolicyAccessError) {
        // Rule #27: a college outside the caller's scope is refused out loud.
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      console.error('[HR Compensation Policies] read error:', err);
      const message = err instanceof Error ? err.message : 'Failed to read the policy';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  {
    requirePermission: 'hr.payroll.salary.view',
    requiredPermission: 'read',
    allowApiKey: false,
  },
);
