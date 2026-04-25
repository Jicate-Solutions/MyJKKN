import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerLearnersTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_learners',
    'Query learner (student) profiles. Returns student details including enrollment status, department, program, semester, section, roll number, and contact information. Filter by lifecycle status, department, or semester. Students see only their own profile. Faculty see their department students. Admins see all.',
    {
      lifecycle_status: z.enum(['admitted', 'pending', 'approved', 'rejected', 'waitlisted', 'active', 'inactive', 'exited', 'graduated', 'alumni']).optional()
        .describe('Filter by student lifecycle status'),
      department_id: z.string().uuid().optional()
        .describe('Filter by department UUID'),
      semester_id: z.string().uuid().optional()
        .describe('Filter by semester UUID'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'learners');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);

        let query = ctx.supabase
          .from('learners_profiles')
          .select('id, application_id, lifecycle_status, first_name, last_name, gender, institution_id, degree_id, department_id, program_id, semester_id, section_id, academic_year_id, batch_id, roll_number, register_number, college_email, student_email, is_profile_complete, admission_year, created_at, updated_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'id',
          departmentIdColumn: 'department_id',
        });

        if (params.lifecycle_status) {
          query = query.eq('lifecycle_status', params.lifecycle_status);
        }
        if (params.department_id) {
          query = query.eq('department_id', params.department_id);
        }
        if (params.semester_id) {
          query = query.eq('semester_id', params.semester_id);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_learners', 'learners', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_learners', 'learners', 500, startTime);
        return mcpError('Failed to fetch learner profiles.');
      }
    }
  );
}
