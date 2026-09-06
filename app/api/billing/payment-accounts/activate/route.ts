export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/activate  — billing.payment_accounts.manage
// Activate a draft (or rotate a row in place) by adding keys. Encrypts the secrets
// via the vault (service-role) and returns the webhook_ref to paste into Razorpay.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { logger } from '@/lib/utils/enhanced-logger';

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }
    const { accountId, keyId, keySecret, webhookSecret } = body as Record<string, string>;
    const missing = ['accountId', 'keyId', 'keySecret', 'webhookSecret'].filter(
      (k) => !body[k] || String(body[k]).trim().length === 0,
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'missing_fields', message: `Required: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await RazorpayAccountVault.activate({
      accountId,
      keyId: keyId.trim(),
      keySecret: keySecret.trim(),
      webhookSecret: webhookSecret.trim(),
      actor: auth.user.id,
    });

    logger.info('billing/payment-accounts', 'Razorpay account activated', {
      accountId,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true, data: result });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
