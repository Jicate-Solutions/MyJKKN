export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import {
  recordPushOptIn,
  recordPushOptOut,
  shouldRefusePushSubscribe
} from '@/lib/push/opt-out';

export async function POST(request: NextRequest) {
  await connection();
  try {
    // Authenticate via cookie-based client
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription, deliberate } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    // Use service role client for DB operations to bypass RLS
    // (prevents issues on mobile PWA where RLS context may be inconsistent)
    const serviceClient = createServiceRoleClient();

    // ── The opt-out gate ──────────────────────────────────────────────────
    // Most calls into this endpoint are NOT a person asking for notifications.
    // They come from the provider's auto-subscribe effect, which fires on any
    // page load where permission is still 'granted' but the browser holds no
    // subscription — exactly the state unsubscribing leaves behind, because
    // `subscription.unsubscribe()` destroys the endpoint. Writing a row here
    // for somebody who switched push off is what resurrects them, and no value
    // of `is_active` can prevent it: the endpoint is new, so the row is new.
    //
    // `deliberate` is set ONLY by an explicit user action (the provider sends
    // it as `!isAutoResubscribeRef.current`). Absent it, this is a page-load
    // side effect and must never re-enable anybody.
    const isDeliberate = deliberate === true;

    if (isDeliberate) {
      // The person clicked "Enable". That, and only that, clears the opt-out.
      await recordPushOptIn(serviceClient, user.id);
    } else if (await shouldRefusePushSubscribe(serviceClient, user.id)) {
      // 200, not an error: an opted-out person hitting a page is an expected
      // state, and a failure status here would surface as a toast to somebody
      // who is getting exactly what they asked for.
      return NextResponse.json(
        { ok: true, skipped: 'user_opted_out' },
        { status: 200 }
      );
    }

    // Check if this exact subscription already exists
    const { data: existingSubscription } = await serviceClient
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('subscription->>endpoint', subscription.endpoint)
      .single();

    if (existingSubscription) {
      // Update the subscription data in case keys rotated
      await serviceClient
        .from('push_subscriptions')
        .update({ subscription })
        .eq('id', existingSubscription.id);

      return NextResponse.json(
        { message: 'Subscription already exists' },
        { status: 200 }
      );
    }

    // Before inserting, limit subscriptions per user to prevent stale endpoint buildup.
    // Keep max 3 most recent subscriptions (covers desktop + mobile + tablet).
    const { data: userSubs } = await serviceClient
      .from('push_subscriptions')
      .select('id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (userSubs && userSubs.length >= 3) {
      // Delete oldest subscriptions beyond the limit (keep newest 2 + new one = 3)
      const idsToDelete = userSubs.slice(2).map((s: any) => s.id);
      if (idsToDelete.length > 0) {
        await serviceClient
          .from('push_subscriptions')
          .delete()
          .in('id', idsToDelete);
      }
    }

    // Insert the new subscription
    const { data, error } = await serviceClient
      .from('push_subscriptions')
      .insert({
        user_id: user.id,
        subscription: subscription
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation gracefully
      if (error.code === '23505') {
        return NextResponse.json(
          { message: 'Subscription already exists' },
          { status: 200 }
        );
      }
      console.error('Error saving push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to save subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Subscription saved successfully',
      subscription: data
    });
  } catch (error) {
    console.error('Error in push subscription endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  await connection();
  try {
    // Authenticate via cookie-based client
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    // Use service role to bypass RLS
    const serviceClient = createServiceRoleClient();

    // Record the opt-out BEFORE the row goes, because this handler HARD-deletes
    // it. Until now that left no trace of the request anywhere in the database:
    // the flag lived on the row, the row was removed, and the next page load
    // minted a fresh subscription. The preference outlives the endpoint.
    const preferenceRecorded = await recordPushOptOut(serviceClient, user.id);

    const { error } = await serviceClient
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('subscription->>endpoint', endpoint);

    if (error) {
      console.error('Error deleting push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to delete subscription' },
        { status: 500 }
      );
    }

    // Reported rather than swallowed: if the preference could not be written the
    // unsubscribe still happened, but it will not survive the next page load,
    // and a silent success would hide that.
    return NextResponse.json({
      message: 'Subscription deleted successfully',
      preference_recorded: preferenceRecorded
    });
  } catch (error) {
    console.error('Error in push subscription deletion endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
