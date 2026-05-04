import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerGrievanceTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_grievance',
    'Query grievance ticket records — complaints filed by learners/parents/staff/alumni with SLA tracking, ICC handling, and anonymous filing. Filter by status, priority, emergency flag, or anonymous flag. Students see their own grievances; faculty see departmental; admins see all institution-wide. ICC-only tickets are excluded for non-admin roles.',
    {
      status: z.enum(['open', 'in_progress', 'pending_info', 'resolved', 'closed', 'reopened']).optional()
        .describe('Filter by grievance status'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
        .describe('Filter by priority level'),
      is_emergency: z.boolean().optional()
        .describe('Filter by emergency flag'),
      is_anonymous: z.boolean().optional()
        .describe('Filter by anonymous flag'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'grievance');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('grievance_tickets')
          .select(
            'id, ticket_number, category_id, institution_id, subject, priority, status, raised_by_type, raised_by_name, sla_deadline, sla_status, resolved_at, is_emergency, is_anonymous, escalation_level, is_icc_only, created_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'raised_by_id',
          departmentIdColumn: 'department_id',
        });

        // ICC gate: McpAuthContext does not currently expose custom roles (icc_member),
        // so non-admin/non-super_admin roles cannot see ICC-only tickets.
        // super_admin break-glass with audit logging is handled at the route layer per spec R1.3.
        if (ctx.userRole !== 'admin' && ctx.userRole !== 'super_admin') {
          query = query.eq('is_icc_only', false);
        }

        if (params.status) {
          query = query.eq('status', params.status);
        }
        if (params.priority) {
          query = query.eq('priority', params.priority);
        }
        if (params.is_emergency !== undefined) {
          query = query.eq('is_emergency', params.is_emergency);
        }
        if (params.is_anonymous !== undefined) {
          query = query.eq('is_anonymous', params.is_anonymous);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_grievance', 'grievance', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_grievance', 'grievance', 500, startTime);
        return mcpError('Failed to fetch grievance records.');
      }
    }
  );
}
