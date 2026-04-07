export const dynamic = 'force-dynamic';

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
async function handleCallback(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract transaction_ref from URL params (set when creating session)
    let transactionRef = searchParams.get('transaction_ref');

    // Also try to extract from form data (HDFC may POST form data)
    let clientStatus = searchParams.get('order_status') || '';
    let hdfcOrderId = searchParams.get('order_id') || '';

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

    // Determine redirect base URL for the external marathon app
    const marathonAppUrl =
      process.env.NEXT_PUBLIC_MARATHON_APP_URL ||
      request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    if (!transactionRef) {
      logger.warn('events/payment-callback', 'No transaction_ref in callback');
      const failUrl = new URL('/payment/failed', marathonAppUrl);
      failUrl.searchParams.set('error', 'missing_transaction');
      return NextResponse.redirect(failUrl, 303);
    }

    // Verify and process payment
    const result = await EventPaymentService.handleCallback(
      transactionRef,
      clientStatus || undefined
    );

    // Build redirect URL
    const redirectPage = result.success ? '/payment/success' : '/payment/failed';
    const redirectUrl = new URL(redirectPage, marathonAppUrl);
    redirectUrl.searchParams.set('txn', result.transactionId);

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

    const marathonAppUrl =
      process.env.NEXT_PUBLIC_MARATHON_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    const failUrl = new URL('/payment/failed', marathonAppUrl);
    failUrl.searchParams.set('error', 'processing_failed');
    return NextResponse.redirect(failUrl, 303);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  await params; // consume params to avoid Next.js warning
  return handleCallback(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  await params;
  return handleCallback(request);
}
