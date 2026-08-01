// GET /api/ims/payment/gateway/[id]/status
//
// What the POS screen polls while the QR is on display.
//
// This is not a passive read. If the payment is still open it asks Razorpay
// directly, and if the money is confirmed but the sale has not been booked it books
// it — in the cashier's own session, which is why ims_pos_checkout's auth.uid()
// guard needs no service-role bypass.
//
// That matters more than it sounds: the webhook is not a reliable single path.
// Razorpay cannot reach localhost at all, so in development the webhook NEVER
// arrives — and in production it can still be missed or misconfigured. A screen that
// only re-read our own table would leave a customer who has paid looking at a
// pending QR indefinitely.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsGatewayPaymentService } from '@/lib/services/ims/gateway-payment-service';

export async function GET(
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

    const status = await ImsGatewayPaymentService.getStatus(id, user.id);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS Gateway QR] status failed:', error);

    if (message === 'Payment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
