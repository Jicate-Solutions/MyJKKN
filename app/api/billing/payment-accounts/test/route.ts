export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/test  — billing.payment_accounts.manage
// Test-connection: resolves the institution's Razorpay credentials (or the env
// fallback) and makes one cheap authenticated GET to Razorpay. 200 from Razorpay
// = keys valid. Reports the resolved source/mode so the admin can confirm whether
// the institution is on its own account or the common fallback.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { resolveRazorpayCredentials } from '@/lib/services/payments/razorpay/resolve-credentials';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { razorpayRequest, RazorpayApiError } from '@/lib/services/payments/razorpay/client';

export const POST = withAuth(
  async (request) => {
    const body = await request.json().catch(() => null);
    const institutionId = (body?.institutionId as string | null | undefined) || null;
    const feeHead = (body?.feeHead as string | null | undefined) ?? null;

    let creds;
    try {
      if (!institutionId) {
        // Global account test — resolve the institution-agnostic account for this fee
        // head directly (the normal router needs an institution and would fall to env).
        if (!feeHead) {
          return NextResponse.json(
            { success: false, error: 'no_credentials', message: 'A global account requires a fee head to test.' },
            { status: 200 },
          );
        }
        const global = await RazorpayAccountVault.getGlobal(feeHead);
        if (!global) {
          return NextResponse.json(
            { success: false, error: 'no_credentials', message: 'No active global account for this fee head.' },
            { status: 200 },
          );
        }
        creds = global;
      } else {
        creds = await resolveRazorpayCredentials({ institutionId, feeHead });
      }
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'no_credentials', message: err instanceof Error ? err.message : 'No credentials' },
        { status: 200 },
      );
    }

    try {
      // Cheap authenticated call — lists at most one order. 200 ⇒ keys are valid.
      await razorpayRequest('GET', '/orders?count=1', { keyId: creds.keyId, keySecret: creds.keySecret });
      return NextResponse.json({
        success: true,
        source: creds.source, // 'institution' | 'env'
        mode: creds.mode,
        keyId: creds.keyId, // public value, safe to echo
      });
    } catch (err) {
      const status = err instanceof RazorpayApiError ? err.status : 0;
      return NextResponse.json(
        {
          success: false,
          error: 'razorpay_rejected',
          status,
          source: creds.source,
          mode: creds.mode,
          message: err instanceof Error ? err.message : 'Razorpay rejected the credentials',
        },
        { status: 200 },
      );
    }
  },
  { requiredPermission: 'write', requirePermission: 'billing.payment_accounts.manage', allowApiKey: false },
);
