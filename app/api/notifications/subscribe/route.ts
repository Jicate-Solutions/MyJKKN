import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the subscription data from the request
    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    // Check if subscription already exists for this user
    const { data: existingSubscription } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('subscription->endpoint', subscription.endpoint)
      .single();

    if (existingSubscription) {
      return NextResponse.json(
        { message: 'Subscription already exists' },
        { status: 200 }
      );
    }

    // Insert the new subscription
    const { data, error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: user.id,
        subscription: subscription
      })
      .select()
      .single();

    if (error) {
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
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the subscription endpoint from the request
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    // Delete the subscription
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('subscription->endpoint', endpoint);

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
