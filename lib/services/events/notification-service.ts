// lib/services/events/notification-service.ts
// Client-side wrapper for reading events-module notifications and for
// invoking the server notify route.
//
// Follows the pattern of lib/services/faculty-innovation/notification-service.ts.
// Unread reads run under the user's Supabase session (RLS-governed).
// Dispatch goes through the /api/events/notify server route, which uses
// the service-role client to write to the core notifications table.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { EventsNotificationEventType } from '@/types/events';

export interface EventsNotificationRow {
  id: string;
  user_id: string;
  notification_id: string;
  read_at: string | null;
  created_at: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;
}

/**
 * What the organiser sees BEFORE pressing send: how many registrants will
 * actually receive the message, how many are registered at all, and how many
 * of those have no MyJKKN account and will therefore hear nothing in-app.
 */
export interface EventMessageAudienceSummary {
  recipient_count: number;
  audience_total: number;
  unreachable: number;
}

/** One message that has already gone out. */
export interface EventRegistrantMessage {
  id: string;
  subject: string;
  body: string;
  audience_total: number;
  recipient_count: number;
  delivered_count: number;
  notification_id: string | null;
  sent_by: string | null;
  sent_at: string;
}

export interface EventMessagePanel {
  audience: EventMessageAudienceSummary;
  messages: EventRegistrantMessage[];
}

/**
 * An error carrying the server's own sentence and code, so the board can show
 * the explicit "you do not have access" state (house rule #27) rather than a
 * generic failure — or a silent redirect.
 */
export class EventMessageError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number
  ) {
    super(message);
    this.name = 'EventMessageError';
  }
}

async function readJsonOrThrow(res: Response): Promise<any> {
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success !== true) {
    throw new EventMessageError(
      payload?.error ?? 'Something went wrong. Please try again.',
      payload?.code ?? null,
      res.status
    );
  }
  return payload;
}

export class EventsNotificationService {
  private static supabase = createClientSupabaseClient();

  // ─── ORGANISER MESSAGES ───────────────────────────────────────────────
  //
  // The manual "Message registrants" surface. Both calls go through
  // /api/events/[eventId]/messages, which authorises the session against
  // fn_can_manage_event_messages and then delivers through the SAME canonical
  // fanout the notify route uses — no second notification path.

  /** Recipient count + the log of what has already been sent. */
  static async getMessagePanel(eventId: string): Promise<EventMessagePanel> {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/messages`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await readJsonOrThrow(res);
    return {
      audience: payload.audience as EventMessageAudienceSummary,
      messages: (payload.messages ?? []) as EventRegistrantMessage[],
    };
  }

  /**
   * Send one message to this event's registrants.
   *
   * `clientToken` is minted once per composed message. Re-posting the same
   * token returns the first send rather than delivering a second time
   * (`deduplicated: true`), which is what makes a double click harmless.
   */
  static async sendRegistrantMessage(
    eventId: string,
    input: { subject: string; body: string; clientToken: string }
  ): Promise<{ message: EventRegistrantMessage; deduplicated: boolean }> {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.subject,
        body: input.body,
        client_token: input.clientToken,
      }),
    });
    const payload = await readJsonOrThrow(res);
    return {
      message: payload.message as EventRegistrantMessage,
      deduplicated: payload.deduplicated === true,
    };
  }

  // ─── DISPATCH ─────────────────────────────────────────────────────────

  /**
   * Post to the server notify route. For server-side callers (API routes,
   * server actions) — the API key is read from `EVENTS_API_KEY`. Client
   * callers should not call this directly; they should trigger a server
   * action that invokes it.
   */
  static async notify(
    eventType: EventsNotificationEventType,
    body: Record<string, unknown>,
    apiKey: string
  ): Promise<{ notified: number }> {
    const res = await fetch(
      `/api/events/notify?type=${encodeURIComponent(eventType)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`events/notify failed: ${res.status} ${err}`);
    }
    return (await res.json()) as { notified: number };
  }

  // ─── READ ─────────────────────────────────────────────────────────────

  /**
   * Get unread events-type notifications for the current user.
   * Filters on `notifications.type === 'events'` after fetching the link
   * rows (PostgREST can't currently filter on a joined non-null column
   * reliably from the user_notifications side).
   */
  static async getUnread(limit = 20): Promise<EventsNotificationRow[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        `id, user_id, notification_id, read_at, created_at,
         notification:notifications!user_notifications_notification_id_fkey(
           id, type, title, body, metadata, created_at
         )`
      )
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).filter(
      (r: any) => r.notification?.type === 'events'
    ) as EventsNotificationRow[];
  }

  /** Get all events-type notifications (read + unread) for the current user. */
  static async getAll(limit = 50): Promise<EventsNotificationRow[]> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    const { data, error } = await (this.supabase as any)
      .from('user_notifications')
      .select(
        `id, user_id, notification_id, read_at, created_at,
         notification:notifications!user_notifications_notification_id_fkey(
           id, type, title, body, metadata, created_at
         )`
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).filter(
      (r: any) => r.notification?.type === 'events'
    ) as EventsNotificationRow[];
  }

  // ─── WRITE ────────────────────────────────────────────────────────────

  static async markAsRead(userNotificationId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', userNotificationId);
    if (error) throw error;
  }

  static async markAllAsRead(): Promise<void> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { error } = await (this.supabase as any)
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
  }
}
