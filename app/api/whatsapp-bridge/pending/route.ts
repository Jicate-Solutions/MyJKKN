export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/pending/route.ts
//
// GET /api/whatsapp-bridge/pending?limit=20
//
// The on-campus bridge's poll. Claims up to `limit` pending messages, flips
// them to `sending` in the same database statement, and hands them over.
//
// Bridge-authenticated only. There is deliberately no user-session path: a
// signed-in member of staff who could call this would be able to take messages
// out of the queue and leave them stranded in `sending`, which delivers nothing
// and raises no error anywhere.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateBridge, clampLimit } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

export async function GET(request: NextRequest) {
  await connection();

  const unauthorized = authenticateBridge(request);
  if (unauthorized) return unauthorized;

  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const messages = await BridgeOutboxService.claimPending(limit);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error(
      '[whatsapp-bridge/pending] claim failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to claim pending messages' }, { status: 500 });
  }
}
