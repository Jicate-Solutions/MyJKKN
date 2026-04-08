

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

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

    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    // Use service role client for DB operations to bypass RLS
    // (prevents issues on mobile PWA where RLS context may be inconsistent)
    const serviceClient = createServiceRoleClient();

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

    return NextResponse.json({
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error in push subscription deletion endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
