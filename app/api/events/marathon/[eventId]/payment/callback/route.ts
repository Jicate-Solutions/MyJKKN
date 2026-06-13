export const dynamic = 'force-dynamic';

// GET/POST /api/events/marathon/[eventId]/payment/callback
// HDFC redirects here after payment. Verifies payment server-to-server,
// then redirects user to success or failed page on the external marathon app.

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';

/**
 * Common callback handler for both GET and POST.
 * HDFC may redirect via GET or POST depending on configuration.
 */
async function handleCallback(request: NextRequest, paramsPromise: Promise<{ eventId: string }>) {
  try {
    const urlParams = request.nextUrl.searchParams;

    // Extract transaction_ref from URL params (set when creating session)
    let transactionRef = urlParams.get('transaction_ref');

    // Also try to extract from form data (HDFC may POST form data)
    let clientStatus = urlParams.get('order_status') || '';
    let hdfcOrderId = urlParams.get('order_id') || '';
    let formDataParsed: FormData | null = null;

    if (request.method === 'POST') {
      try {
        formDataParsed = await request.formData();
        if (!transactionRef) {
          transactionRef = formDataParsed.get('order_id')?.toString() || null;
        }
        if (!clientStatus) {
          clientStatus =
            formDataParsed.get('status')?.toString() ||
            formDataParsed.get('order_status')?.toString() ||
            '';
        }
        if (!hdfcOrderId) {
          hdfcOrderId = formDataParsed.get('order_id')?.toString() || '';
        }
      } catch {
        // No form data — continue with URL params
      }
    }

    // ------------------------------------------------------------------
    // Task 24: Razorpay callback branch.
    // Razorpay Checkout.js POSTs razorpay_order_id, razorpay_payment_id,
    // razorpay_signature. Detect that and run signature + dual-inquiry
    // verification, then redirect to the marathon success/failed page.
    // ------------------------------------------------------------------
    if (formDataParsed) {
      const rOrderId = formDataParsed.get('razorpay_order_id')?.toString();
      const rPaymentId = formDataParsed.get('razorpay_payment_id')?.toString();
      const rSignature = formDataParsed.get('razorpay_signature')?.toString();

      if (rOrderId && rPaymentId && rSignature) {
        const { eventId: evId } = await paramsPromise;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const supabase = createServiceRoleClient();

        const { data: txn } = await (supabase as any)
          .from('event_payment_transactions')
          .select('id, registration_id, amount_paise, total_amount, amount, status, institution_id, razorpay_account_id')
          .eq('razorpay_order_id', rOrderId)
          .single();

        if (!txn) {
          logger.warn('events/payment-callback', 'Razorpay callback for unknown order', { rOrderId });
          return NextResponse.redirect(new URL(`/events/marathon/${evId}/registrations?payment=failed&error=unknown_order`, appUrl), 303);
        }

        const provider = await getPaymentProvider('events', {
          accountId: txn.razorpay_account_id,
          institutionId: txn.institution_id,
        });
        const sigOk = provider.verifySignature({
          gatewayOrderId: rOrderId,
          gatewayPaymentId: rPaymentId,
          signature: rSignature,
        });

        if (!sigOk) {
          logger.warn('events/payment-callback', 'Razorpay signature invalid', { rOrderId });
          await (supabase as any)
            .from('event_payment_transactions')
            .update({ status: 'failed', gateway_response: { reason: 'signature_invalid' } })
            .eq('id', txn.id);
          return NextResponse.redirect(new URL(`/events/marathon/${evId}/registrations?payment=failed&error=signature_invalid`, appUrl), 303);
        }

        const status = await (provider as RazorpayProvider).dualInquiry(rOrderId, rPaymentId);
        const expectedPaise = Number(txn.amount_paise ?? Math.round(Number(txn.amount ?? 0) * 100));

        if (status.amountPaise !== expectedPaise) {
          logger.error('events/payment-callback', 'Razorpay amount mismatch', {
            rOrderId,
            expected: expectedPaise,
            actual: status.amountPaise,
          });
          await (supabase as any)
            .from('event_payment_transactions')
            .update({ status: 'failed', gateway_response: { reason: 'amount_mismatch', expectedPaise, actualPaise: status.amountPaise } })
            .eq('id', txn.id);
          return NextResponse.redirect(new URL(`/events/marathon/${evId}/registrations?payment=failed&error=amount_mismatch`, appUrl), 303);
        }

        if (status.status === 'captured') {
          await (supabase as any)
            .from('event_payment_transactions')
            .update({
              status: 'success',
              razorpay_payment_id: rPaymentId,
              captured_at: status.capturedAt?.toISOString() ?? new Date().toISOString(),
              payment_date: status.capturedAt?.toISOString() ?? new Date().toISOString(),
              completed_at: new Date().toISOString(),
              gateway_response: status.raw,
            })
            .eq('id', txn.id);

          // Mark registration as paid (mirror HDFC success-side-effect)
          if (txn.registration_id) {
            await (supabase as any)
              .from('events_registrations')
              .update({ payment_status: 'paid' })
              .eq('id', txn.registration_id);
          }

          return NextResponse.redirect(
            new URL(`/events/marathon/${evId}/registrations?payment=success&txn=${txn.id}`, appUrl),
            303,
          );
        }

        await (supabase as any)
          .from('event_payment_transactions')
          .update({ status: status.status === 'failed' ? 'failed' : 'processing', gateway_response: status.raw })
          .eq('id', txn.id);

        return NextResponse.redirect(
          new URL(`/events/marathon/${evId}/registrations?payment=${status.status === 'failed' ? 'failed' : 'pending'}&txn=${txn.id}`, appUrl),
          303,
        );
      }
    }

    logger.info('events/payment-callback', 'Callback received', {
      transactionRef,
      clientStatus,
      hdfcOrderId,
      method: request.method,
    });

    // Determine redirect base URL — use MyJKKN app URL (works for both internal and external)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
      'http://localhost:3000';
    const { eventId: evId } = await paramsPromise;
    const marathonAppUrl = appUrl;

    if (!transactionRef) {
      logger.warn('events/payment-callback', 'No transaction_ref in callback');
      const failUrl = new URL(`/events/marathon/${evId}/registrations?payment=failed&error=missing_transaction`, marathonAppUrl);
      return NextResponse.redirect(failUrl, 303);
    }

    // Check if user explicitly cancelled on HDFC page
    const isCancelled = ['CANCELLED', 'CANCEL', 'ABORTED', 'USER_CANCELLED'].includes(
      clientStatus.toUpperCase()
    );

    if (isCancelled) {
      logger.info('events/payment-callback', 'User cancelled payment', {
        transactionRef,
        eventId: evId,
      });
      // Redirect back to registration page with cancelled status — no registration created
      const cancelUrl = new URL(
        `/events/marathon/${evId}/registrations?payment=cancelled`,
        marathonAppUrl
      );
      return NextResponse.redirect(cancelUrl, 303);
    }

    // Verify and process payment
    const result = await EventPaymentService.handleCallback(
      transactionRef,
      clientStatus || undefined
    );

    // Build redirect URL
    const paymentStatus = result.success ? 'success' : 'failed';
    const redirectUrl = new URL(
      `/events/marathon/${evId}/registrations?payment=${paymentStatus}&txn=${result.transactionId}`,
      marathonAppUrl
    );

    if (result.registrationId) {
      redirectUrl.searchParams.set('reg', result.registrationId);
    }

    logger.info('events/payment-callback', 'Redirecting user', {
      success: result.success,
      paymentStatus,
      transactionId: result.transactionId,
    });

    // Use 303 See Other to convert POST to GET
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    logger.error('events/payment-callback', 'Callback processing failed', error);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const failUrl = new URL('/events?payment=failed&error=processing_failed', appUrl);
    return NextResponse.redirect(failUrl, 303);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  return handleCallback(request, context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  return handleCallback(request, context.params);
}
