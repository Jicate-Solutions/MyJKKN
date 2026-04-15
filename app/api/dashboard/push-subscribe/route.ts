/**
 * Dashboard v2 — Push subscription save endpoint
 *
 * POST /api/dashboard/push-subscribe
 * Body: { subscription: PushSubscriptionJSON, rotation?: boolean }
 *
 * Saves to push_subscriptions (existing table, Day 1 added is_active+failure_count cols).
 * Upsert on (user_id, endpoint) unique constraint.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.4, §6.2
 * Decision Round 3.12: soft-delete on 410 Gone + re-subscribe on next login
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sub = body?.subscription;

    if (!sub || !sub.endpoint) {
      return NextResponse.json(
        { ok: false, error: 'missing_subscription' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'not_authenticated' },
        { status: 401 }
      );
    }

    // Upsert: one active subscription per (user_id, endpoint)
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          subscription: sub,
          is_active: true,
          failure_count: 0,
          last_failed_at: null,
          updated_at: new Date().toISOString()
        } as never,
        { onConflict: 'user_id,endpoint', ignoreDuplicates: false }
      )
      .select('id, endpoint, is_active')
      .single();

    if (error) {
      console.error('[push-subscribe] upsert error:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      subscription_id: data?.id,
      rotation: body?.rotation === true
    });
  } catch (err) {
    console.error('[push-subscribe] unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const endpoint = body?.endpoint as string | undefined;

    if (!endpoint) {
      return NextResponse.json(
        { ok: false, error: 'missing_endpoint' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'not_authenticated' },
        { status: 401 }
      );
    }

    // Soft-delete: mark inactive (per Round 3.12 decision — keep history)
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[push-subscribe] soft-delete error:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscribe] unexpected DELETE error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
