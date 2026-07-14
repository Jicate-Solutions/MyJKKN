export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/payment/callback
// Razorpay's hosted checkout POSTs back here after payment. Verifies the
// signature + runs the dual inquiry server-side (NEVER trusts the client),
// settles the transaction + registration, then redirects the payer back to
// whichever page initiated payment — the transaction's stashed return_url
// (the guest public page or the organizer management page).
//
// Replaces the old GET handler, which only supported the decommissioned HDFC
// SmartGateway redirect contract and is no longer reachable (getActiveProviderName
// throws for anything but 'razorpay').

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const fallback = (flag: string) =>
    NextResponse.redirect(`${appUrl}/p/tournament/${eventId}?payment=${flag}`, 303);

  const formData = await request.formData().catch(() => null);
  if (!formData) return fallback('error');

  try {
    const razorpayOrderId = formData.get('razorpay_order_id')?.toString();
    const razorpayPaymentId = formData.get('razorpay_payment_id')?.toString();
    const razorpaySignature = formData.get('razorpay_signature')?.toString();

    if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
      const result = await EventPaymentService.verifyAndSettleRazorpayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });
      const target = result.returnUrl || `${appUrl}/p/tournament/${eventId}`;
      try {
        const url = new URL(target);
        url.searchParams.set('payment', result.success ? 'success' : 'failed');
        return NextResponse.redirect(url, 303);
      } catch {
        // result.returnUrl was non-empty but malformed/non-absolute (e.g. a
        // misconfigured NEXT_PUBLIC_APP_URL at order-creation time). The
        // payment has ALREADY been verified + settled above — never let a bad
        // redirect URL surface as a raw 500 to a payer who genuinely paid.
        return fallback(result.success ? 'success' : 'failed');
      }
    }

    // Razorpay hosted-checkout FAILURE callback: no signed success trio; instead
    // error[code]/error[description]/error[metadata] (JSON string with order_id).
    const errorCode = formData.get('error[code]')?.toString();
    const errorMetadataRaw = formData.get('error[metadata]')?.toString();
    let failedOrderId: string | undefined;
    if (errorMetadataRaw) {
      try {
        failedOrderId = JSON.parse(errorMetadataRaw)?.order_id;
      } catch {
        // metadata wasn't JSON; fall back to the bracketed key below.
      }
    }
    failedOrderId = failedOrderId || formData.get('error[metadata][order_id]')?.toString();

    if (failedOrderId) {
      await EventPaymentService.markRazorpayOrderFailed(failedOrderId, {
        code: errorCode ?? null,
        description: formData.get('error[description]')?.toString() ?? null,
      });
    }

    if (errorCode || failedOrderId) return fallback('failed');
    return fallback('error');
  } catch {
    // Unexpected error (e.g. a network failure calling Razorpay's API during
    // dual inquiry) can happen AFTER a payment has already been verified and
    // settled server-side. Never surface a raw 500 to a payer who may have
    // genuinely paid — fall back to a generic error redirect instead.
    return fallback('error');
  }
}
