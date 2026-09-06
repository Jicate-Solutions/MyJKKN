export const dynamic = 'force-dynamic';

// GET /api/billing/payment-accounts/connected?institutionId=<uuid>
//
// Returns which fee heads (billing_categories.kind) can be paid ONLINE at an
// institution, i.e. which heads resolve to a usable Razorpay account instead of
// falling through to an unusable fallback. The Pay Online UI hides bills whose
// head is not connected (those are settled manually with a manual receipt).
//
// "Connected" means an ACTIVE vault row with keys, matching the institution or
// GLOBAL, whose key is live (or sandbox is allowed in this runtime). A default
// vault row (fee_head NULL) connects all heads. The common ENV account is
// deliberately NOT counted: it would light up every category (and on a test
// key it was the source of the fake-UPI-paid incident) — Pay Online must only
// appear for fee heads someone explicitly configured in Payment Accounts.
//
// Auth: any authenticated user (students query it for their own bills view).
// Returns fee-head strings only — never key material.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/utils/uuid-validator';
import {
  isTestModeKey,
  sandboxPaymentsAllowed,
} from '@/lib/services/payments/razorpay/resolve-credentials';

export const GET = withAuth(
  async (request) => {
    const institutionId = request.nextUrl.searchParams.get('institutionId');
    // Strict UUID check: institutionId is interpolated into a PostgREST .or()
    // filter below — reject anything that could smuggle extra filter clauses.
    if (!institutionId || !isValidUUID(institutionId)) {
      return NextResponse.json(
        { success: false, error: 'institutionId must be a valid UUID' },
        { status: 400 },
      );
    }

    const allowSandbox = sandboxPaymentsAllowed();

    // Vault rows visible to this institution (own + global). RLS on
    // razorpay_accounts is service-role-only, hence the service client; the
    // row filter below is explicit and returns no secrets.
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await (supabase as any)
      .from('razorpay_accounts')
      .select('institution_id, fee_head, key_id, mode')
      .eq('is_active', true)
      .not('key_id', 'is', null)
      .or(`institution_id.eq.${institutionId},institution_id.is.null`);

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to load payment accounts' },
        { status: 500 },
      );
    }

    const usable = (rows ?? []).filter(
      (r: any) => allowSandbox || !isTestModeKey(r.key_id, r.mode),
    );

    // A default account (fee_head NULL) serves every head for its scope.
    const allConnected = usable.some((r: any) => r.fee_head === null);
    const feeHeads = [
      ...new Set(usable.map((r: any) => r.fee_head).filter(Boolean)),
    ] as string[];

    return NextResponse.json({
      success: true,
      data: { feeHeads, allConnected },
    });
  },
  { requiredPermission: 'read', allowApiKey: false },
);
