export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/ack/route.ts
//
// POST /api/whatsapp-bridge/ack
//   { id, status: 'sent' | 'failed', wa_message_id?, error? }
//
// The bridge reporting what happened to a message it claimed. The retry
// decision lives in fn_wa_bridge_ack, not here: it depends on the row's current
// attempt count and has to be read and written in one statement, or two racing
// acks both read the same count and the message is attempted a fourth time.
//
// Bridge-authenticated only. A user session must never be able to forge a
// delivery receipt.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateBridge, readJsonBody } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

interface AckBody {
  id?: unknown;
  status?: unknown;
  wa_message_id?: unknown;
  error?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  await connection();

  const unauthorized = authenticateBridge(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonBody<AckBody>(request);
  if (parsed.response) return parsed.response;

  const { id, status, wa_message_id: waMessageId, error: bridgeError } = parsed.body;

  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be a message uuid' }, { status: 400 });
  }
  if (status !== 'sent' && status !== 'failed') {
    return NextResponse.json({ error: "status must be 'sent' or 'failed'" }, { status: 400 });
  }

  try {
    const result = await BridgeOutboxService.ack({
      id,
      status,
      waMessageId: typeof waMessageId === 'string' ? waMessageId : null,
      error: typeof bridgeError === 'string' ? bridgeError.slice(0, 1000) : null,
    });

    // A repeated ack is not an error — the bridge retries on purpose — but it
    // is reported honestly rather than answered with a bare success, so a
    // bridge acknowledging rows it never claimed is visible in its own logs.
    if (!result.matched) {
      return NextResponse.json({
        success: true,
        matched: false,
        note: 'No message was awaiting acknowledgement under this id',
      });
    }

    return NextResponse.json({
      success: true,
      matched: true,
      status: result.status,
      attempts: result.attempts,
    });
  } catch (err) {
    console.error(
      '[whatsapp-bridge/ack] failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to record acknowledgement' }, { status: 500 });
  }
}
