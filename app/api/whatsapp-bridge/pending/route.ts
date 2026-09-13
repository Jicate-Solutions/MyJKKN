export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/pending/route.ts
//
// POST /api/whatsapp-bridge/pending?limit=20
//
// The on-campus bridge's poll. Claims up to `limit` pending messages, flips
// them to `sending` in the same database statement, and hands them over.
//
// ⚠️ POST, NOT GET, and that is a correctness requirement rather than a style
// preference. This call MUTATES: a claimed row leaves `pending` and does not
// come back. GET is defined as safe, and everything in the path between the
// bridge and Vercel behaves accordingly — a client library that retries an
// idle GET, a proxy that prefetches one, a browser that replays one from the
// address bar. Each of those would claim a second batch nobody asked for, and
// the batch it claimed would sit in `sending` undelivered, which raises no
// error anywhere. Naming it POST removes that whole class of accident.
//
// Bridge-authenticated only. There is deliberately no user-session path: a
// signed-in member of staff who could call this would be able to take messages
// out of the queue and leave them stranded in `sending`.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateBridge, clampLimit } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

export async function POST(request: NextRequest) {
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

/**
 * Answer a GET explicitly rather than letting Next.js return its generic 405.
 *
 * A bridge still running the old contract would otherwise see an unexplained
 * 405 and its operator would have nothing to go on. This says which verb to
 * use, and it never claims anything.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        'Use POST to claim pending messages. This call mutates the queue, so it is not available over GET.',
    },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
