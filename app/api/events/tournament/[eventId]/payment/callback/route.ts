export const dynamic = 'force-dynamic';

// GET /api/events/tournament/[eventId]/payment/callback?transaction_ref=...
// HDFC SmartGateway redirects here after a tournament entry payment. Reuses
// EventPaymentService.handleCallback (event-type-agnostic — it finalizes off the
// transaction_ref → events_registrations). On completion we redirect the payer back
// to the tournament page with a status flag.

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const url = new URL(request.url);
  const transactionRef = url.searchParams.get('transaction_ref') || '';
  const clientStatus = url.searchParams.get('status') || undefined;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const back = (flag: string) =>
    NextResponse.redirect(`${appUrl}/events/tournament/${eventId}?payment=${flag}`);

  if (!transactionRef) return back('error');

  try {
    const result = await EventPaymentService.handleCallback(transactionRef, clientStatus);
    return back(result.success ? 'success' : 'failed');
  } catch {
    return back('error');
  }
}
