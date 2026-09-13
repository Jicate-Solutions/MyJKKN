export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/heartbeat/route.ts
//
// POST /api/whatsapp-bridge/heartbeat
//   { connected, logged_in, phone_number, version }
//
// The bridge saying it is alive. `connected` and `logged_in` are separate
// answers and both are stored: a bridge process that is running but whose
// WhatsApp session has been logged out looks perfectly healthy from outside
// while delivering nothing, and that is the state worth being able to see.
//
// Bridge-authenticated only.

import { NextRequest, connection } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateBridge, readJsonBody } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

interface HeartbeatBody {
  connected?: unknown;
  logged_in?: unknown;
  phone_number?: unknown;
  version?: unknown;
}

export async function POST(request: NextRequest) {
  await connection();

  const unauthorized = authenticateBridge(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonBody<HeartbeatBody>(request);
  if (parsed.response) return parsed.response;

  const { connected: isConnected, logged_in: loggedIn, phone_number: phoneNumber, version } =
    parsed.body;

  if (typeof isConnected !== 'boolean') {
    return NextResponse.json({ error: 'connected must be a boolean' }, { status: 400 });
  }
  if (typeof loggedIn !== 'boolean') {
    return NextResponse.json({ error: 'logged_in must be a boolean' }, { status: 400 });
  }

  try {
    await BridgeOutboxService.recordHeartbeat({
      connected: isConnected,
      loggedIn,
      phoneNumber: typeof phoneNumber === 'string' ? phoneNumber : null,
      version: typeof version === 'string' ? version.slice(0, 100) : null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      '[whatsapp-bridge/heartbeat] failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 });
  }
}
