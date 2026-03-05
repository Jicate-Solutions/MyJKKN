import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerOrganizationsTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_organizations',
    'Query organizational structure: institutions, departments, and courses. Use the entity parameter to choose what to query. All users see their institution data.',
    {
      entity: z.enum(['institutions', 'departments', 'courses'])
        .describe('Which organizational entity to query'),
      is_active: z.boolean().optional()
        .describe('Filter by active status'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'organizations');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        const entityConfig = {
          institutions: {
            table: 'institutions' as const,
            select: 'id, name, phone, email, website, is_active, counselling_code, category, accredited_by, city, state, country, institution_type, timetable_type, created_at, updated_at',
            instColumn: 'id',
          },
          departments: {
            table: 'departments' as const,
            select: 'id, department_name, department_code, institution_id, degree_id, is_active, display_name, department_order, created_at, updated_at',
            instColumn: 'institution_id',
          },
          courses: {
            table: 'courses' as const,
            select: 'id, course_name, course_code, institution_id, is_active, created_at, updated_at',
            instColumn: 'institution_id',
          },
        };

        const config = entityConfig[params.entity];

        let query = ctx.supabase
          .from(config.table)
          .select(config.select, { count: 'exact' })
          .eq(config.instColumn, ctx.institutionId);

        if (params.is_active !== undefined) {
          query = query.eq('is_active', params.is_active);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_organizations', 'organizations', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_organizations', 'organizations', 500, startTime);
        return mcpError('Failed to fetch organization records.');
      }
    }
  );
}
