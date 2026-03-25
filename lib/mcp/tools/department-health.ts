import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall } from '@/lib/mcp/tool-helpers';
import { hasModuleAccess } from '@/lib/api-keys/authenticate';

export function registerDepartmentHealthTool(server: McpServer): void {
  server.tool(
    'myjkkn_department_health',
    'Cross-module department health metrics. Aggregates learner count, ' +
    'active staff count, overdue billing, and OKR progress for a specific department. ' +
    'Requires organizations read access; other modules enhance the report.',
    {
      department_id: z.string().uuid().describe('Department UUID to analyze'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required.');

      const accessError = checkModuleAccess(ctx, 'organizations');
      if (accessError) return accessError;

      try {
        const deptId = params.department_id;
        const metrics: Record<string, unknown> = { department_id: deptId };
        const promises: Promise<void>[] = [];

        if (hasModuleAccess(ctx.permissions.read, 'learners')) {
          promises.push(
            (async () => {
              const { count } = await ctx.supabase
                .from('learners_profiles')
                .select('*', { count: 'exact', head: true })
                .eq('institution_id', ctx.institutionId)
                .eq('department_id', deptId)
                .eq('lifecycle_status', 'active');
              metrics.active_learners = count ?? 0;
            })()
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'staff')) {
          promises.push(
            (async () => {
              const { count } = await ctx.supabase
                .from('staff')
                .select('*', { count: 'exact', head: true })
                .eq('institution_id', ctx.institutionId)
                .eq('department_id', deptId)
                .eq('is_active', true);
              metrics.active_staff = count ?? 0;
            })()
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'billing')) {
          promises.push(
            (async () => {
              const { data } = await ctx.supabase
                .from('billing_student_bills')
                .select('balance_amount')
                .eq('institution_id', ctx.institutionId)
                .eq('department_id', deptId)
                .in('status', ['unpaid', 'partial'])
                .limit(1000);
              const total = (data ?? []).reduce(
                (sum: number, r: { balance_amount: number }) => sum + (r.balance_amount ?? 0), 0
              );
              metrics.outstanding_amount = total;
              metrics.outstanding_currency = 'INR';
            })()
          );
        }

        if (hasModuleAccess(ctx.permissions.read, 'okr')) {
          promises.push(
            (async () => {
              const { data } = await ctx.supabase
                .from('okr_objectives')
                .select('overall_progress')
                .eq('institution_id', ctx.institutionId)
                .eq('department_id', deptId)
                .eq('status', 'active')
                .limit(100);
              const objectives = data ?? [];
              const avgProgress = objectives.length > 0
                ? objectives.reduce((sum: number, o: { overall_progress: number }) => sum + (o.overall_progress ?? 0), 0) / objectives.length
                : 0;
              metrics.okr_avg_progress = Math.round(avgProgress * 100) / 100;
              metrics.okr_active_count = objectives.length;
            })()
          );
        }

        await Promise.all(promises);

        logMcpToolCall(ctx, 'myjkkn_department_health', 'organizations', 200, startTime);
        return mcpSuccess(metrics);
      } catch {
        logMcpToolCall(ctx, 'myjkkn_department_health', 'organizations', 500, startTime);
        return mcpError('Failed to fetch department health metrics.');
      }
    }
  );
}
