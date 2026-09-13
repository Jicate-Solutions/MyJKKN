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
 * Thrown when the kill switch could not be READ at all.
 *
 * This is deliberately a refusal, not a default. The previous implementation
 * resolved the policy through the CLIENT policy reader, whose browser supabase
 * client carries no session on a server path: every read errored, silently
 * returned the `true` default, and the switch could never turn anything off.
 * An unreadable switch now blocks the send — fail CLOSED.
 */
export class ByowPolicyUnreadableError extends Error {
  constructor(detail: string) {
    super(
      `BYOW kill switch (${POLICY_KEYS.WA_BYOW_IS_ENABLED}) could not be read, so the send was refused: ${detail}`
    );
    this.name = 'ByowPolicyUnreadableError';
  }
}

/**
 * Thrown when the database rejects the `type` we write onto an outbox row.
 *
 * Every media send failed silently once because this module wrote a `type`
 * value the table's CHECK constraint did not allow, and the failure surfaced
 * only as a generic "could not queue" string. This error names the contract so
 * a future constraint change is a loud, diagnosable failure instead.
 */
export class BridgeOutboxTypeRejectedError extends Error {
  constructor(detail: string) {
    super(
      `wa_bridge_outbox rejected the message type. The MyJKKN side writes exactly ` +
        `[${BRIDGE_OUTBOX_TYPES.join(', ')}]; the table's CHECK constraint must allow all of them. ` +
        `Database said: ${detail}`
    );
    this.name = 'BridgeOutboxTypeRejectedError';
  }
}

/** Thrown when a recipient phone number cannot be reduced to E.164 digits. */
export class BridgeRecipientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeRecipientError';
  }
}

/** Thrown when a bulk request exceeds the per-request fan-out cap. */
export class ByowBulkLimitError extends Error {
  constructor(requested: number) {
    super(
      `Too many recipients in one request: ${requested}. The shared JKKN WhatsApp number ` +
        `accepts at most ${BRIDGE_BULK_MAX_RECIPIENTS} per request. Split the list and send again.`
    );
    this.name = 'ByowBulkLimitError';
  }
}

/**
 * A heartbeat older than this means the campus bridge is not running, or has
 * lost its network, and nothing in the outbox is draining.
 */
export const BRIDGE_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

/**
 * Hard cap on recipients per bulk request.
 *
 * Every message leaves ONE shared institutional number. An uncapped fan-out
 * from a single number is the exact pattern WhatsApp bans numbers for, and the
 * ban is permanent and affects every department at once. Per-message pacing is
 * the bridge's job; this cap bounds the burst the bridge is ever handed.
 * It sits below the 200/day personal ceiling enforced in
 * whatsapp-personal-queue-service.ts, so one request can never spend the day.
 */
export const BRIDGE_BULK_MAX_RECIPIENTS = 100;

/**
 * The complete set of `type` values MyJKKN writes onto `wa_bridge_outbox`.
 *
 * SINGLE SOURCE OF TRUTH. The table's CHECK constraint must allow every value
 * in this list; `assertOutboxType` below refuses to write anything outside it,
 * and `enqueue` turns a constraint rejection into a named error rather than a
 * generic queue failure.
 */
export const BRIDGE_OUTBOX_TYPES = ['text', 'media'] as const;
export type BridgeOutboxType = (typeof BRIDGE_OUTBOX_TYPES)[number];

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
  /** How many rows reached the outbox. Mirrors ids.length. */
  queuedCount: number;
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
  /**
   * Why the bridge does not read as healthy.
   *
   * `no_status_row` (the bridge has never checked in), `query_error` (we could
   * not ask — a missing table reads as this, never as a quiet bridge) and
   * `not_configured` (no service credentials in this environment) are
   * deliberately distinct: they need different people to fix them.
   */
  reason?:
    | 'no_status_row'
    | 'stale_heartbeat'
    | 'not_logged_in'
    | 'query_error'
    | 'not_configured';
  /** Present with `query_error` / `not_configured` — the underlying message. */
  error?: string;
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
 * Reduce any of the phone shapes this codebase produces to canonical E.164
 * DIGITS ONLY — no '+', no '@c.us', no '@s.whatsapp.net'.
 *
 * Three incompatible formats used to reach `wa_bridge_outbox.to_phone` and go
 * to the bridge verbatim: the admission lead page builds a whatsapp-web.js JID
 * (`919876543210@c.us`), the queue path built its own JID, and other callers
 * pass a raw or '+'-prefixed number. One column, one wire format, one place to
 * normalise — here, on the insert path, so no caller can bypass it.
 *
 * India is the default country: a bare 10-digit mobile and a leading-0 trunk
 * number both become 91-prefixed. A number that already carries a country code
 * is left alone.
 */
export function normalizeToE164(raw: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new BridgeRecipientError('Recipient phone number is empty.');
  }

  // Drop any JID suffix (@c.us, @s.whatsapp.net, @g.us) and anything after it.
  const withoutJid = raw.split('@')[0];

  // Strip formatting: spaces, dashes, parens, dots, and a leading '+'.
  const digits = withoutJid.replace(/[\s\-().]/g, '').replace(/^\+/, '');

  if (!/^\d+$/.test(digits)) {
    throw new BridgeRecipientError(
      `Recipient phone number is not a number after normalisation: "${raw}".`
    );
  }

  let e164 = digits;
  if (e164.startsWith('0')) e164 = '91' + e164.replace(/^0+/, '');
  else if (/^[6-9]\d{9}$/.test(e164)) e164 = '91' + e164;

  if (e164.length < 10 || e164.length > 15) {
    throw new BridgeRecipientError(
      `Recipient phone number has an implausible length after normalisation: "${raw}" → "${e164}".`
    );
  }

  return e164;
}

/** Refuse to write a `type` outside the declared contract. */
function assertOutboxType(type: string): asserts type is BridgeOutboxType {
  if (!(BRIDGE_OUTBOX_TYPES as readonly string[]).includes(type)) {
    throw new BridgeOutboxTypeRejectedError(
      `MyJKKN tried to write type "${type}", which is not part of the contract.`
    );
  }
}

/**
 * Read the kill switch on a SERVER path.
 *
 * Deliberately does NOT use `lib/policies/get-policy.ts`: that module imports
 * next/headers, and this file is reachable from the client bundle via
 * lead-service.ts → wa-event-dispatcher → auto-trigger-service, so a static
 * import of the server variant would break the build the way PR #626 did.
 * Instead it calls the same `fn_get_policy_bool` SECURITY DEFINER RPC through
 * the service-role client — that RPC is granted to `service_role`
 * (migration 20260429000002, line 322), so it resolves on any server path.
 *
 * The GLOBAL scope is the right one for a kill switch, and service_role has no
 * auth.uid(), so user/role overrides correctly do not apply.
 *
 * In a browser `bridgeClient()` throws for want of a service key — which is the
 * fail-closed answer, since no send path is ever meant to run there.
 */
async function readByowEnabled(): Promise<boolean> {
  const db = bridgeClient();
  const { data, error } = await db.rpc('fn_get_policy_bool', {
    p_key: POLICY_KEYS.WA_BYOW_IS_ENABLED,
    p_default: true,
    p_scope_id: null,
  });
  if (error) throw new ByowPolicyUnreadableError(error.message);
  if (typeof data !== 'boolean') {
    throw new ByowPolicyUnreadableError(`RPC returned ${JSON.stringify(data)}, expected a boolean`);
  }
  return data;
}

/**
 * Kill-switch gate (v4 spec). When wa_byow.is_enabled is false nothing may be
 * enqueued — and when the switch cannot be READ, nothing may be enqueued
 * either. A switch that defaults to "on" whenever it fails to resolve is not a
 * switch.
 *
 * A MISSING policy row still resolves to the `true` default inside the RPC, so
 * a first deploy works without seeding anything.
 */
async function assertByowEnabled(): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await readByowEnabled();
  } catch (err) {
    if (err instanceof ByowPolicyUnreadableError) throw err;
    throw new ByowPolicyUnreadableError(err instanceof Error ? err.message : String(err));
  }
  if (!enabled) throw new ByowDisabledError();
}

/**
 * Read the single wa_bridge_status row and decide whether the bridge is alive.
 *
 * Never throws: callers are API routes that must still answer. A missing table,
 * a failed query and a missing heartbeat are reported as DIFFERENT reasons —
 * previously the query error was swallowed, so "the table does not exist" and
 * "the bridge is quiet" looked identical to whoever was on call.
 */
export async function getBridgeHealth(): Promise<BridgeHealth> {
  return Sentry.startSpan({ op: 'whatsapp.bridge', name: 'status' }, async () => {
    const offline = (
      reason: NonNullable<BridgeHealth['reason']>,
      error?: string
    ): BridgeHealth => ({
      connected: false,
      loggedIn: false,
      phoneNumber: null,
      version: null,
      lastHeartbeatAt: null,
      heartbeatAgeMs: null,
      reason,
      ...(error ? { error } : {}),
    });

    let db: ReturnType<typeof bridgeClient>;
    try {
      db = bridgeClient();
    } catch (err) {
      // No service credentials in this environment. Report it; do not throw
      // into a route handler that would then 500 on an otherwise fine page.
      return offline('not_configured', err instanceof Error ? err.message : String(err));
    }

    let data: unknown = null;
    try {
      const res = await db
        .from('wa_bridge_status')
        .select('connected, logged_in, phone_number, version, last_heartbeat_at')
        .limit(1)
        .maybeSingle();
      // A missing table, a revoked grant and a network blip all arrive here.
      // Surfacing them is the whole point: they are not "the bridge is quiet".
      if (res.error) return offline('query_error', res.error.message);
      data = res.data;
    } catch (err) {
      return offline('query_error', err instanceof Error ? err.message : String(err));
    }

    if (!data) return offline('no_status_row');

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
  type: BridgeOutboxType;
  media_url?: string | null;
  lead_id?: string | null;
  institution_id?: string | null;
  created_by?: string | null;
}

/**
 * Insert rows into wa_bridge_outbox as `pending` and return their ids.
 *
 * This is the ONLY insert path, which is why both invariants live here:
 * `to_phone` is normalised to E.164 digits, and `type` is checked against the
 * declared contract before the write and again if the database rejects it.
 */
async function enqueue(rows: OutboxRowInput[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const db = bridgeClient();

  const prepared = rows.map((r) => {
    assertOutboxType(r.type);
    return {
      to_phone: normalizeToE164(r.to_phone),
      body: r.body,
      type: r.type,
      media_url: r.media_url ?? null,
      status: 'pending',
      attempts: 0,
      lead_id: r.lead_id ?? null,
      institution_id: r.institution_id ?? null,
      created_by: r.created_by ?? null,
    };
  });

  const { data, error } = await db.from('wa_bridge_outbox').insert(prepared).select('id');

  if (error) {
    // 23514 = check_violation. If the constraint that rejected us is the one on
    // `type`, say so by name — the alternative is 100% of media sends failing
    // behind the words "Could not queue WhatsApp message".
    const code = (error as { code?: string }).code;
    const blob = `${error.message} ${(error as { details?: string }).details ?? ''}`;
    if (code === '23514' && /type/i.test(blob)) {
      throw new BridgeOutboxTypeRejectedError(blob.trim());
    }
    throw new Error(`Could not queue WhatsApp message: ${error.message}`);
  }
  return ((data ?? []) as { id: string }[]).map((d) => d.id);
}

/** The department the caller themselves belongs to, or null. */
async function callerDepartment(userId: string): Promise<string | null> {
  try {
    const db = bridgeClient();
    const { data } = await db
      .from('profiles')
      .select('department_id')
      .eq('id', userId)
      .maybeSingle();
    return (data?.department_id as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Pick the `wa_personal_connections` row that a history entry is attributed to.
 *
 * `wa_personal_message_logs.department_id` and `.connection_id` are both NOT
 * NULL with foreign keys, so history cannot be written without one. Transport
 * no longer selects a connection — this is metadata only.
 *
 * SCOPE RULE (the reason this function is not a one-liner): the anchor may only
 * ever be a department the CALLER is entitled to. The previous version fell
 * back to "whatever connection row sorts first", which wrote the message body
 * and the recipient's phone number into a history row belonging to a department
 * the caller had never been authorised for — readable by that department's
 * staff. A wrong department is worse than no row, so when the caller's own
 * scope yields nothing this returns null and the caller records the message as
 * queued-but-unlogged.
 *
 * @param departmentId A department the caller has ALREADY been gated against
 *   (checkByowDeptAccess), or null.
 * @param callerUserId Used only to fall back to the caller's OWN department.
 *   System senders pass null and get no anchor.
 */
export async function resolveHistoryAnchor(
  departmentId: string | null,
  callerUserId?: string | null
): Promise<{ id: string; department_id: string } | null> {
  const deptId = departmentId ?? (callerUserId ? await callerDepartment(callerUserId) : null);
  if (!deptId) return null;

  const own = await WhatsAppPersonalConnectionService.getConnection(deptId);
  return own ? { id: own.id, department_id: own.department_id } : null;
}

/**
 * Drive `wa_personal_connections.status` from the bridge heartbeat.
 *
 * The old status route was this column's only writer. Without a writer the BYOW
 * health badge — and `isConnected()` / `getAnyReadyConnection()`, which the
 * expo and auto-trigger services branch on — freeze on whatever the Railway
 * service last said and stay there forever. There is one shared number now, so
 * every connection row reports the same bridge state.
 *
 * Best-effort and idempotent: writes only rows whose value actually changed,
 * and never throws into the caller (a health read must not fail on a write).
 */
export async function syncConnectionsToBridgeHealth(health: BridgeHealth): Promise<void> {
  try {
    // Do not overwrite a live value with a guess when we could not read health.
    if (health.reason === 'query_error' || health.reason === 'not_configured') return;

    const target = health.connected && health.loggedIn ? 'ready' : 'disconnected';
    const connections = await WhatsAppPersonalConnectionService.getAllConnections();

    await Promise.all(
      connections
        .filter((c) => c.status !== target)
        .map((c) =>
          WhatsAppPersonalConnectionService.updateStatus(
            c.department_id,
            target,
            target === 'ready' && health.phoneNumber
              ? { phone_number: health.phoneNumber }
              : undefined
          )
        )
    );
  } catch {
    // Health reads must keep working even when this write cannot.
  }
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
 * longer performs the sends. All rows are enqueued in one insert, bounded by
 * BRIDGE_BULK_MAX_RECIPIENTS.
 *
 * Every count in the response means ACCEPTED INTO THE OUTBOX, not delivered —
 * they used to disagree with each other (`totalSent: 0` next to
 * `successCount: N`), which left callers free to pick whichever number suited
 * them.
 */
export async function personalSendBulkAPI(
  recipients: PersonalRecipient[],
  _delayMs: number = 1500,
  config?: ByowServiceConfig
): Promise<PersonalQueuedBulkResponse> {
  if (recipients.length > BRIDGE_BULK_MAX_RECIPIENTS) {
    throw new ByowBulkLimitError(recipients.length);
  }
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
      queuedCount: ids.length,
      // All three counters below mean "reached the outbox". Nothing here has
      // been delivered yet; the bridge owns delivery.
      totalSent: ids.length,
      successCount: ids.length,
      failCount: recipients.length - ids.length,
      results: recipients.map((r, i) => ({ phone: r.phone, success: i < ids.length })),
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
