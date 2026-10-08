// lib/mcp/personal-door.ts
//
// The outside-AI door for PERSONAL keys (jkkn_pk_…), made by a person for
// themselves on /ai-query/connect.
//
// What differs from an administrator's key (lib/mcp/auth-bridge.ts):
//   - The tools come from the catalog (fn_ai_tool_menu 'door'), filtered to
//     what the key's OWNER may use — not the 12 hand-written tools.
//   - Every tool runs AS THE OWNER through their own minted session
//     (lib/ai-tools/run-as-user.ts). The service-role client is used for ONE
//     thing only: looking the key up by its hash, the same way every other key
//     is verified. It never runs a tool.
//   - Every tool call is audit-logged (who = the key, which tool, when, the
//     outcome — never the arguments or the data) and every request is
//     rate-limited, with the existing logger and limiter.
//   - ONE write exists (8 Oct 2026): schedule_meeting, listed only when the
//     owner switched booking on for THIS key (ai_personal_key_booking_grants,
//     20271008150000). It books on the OWNER's calendar only — the host is the
//     key's user_id, never a value from the caller — through
//     HostSchedulingService.scheduleDirect, the same path as /meetings/schedule.
//     That service needs the service-role client by design (it writes
//     meeting_bookings for the host and reads invitees' profiles); it is used
//     only after the owner's identity and meetings access are fixed.

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import { AccountOffError, getUserSessionClient } from '@/lib/ai-tools/run-as-user';
import {
  callRpcTool,
  fetchToolMenu,
  publicInputSchema,
  ToolArgsError,
  type CatalogTool,
} from '@/lib/ai-tools/catalog';
import { mcpError, mcpSuccess, type McpToolResult } from '@/lib/mcp/tool-helpers';
import {
  CAMPUS_TZ,
  HostSchedulingService,
  type HostMeetingLocationMode,
  type ScheduleAttendee,
} from '@/lib/services/meetings/host-scheduling-service';
import { zonedToUtc } from '@/lib/services/meetings/native-slot-engine';

/** Every personal key starts with this; admin keys are `jkkn_` + 32 hex characters. */
export const PERSONAL_KEY_PREFIX = 'jkkn_pk_';

/** Largest tool answer handed back, in characters. Bigger answers are cut with a note. */
export const MAX_RESULT_CHARS = 100_000;

/**
 * Most rows one door call may ask for. Many functions default p_limit to
 * 10,000; the door sends at most this many (and this many when the outside AI
 * leaves p_limit out). The character cut above stays as a second guard.
 */
export const DOOR_MAX_LIMIT = 500;

/** A refusal the door returns to the outside AI as a tool error (never a crash). */
export class DoorRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoorRefusal';
  }
}

export function isPersonalKeyToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && token.startsWith(PERSONAL_KEY_PREFIX);
}

export interface PersonalKeyContext {
  keyId: string;
  keyName: string;
  ownerId: string;
  institutionId: string | null;
  /** The owner switched booking on for this key (fails closed to false). */
  canBookMeetings: boolean;
}

/**
 * Looks a personal key up by its SHA-256 hash. Returns undefined for an
 * unknown, turned-off, expired or non-personal key.
 */
export async function verifyPersonalMcpToken(token: string): Promise<PersonalKeyContext | undefined> {
  if (!isPersonalKeyToken(token)) return undefined;

  const hashedKey = createHash('sha256').update(token).digest('hex');
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, user_id, institution_id, is_active, expires_at, key_kind')
    .eq('key_value', hashedKey)
    .eq('key_kind', 'personal')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return undefined;
  const row = data as {
    id: string;
    name: string;
    user_id: string | null;
    institution_id: string | null;
    is_active: boolean | null;
    expires_at: string | null;
    key_kind: string;
  };
  if (row.key_kind !== 'personal' || row.is_active !== true || !row.user_id) return undefined;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return undefined;

  void Promise.resolve(
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
  )
    .then(() => {})
    .catch(() => {});

  return {
    keyId: row.id,
    keyName: row.name,
    ownerId: row.user_id,
    institutionId: row.institution_id,
    canBookMeetings: await keyMayBook(supabase as unknown as SupabaseClient, row.id),
  };
}

/** Whether the owner switched booking on for this key. Any error reads as no. */
async function keyMayBook(supabase: SupabaseClient, keyId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ai_personal_key_booking_grants')
      .select('active')
      .eq('key_id', keyId)
      .maybeSingle();
    return !error && (data as { active?: boolean } | null)?.active === true;
  } catch {
    return false;
  }
}

// ─── schedule_meeting ──────────────────────────────────────────────────────

export const SCHEDULE_TOOL_NAME = 'schedule_meeting';

const LOCATION_MODES: HostMeetingLocationMode[] = ['online', 'phone', 'in_person'];
const MAX_ATTENDEES = 50;
const MAX_DURATION_MIN = 480;

/** The tool as the outside AI sees it. Listed only for a key allowed to book. */
export const SCHEDULE_TOOL = {
  name: SCHEDULE_TOOL_NAME,
  description:
    "Book a meeting on the key owner's own MyJKKN calendar and send the invitations, exactly as the owner would on Meetings > Schedule. " +
    'Times are India time (Asia/Kolkata). Fails with "slot taken" when the owner already has a meeting then.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'What the meeting is called.' },
      start_local: {
        type: 'string',
        description: 'Start in India time, as YYYY-MM-DDTHH:MM, for example 2026-10-08T15:30.',
      },
      duration_min: { type: 'integer', minimum: 5, maximum: MAX_DURATION_MIN, description: 'Length in minutes.' },
      location_mode: { type: 'string', enum: LOCATION_MODES, description: 'online makes a Google Meet link.' },
      location_text: { type: 'string', description: 'Where, required for in_person.' },
      note: { type: 'string', description: 'Text the invitees see in the invitation.' },
      attendees: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_ATTENDEES,
        items: {
          type: 'object',
          properties: { email: { type: 'string' }, name: { type: 'string' } },
          required: ['email'],
        },
      },
    },
    required: ['title', 'start_local', 'duration_min', 'location_mode', 'attendees'],
  },
};

export interface ScheduleArgs {
  title: string;
  startIso: string;
  durationMin: number;
  locationMode: HostMeetingLocationMode;
  locationText: string | null;
  note: string | null;
  attendees: { email: string; name: string }[];
}

/** Reads India wall-clock "YYYY-MM-DDTHH:MM" as a real instant. */
export function indiaLocalToIso(local: unknown): string | null {
  if (typeof local !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedToUtc(y, mo, d, h * 60 + mi, CAMPUS_TZ).toISOString();
}

/** Checks and shapes the outside AI's arguments. Throws ToolArgsError in plain words. */
export function parseScheduleArgs(input: Record<string, unknown> | undefined): ScheduleArgs {
  const a = input ?? {};
  const title = typeof a.title === 'string' ? a.title.trim() : '';
  if (!title) throw new ToolArgsError('Give the meeting a title.');
  const startIso = indiaLocalToIso(a.start_local);
  if (!startIso) throw new ToolArgsError('start_local must be India time as YYYY-MM-DDTHH:MM.');
  if (new Date(startIso).getTime() < Date.now() - 5 * 60_000) {
    throw new ToolArgsError('That start time has already passed.');
  }
  const durationMin = Number(a.duration_min);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > MAX_DURATION_MIN) {
    throw new ToolArgsError(`duration_min must be a whole number from 5 to ${MAX_DURATION_MIN}.`);
  }
  const locationMode = a.location_mode as HostMeetingLocationMode;
  if (!LOCATION_MODES.includes(locationMode)) {
    throw new ToolArgsError('location_mode must be online, phone or in_person.');
  }
  if (!Array.isArray(a.attendees) || a.attendees.length < 1 || a.attendees.length > MAX_ATTENDEES) {
    throw new ToolArgsError(`attendees must list 1 to ${MAX_ATTENDEES} people.`);
  }
  const attendees = a.attendees.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const email = typeof o.email === 'string' ? o.email.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    return { email, name: name || email };
  });
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    title,
    startIso,
    durationMin,
    locationMode,
    locationText: text(a.location_text),
    note: text(a.note),
    attendees,
  };
}

/**
 * Books for the key's owner. The owner's meetings access is re-checked AS the
 * owner on every call, so taking Meetings away stops the key at once.
 */
async function runScheduleTool(
  ownerClient: SupabaseClient,
  ownerId: string,
  input: Record<string, unknown> | undefined
): Promise<unknown> {
  const args = parseScheduleArgs(input);

  const [{ data: isSuper }, { data: canMeet }] = await Promise.all([
    ownerClient.rpc('is_super_admin'),
    ownerClient.rpc('user_has_permission', { permission_name: 'meetings.view' }),
  ]);
  if (isSuper !== true && canMeet !== true) {
    throw new DoorRefusal('The owner of this key no longer has access to Meetings in MyJKKN.');
  }

  const db = createServiceRoleClient() as unknown as SupabaseClient;

  // Link invitees who are MyJKKN people, the same way the Schedule page does
  // when someone is picked from the list. Unknown addresses stay plain emails.
  // Both the lowercased and the as-typed address: profiles.email is matched
  // exactly here, and not every stored address is lowercase.
  const emails = [
    ...new Set(args.attendees.flatMap((p) => [p.email.toLowerCase(), p.email])),
  ];
  const { data: known } = await db
    .from('profiles')
    .select('id, email')
    .in('email', emails)
    .eq('is_active', true);
  const byEmail = new Map(
    ((known ?? []) as { id: string; email: string }[]).map((r) => [r.email.toLowerCase(), r.id])
  );
  const attendees: ScheduleAttendee[] = args.attendees.map((p) => ({
    email: p.email,
    name: p.name,
    profileId: byEmail.get(p.email.toLowerCase()) ?? null,
  }));

  const outcome = await HostSchedulingService.scheduleDirect(db, {
    hostProfileId: ownerId,
    title: args.title,
    startIso: args.startIso,
    durationMin: args.durationMin,
    locationMode: args.locationMode,
    locationText: args.locationText,
    note: args.note,
    attendees,
  });
  if (!outcome.ok) {
    const code = outcome.error?.code;
    if (code === 'VALIDATION') throw new ToolArgsError(outcome.error.message);
    if (code === 'SLOT_TAKEN') throw new DoorRefusal(outcome.error.message);
    throw new Error(outcome.error?.message ?? 'not booked');
  }
  return {
    booked: true,
    uid: outcome.data.uid,
    start: outcome.data.startIso,
    end: outcome.data.endIso,
    meet_link: outcome.data.videoUrl,
    // Booked, but the calendar or invitation step did not fully succeed.
    warning: outcome.data.warning,
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The one answer for an unknown, turned-off or expired key — and for a switched-off owner. */
function revokedKeyResponse(): Response {
  return jsonResponse(401, {
    error: 'invalid_token',
    error_description: 'This key is not valid, has been turned off, or has expired.',
  });
}

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ipAddress: forwarded || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent') || null,
  };
}

function capped(data: unknown): McpToolResult {
  const result = mcpSuccess(data);
  const text = result.content[0]?.text ?? '';
  if (text.length <= MAX_RESULT_CHARS) return result;
  return {
    content: [
      {
        type: 'text',
        text:
          text.slice(0, MAX_RESULT_CHARS) +
          `\n\n[Cut at ${MAX_RESULT_CHARS} characters. Ask again with a smaller p_limit or a narrower filter.]`,
      },
    ],
  };
}

/**
 * Caps p_limit for any tool that takes one: min(asked, DOOR_MAX_LIMIT), and
 * DOOR_MAX_LIMIT when the outside AI leaves it out. Other arguments pass
 * through untouched (buildRpcArgs still decides what is kept).
 */
export function withDoorLimit(
  tool: CatalogTool,
  input: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(input ?? {}) };
  const declared = tool.params?.properties ?? {};
  if (!Object.prototype.hasOwnProperty.call(declared, 'p_limit')) return out;
  const asked = Number(out.p_limit);
  out.p_limit =
    Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), DOOR_MAX_LIMIT) : DOOR_MAX_LIMIT;
  return out;
}

/**
 * Several ai_rpc_* functions honour a caller-supplied p_institution_id without
 * checking that the caller may see that college (measured live 2026-09-23:
 * students_summary, students_by_department, admission_referrers). Until their
 * SQL is fixed, the door refuses any p_institution_id the key OWNER cannot
 * access — asked AS the owner, through role_has_institution_access, the same
 * function MyJKKN's own row rules use (and the same guard the Mac standby
 * answerer applies). A missing or empty p_institution_id is not checked: the
 * functions then fall back to the person's own college.
 */
export async function assertInstitutionAllowed(
  client: SupabaseClient,
  tool: CatalogTool,
  input: Record<string, unknown> | undefined
): Promise<void> {
  const declared = tool.params?.properties ?? {};
  if (!Object.prototype.hasOwnProperty.call(declared, 'p_institution_id')) return;
  const value = input?.p_institution_id;
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  if (typeof value !== 'string') throw new DoorRefusal('p_institution_id must be a college id.');

  const { data, error } = await client.rpc('role_has_institution_access', {
    check_institution_id: value.trim(),
  });
  if (error || data !== true) {
    throw new DoorRefusal(
      'You do not have access to that college in MyJKKN. Ask only about the colleges you can see.'
    );
  }
}

/** The door's tool list for this person: rpc tools only, and never a write. */
export function doorTools(menu: CatalogTool[]): CatalogTool[] {
  return menu.filter((t) => t.kind === 'rpc' && t.is_write !== true);
}

/**
 * Handles one MCP request made with a personal key. Stateless, like the admin
 * path: a fresh server per request.
 */
export async function handlePersonalKeyRequest(req: Request, token: string): Promise<Response> {
  const ctx = await verifyPersonalMcpToken(token);
  if (!ctx) return revokedKeyResponse();

  const limit = checkRateLimit(ctx.keyId);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
    return jsonResponse(
      429,
      { error: 'rate_limited', error_description: 'Too many requests. Try again shortly.' },
      { 'Retry-After': String(retryAfter) }
    );
  }

  let tools: CatalogTool[];
  let client: Awaited<ReturnType<typeof getUserSessionClient>>;
  try {
    client = await getUserSessionClient(ctx.ownerId);
    tools = doorTools(await fetchToolMenu(client, 'door'));
  } catch (err) {
    console.warn('[MCP personal] could not act as key owner', {
      keyId: ctx.keyId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    // The owner's account is switched off in MyJKKN: answer exactly as for a
    // turned-off key, so the holder learns nothing about why.
    if (err instanceof AccountOffError) return revokedKeyResponse();
    return jsonResponse(401, {
      error: 'invalid_token',
      error_description: 'This key cannot be used right now. Make a new key on the Connect an outside AI page.',
    });
  }

  const meta = requestMeta(req);
  const audit = (toolName: string, statusCode: number, startTime: number) =>
    logApiUsage({
      apiKeyId: ctx.keyId,
      endpoint: `mcp:${toolName}`,
      module: 'ai',
      institutionId: ctx.institutionId,
      statusCode,
      responseTimeMs: Date.now() - startTime,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

  const server = new Server(
    { name: 'MyJKKN MCP Server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: publicInputSchema(t.params) as { type: 'object'; [k: string]: unknown },
      })),
      ...(ctx.canBookMeetings ? [SCHEDULE_TOOL] : []),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    const name = request.params.name;
    if (name === SCHEDULE_TOOL_NAME && ctx.canBookMeetings) {
      try {
        const data = await runScheduleTool(
          client as unknown as SupabaseClient,
          ctx.ownerId,
          request.params.arguments as Record<string, unknown> | undefined
        );
        audit(name, 200, startTime);
        return mcpSuccess(data);
      } catch (err) {
        if (err instanceof DoorRefusal) {
          audit(name, 403, startTime);
          return mcpError(err.message);
        }
        const isArgs = err instanceof ToolArgsError;
        audit(name, isArgs ? 400 : 500, startTime);
        if (!isArgs) {
          console.error('[MCP personal] schedule_meeting failed', {
            keyId: ctx.keyId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
        return mcpError(isArgs ? err.message : "MyJKKN could not confirm that booking. Check the owner's Meetings inbox before trying again.");
      }
    }
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      audit(name, 404, startTime);
      return mcpError(`Unknown tool: ${name}`);
    }
    try {
      const input = withDoorLimit(tool, request.params.arguments as Record<string, unknown> | undefined);
      await assertInstitutionAllowed(client, tool, input);
      const data = await callRpcTool(client, tool, input, ctx.ownerId);
      audit(name, 200, startTime);
      return capped(data);
    } catch (err) {
      if (err instanceof DoorRefusal) {
        audit(name, 403, startTime);
        return mcpError(err.message);
      }
      const isArgs = err instanceof ToolArgsError;
      audit(name, isArgs ? 400 : 500, startTime);
      return mcpError(isArgs ? err.message : `MyJKKN could not run ${name}. Try different filters.`);
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch (err) {
    console.error('[MCP personal] handleRequest error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}
