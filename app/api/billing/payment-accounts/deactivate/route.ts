export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/deactivate  — billing.payment_accounts.manage
// Deactivates a SPECIFIC account (by id). After this the institution+fee-head slot
// falls back to the institution default, then the common env account (existing
// transactions still resolve by their pinned account id).

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { logger } from '@/lib/utils/enhanced-logger';

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    const accountId = body?.accountId;
    if (!accountId) {
      return NextResponse.json({ success: false, error: 'missing_account_id' }, { status: 400 });
    }

    await RazorpayAccountVault.deactivateById(accountId, auth.user.id);
    logger.info('billing/payment-accounts', 'Razorpay account deactivated', {
      accountId,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
