// POST /api/ims/payment/pos-device/push
//
// Sends the current cart's total to the counter's payment terminal, which shows
// the customer a UPI QR for it.
//
// Same rule as the gateway create route next door: NO AMOUNT IS ACCEPTED. The
// browser says which items and how many; the server prices them and pushes that
// figure. The sale is later booked from the same server-priced snapshot, so the
// amount on the terminal and the amount on the bill cannot drift apart.
//
// Status codes carry meaning the screen acts on:
//   409  the terminal is holding another payment — `blocking` names it so the
//        cashier can cancel it and retry
//   400  something at the counter to fix (cart, config, no terminal)
//   502  the terminal refused the push — the message is written for the cashier
//        (describePushError) and is passed through intact

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ImsPosDevicePaymentService,
  PosDeviceBusyError,
} from '@/lib/services/ims/pos-device-payment-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      storeId, lines, additionalDiscount, customerType, customerName, customerPhone,
    } = body ?? {};

    if (!storeId || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'storeId and at least one cart line are required' },
        { status: 400 },
      );
    }

    const result = await ImsPosDevicePaymentService.pushToDevice(
      { storeId, lines, additionalDiscount, customerType, customerName, customerPhone },
      user.id,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PosDeviceBusyError) {
      return NextResponse.json(
        { error: error.message, blocking: error.blocking },
        { status: 409 },
      );
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS POS Terminal] push failed:', error);

    if (message === 'Store not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    // Anchored on our own wording, so a vendor message that happens to mention
    // "permission" is not mistaken for the cashier lacking one.
    if (message.startsWith('You do not have')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message.includes('no longer available') ||
      message.includes('Not enough stock') ||
      message.includes('Cart') ||
      message.includes('Quantity') ||
      message.includes('discount') ||
      message.includes('minimum') ||
      message.includes('counter limit') ||
      message.includes('selling counter') ||
      message.includes('No payment terminal') ||
      message.includes('DEMO terminal') ||
      message.includes('switched off') ||
      message.includes('credentials')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Not 500: the likeliest thing left is the terminal refusing the push, and that
    // message already tells the cashier what to do next.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
