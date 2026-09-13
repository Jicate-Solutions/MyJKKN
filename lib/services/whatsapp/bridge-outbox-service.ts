// lib/services/whatsapp/bridge-outbox-service.ts
//
// The MyJKKN side of the on-campus WhatsApp bridge.
//
// The bridge is a Go process on a Windows machine on the campus LAN, behind
// NAT. Vercel cannot reach it, so the direction is inverted: the bridge POLLS
// this service for work, does it, and posts the outcome back. Everything here
// runs under the service-role client — the bridge has no MyJKKN account and
// therefore no RLS identity; it is authenticated at the route by a shared
// secret before any of these methods is reached.
//
// Deliberately separate from WhatsAppPersonalQueueService: that one owns
// wa_personal_message_queue and sends THROUGH the Railway BYOW service, which
// MyJKKN can call directly. Nothing here touches those tables or that client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Attempts a message gets before it is abandoned, counted on acknowledgement. */
export const MAX_SEND_ATTEMPTS = 3;

export type BridgeMessageType = 'text' | 'image' | 'document' | 'video' | 'audio';

export interface ClaimedMessage {
  id: string;
  to: string;
  body: string | null;
  type: string;
  media_url: string | null;
}

export interface EnqueueInput {
  toPhone: string;
  body?: string | null;
  type?: BridgeMessageType;
  mediaUrl?: string | null;
  leadId?: string | null;
  institutionId?: string | null;
  createdBy?: string | null;
}

export interface AckInput {
  id: string;
  status: 'sent' | 'failed';
  waMessageId?: string | null;
  error?: string | null;
}

export interface AckResult {
  /** False when no row was in `sending` under this id — a repeated ack. */
  matched: boolean;
  status: string | null;
  attempts: number | null;
}

export interface InboundInput {
  from: string;
  senderName?: string | null;
  waMessageId: string;
  body?: string | null;
  type?: string | null;
  /** Unix seconds, as the bridge reports it. */
  timestamp?: number | null;
  isGroup?: boolean | null;
}

export interface InboundResult {
  id: string;
  leadId: string | null;
  /** True when this wa_message_id was already recorded — a bridge retry. */
  duplicate: boolean;
}

export interface HeartbeatInput {
  connected: boolean;
  loggedIn: boolean;
  phoneNumber?: string | null;
  version?: string | null;
}

export interface BridgeStatusSnapshot {
  connected: boolean;
  logged_in: boolean;
  phone_number: string | null;
  version: string | null;
  last_heartbeat_at: string | null;
  /** Seconds since the last heartbeat, or null when none has ever arrived. */
  seconds_since_heartbeat: number | null;
  pending_count: number;
  sending_count: number;
  failed_count: number;
}

/**
 * Phone variants to try when matching an inbound number to a lead.
 *
 * Mirrors app/api/whatsapp-personal/webhook/route.ts deliberately: the same
 * numbers must resolve to the same leads whichever door a message came in
 * through, and two different normalisers would drift apart the first time
 * either was touched.
 */
function phoneVariants(from: string): string[] {
  const clean = from.replace(/\D/g, '');
  return [
    clean,
    clean.startsWith('91') ? clean.substring(2) : `91${clean}`,
    `+${clean}`,
    `+91${clean.startsWith('91') ? clean.substring(2) : clean}`,
  ];
}

export class BridgeOutboxService {
  /**
   * Queue one message for the bridge to collect on its next poll.
   *
   * Returns the new row's id. Nothing is sent here — the row sits at `pending`
   * until a poll claims it, so a caller that gets an id back has queued a
   * message, not delivered one.
   */
  static async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_bridge_outbox')
      .insert({
        to_phone: input.toPhone,
        body: input.body ?? null,
        type: input.type ?? 'text',
        media_url: input.mediaUrl ?? null,
        lead_id: input.leadId ?? null,
        institution_id: input.institutionId ?? null,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to queue bridge message: ${error.message}`);
    return { id: data.id as string };
  }

  /**
   * Claim up to `limit` pending rows for this poll.
   *
   * The claim happens inside fn_wa_bridge_claim_pending as one UPDATE ... FOR
   * UPDATE SKIP LOCKED RETURNING statement, so two overlapping polls cannot be
   * handed the same row. Doing it here as a SELECT then an UPDATE would open
   * exactly that window, and the visible symptom would be a parent receiving
   * the same message twice.
   */
  static async claimPending(limit: number): Promise<ClaimedMessage[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc('fn_wa_bridge_claim_pending', {
      p_limit: limit,
    });

    if (error) throw new Error(`Failed to claim pending messages: ${error.message}`);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      to: row.to_phone as string,
      body: (row.body as string | null) ?? null,
      type: (row.type as string) ?? 'text',
      media_url: (row.media_url as string | null) ?? null,
    }));
  }

  /**
   * Record the outcome of one claimed message.
   *
   * `matched: false` means no row under that id was still in `sending` — the
   * bridge acknowledged something twice, or acknowledged a row it never
   * claimed. That is reported, not swallowed: a write that matched nothing and
   * reported success is how a queue quietly stops working.
   */
  static async ack(input: AckInput): Promise<AckResult> {
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc('fn_wa_bridge_ack', {
      p_id: input.id,
      p_status: input.status,
      p_wa_message_id: input.waMessageId ?? null,
      p_error: input.error ?? null,
      p_max_attempts: MAX_SEND_ATTEMPTS,
    });

    if (error) throw new Error(`Failed to acknowledge message: ${error.message}`);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return { matched: false, status: null, attempts: null };

    return {
      matched: true,
      status: rows[0].status as string,
      attempts: rows[0].attempts as number,
    };
  }

  /**
   * Record one inbound message, idempotently on its WhatsApp message id.
   *
   * The bridge re-posts anything it is not certain reached us, so this is
   * called more than once for a single message a person sent once. The UNIQUE
   * constraint on wa_message_id is what makes the second call harmless; the
   * ignoreDuplicates insert turns the conflict into a no-op and the existing
   * row is read back so the caller still gets an id.
   */
  static async recordInbound(input: InboundInput): Promise<InboundResult> {
    const supabase = getServiceClient();

    const leadId = await BridgeOutboxService.matchLead(supabase, input.from);

    const receivedAt = input.timestamp
      ? new Date(input.timestamp * 1000).toISOString()
      : new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('wa_bridge_inbound')
      .upsert(
        {
          wa_message_id: input.waMessageId,
          from_phone: input.from,
          sender_name: input.senderName ?? null,
          body: input.body ?? null,
          type: input.type ?? 'text',
          is_group: input.isGroup ?? false,
          lead_id: leadId,
          received_at: receivedAt,
        },
        { onConflict: 'wa_message_id', ignoreDuplicates: true }
      )
      .select('id');

    if (insertError) {
      throw new Error(`Failed to record inbound message: ${insertError.message}`);
    }

    // ignoreDuplicates returns an empty set on conflict rather than the
    // colliding row, so the existing record is read back explicitly. This is
    // the retry path and it must still return the original id.
    if (inserted && inserted.length > 0) {
      return { id: inserted[0].id as string, leadId, duplicate: false };
    }

    const { data: existing, error: readError } = await supabase
      .from('wa_bridge_inbound')
      .select('id, lead_id')
      .eq('wa_message_id', input.waMessageId)
      .maybeSingle();

    if (readError || !existing) {
      throw new Error(
        `Inbound message was neither inserted nor found: ${readError?.message ?? 'no row'}`
      );
    }

    return {
      id: existing.id as string,
      leadId: (existing.lead_id as string | null) ?? null,
      duplicate: true,
    };
  }

  /**
   * Best-effort match of an inbound phone number to an admission lead.
   *
   * Returns null when nothing matches, and that is a normal outcome, not an
   * error — a message from a number we do not know is still a message someone
   * sent, and it is kept.
   */
  private static async matchLead(
    supabase: SupabaseClient,
    from: string
  ): Promise<string | null> {
    for (const variant of phoneVariants(from)) {
      const tail = variant.slice(-10);
      if (tail.length < 10) continue;

      const { data: lead } = await supabase
        .from('admission_leads')
        .select('id')
        .ilike('phone', `%${tail}%`)
        .limit(1)
        .maybeSingle();

      if (lead) return lead.id as string;
    }
    return null;
  }

  /** Upsert the single heartbeat row. */
  static async recordHeartbeat(input: HeartbeatInput): Promise<void> {
    const supabase = getServiceClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('wa_bridge_status')
      .upsert(
        {
          id: 'bridge',
          connected: input.connected,
          logged_in: input.loggedIn,
          phone_number: input.phoneNumber ?? null,
          version: input.version ?? null,
          last_heartbeat_at: now,
          updated_at: now,
        },
        { onConflict: 'id' }
      );

    if (error) throw new Error(`Failed to record heartbeat: ${error.message}`);
  }

  /**
   * The staff-facing view: is the bridge alive, and what is stuck behind it.
   *
   * Takes the CALLER's Supabase client rather than making a service-role one,
   * so the read goes through RLS as the signed-in user. A member of staff who
   * may not see the queue must not see its counts either.
   *
   * `sending_count` is reported separately from pending on purpose. A row stuck
   * in `sending` is one the bridge claimed and never acknowledged — it is not
   * waiting for the bridge, it is lost, and hiding it inside the pending number
   * would make a dead bridge look busy.
   */
  static async getStatus(supabase: SupabaseClient): Promise<BridgeStatusSnapshot> {
    const [statusRow, pending, sending, failed] = await Promise.all([
      supabase
        .from('wa_bridge_status')
        .select('connected, logged_in, phone_number, version, last_heartbeat_at')
        .eq('id', 'bridge')
        .maybeSingle(),
      supabase
        .from('wa_bridge_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('wa_bridge_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sending'),
      supabase
        .from('wa_bridge_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ]);

    const row = statusRow.data as Record<string, unknown> | null;
    const lastHeartbeat = (row?.last_heartbeat_at as string | null) ?? null;

    return {
      connected: Boolean(row?.connected),
      logged_in: Boolean(row?.logged_in),
      phone_number: (row?.phone_number as string | null) ?? null,
      version: (row?.version as string | null) ?? null,
      last_heartbeat_at: lastHeartbeat,
      seconds_since_heartbeat: lastHeartbeat
        ? Math.max(0, Math.round((Date.now() - new Date(lastHeartbeat).getTime()) / 1000))
        : null,
      pending_count: pending.count ?? 0,
      sending_count: sending.count ?? 0,
      failed_count: failed.count ?? 0,
    };
  }
}
