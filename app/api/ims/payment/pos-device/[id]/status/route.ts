// GET /api/ims/payment/pos-device/[id]/status
//
// What the POS screen polls while the amount is on the terminal.
//
// Like the gateway status route, this is not a passive read — and here it matters
// even more. The terminal has no webhook: the server asking Ezetap is the ONLY way
// a payment is ever confirmed, so this call asks (rate-limited server-side), applies
// the answer, withdraws the push once its deadline passes, and books the sale in the
// cashier's own session. The browser never asserts anything; it only reports what
// the server now thinks.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsPosDevicePaymentService } from '@/lib/services/ims/pos-device-payment-service';

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

    const status = await ImsPosDevicePaymentService.getStatus(id, user.id);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS POS Terminal] status failed:', error);

    if (message === 'Payment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
