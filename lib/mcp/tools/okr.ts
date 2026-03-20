import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerOkrTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_okr',
    'Query OKR objectives with progress, tier, cycle type, status, and ownership. Filter by status, tier, or cycle type. Faculty see their department OKRs. Admins see all institution OKRs.',
    {
      status: z.enum(['draft', 'active', 'completed', 'archived']).optional()
        .describe('Filter by objective status'),
      tier: z.enum(['tier_1', 'tier_2', 'tier_3']).optional()
        .describe('Filter by OKR tier'),
      cycle_type: z.enum(['annual', 'quarterly', 'semester']).optional()
        .describe('Filter by cycle type'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'okr');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('okr_objectives')
          .select('id, title, description, tier, level, owner_id, institution_id, department_id, cycle_type, start_date, end_date, status, overall_progress, created_by, approved_by, approved_at, created_at, updated_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'owner_id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) {
          query = query.eq('status', params.status);
        }
        if (params.tier) {
          query = query.eq('tier', params.tier);
        }
        if (params.cycle_type) {
          query = query.eq('cycle_type', params.cycle_type);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_okr', 'okr', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_okr', 'okr', 500, startTime);
        return mcpError('Failed to fetch OKR records.');
      }
    }
  );
}
