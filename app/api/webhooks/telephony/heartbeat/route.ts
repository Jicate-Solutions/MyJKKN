import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Heartbeat is a fast-path INSERT; 30s is generous headroom against the
// Vercel 10s default. Future CRITICAL-event branching (notification dispatch,
// Director WA alert) will benefit from this cushion.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Auth
  const token = request.nextUrl.searchParams.get('token')
    || request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token');

  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    if (tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const payload = await request.json();

    // Store health event
    await supabase.from('telephony_health_events').insert({
      status_type: payload.status_type || 'CRITICAL',
      connectivity_status: payload.connectivity_status,
      incoming_affected: payload.incoming_affected || [],
      outgoing_affected: payload.outgoing_affected || [],
      alternate_exophones: payload.alternate_exophone || null,
      raw_payload: payload,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Heartbeat Webhook] Error:', error);
    return NextResponse.json({ received: true, error: String(error) });
  }
}
