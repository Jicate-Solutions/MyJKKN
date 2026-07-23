export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/delete  — billing.payment_accounts.manage
// Hard-delete an account. The RPC blocks deletion when any transaction pins it
// (use Deactivate instead). Safe for drafts and unused rows.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { logger } from '@/lib/utils/enhanced-logger';

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    if (!body?.accountId) {
      return NextResponse.json({ success: false, error: 'missing_account_id' }, { status: 400 });
    }
    await RazorpayAccountVault.deleteById(body.accountId, auth.user.id);
    logger.info('billing/payment-accounts', 'Razorpay account deleted', {
      accountId: body.accountId,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
