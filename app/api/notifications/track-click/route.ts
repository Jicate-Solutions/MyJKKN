export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/track-click
 *
 * Records a push notification click. Called by the service worker when a user
 * taps a push notification. No auth required because the SW fires this before
 * the app is fully loaded and has no user session context.
 *
 * Uses the existing webhook_logs table with event_type 'push_notification.clicked'
 * so click data can be queried alongside other webhook events.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notification_id } = body;

    if (!notification_id) {
      return NextResponse.json(
        { error: 'notification_id required' },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS -- no user session from SW
    const serviceClient = createServiceRoleClient();

    // Log the click event into webhook_logs (existing table)
    await serviceClient.from('webhook_logs').insert({
      event_type: 'push_notification.clicked',
      table_name: 'user_notifications',
      record_id: notification_id,
      payload: {
        notification_id,
        clicked_at: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // Never let a tracking failure bubble up -- the user should navigate normally
    console.error('[notifications/track-click] Error:', error);
    return NextResponse.json({ ok: true });
  }
}
