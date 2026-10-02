// app/api/cron/ims-pos-device-sweep/route.ts
//
// Backstop for IMS counter payments pushed to a Razorpay POS DQR terminal.
//
// The POS screen's poll normally resolves every push while the cashier watches.
// This covers the tab that was closed mid-payment: without it the terminal keeps
// showing a payable amount nobody is tracking, and the next sale at that counter
// is refused as "device busy". See ImsPosDevicePaymentService.sweep.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) OR `?secret=`.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { ImsPosDevicePaymentService } from '@/lib/services/ims/pos-device-payment-service';
import { PosDeviceVault } from '@/lib/services/payments/ezetap/device-vault';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // No master secret ⇒ no terminal can have credentials ⇒ nothing to sweep.
  if (!PosDeviceVault.isConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'vault not configured' });
  }

  try {
    const result = await ImsPosDevicePaymentService.sweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/ims-pos-device-sweep] failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
