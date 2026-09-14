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
// ⚠️ A number that resolves to MORE THAN ONE lead is attached to NONE of them.
// At JKKN siblings genuinely share a parent's phone, so "two leads, same
// number" is ordinary rather than dirty data. The message is stored with
// match_status = 'ambiguous' and its candidates counted, for a person to
// resolve. See BridgeOutboxService.matchLead.
//
// IDEMPOTENT on wa_message_id. The bridge re-posts anything it is not certain
// reached us; a duplicate must collapse onto the first record rather than
// making it look as though a parent wrote twice.
//
// Bridge-authenticated only. Accepting a user session here would let a signed-in
// user fabricate a message attributed to a lead.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authenticateBridge,
  readJsonBody,
  messageCharLength,
  MAX_MESSAGE_CHARS,
} from '../_lib/bridge-auth';
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

  // readJsonBody guarantees a non-null, non-array object here, so the
  // destructure below cannot throw on a literal `null` body and be answered as
  // a 500. That guarantee is the fix, and it lives in one place rather than
  // being repeated defensively in each of the three bridge routes.
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
  // Counted in CHARACTERS, which is how WhatsApp counts. A byte cap here would
  // refuse a Tamil message at roughly a third of the length it refuses an
  // English one, for no reason a parent could ever see or act on.
  if (typeof body === 'string' && messageCharLength(body) > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `body exceeds ${MAX_MESSAGE_CHARS} characters` },
      { status: 413 }
    );
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
      // Reported, not hidden. `ambiguous` means several leads share this number
      // — siblings, most often — and the message was deliberately left
      // unattached rather than guessed onto one of their records.
      match_status: result.matchStatus,
      match_candidate_count: result.matchCandidateCount,
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
