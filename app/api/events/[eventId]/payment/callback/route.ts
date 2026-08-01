export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/payment/callback
//
// Razorpay's hosted checkout POSTs the signed result here after a GENERAL
// event's registration fee is paid. Verifies the signature AND runs the dual
// inquiry server-side (never trusts the client), settles the transaction plus
// the registration, then redirects the payer back to whichever page started the
// payment — the transaction's stashed return_url.
//
// Mirrors the tournament callback deliberately: both delegate to the same
// EventPaymentService methods, which look the transaction up by
// razorpay_order_id, so verification is identical. What differs is only where
// the payer lands afterwards.
//
// Cross-site safety: Razorpay POSTs this from their own origin, so the session
// cookie (SameSite=Lax) is NOT sent. That is fine — proxy.ts treats all /api/*
// as public and the settle path uses a service-role client keyed on the order
// id, so no user session is needed.

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const fallback = (flag: string) =>
    NextResponse.redirect(`${appUrl}/p/event/${eventId}/register?payment=${flag}`, 303);

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
      const target = result.returnUrl || `${appUrl}/p/event/${eventId}/register`;
      try {
        const url = new URL(target);
        url.searchParams.set('payment', result.success ? 'success' : 'failed');
        return NextResponse.redirect(url, 303);
      } catch {
        // return_url was non-empty but malformed (e.g. a misconfigured
        // NEXT_PUBLIC_APP_URL when the order was created). The payment has
        // ALREADY been verified and settled above — never surface a bad
        // redirect as a raw 500 to someone who genuinely paid.
        return fallback(result.success ? 'success' : 'failed');
      }
    }

    // Hosted-checkout FAILURE callback: no signed success trio, instead
    // error[code] / error[description] / error[metadata] (JSON holding order_id).
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
    // An unexpected error (a network failure during dual inquiry, say) can occur
    // AFTER the payment was verified and settled. Never show a raw 500 to a
    // payer who may have genuinely paid.
    return fallback('error');
  }
}
