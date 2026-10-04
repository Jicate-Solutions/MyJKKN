// GET /api/ims/payment/pos-device/terminal?storeId=
//
// Does this counter have a payment terminal? The POS asks once when checkout opens
// and shows the "Terminal" tab only on a yes.
//
// Answers with the label and environment and nothing else. The serial is what a
// push is addressed to, and the vault row carries the account and credentials —
// none of which the till needs to decide whether to show a tab.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImsPosDevicePaymentService } from '@/lib/services/ims/pos-device-payment-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = request.nextUrl.searchParams.get('storeId');
    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const device = await ImsPosDevicePaymentService.getStoreTerminal(storeId, user.id);
    return NextResponse.json({
      terminal: device ? { label: device.label, environment: device.environment } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[IMS POS Terminal] lookup failed:', error);

    if (message === 'Store not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'You do not have access to this store' || message.includes('permission')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes('selling counter')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
