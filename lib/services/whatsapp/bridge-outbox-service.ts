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

/**
 * The only two message shapes on the wire.
 *
 * `media` — not `image`/`document`/`video`/`audio`. The bridge takes a URL and
 * WhatsApp decides how to render it; splitting that into four names on our side
 * would be four names for one behaviour, and the sibling sender lane already
 * writes `'media'`. A constraint that rejected it would fail 100% of media
 * sends, which is why this list and the database CHECK must agree exactly.
 */
export type BridgeMessageType = 'text' | 'media';

export const BRIDGE_MESSAGE_TYPES: readonly BridgeMessageType[] = ['text', 'media'];

/** Longest message body WhatsApp will carry, counted in CHARACTERS. */
export const MAX_MESSAGE_CHARS = 4096;

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

/**
 * How an inbound number resolved to a lead.
 *
 * `ambiguous` is the one that matters: several leads carry this number and the
 * message was attached to NONE of them. It is a distinct state from
 * `unmatched`, because the two need different human actions — one needs the
 * number adding, the other needs a person to say which child it was.
 */
export type LeadMatchStatus = 'matched' | 'unmatched' | 'ambiguous';

export interface LeadMatch {
  leadId: string | null;
  status: LeadMatchStatus;
  /** Leads that carry this number. 0, 1, or more than 1. */
  candidateCount: number;
}

export interface InboundResult {
  id: string;
  leadId: string | null;
  matchStatus: LeadMatchStatus;
  matchCandidateCount: number;
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
 * Most leads a single inbound number is looked up against.
 *
 * The number that matters is 1 versus more-than-1, so this only has to be big
 * enough to tell those apart with room to spare. A number shared by more rows
 * than this is ambiguous several times over.
 */
const MAX_LEAD_CANDIDATES = 25;

/**
 * Prefixes that may sit in front of a 10-digit Indian national number and still
 * mean the same person: nothing, a trunk 0, the country code, or both.
 *
 * This is the guard against substring matching. `phone ILIKE '%9876543210%'`
 * also matches `+1-555-9876543210` and `99876543210` — different numbers,
 * different people. Requiring the digits BEFORE the national number to be one
 * of these is what makes the match mean "the same phone".
 */
const ACCEPTED_NUMBER_PREFIXES = new Set(['', '0', '91', '091']);

/** Every digit, nothing else. A JID (`9198…@s.whatsapp.net`) loses its suffix. */
function digitsOnly(value: string): string {
  return value.split('@')[0].replace(/\D/g, '');
}

/** Character count as WhatsApp counts it: one per code point, not per code unit. */
function charLength(value: string): number {
  return [...value].length;
}

/**
 * The last ten digits of an inbound number — the part that identifies the
 * person regardless of how the country code was written.
 *
 * Returns null for anything too short to be a phone number, which is the
 * correct answer for a group JID or a service address.
 */
function nationalTail(from: string): string | null {
  const digits = digitsOnly(from);
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Canonical outbound number: E.164 DIGITS ONLY — no '+', no separators, no
 * `@s.whatsapp.net`. Returns null when the input cannot be read as one.
 *
 * A bare 10-digit number is read as Indian and given `91`, matching every other
 * phone helper in this repo (see app/api/whatsapp-personal/webhook). That is a
 * country assumption, and it is the one JKKN already runs on.
 */
export function normalizeToPhone(raw: string): string | null {
  const digits = digitsOnly(raw ?? '');

  // Bare national number, as it is typed on a form or read off a visiting card.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  // Trunk-prefixed national number: 0 98765 43210.
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  // Already E.164. A leading zero is never valid in E.164, so it is refused
  // rather than guessed at.
  if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return digits;

  return null;
}

export class BridgeOutboxService {
  /**
   * Queue one message for the bridge to collect on its next poll.
   *
   * Returns the new row's id. Nothing is sent here — the row sits at `pending`
   * until a poll claims it, so a caller that gets an id back has queued a
   * message, not delivered one.
   *
   * The number is normalised to canonical E.164 digits here and an
   * unreadable one is refused rather than queued. A row the bridge cannot use
   * would otherwise be claimed, fail three times and land in `failed`, where it
   * reads as "WhatsApp rejected it" rather than "we wrote a bad number".
   */
  static async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    const supabase = getServiceClient();

    const toPhone = normalizeToPhone(input.toPhone ?? '');
    if (!toPhone) {
      throw new Error(
        `Cannot queue bridge message: "${input.toPhone}" is not a usable phone number`
      );
    }

    const type: BridgeMessageType = input.type ?? 'text';
    if (!BRIDGE_MESSAGE_TYPES.includes(type)) {
      throw new Error(`Cannot queue bridge message: type must be text or media, got "${type}"`);
    }

    const body = input.body ?? null;
    const mediaUrl = input.mediaUrl ?? null;

    // Mirrors wa_bridge_outbox_payload_chk. Checked here too so the caller gets
    // a sentence rather than a constraint name, and so a text message with no
    // words can never be claimed and handed to the bridge with nothing to send.
    if (type === 'text' && (!body || body.trim().length === 0)) {
      throw new Error('Cannot queue bridge message: a text message needs a body');
    }
    if (type === 'text' && mediaUrl) {
      throw new Error('Cannot queue bridge message: a text message cannot carry a media_url');
    }
    if (type === 'media' && (!mediaUrl || mediaUrl.trim().length === 0)) {
      throw new Error('Cannot queue bridge message: a media message needs a media_url');
    }
    // Counted in CHARACTERS. A byte cap would refuse a Tamil message at roughly
    // a third of the length it refuses an English one.
    if (body && charLength(body) > MAX_MESSAGE_CHARS) {
      throw new Error(
        `Cannot queue bridge message: body exceeds ${MAX_MESSAGE_CHARS} characters`
      );
    }

    const { data, error } = await supabase
      .from('wa_bridge_outbox')
      .insert({
        to_phone: toPhone,
        body,
        type,
        media_url: mediaUrl,
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

    const match = await BridgeOutboxService.matchLead(supabase, input.from);

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
          lead_id: match.leadId,
          match_status: match.status,
          match_candidate_count: match.candidateCount,
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
      return {
        id: inserted[0].id as string,
        leadId: match.leadId,
        matchStatus: match.status,
        matchCandidateCount: match.candidateCount,
        duplicate: false,
      };
    }

    const { data: existing, error: readError } = await supabase
      .from('wa_bridge_inbound')
      .select('id, lead_id, match_status, match_candidate_count')
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
      matchStatus: (existing.match_status as LeadMatchStatus | null) ?? 'unmatched',
      matchCandidateCount: (existing.match_candidate_count as number | null) ?? 0,
      duplicate: true,
    };
  }

  /**
   * Resolve an inbound phone number to at most one admission lead.
   *
   * ⚠️ SIBLINGS SHARE A PARENT'S PHONE AT JKKN, and families share an email.
   * Two leads carrying the same number is ordinary data, not dirty data. The
   * previous shape of this method — `ilike(...).limit(1).maybeSingle()` with no
   * ORDER BY — asked Postgres for "any one of them", which is genuinely
   * arbitrary and can differ between two calls with the same input. A parent's
   * reply would then be filed against whichever child the planner happened to
   * return, and nothing anywhere would say it had guessed.
   *
   * So: MORE THAN ONE candidate attaches to NONE of them. The message is kept
   * and flagged `ambiguous` for a person to resolve. A message a human has to
   * file by hand is a cheap failure; a message filed against the wrong
   * learner's admission record is not, because nobody looking at it will ever
   * know to doubt it.
   *
   * ONE query, not four. The four phone variants the old loop walked all share
   * the same last ten digits, so it ran the identical statement four times.
   */
  private static async matchLead(
    supabase: SupabaseClient,
    from: string
  ): Promise<LeadMatch> {
    const tail = nationalTail(from);
    if (!tail) return { leadId: null, status: 'unmatched', candidateCount: 0 };

    // Anchored at the END, not a floating `%tail%`. The TypeScript check below
    // then re-verifies digit by digit, because a SQL suffix match alone still
    // accepts `+15559876543210` — a different number that happens to end the
    // same way.
    const { data, error } = await supabase
      .from('admission_leads')
      .select('id, phone')
      .ilike('phone', `%${tail}`)
      .limit(MAX_LEAD_CANDIDATES);

    if (error) {
      throw new Error(`Failed to match inbound number to a lead: ${error.message}`);
    }

    const seen = new Set<string>();
    for (const row of (data ?? []) as Array<{ id: string; phone: string | null }>) {
      const digits = digitsOnly(row.phone ?? '');
      if (!digits.endsWith(tail)) continue;
      // What sits in front of the national number decides whether this is the
      // same phone or merely a number ending in the same ten digits.
      if (!ACCEPTED_NUMBER_PREFIXES.has(digits.slice(0, digits.length - tail.length))) {
        continue;
      }
      seen.add(row.id);
    }

    if (seen.size === 0) return { leadId: null, status: 'unmatched', candidateCount: 0 };
    if (seen.size === 1) {
      return { leadId: [...seen][0], status: 'matched', candidateCount: 1 };
    }
    return { leadId: null, status: 'ambiguous', candidateCount: seen.size };
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
   * so the read goes through RLS as the signed-in user. The route checks the
   * permission before calling this, so a denied user is told they are denied
   * rather than handed an all-zero snapshot that reads as a dead bridge.
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
