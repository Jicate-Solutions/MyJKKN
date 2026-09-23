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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import { getUserSessionClient } from '@/lib/ai-tools/run-as-user';
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
  if (!ctx) {
    return jsonResponse(401, {
      error: 'invalid_token',
      error_description: 'This key is not valid, has been turned off, or has expired.',
    });
  }

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
      const data = await callRpcTool(
        client,
        tool,
        request.params.arguments as Record<string, unknown> | undefined,
        ctx.ownerId
      );
      audit(name, 200, startTime);
      return capped(data);
    } catch (err) {
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
