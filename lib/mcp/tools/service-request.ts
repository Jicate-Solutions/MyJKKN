import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerServiceRequestTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_service_request',
    'Query service request records — institutional service requests for certificates, transport passes, hall tickets, auditorium bookings, and similar fulfillment workflows. Returns request details with lifecycle state, priority, approval step, and timestamps. Filter by status or priority. Students see only their own service requests; faculty see departmental; admins see all institution-wide.',
    {
      status: z.enum(['draft', 'submitted', 'in_review', 'approved', 'rejected', 'returned', 'fulfilled', 'closed', 'cancelled']).optional()
        .describe('Filter by service request lifecycle status'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional()
        .describe('Filter by priority level'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'service_request');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('service_requests')
          .select('id, request_number, service_type_id, requester_id, institution_id, status, priority, current_approval_step, submitted_at, approved_at, fulfilled_at, closed_at, created_at, updated_at', { count: 'exact' });

        // Note: service_requests has no department_id column — only studentIdColumn applies for non-admin scoping.
        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'requester_id',
        });

        if (params.status) {
          query = query.eq('status', params.status);
        }
        if (params.priority) {
          query = query.eq('priority', params.priority);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_service_request', 'service_request', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_service_request', 'service_request', 500, startTime);
        return mcpError('Failed to fetch service request records.');
      }
    }
  );
}
