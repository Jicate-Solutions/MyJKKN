export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/deactivate  — billing.payment_accounts.manage
// Deactivates an institution's active account. After this it falls back to the
// common env account (existing transactions still resolve by pinned account id).

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { logger } from '@/lib/utils/enhanced-logger';

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    const institutionId = body?.institutionId;
    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'missing_institution_id' }, { status: 400 });
    }

    await RazorpayAccountVault.deactivate(institutionId, auth.user.id);
    logger.info('billing/payment-accounts', 'Razorpay account deactivated', {
      institutionId,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
