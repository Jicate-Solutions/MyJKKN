// lib/services/meetings/meeting-webhook-service.ts
//
// MODULE 9 — Custom Webhooks for Universal Booking (Calendly parity).
//
// CRUD over the host-owned meeting_webhooks registrations + read access to the
// meeting_webhook_deliveries ledger. Pure data layer: every method takes the
// caller's Supabase client so the SAME service works under both the RLS-scoped
// browser/server client (admin UI — rows auto-scoped to host_profile_id =
// auth.uid()) and the service-role client (cron / tests).
//
// Pattern mirrors the other lib/services/meetings/* services: static methods,
// injected client, untyped client cast where a table isn't in the generated
// types yet (meeting_webhooks / meeting_webhook_deliveries are new — TS2589
// class, same as native-scheduling-service treats meeting_bookings).
//
// The trigger fn_enqueue_meeting_webhook_deliveries (migration
// 20260617001400) is what actually creates delivery rows on booking events;
// this service never enqueues — it only manages registrations and reads the log.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-webhooks]';

export const WEBHOOK_EVENTS = [
  'booking.created',
  'booking.cancelled',
  'booking.rescheduled',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface MeetingWebhook {
  id: string;
  host_profile_id: string;
  name: string;
  target_url: string;
  signing_secret: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingWebhookDelivery {
  id: string;
  webhook_id: string;
  booking_id: string | null;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  response_code: number | null;
  error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
}

export interface CreateWebhookInput {
  hostProfileId: string;
  name: string;
  targetUrl: string;
  /** Defaults to all three events when omitted. */
  events?: WebhookEvent[];
  /** Optional override; the DB generates a secure default when absent. */
  signingSecret?: string;
}

export interface UpdateWebhookInput {
  name?: string;
  targetUrl?: string;
  events?: WebhookEvent[];
  isActive?: boolean;
}

export type WebhookResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Loosely-typed view of the client — these tables aren't in types/supabase.ts.
type Db = SupabaseClient;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function sanitizeEvents(events?: WebhookEvent[]): WebhookEvent[] | null {
  if (!events) return null; // let the DB default apply
  const valid = events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  return valid.length > 0 ? Array.from(new Set(valid)) : null;
}

export class MeetingWebhookService {
  /** List a host's webhook registrations (RLS scopes to caller when applicable). */
  static async listForHost(
    supabase: Db,
    hostProfileId: string,
  ): Promise<MeetingWebhook[]> {
    const { data, error } = await supabase
      .from('meeting_webhooks')
      .select('*')
      .eq('host_profile_id', hostProfileId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(`${LOG_PREFIX} listForHost failed:`, error.message);
      return [];
    }
    return (data ?? []) as MeetingWebhook[];
  }

  static async getById(supabase: Db, id: string): Promise<MeetingWebhook | null> {
    const { data, error } = await supabase
      .from('meeting_webhooks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} getById failed:`, error.message);
      return null;
    }
    return (data as MeetingWebhook | null) ?? null;
  }

  static async create(
    supabase: Db,
    input: CreateWebhookInput,
  ): Promise<WebhookResult<MeetingWebhook>> {
    const name = input.name?.trim();
    const targetUrl = input.targetUrl?.trim();
    if (!name) return { success: false, error: 'Name is required.' };
    if (!targetUrl || !isHttpUrl(targetUrl)) {
      return { success: false, error: 'A valid http(s) URL is required.' };
    }

    const row: Record<string, unknown> = {
      host_profile_id: input.hostProfileId,
      name,
      target_url: targetUrl,
    };
    const events = sanitizeEvents(input.events);
    if (events) row.events = events;
    if (input.signingSecret && input.signingSecret.trim().length >= 16) {
      row.signing_secret = input.signingSecret.trim();
    }

    const { data, error } = await supabase
      .from('meeting_webhooks')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      console.error(`${LOG_PREFIX} create failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data as MeetingWebhook };
  }

  static async update(
    supabase: Db,
    id: string,
    input: UpdateWebhookInput,
  ): Promise<WebhookResult<MeetingWebhook>> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const n = input.name.trim();
      if (!n) return { success: false, error: 'Name cannot be empty.' };
      patch.name = n;
    }
    if (input.targetUrl !== undefined) {
      const u = input.targetUrl.trim();
      if (!isHttpUrl(u)) return { success: false, error: 'A valid http(s) URL is required.' };
      patch.target_url = u;
    }
    if (input.events !== undefined) {
      const events = sanitizeEvents(input.events);
      if (!events) return { success: false, error: 'At least one valid event is required.' };
      patch.events = events;
    }
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    if (Object.keys(patch).length === 0) {
      return { success: false, error: 'No changes supplied.' };
    }

    const { data, error } = await supabase
      .from('meeting_webhooks')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error(`${LOG_PREFIX} update failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data as MeetingWebhook };
  }

  static async remove(supabase: Db, id: string): Promise<WebhookResult<{ id: string }>> {
    const { error } = await supabase.from('meeting_webhooks').delete().eq('id', id);
    if (error) {
      console.error(`${LOG_PREFIX} remove failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: { id } };
  }

  /** Recent deliveries for one webhook (most recent first). */
  static async listDeliveries(
    supabase: Db,
    webhookId: string,
    limit = 50,
  ): Promise<MeetingWebhookDelivery[]> {
    const { data, error } = await supabase
      .from('meeting_webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error(`${LOG_PREFIX} listDeliveries failed:`, error.message);
      return [];
    }
    return (data ?? []) as MeetingWebhookDelivery[];
  }

  /** Recent deliveries across all of a host's webhooks (the log view). */
  static async listDeliveriesForHost(
    supabase: Db,
    hostProfileId: string,
    limit = 100,
  ): Promise<MeetingWebhookDelivery[]> {
    const hooks = await this.listForHost(supabase, hostProfileId);
    if (hooks.length === 0) return [];
    const ids = hooks.map((h) => h.id);
    const { data, error } = await supabase
      .from('meeting_webhook_deliveries')
      .select('*')
      .in('webhook_id', ids)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error(`${LOG_PREFIX} listDeliveriesForHost failed:`, error.message);
      return [];
    }
    return (data ?? []) as MeetingWebhookDelivery[];
  }
}
