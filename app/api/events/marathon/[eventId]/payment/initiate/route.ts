

// POST /api/events/marathon/[eventId]/payment/initiate
// Public endpoint — creates an HDFC payment session for an event registration.
// No auth required (called by external marathon app).

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      registration_id,
      amount,
      payer_name,
      payer_email,
      payer_phone,
      discount_code,
    } = body as {
      registration_id?: string;
      amount?: number;
      payer_name?: string;
      payer_email?: string;
      payer_phone?: string;
      discount_code?: string;
    };

    // Validate required fields
    if (!registration_id || !amount || !payer_name || !payer_email || !payer_phone) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message:
            'registration_id, amount, payer_name, payer_email, and payer_phone are required',
        },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'INVALID_AMOUNT', message: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    logger.info('events/payment-api', 'Payment initiation request', {
      eventId,
      registrationId: registration_id,
      amount,
    });

    // Build return URL for HDFC callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `${appUrl}/api/events/marathon/${eventId}/payment/callback`;

    const result = await EventPaymentService.initiatePayment({
      registrationId: registration_id,
      eventId,
      amount,
      payerName: payer_name,
      payerEmail: payer_email,
      payerPhone: payer_phone,
      discountCode: discount_code,
      returnUrl,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          payment_url: result.payment_url,
          transaction_id: result.transaction_id,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('events/payment-api', 'Payment initiation failed', error);

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    // Return user-facing errors with appropriate status
    if (
      message === 'Registration not found' ||
      message === 'Registration is already paid'
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message },
      { status: 500 }
    );
  }
}
