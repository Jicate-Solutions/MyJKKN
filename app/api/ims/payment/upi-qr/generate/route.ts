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
    const { storeId, amount, customerName } = body;

    if (!storeId || !amount || amount <= 0 || amount > 100000) {
      return NextResponse.json(
        { error: 'storeId and a positive amount (max ₹1,00,000) are required' },
        { status: 400 }
      );
    }

    const result = await ImsPaymentService.generateUpiQr({
      storeId,
      amount,
      customerName: customerName ?? null,
      createdBy: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[UPI QR Generate] Error:', error);

    if (
      message === 'Store not found' ||
      message === 'User profile not found'
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (
      message === 'UPI VPA not configured for this store. Update store settings.' ||
      message === 'Failed to create payment record'
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (message === 'Store does not belong to your institution') {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
