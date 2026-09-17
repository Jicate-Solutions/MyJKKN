// POST /api/ims/payment/gateway/[id]/cancel
//
// The cashier dismissed a QR that is still on screen.
//
// This route exists because the QR instrument does. The hosted-checkout flow never
// needed it: Razorpay's own page owned the cancel button, and abandoning it simply
// left our row to expire. A QR rendered on the till is OUR responsibility to stop —
// otherwise the last customer's basket stays payable at the counter for another
// quarter of an hour.
//
// Note what a 200 here does NOT mean. `cancelled: false` with reason
// 'payment_in_flight' is a success: the gateway reported money against the QR at
// close time, so the payment was deliberately left open to settle into a sale. The
// screen must keep polling on that answer, not treat it as a dead end. See
// ImsGatewayPaymentService.cancel for why the gateway, and not this route, decides.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsGatewayPaymentService } from '@/lib/services/ims/gateway-payment-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await ImsGatewayPaymentService.cancel(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS Gateway QR] cancel failed:', error);

    if (message === 'Payment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
