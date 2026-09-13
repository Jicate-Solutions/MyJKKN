export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/status/route.ts
//
// GET /api/whatsapp-bridge/status
//
// The staff-facing view: is the campus bridge alive, is it still logged in to
// WhatsApp, and what is piled up behind it.
//
// This is the ONE endpoint in this folder that takes a normal MyJKKN session,
// and it refuses the bridge secret outright. The secret lives in a config file
// on a Windows machine in a staff room; if it leaks it must not become a way to
// read the queue. The two authentication paths are kept disjoint on purpose —
// a bridge route never reads a session, and this route never checks a secret.

import { connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rejectsBridgeSecret } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

export async function GET(request: NextRequest) {
  await connection();

  const bridgeSecretPresented = rejectsBridgeSecret(request);
  if (bridgeSecretPresented) return bridgeSecretPresented;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // The caller's own client, so the counts are read through RLS. A member of
    // staff who may not see the queue must not be told how long it is either.
    const snapshot = await BridgeOutboxService.getStatus(supabase);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error(
      '[whatsapp-bridge/status] failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to read bridge status' }, { status: 500 });
  }
}
