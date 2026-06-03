export const dynamic = 'force-dynamic';

// POST /api/billing/payment-accounts/test  — billing.payment_accounts.manage
// Test-connection: resolves the institution's Razorpay credentials (or the env
// fallback) and makes one cheap authenticated GET to Razorpay. 200 from Razorpay
// = keys valid. Reports the resolved source/mode so the admin can confirm whether
// the institution is on its own account or the common fallback.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { resolveRazorpayCredentials } from '@/lib/services/payments/razorpay/resolve-credentials';
import { razorpayRequest, RazorpayApiError } from '@/lib/services/payments/razorpay/client';

export const POST = withAuth(
  async (request) => {
    const body = await request.json().catch(() => null);
    const institutionId = body?.institutionId as string | undefined;

    let creds;
    try {
      creds = await resolveRazorpayCredentials({ institutionId });
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
