export const dynamic = 'force-dynamic';

// Admin API for per-institution Razorpay accounts.
// GET  → list accounts (no secrets)            — billing.payment_accounts.view
// POST → create/rotate an institution's account — billing.payment_accounts.manage
//
// Session-only (allowApiKey:false). The vault uses a service-role client + the
// master secret internally; secrets are NEVER returned to the browser.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { logger } from '@/lib/utils/enhanced-logger';

export const GET = withAuth(
  async () => {
    const accounts = await RazorpayAccountVault.list();
    return NextResponse.json({ success: true, data: accounts });
  },
  { requiredPermission: 'read', requirePermission: 'billing.payment_accounts.view', allowApiKey: false },
);

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { institutionId, keyId, keySecret, webhookSecret, label, mode, feeHead, mid, tid, dbaName } =
      body as Record<string, string>;
    const missing = ['keyId', 'keySecret', 'webhookSecret'].filter(
      (k) => !body[k] || String(body[k]).trim().length === 0,
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'missing_fields', message: `Required: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
    if (mode && mode !== 'test' && mode !== 'live') {
      return NextResponse.json({ success: false, error: 'invalid_mode' }, { status: 400 });
    }

    // institutionId omitted/blank => GLOBAL account (institution-agnostic). A global
    // account must target a specific fee head (it can't be the catch-all default).
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

    const result = await RazorpayAccountVault.set({
      institutionId: instId,
      keyId: keyId.trim(),
      keySecret: keySecret.trim(),
      webhookSecret: webhookSecret.trim(),
      label: label ?? null,
      mode: (mode as 'test' | 'live') ?? 'live',
      actor: auth.user.id,
      feeHead: head,
      mid: mid?.trim() || null,
      tid: tid?.trim() || null,
      dbaName: dbaName?.trim() || null,
    });

    logger.info('billing/payment-accounts', 'Razorpay account upserted', {
      institutionId: instId,
      feeHead: head,
      accountId: result.id,
      actor: auth.user.id,
    });

    return NextResponse.json({ success: true, data: result });
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
