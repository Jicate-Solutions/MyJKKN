import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerBillingTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_billing',
    'Query student billing records including invoices, payment status, and outstanding amounts. Filter by payment status (unpaid, partial, paid, overdue) and due date. Students see only their own bills. Faculty see their department bills. Admins see all institution bills.',
    {
      status: z.enum(['unpaid', 'partial', 'paid', 'overdue']).optional()
        .describe('Filter by payment status'),
      due_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Filter bills due before this date (YYYY-MM-DD)'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'billing');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('billing_student_bills')
          .select('id, student_id, institution_id, final_amount, balance_amount, status, due_date, created_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'student_id',
          departmentIdColumn: 'department_id',
        });

        if (params.status) {
          query = query.eq('status', params.status);
        }
        if (params.due_before) {
          query = query.lt('due_date', params.due_before);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_billing', 'billing', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_billing', 'billing', 500, startTime);
        return mcpError('Failed to fetch billing records.');
      }
    }
  );
}
