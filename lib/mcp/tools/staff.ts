import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerStaffTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_staff',
    'Query staff/faculty records. Returns staff details including name, designation, department, role type, contact info, and active status. Filter by active status, department, or designation (partial match). Faculty see their department staff only. Admins see all institution staff.',
    {
      is_active: z.boolean().optional()
        .describe('Filter by active status'),
      department_id: z.string().uuid().optional()
        .describe('Filter by department UUID'),
      designation: z.string().optional()
        .describe('Filter by designation (partial match, case-insensitive)'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'staff');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('staff')
          .select('id, staff_id, first_name, last_name, gender, designation, role_type, institution_id, department_id, category_id, institution_email, email, is_active, date_of_joining, created_at, updated_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          departmentIdColumn: 'department_id',
        });

        if (params.is_active !== undefined) {
          query = query.eq('is_active', params.is_active);
        }
        if (params.department_id) {
          query = query.eq('department_id', params.department_id);
        }
        if (params.designation) {
          query = query.ilike('designation', `%${params.designation}%`);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_staff', 'staff', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_staff', 'staff', 500, startTime);
        return mcpError('Failed to fetch staff records.');
      }
    }
  );
}
