// POST /api/ims/payment/pos-device/[id]/cancel
//
// The cashier is withdrawing an amount from the terminal — either the one on their
// own screen, or one left behind that is keeping the terminal busy.
//
// This matters more than the QR cancel next door: a push left alone keeps the
// terminal ARMED, so the last customer's amount stays payable at the counter until
// the server's deadline withdraws it.
//
// As with the gateway cancel, a 200 is not always "cancelled". `cancelled: false`
// with reason 'payment_in_flight' means the customer is paying on the terminal
// right now (Ezetap refused the cancel), or finished paying as we cancelled. The
// screen must keep polling on that answer. The terminal decides, not this route —
// see ImsPosDevicePaymentService.cancel.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsPosDevicePaymentService } from '@/lib/services/ims/pos-device-payment-service';

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

    const result = await ImsPosDevicePaymentService.cancel(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS POS Terminal] cancel failed:', error);

    if (message === 'Payment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
