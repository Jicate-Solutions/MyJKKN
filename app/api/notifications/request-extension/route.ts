import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    const body = await request.json();

    const { notification_id, reason, requested_deadline } = body as {
      notification_id: string;
      reason: string;
      requested_deadline: string;
    };

    // Validate required fields
    if (!notification_id || !reason || !requested_deadline) {
      return NextResponse.json(
        {
          error:
            'notification_id, reason, and requested_deadline are required'
        },
        { status: 400 }
      );
    }

    // Validate reason minimum length
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    // Validate requested_deadline is a future date
    const deadlineDate = new Date(requested_deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { error: 'requested_deadline must be a valid date' },
        { status: 400 }
      );
    }
    if (deadlineDate <= new Date()) {
      return NextResponse.json(
        { error: 'requested_deadline must be in the future' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Check no approved extension already exists for this user + notification
    const { data: existing, error: checkError } = await (serviceClient as any)
      .from('action_extension_requests')
      .select('id, status')
      .eq('notification_id', notification_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (checkError) {
      console.error(
        '[notifications/request-extension] Check error:',
        checkError
      );
      return NextResponse.json(
        { error: 'Failed to check existing extensions' },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        {
          error:
            'An approved extension already exists for this notification'
        },
        { status: 409 }
      );
    }

    // Insert the extension request
    const { data: inserted, error: insertError } = await (
      serviceClient as any
    )
      .from('action_extension_requests')
      .insert({
        notification_id,
        user_id: user.id,
        reason: reason.trim(),
        requested_deadline,
        status: 'pending'
      })
      .select('id, status')
      .single();

    if (insertError) {
      console.error(
        '[notifications/request-extension] Insert error:',
        insertError
      );
      return NextResponse.json(
        { error: 'Failed to create extension request' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { id: inserted.id, status: inserted.status },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.error(
      '[notifications/request-extension] Unexpected error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
