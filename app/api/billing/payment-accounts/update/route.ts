export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/update  — billing.payment_accounts.manage
// Edit reconciliation/display metadata (label/MID/TID/DBA/mode). For DRAFTS, the
// routing slot (institution/fee-head) is changed only when changeSlot=true.

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
    const { accountId, label, mid, tid, dbaName, mode, institutionId, feeHead, changeSlot } =
      body as Record<string, string | boolean>;
    if (mode && mode !== 'test' && mode !== 'live') {
      return NextResponse.json({ success: false, error: 'invalid_mode' }, { status: 400 });
    }

    await RazorpayAccountVault.updateMeta({
      accountId: accountId as string,
      label: (label as string)?.trim() || null,
      mid: (mid as string)?.trim() || null,
      tid: (tid as string)?.trim() || null,
      dbaName: (dbaName as string)?.trim() || null,
      mode: (mode as 'test' | 'live') || undefined,
      institutionId: (institutionId as string) || null,
      feeHead: (feeHead as string)?.trim() || null,
      changeSlot: !!changeSlot,
      actor: auth.user.id,
    });

    logger.info('billing/payment-accounts', 'Razorpay account meta updated', {
      accountId,
      changeSlot: !!changeSlot,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
