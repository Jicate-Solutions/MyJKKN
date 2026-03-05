import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMorningBriefTool } from '@/lib/mcp/tools/morning-brief';

export function registerAllTools(server: McpServer): void {
  registerMorningBriefTool(server);
}
