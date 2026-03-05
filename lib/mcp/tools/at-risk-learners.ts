import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';
import { hasModuleAccess } from '@/lib/api-keys/authenticate';

export function registerAtRiskLearnersTool(server: McpServer): void {
  server.tool(
    'myjkkn_at_risk_learners',
    'Cross-module analysis to identify at-risk students. ' +
    'Checks multiple signals: overdue bills (billing module), ' +
    'and pending grievances (grievance module). ' +
    'Returns students with risk indicators from each available module. ' +
    'Requires read access to learners module; other modules are optional (enhances results).',
    {
      limit: z.number().int().min(1).max(50).optional()
        .describe('Max students to analyze (default: 20, max: 50)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'learners');
      if (accessError) return accessError;

      try {
        const resultLimit = Math.min(50, params.limit ?? 20);
        const overdueStudentIds: string[] = [];
        const grievanceStudentIds: string[] = [];

        // Check billing (if access)
        if (hasModuleAccess(ctx.permissions.read, 'billing')) {
          const today = new Date().toISOString().split('T')[0];
          let billQuery = ctx.supabase
            .from('billing_student_bills')
            .select('student_id')
            .lt('due_date', today)
            .gt('balance_amount', 0)
            .in('status', ['unpaid', 'partial']);
          billQuery = applyScopeFilters(billQuery, ctx, { studentIdColumn: 'student_id' });
          const { data: bills } = await billQuery.limit(resultLimit);
          if (bills) overdueStudentIds.push(...bills.map((b: { student_id: string }) => b.student_id));
        }

        // Check grievances (if access)
        if (hasModuleAccess(ctx.permissions.read, 'grievance')) {
          let gQuery = ctx.supabase
            .from('service_requests')
            .select('requester_id')
            .in('status', ['submitted', 'in_review']);
          gQuery = applyScopeFilters(gQuery, ctx, { studentIdColumn: 'requester_id' });
          const { data: grievances } = await gQuery.limit(resultLimit);
          if (grievances) grievanceStudentIds.push(...grievances.map((g: { requester_id: string }) => g.requester_id));
        }

        const allRiskIds = [...new Set([...overdueStudentIds, ...grievanceStudentIds])];

        if (allRiskIds.length === 0) {
          logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 200, startTime);
          return mcpSuccess({
            message: 'No at-risk students identified.',
            students: [],
            signals_checked: {
              billing: hasModuleAccess(ctx.permissions.read, 'billing'),
              grievance: hasModuleAccess(ctx.permissions.read, 'grievance'),
            },
          });
        }

        let profileQuery = ctx.supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, lifecycle_status, department_id, semester_id, roll_number')
          .in('id', allRiskIds.slice(0, resultLimit));
        profileQuery = applyScopeFilters(profileQuery, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });
        const { data: students } = await profileQuery;

        const result = (students ?? []).map((s: Record<string, unknown>) => ({
          ...s,
          risk_signals: {
            overdue_bills: overdueStudentIds.includes(s.id as string),
            open_grievances: grievanceStudentIds.includes(s.id as string),
          },
        }));

        logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 200, startTime);
        return mcpSuccess({
          students: result,
          total: result.length,
          signals_checked: {
            billing: hasModuleAccess(ctx.permissions.read, 'billing'),
            grievance: hasModuleAccess(ctx.permissions.read, 'grievance'),
          },
        });
      } catch {
        logMcpToolCall(ctx, 'myjkkn_at_risk_learners', 'learners', 500, startTime);
        return mcpError('Failed to analyze at-risk learners.');
      }
    }
  );
}
