// POST /api/ims/payment/gateway/create
//
// Opens a Razorpay payment session (order + hosted checkout) for the current cart.
//
// Note what this route does NOT accept: an amount, a unit price, or a cost price.
// The browser says WHICH items and how many; the server reads what they cost. The
// manual UPI QR route next door takes `amount` straight from the request body, which
// means the figure the customer is asked to pay need not match the figure the sale
// books. That cannot happen here.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsGatewayPaymentService } from '@/lib/services/ims/gateway-payment-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storeId, lines, additionalDiscount, customerType, customerName, customerPhone } = body ?? {};

    if (!storeId || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'storeId and at least one cart line are required' },
        { status: 400 },
      );
    }

    const result = await ImsGatewayPaymentService.createPaymentSession(
      {
        storeId,
        institutionId: '',   // resolved server-side from the store
        lines,
        additionalDiscount,
        customerType,
        customerName,
        customerPhone,
      },
      user.id,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS Gateway Payment] create failed:', error);

    if (message === 'Store not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'You do not have access to this store') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    // Cart problems and configuration problems are both the caller's to fix, and
    // both carry a message written for whoever is standing at the counter.
    if (
      message.includes('no longer available') ||
      message.includes('Not enough stock') ||
      message.includes('Cart') ||
      message.includes('Quantity') ||
      message.includes('discount') ||
      message.includes('minimum') ||
      message.includes('counter limit') ||
      message.includes('not set up for this store')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
