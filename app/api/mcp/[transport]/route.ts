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
  }
);

const authHandler = withMcpAuth(
  handler,
  async (req, token) => {
    const result = await verifyMcpToken(req, token);
    return result as unknown as AuthInfo | undefined;
  },
  { required: true }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
