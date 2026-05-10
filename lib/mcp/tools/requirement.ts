import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerRequirementTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_requirement',
    'Query institutional feature requirement records — feature requests with voting + budget approval workflow. Returns requirements with status, vote tally, approval chain progression, and budget state. Filter by status, voting state (active/closed), or budgeted flag. Students see their own; faculty see departmental; admins see all institution-wide.',
    {
      status: z.enum([
        'submitted', 'under_review', 'voting_open', 'voting_closed',
        'approved', 'budgeted', 'in_progress', 'fulfilled', 'rejected', 'withdrawn',
      ]).optional()
        .describe('Filter by requirement lifecycle status'),
      voting_state: z.enum(['active', 'closed']).optional()
        .describe('Filter by voting window state — active = NOW() between voting_opens_at and voting_closes_at; closed = voting_closes_at < NOW()'),
      is_budgeted: z.boolean().optional()
        .describe('Filter by budget state — true = budgeted_amount IS NOT NULL'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'requirement');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        // TODO: regenerate types after substrate migration applies (requirement_requests table created in sibling SQL PR).
        // Cast supabase client to any until types/supabase.ts includes requirement_requests.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (ctx.supabase as any)
          .from('requirement_requests')
          .select(
            'id, request_number, category_id, institution_id, subject, description, estimated_budget, status, voting_opens_at, voting_closes_at, vote_count_yes, vote_count_no, approved_at, budgeted_amount, fulfilled_at, raised_by_type, raised_by_name, created_at',
            { count: 'exact' }
          );

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'raised_by_id',
          // Note: requirement_requests does not have department_id per spec; faculty scoping
          // is institution-wide for this table until a department-scoping rule is locked.
        });

        if (params.status) {
          query = query.eq('status', params.status);
        }

        if (params.voting_state) {
          const nowIso = new Date().toISOString();
          if (params.voting_state === 'active') {
            // active = voting_opens_at <= NOW() AND voting_closes_at >= NOW()
            query = query.lte('voting_opens_at', nowIso).gte('voting_closes_at', nowIso);
          } else {
            // closed = voting_closes_at < NOW()
            query = query.lt('voting_closes_at', nowIso);
          }
        }

        if (params.is_budgeted !== undefined) {
          if (params.is_budgeted) {
            query = query.not('budgeted_amount', 'is', null);
          } else {
            query = query.is('budgeted_amount', null);
          }
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_requirement', 'requirement', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_requirement', 'requirement', 500, startTime);
        return mcpError('Failed to fetch requirement records.');
      }
    }
  );
}
