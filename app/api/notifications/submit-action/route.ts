import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import type { ActionConfig, ResponseType } from '@/types/notifications';

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

    const {
      notification_id,
      response_type,
      text_response,
      file_url,
      file_name,
      file_size,
      form_response,
      link_confirmed
    } = body as {
      notification_id: string;
      response_type: ResponseType;
      text_response?: string;
      file_url?: string;
      file_name?: string;
      file_size?: number;
      form_response?: Record<string, boolean>;
      link_confirmed?: boolean;
    };

    if (!notification_id || !response_type) {
      return NextResponse.json(
        { error: 'notification_id and response_type are required' },
        { status: 400 }
      );
    }

    // Use service role client to read the notification's action_config (cross-RLS)
    const serviceClient = createServiceRoleClient();

    // IDOR check: verify the authenticated user is actually a recipient
    const { data: recipientCheck } = await (serviceClient as any)
      .from('user_notifications')
      .select('id')
      .eq('notification_id', notification_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!recipientCheck) {
      return NextResponse.json(
        { error: 'You are not a recipient of this notification' },
        { status: 403 }
      );
    }

    // Fetch the notification to validate against its action_config
    const { data: notification, error: notifError } = await (
      serviceClient as any
    )
      .from('notifications')
      .select('action_config, action_type')
      .eq('id', notification_id)
      .single();

    if (notifError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    const actionConfig: ActionConfig | null = notification.action_config;

    if (!actionConfig) {
      return NextResponse.json(
        { error: 'This notification does not require an action response' },
        { status: 400 }
      );
    }

    // Validate response_type matches the notification's expected response_type
    if (response_type !== actionConfig.response_type) {
      return NextResponse.json(
        {
          error: `Expected response type "${actionConfig.response_type}", got "${response_type}"`
        },
        { status: 400 }
      );
    }

    // Type-specific validation
    switch (response_type) {
      case 'text': {
        if (!text_response || typeof text_response !== 'string') {
          return NextResponse.json(
            { error: 'text_response is required for text responses' },
            { status: 400 }
          );
        }
        const minLength = actionConfig.min_text_length ?? 10;
        if (text_response.trim().length < minLength) {
          return NextResponse.json(
            {
              error: `Text response must be at least ${minLength} characters`
            },
            { status: 400 }
          );
        }
        break;
      }

      case 'file': {
        if (!file_url || !file_name) {
          return NextResponse.json(
            { error: 'file_url and file_name are required for file responses' },
            { status: 400 }
          );
        }
        if (
          actionConfig.max_file_size_mb &&
          file_size &&
          file_size > actionConfig.max_file_size_mb * 1024 * 1024
        ) {
          return NextResponse.json(
            {
              error: `File size exceeds maximum of ${actionConfig.max_file_size_mb}MB`
            },
            { status: 400 }
          );
        }
        if (actionConfig.allowed_file_types && actionConfig.allowed_file_types.length > 0) {
          const ext = file_name.split('.').pop()?.toLowerCase();
          if (ext && !actionConfig.allowed_file_types.includes(`.${ext}`)) {
            return NextResponse.json(
              {
                error: `File type .${ext} is not allowed. Allowed: ${actionConfig.allowed_file_types.join(', ')}`
              },
              { status: 400 }
            );
          }
        }
        break;
      }

      case 'form': {
        if (!form_response || typeof form_response !== 'object') {
          return NextResponse.json(
            { error: 'form_response is required for form responses' },
            { status: 400 }
          );
        }
        // Validate all form_items have been checked
        if (actionConfig.form_items && actionConfig.form_items.length > 0) {
          const missing = actionConfig.form_items.filter(
            (item) => !form_response[item.id]
          );
          if (missing.length > 0) {
            return NextResponse.json(
              {
                error: `Missing required form fields: ${missing.map(i => i.title).join(', ')}`
              },
              { status: 400 }
            );
          }
        }
        break;
      }

      case 'link': {
        if (typeof link_confirmed !== 'boolean') {
          return NextResponse.json(
            { error: 'link_confirmed (boolean) is required for link responses' },
            { status: 400 }
          );
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown response type: ${response_type}` },
          { status: 400 }
        );
    }

    // Insert the action response (service role to bypass RLS)
    const now = new Date().toISOString();

    const { error: insertError } = await (serviceClient as any)
      .from('action_responses')
      .insert({
        notification_id,
        user_id: user.id,
        response_type,
        text_response: text_response || null,
        file_url: file_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        form_response: form_response || null,
        link_confirmed: link_confirmed ?? null,
        submitted_at: now
      });

    if (insertError) {
      // UNIQUE constraint violation = duplicate submission
      if (
        insertError.code === '23505' ||
        insertError.message?.includes('unique') ||
        insertError.message?.includes('duplicate')
      ) {
        return NextResponse.json(
          { error: 'You have already submitted a response for this notification' },
          { status: 409 }
        );
      }
      console.error('[notifications/submit-action] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit action response' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, submitted_at: now },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.error('[notifications/submit-action] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
