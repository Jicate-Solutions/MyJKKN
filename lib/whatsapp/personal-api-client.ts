// lib/whatsapp/personal-api-client.ts
// Transport for the "Personal WhatsApp" (BYOW) send paths.
//
// 2026-09-13 — REPOINTED off the Railway whatsapp-web.js service.
// ---------------------------------------------------------------------------
// The replacement transport is an on-campus Go bridge running on a Windows box
// behind NAT. Vercel cannot reach it, so the call direction is inverted: this
// module no longer performs a synchronous HTTP send and waits for a delivery
// result. It ENQUEUES a row into `wa_bridge_outbox` and returns immediately;
// the bridge polls that table, sends, and writes the outcome back.
//
// Consequences every caller must understand:
//   * `success: true` now means QUEUED, not DELIVERED. `queued` is true on
//     those responses and `messageId` is undefined until the bridge sends.
//   * Pairing (QR) happens ON the bridge machine. `personalConnectAPI` can no
//     longer produce a QR and says so explicitly instead of failing silently.
//   * Connection health is read from the `wa_bridge_status` heartbeat row, not
//     from polling a remote HTTP service.
//
// The per-department connection model is retired for TRANSPORT: there is one
// shared JKKN number, so a send no longer selects a department's browser
// session. Department identity survives only as an authorization scope
// (lib/whatsapp/byow-authz.ts) and as history metadata.
//
// Server-only by convention, but this module is reachable from the CLIENT
// bundle via lead-service.ts → wa-event-dispatcher → auto-trigger-service, so
// it must not import next/headers. It uses the plain supabase-js client (same
// pattern as byow-authz.ts); the service-role key simply resolves undefined in
// a browser, where none of these functions are ever invoked.

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
// Use the CLIENT variant of get-policy: this module is reachable from
// client-bundled lead-service.ts via wa-event-dispatcher → auto-trigger-service.
// Server variant imports next/headers and would break the client bundle
// (memory: feedback_shared_lib_must_ship_server_and_client_variants.md, PR #626).
// Global policy resolution works fine via SECURITY DEFINER RPC from any context.
import { getPolicyBool } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import type {
  PersonalWhatsAppStatus,
  PersonalConnectResponse,
  PersonalSendResponse,
  PersonalBulkSendResponse,
  PersonalRecipient,
} from '@/types/whatsapp-personal';

/**
 * Thrown when wa_byow.is_enabled is false (manually disabled by super_admin, or
 * auto-disabled by the health cron). Routes catch this and return 503.
 */
export class ByowDisabledError extends Error {
  constructor(message = 'BYOW WhatsApp is disabled. Check /admin/policies for wa_byow.is_enabled.') {
    super(message);
    this.name = 'ByowDisabledError';
  }
}

/**
 * A heartbeat older than this means the campus bridge is not running, or has
 * lost its network, and nothing in the outbox is draining.
 */
export const BRIDGE_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

/** Where a human performs the pairing scan. The bridge serves its own QR page. */
export const BRIDGE_PAIRING_HINT =
  'Pairing now happens on the campus bridge machine: open the bridge\'s /qr page on that Windows box and scan the code with the shared JKKN WhatsApp number. The web app can no longer show a QR code.';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Config for one BYOW call.
 *
 * `serviceUrl` / `apiKey` / `departmentId` are RETAINED ONLY so the existing
 * call sites keep compiling — the bridge transport ignores all three. They are
 * deprecated and should be dropped from call sites as those files are touched.
 *
 * The fields the bridge outbox actually uses are the attribution ones below.
 */
export interface ByowServiceConfig {
  /** @deprecated Railway transport is gone; ignored. */
  serviceUrl?: string;
  /** @deprecated Railway transport is gone; ignored. */
  apiKey?: string;
  /** @deprecated Sends no longer select a per-department browser session. */
  departmentId?: string;

  /** Admission lead this message belongs to, stamped on the outbox row. */
  leadId?: string | null;
  /** Institution the send is attributed to, stamped on the outbox row. */
  institutionId?: string | null;
  /** auth.users.id of the sender ('system' senders pass null). */
  createdBy?: string | null;
}

/** A send response from the async transport. `success` means QUEUED. */
export interface PersonalQueuedSendResponse extends PersonalSendResponse {
  /** True when the message reached `wa_bridge_outbox`. */
  queued: boolean;
  /** wa_bridge_outbox.id — the handle for tracking delivery. */
  id?: string;
  /** Whether the bridge's heartbeat was fresh at enqueue time. */
  bridgeConnected?: boolean;
}

/** A bulk send response from the async transport. `success` means QUEUED. */
export interface PersonalQueuedBulkResponse extends PersonalBulkSendResponse {
  queued: boolean;
  /** wa_bridge_outbox.id per enqueued row, in recipient order. */
  ids: string[];
  bridgeConnected?: boolean;
}

/** Live bridge health, derived from the wa_bridge_status heartbeat row. */
export interface BridgeHealth {
  connected: boolean;
  loggedIn: boolean;
  phoneNumber: string | null;
  version: string | null;
  lastHeartbeatAt: string | null;
  /** Milliseconds since the last heartbeat; null when there has never been one. */
  heartbeatAgeMs: number | null;
  /** Present when the row is missing or the heartbeat is stale. */
  reason?: 'no_status_row' | 'stale_heartbeat' | 'not_logged_in';
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function bridgeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Kill-switch gate (v4 spec). Unchanged in meaning: when wa_byow.is_enabled is
 * false nothing may be enqueued. Default true so a first deploy works.
 */
async function assertByowEnabled(): Promise<void> {
  const enabled = await getPolicyBool(POLICY_KEYS.WA_BYOW_IS_ENABLED, true);
  if (!enabled) throw new ByowDisabledError();
}

/** Read the single wa_bridge_status row and decide whether the bridge is alive. */
export async function getBridgeHealth(): Promise<BridgeHealth> {
  return Sentry.startSpan({ op: 'whatsapp.bridge', name: 'status' }, async () => {
    const db = bridgeClient();
    const { data } = await db
      .from('wa_bridge_status')
      .select('connected, logged_in, phone_number, version, last_heartbeat_at')
      .limit(1)
      .maybeSingle();

    if (!data) {
      return {
        connected: false,
        loggedIn: false,
        phoneNumber: null,
        version: null,
        lastHeartbeatAt: null,
        heartbeatAgeMs: null,
        reason: 'no_status_row' as const,
      };
    }

    const row = data as {
      connected: boolean | null;
      logged_in: boolean | null;
      phone_number: string | null;
      version: string | null;
      last_heartbeat_at: string | null;
    };

    const beatMs = row.last_heartbeat_at ? Date.parse(row.last_heartbeat_at) : NaN;
    const ageMs = Number.isNaN(beatMs) ? null : Date.now() - beatMs;
    const fresh = ageMs !== null && ageMs <= BRIDGE_HEARTBEAT_STALE_MS;
    const connected = fresh && row.connected === true;

    let reason: BridgeHealth['reason'];
    if (!fresh) reason = 'stale_heartbeat';
    else if (row.logged_in !== true) reason = 'not_logged_in';

    return {
      connected,
      loggedIn: row.logged_in === true,
      phoneNumber: row.phone_number ?? null,
      version: row.version ?? null,
      lastHeartbeatAt: row.last_heartbeat_at ?? null,
      heartbeatAgeMs: ageMs,
      reason,
    };
  });
}

interface OutboxRowInput {
  to_phone: string;
  body: string;
  type: 'text' | 'media';
  media_url?: string | null;
  lead_id?: string | null;
  institution_id?: string | null;
  created_by?: string | null;
}

/** Insert rows into wa_bridge_outbox as `pending` and return their ids. */
async function enqueue(rows: OutboxRowInput[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const db = bridgeClient();
  const { data, error } = await db
    .from('wa_bridge_outbox')
    .insert(
      rows.map((r) => ({
        to_phone: r.to_phone,
        body: r.body,
        type: r.type,
        media_url: r.media_url ?? null,
        status: 'pending',
        attempts: 0,
        lead_id: r.lead_id ?? null,
        institution_id: r.institution_id ?? null,
        created_by: r.created_by ?? null,
      }))
    )
    .select('id');

  if (error) throw new Error(`Could not queue WhatsApp message: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((d) => d.id);
}

/**
 * Pick the `wa_personal_connections` row that a history entry is attributed to.
 *
 * `wa_personal_message_logs.department_id` and `.connection_id` are both NOT
 * NULL with foreign keys, so history cannot be written without one. Transport
 * no longer selects a connection — this is metadata only. Status is ignored
 * because nothing marks a row 'ready' now that sending left this process.
 *
 * Returns null when no connection row exists at all, in which case the caller
 * queues the message and records that it could not be logged.
 */
export async function resolveHistoryAnchor(
  departmentId: string | null
): Promise<{ id: string; department_id: string } | null> {
  if (departmentId) {
    const own = await WhatsAppPersonalConnectionService.getConnection(departmentId);
    if (own) return { id: own.id, department_id: own.department_id };
  }
  const all = await WhatsAppPersonalConnectionService.getAllConnections();
  const first = all[0];
  return first ? { id: first.id, department_id: first.department_id } : null;
}

// ---------------------------------------------------------------------------
// Public API — signatures preserved for every existing importer
// ---------------------------------------------------------------------------

/**
 * Pairing is no longer remotely triggerable: the QR is produced by the bridge
 * process on the campus Windows box. This returns an explicit instruction
 * rather than calling a service that no longer exists.
 */
export async function personalConnectAPI(
  _config?: ByowServiceConfig
): Promise<PersonalConnectResponse> {
  const health = await getBridgeHealth();
  return {
    success: false,
    status: health.connected && health.loggedIn ? 'ready' : 'disconnected',
    message:
      health.connected && health.loggedIn
        ? 'The campus bridge is already paired and online. No action needed here.'
        : BRIDGE_PAIRING_HINT,
  };
}

/** Current connection status, derived from the bridge heartbeat. */
export async function personalGetStatusAPI(
  _config?: ByowServiceConfig
): Promise<PersonalWhatsAppStatus> {
  const health = await getBridgeHealth();
  return {
    success: true,
    status: health.connected && health.loggedIn ? 'ready' : 'disconnected',
    // The bridge machine owns the QR; it is never relayed through the web app.
    qrCode: null,
    clientInfo: health.phoneNumber ? { phoneNumber: health.phoneNumber } : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Queue a single text message for the campus bridge.
 * `success: true` means QUEUED — delivery happens later, out of band.
 */
export async function personalSendMessageAPI(
  to: string,
  message: string,
  config?: ByowServiceConfig
): Promise<PersonalQueuedSendResponse> {
  await assertByowEnabled();

  return Sentry.startSpan({ op: 'whatsapp.bridge', name: 'enqueue' }, async () => {
    const health = await getBridgeHealth();
    const [id] = await enqueue([
      {
        to_phone: to,
        body: message,
        type: 'text',
        lead_id: config?.leadId ?? null,
        institution_id: config?.institutionId ?? null,
        created_by: config?.createdBy ?? null,
      },
    ]);

    return { success: true, queued: true, id, bridgeConnected: health.connected };
  });
}

/**
 * Queue a media message for the campus bridge.
 * New export — the send-media route used to build a raw Railway URL inline.
 */
export async function personalSendMediaAPI(
  to: string,
  mediaUrl: string,
  caption: string | undefined,
  config?: ByowServiceConfig
): Promise<PersonalQueuedSendResponse> {
  await assertByowEnabled();

  return Sentry.startSpan({ op: 'whatsapp.bridge', name: 'enqueue-media' }, async () => {
    const health = await getBridgeHealth();
    const [id] = await enqueue([
      {
        to_phone: to,
        body: caption ?? '',
        type: 'media',
        media_url: mediaUrl,
        lead_id: config?.leadId ?? null,
        institution_id: config?.institutionId ?? null,
        created_by: config?.createdBy ?? null,
      },
    ]);

    return { success: true, queued: true, id, bridgeConnected: health.connected };
  });
}

/**
 * Queue many messages for the campus bridge.
 *
 * `delayMs` is accepted for signature compatibility but is no longer honoured
 * here: pacing between sends is the bridge's job now, since this process no
 * longer performs the sends. All rows are enqueued in one insert.
 */
export async function personalSendBulkAPI(
  recipients: PersonalRecipient[],
  _delayMs: number = 1500,
  config?: ByowServiceConfig
): Promise<PersonalQueuedBulkResponse> {
  await assertByowEnabled();

  return Sentry.startSpan({ op: 'whatsapp.bridge', name: 'enqueue-bulk' }, async () => {
    const health = await getBridgeHealth();
    const ids = await enqueue(
      recipients.map((r) => ({
        to_phone: r.phone,
        body: r.message,
        type: 'text' as const,
        lead_id: config?.leadId ?? null,
        institution_id: config?.institutionId ?? null,
        created_by: config?.createdBy ?? null,
      }))
    );

    return {
      success: true,
      queued: true,
      ids,
      totalSent: 0,
      successCount: recipients.length,
      failCount: 0,
      // `success` here means "accepted into the outbox", not "delivered".
      results: recipients.map((r) => ({ phone: r.phone, success: true })),
      bridgeConnected: health.connected,
    };
  });
}

/**
 * The bridge owns its own WhatsApp session on the campus machine and cannot be
 * logged out from the web app. Reported explicitly instead of calling a dead
 * service and pretending it worked.
 */
export async function personalDisconnectAPI(
  _config?: ByowServiceConfig
): Promise<{ success: boolean; message: string }> {
  return {
    success: false,
    message:
      'The campus WhatsApp bridge is not remotely controllable. To log the shared number out, stop the bridge service on the campus machine or unlink the device from WhatsApp on the phone itself.',
  };
}
