export const dynamic = 'force-dynamic';

// POST /api/ims/payment/gateway/callback
//
// Where Razorpay's hosted checkout sends the cashier's browser back to.
//
// WHAT THIS ROUTE TRUSTS: nothing in the request except the ORDER ID, and even that
// only as a lookup key. The status, the amount, and whether money moved at all are
// established by asking Razorpay — never by reading what was posted here. The
// browser making this POST is the customer's, and a payment page is exactly where
// someone would try editing a failure into a success.
//
// WHAT IT DOES NOT DO: book the sale. This is a cross-site form POST, so a
// SameSite=Lax session cookie is not sent — the request has no cashier session, and
// ims_pos_checkout derives the cashier from auth.uid(). So this route records that
// the money arrived and redirects the cashier back to /ims/sales?gp=<id>, a
// top-level GET that DOES carry their cookies. The poll already running on that
// page books the sale inside their own session. See the long note in
// gateway-payment-service.ts.

import { NextRequest, NextResponse, connection } from 'next/server';
import { ImsGatewayPaymentService } from '@/lib/services/ims/gateway-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

function posUrl(baseUrl: string, params: Record<string, string | null | undefined>) {
  const url = new URL('/ims/sales', baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url;
}

export async function POST(request: NextRequest) {
  await connection();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  try {
    let formData: FormData | null = null;
    try {
      formData = await request.formData();
    } catch {
      // Not form-encoded — fall through to the query-string branch below.
    }

    const field = (name: string) =>
      formData?.get(name)?.toString() || request.nextUrl.searchParams.get(name) || undefined;

    const razorpayOrderId = field('razorpay_order_id');
    const razorpayPaymentId = field('razorpay_payment_id');
    const razorpaySignature = field('razorpay_signature');

    // ── Success branch ───────────────────────────────────────────────────────
    if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
      const result = await ImsGatewayPaymentService.confirmFromCallback({
        razorpayOrderId,
        razorpayPaymentId,
        signature: razorpaySignature,
      });

      logger.info('ims/gateway-callback', 'hosted checkout returned', {
        razorpayOrderId,
        paid: result.paid,
        reason: result.reason,
      });

      return NextResponse.redirect(
        posUrl(baseUrl, {
          gp: result.id,
          payment: result.paid ? 'success' : 'failed',
          reason: result.paid ? null : (result.reason ?? 'not_captured'),
        }),
        303,
      );
    }

    // ── Failure branch ───────────────────────────────────────────────────────
    // On a failed payment Razorpay does not post the signed trio; it posts
    // error[code] / error[description] / error[metadata] (a JSON string carrying
    // order_id and payment_id). Without this branch the request would fall through
    // and the cashier would land on the POS with no idea what happened.
    const errorCode = field('error[code]');
    const errorMetadataRaw = field('error[metadata]');

    if (errorCode || errorMetadataRaw) {
      let failedOrderId = razorpayOrderId;
      let failedPaymentId = razorpayPaymentId;

      if (errorMetadataRaw) {
        try {
          const meta = JSON.parse(errorMetadataRaw);
          failedOrderId = failedOrderId || meta?.order_id;
          failedPaymentId = failedPaymentId || meta?.payment_id;
        } catch {
          // Not JSON — fall back to the bracketed keys.
        }
      }
      failedOrderId = failedOrderId || field('error[metadata][order_id]');
      failedPaymentId = failedPaymentId || field('error[metadata][payment_id]');

      let id: string | null = null;
      if (failedOrderId) {
        ({ id } = await ImsGatewayPaymentService.markFailedFromCallback({
          razorpayOrderId: failedOrderId,
          razorpayPaymentId: failedPaymentId,
          reason: field('error[description]') ?? errorCode ?? null,
        }));
      }

      logger.info('ims/gateway-callback', 'hosted checkout reported failure', {
        failedOrderId,
        errorCode,
      });

      return NextResponse.redirect(
        posUrl(baseUrl, { gp: id, payment: 'failed', reason: errorCode ?? 'payment_failed' }),
        303,
      );
    }

    // Neither shape. Send the cashier back to a working till rather than an error
    // page — the payment row, if any, is still resolvable by the webhook and cron.
    logger.warn('ims/gateway-callback', 'callback had neither success nor failure fields');
    return NextResponse.redirect(posUrl(baseUrl, { payment: 'unknown' }), 303);
  } catch (error) {
    logger.error('ims/gateway-callback', 'callback processing failed', error);
    return NextResponse.redirect(posUrl(baseUrl, { payment: 'error' }), 303);
  }
}

/**
 * Some cancel/return paths come back as a GET. Same handling — POST does not assume
 * a body it can only sometimes read.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
