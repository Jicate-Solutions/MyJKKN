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
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: publicInputSchema(t.params) as { type: 'object'; [k: string]: unknown },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    const name = request.params.name;
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
