

// GET /api/events/marathon/[eventId]/payment/status/[transactionId]
// Public endpoint — returns current payment status for a transaction.

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; transactionId: string }> }
) {
  try {
    const { eventId, transactionId } = await params;

    const transaction = await EventPaymentService.checkPaymentStatus(transactionId);

    if (!transaction) {
      return NextResponse.json(
        { error: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify the transaction belongs to this event
    if (transaction.event_id !== eventId) {
      return NextResponse.json(
        { error: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: transaction.id,
          event_id: transaction.event_id,
          registration_id: transaction.registration_id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          payment_method: transaction.payment_method,
          paid_at: transaction.paid_at,
          created_at: transaction.created_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('events/payment-api', 'Payment status check failed', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
