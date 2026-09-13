export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/inbound/route.ts
//
// POST /api/whatsapp-bridge/inbound
//   { from, sender_name, wa_message_id, body, type, timestamp, is_group }
//
// A message the bridge received. Recorded, then matched to an admission lead by
// normalised phone — the same variants the existing BYOW webhook uses, so one
// number resolves to one lead whichever door it came in through.
//
// IDEMPOTENT on wa_message_id. The bridge re-posts anything it is not certain
// reached us; a duplicate must collapse onto the first record rather than
// making it look as though a parent wrote twice.
//
// Bridge-authenticated only. Accepting a user session here would let a signed-in
// user fabricate a message attributed to a lead.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateBridge, readJsonBody } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

interface InboundBody {
  from?: unknown;
  sender_name?: unknown;
  wa_message_id?: unknown;
  body?: unknown;
  type?: unknown;
  timestamp?: unknown;
  is_group?: unknown;
}

export async function POST(request: NextRequest) {
  await connection();

  const unauthorized = authenticateBridge(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonBody<InboundBody>(request);
  if (parsed.response) return parsed.response;

  const {
    from,
    sender_name: senderName,
    wa_message_id: waMessageId,
    body,
    type,
    timestamp,
    is_group: isGroup,
  } = parsed.body;

  if (typeof from !== 'string' || from.trim().length === 0) {
    return NextResponse.json({ error: 'from is required' }, { status: 400 });
  }
  // Required, and not defaultable: without it there is no idempotency key, and
  // the next retry would record the same message a second time.
  if (typeof waMessageId !== 'string' || waMessageId.trim().length === 0) {
    return NextResponse.json({ error: 'wa_message_id is required' }, { status: 400 });
  }

  try {
    const result = await BridgeOutboxService.recordInbound({
      from: from.trim(),
      senderName: typeof senderName === 'string' ? senderName : null,
      waMessageId: waMessageId.trim(),
      body: typeof body === 'string' ? body : null,
      type: typeof type === 'string' ? type : 'text',
      timestamp: typeof timestamp === 'number' ? timestamp : null,
      isGroup: typeof isGroup === 'boolean' ? isGroup : false,
    });

    return NextResponse.json({
      success: true,
      id: result.id,
      lead_id: result.leadId,
      duplicate: result.duplicate,
    });
  } catch (err) {
    console.error(
      '[whatsapp-bridge/inbound] failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to record inbound message' }, { status: 500 });
  }
}
