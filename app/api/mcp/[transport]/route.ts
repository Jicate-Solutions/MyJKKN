export const dynamic = 'force-dynamic';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerAllTools } from '@/lib/mcp/register-tools';
import { verifyMcpToken } from '@/lib/mcp/auth-bridge';

/**
 * MCP route handler using the SDK directly (stateless mode).
 * Creates a fresh McpServer + transport per request to avoid
 * stale-singleton issues with mcp-handler.
 */
async function handler(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const [type, token] = authHeader?.split(' ') ?? [];
  const bearerToken = type?.toLowerCase() === 'bearer' ? token : undefined;

  let authResult: Awaited<ReturnType<typeof verifyMcpToken>>;
  try {
    authResult = await verifyMcpToken(req, bearerToken);
    if (!authResult) {
      return new Response(
        JSON.stringify({ error: 'invalid_token', error_description: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('[MCP Auth] Error:', err);
    return new Response(
      JSON.stringify({ error: 'invalid_token', error_description: 'Authentication failed' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── MCP Server (fresh per request — stateless) ──────────────────────────
  const server = new McpServer(
    { name: 'MyJKKN MCP Server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  registerAllTools(server);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  try {
    // Pass authInfo so tools receive it via extra.authInfo
    return await transport.handleRequest(req, { authInfo: authResult as unknown as import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo });
  } catch (err) {
    console.error('[MCP Route] handleRequest error:', err);
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export { handler as GET, handler as POST, handler as DELETE };
