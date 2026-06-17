export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/draft  — billing.payment_accounts.manage
// Create/update a DRAFT account (institution + fee-head + MID/TID/DBA, NO keys).
// Drafts are inert — the institution keeps using the env fallback until activated.

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
    const { institutionId, feeHead, label, mid, tid, dbaName, mode } = body as Record<string, string>;
    if (mode && mode !== 'test' && mode !== 'live') {
      return NextResponse.json({ success: false, error: 'invalid_mode' }, { status: 400 });
    }

    // institutionId omitted/blank => GLOBAL draft; a global account must target a fee head.
    const instId = institutionId && String(institutionId).trim().length > 0 ? institutionId : null;
    const head = feeHead?.trim() || null;
    if (!instId && !head) {
      return NextResponse.json(
        {
          success: false,
          error: 'global_requires_fee_head',
          message: 'A global account (no institution) must target a specific fee head.',
        },
        { status: 400 },
      );
    }

    const result = await RazorpayAccountVault.createDraft({
      institutionId: instId,
      feeHead: head,
      label: label?.trim() || null,
      mid: mid?.trim() || null,
      tid: tid?.trim() || null,
      dbaName: dbaName?.trim() || null,
      mode: (mode as 'test' | 'live') ?? 'live',
      actor: auth.user.id,
    });

    logger.info('billing/payment-accounts', 'Razorpay draft upserted', {
      institutionId: instId,
      feeHead: head,
      accountId: result.id,
      actor: auth.user.id,
    });
    return NextResponse.json({ success: true, data: result });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
