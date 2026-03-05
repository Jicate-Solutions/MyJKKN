import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registerAllTools } from '@/lib/mcp/register-tools';
import { verifyMcpToken } from '@/lib/mcp/auth-bridge';

const handler = createMcpHandler(
  (server) => {
    registerAllTools(server);
  },
  {
    capabilities: {
      tools: {},
    },
  },
  {
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: true,
  }
);

const authHandler = withMcpAuth(
  handler,
  async (req, token) => {
    try {
      const result = await verifyMcpToken(req, token);
      return result as unknown as AuthInfo | undefined;
    } catch (err) {
      console.error('[MCP Auth] verifyMcpToken error:', err);
      return undefined;
    }
  },
  { required: true }
);

async function wrappedHandler(req: Request) {
  try {
    return await authHandler(req);
  } catch (err) {
    console.error('[MCP Route] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
