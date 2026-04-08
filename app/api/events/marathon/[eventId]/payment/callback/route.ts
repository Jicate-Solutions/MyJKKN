

// GET/POST /api/events/marathon/[eventId]/payment/callback
// HDFC redirects here after payment. Verifies payment server-to-server,
// then redirects user to success or failed page on the external marathon app.

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

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

    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        if (!transactionRef) {
          transactionRef = formData.get('order_id')?.toString() || null;
        }
        if (!clientStatus) {
          clientStatus =
            formData.get('status')?.toString() ||
            formData.get('order_status')?.toString() ||
            '';
        }
        if (!hdfcOrderId) {
          hdfcOrderId = formData.get('order_id')?.toString() || '';
        }
      } catch {
        // No form data — continue with URL params
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
      redirectPage,
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
