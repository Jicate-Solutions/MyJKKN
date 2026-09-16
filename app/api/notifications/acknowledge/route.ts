export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapBlockingItems } from '@/lib/notifications/blocking-items';

/**
 * POST /api/notifications/acknowledge
 *
 * Records explicit acknowledgment of a notification.
 * Unlike "read" (passive - just opened it), "acknowledge" is an
 * active confirmation that the user has seen and understood the content.
 *
 * This is the key differentiator from Google Chat's voluntary 🙏 reaction.
 * In MyJKKN, acknowledgment is system-enforced and permanently recorded.
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notification_id } = await request.json();

    if (!notification_id) {
      return NextResponse.json(
        { error: 'notification_id is required' },
        { status: 400 }
      );
    }

    // Use database function to bypass PostgREST column cache issues
    // The function handles: find record, check already-acked, set acknowledged_at + read_at
    const { data: result, error: rpcError } = await supabase
      .rpc('acknowledge_notification', {
        p_notification_id: notification_id,
        p_user_id: user.id
      });

    if (rpcError) {
      console.error('Error acknowledging notification:', rpcError);
      return NextResponse.json(
        { error: 'Failed to record acknowledgment' },
        { status: 500 }
      );
    }

    if (result?.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    console.error('Error in acknowledge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/acknowledge
 *
 * Returns all unacknowledged notifications that require acknowledgment
 * for the current user. This powers the blocking modal.
 */
export async function GET() {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use DB function to bypass PostgREST column cache issues
    // PostgREST silently drops filters on unknown columns (acknowledged_at),
    // causing already-acknowledged notifications to reappear
    // 2026-09-16: same queue as /api/notifications/pulse (ack + must-answer +
    // due bug-feedback questions, tagged by `kind`).
    const { data: items, error } = await (supabase as any)
      .rpc('get_blocking_items', { p_user_id: user.id });

    if (error) {
      console.error('Error fetching unacknowledged notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unacknowledged notifications' },
        { status: 500 }
      );
    }

    const unacknowledged = mapBlockingItems(items, new Date());

    return NextResponse.json({
      unacknowledged,
      count: unacknowledged.length,
      has_pending: unacknowledged.length > 0
    }, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    console.error('Error in acknowledge GET endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
