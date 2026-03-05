import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMorningBrief } from '@/lib/services/morning-brief/morning-brief-service';
import type { McpAuthContext } from '@/lib/mcp/types';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';

export function registerMorningBriefTool(server: McpServer): void {
  server.tool(
    'myjkkn_morning_brief',
    'Get a comprehensive morning briefing of institutional metrics. ' +
    'Aggregates data from attendance (active students, sections marked today), ' +
    'billing (outstanding amounts, overdue count), admissions (pending applications), ' +
    'and staff (active count) in parallel. ' +
    'Perfect for daily management overview. Only includes modules the API key has access to.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Date for the brief (YYYY-MM-DD, defaults to today)'),
    },
    async ({ date }, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'morning-brief');
      if (accessError) return accessError;

      try {
        const data = await getMorningBrief(ctx.institutionId);
        logMcpToolCall(ctx, 'myjkkn_morning_brief', 'morning-brief', 200, startTime);
        return mcpSuccess(data);
      } catch {
        logMcpToolCall(ctx, 'myjkkn_morning_brief', 'morning-brief', 500, startTime);
        return mcpError('Failed to generate morning brief. Please try again.');
      }
    }
  );
}
