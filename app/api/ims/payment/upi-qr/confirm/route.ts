import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsPaymentService } from '@/lib/services/ims/payment-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transactionRef, upiTransactionId } = body;

    if (!transactionRef || !upiTransactionId) {
      return NextResponse.json(
        { error: 'transactionRef and upiTransactionId are required' },
        { status: 400 }
      );
    }

    const result = await ImsPaymentService.confirmUpiQr({
      transactionRef,
      upiTransactionId,
      confirmedBy: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[UPI QR Confirm] Error:', error);

    if (message === 'Payment record not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === 'Payment already confirmed') {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (
      message.startsWith('Payment is ') ||
      message === 'Payment has expired. Please generate a new QR.' ||
      message === 'Failed to confirm payment'
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
