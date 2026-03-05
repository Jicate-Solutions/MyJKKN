import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerAdmissionTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_admission',
    'Query admission/application records. Returns applicant details with lifecycle status. Filter by lifecycle status. Admins see all institution admissions.',
    {
      status: z.enum(['enquiry', 'pending', 'approved', 'rejected', 'waitlisted', 'active', 'inactive', 'exited', 'graduated', 'alumni']).optional()
        .describe('Filter by lifecycle status'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'admission');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, student_email, student_mobile, lifecycle_status, application_id, created_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) {
          query = query.eq('lifecycle_status', params.status);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_admission', 'admission', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_admission', 'admission', 500, startTime);
        return mcpError('Failed to fetch admission records.');
      }
    }
  );
}
