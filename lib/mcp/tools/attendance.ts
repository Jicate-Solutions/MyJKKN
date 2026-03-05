import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '@/lib/mcp/types';
import { applyScopeFilters, parsePagination } from '@/lib/mcp/scoping';
import { checkModuleAccess, mcpSuccess, mcpError, logMcpToolCall, buildPaginatedResult } from '@/lib/mcp/tool-helpers';

export function registerAttendanceTool(server: McpServer): void {
  server.tool(
    'myjkkn_query_attendance',
    'Query student attendance records for a specific date. Returns attendance entries with section, timetable, and period information. Defaults to today if no date specified. Students see only their own attendance. Faculty see their department. Admins see all.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe('Attendance date to query (YYYY-MM-DD, defaults to today)'),
      page: z.number().int().min(1).optional()
        .describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Results per page (default 20, max 100)'),
    },
    async (params, extra) => {
      const startTime = Date.now();
      const ctx = extra.authInfo?.extra as unknown as McpAuthContext | undefined;
      if (!ctx) return mcpError('Authentication required. Provide a valid jkkn_ API key as Bearer token.');

      const accessError = checkModuleAccess(ctx, 'attendance');
      if (accessError) return accessError;

      try {
        const { page, limit, offset } = parsePagination(params);
        const date = params.date ?? new Date().toISOString().slice(0, 10);

        let query = ctx.supabase
          .from('student_attendance')
          .select('id, attendance_date, institution_id, section_id, timetable_id, period_slot_id, created_at, updated_at', { count: 'exact' });

        query = applyScopeFilters(query, ctx, {
          studentIdColumn: 'student_id',
          departmentIdColumn: 'section_id',
        });

        query = query.eq('attendance_date', date);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logMcpToolCall(ctx, 'myjkkn_query_attendance', 'attendance', 200, startTime);
        return mcpSuccess(buildPaginatedResult(data ?? [], count ?? 0, page, limit));
      } catch {
        logMcpToolCall(ctx, 'myjkkn_query_attendance', 'attendance', 500, startTime);
        return mcpError('Failed to fetch attendance records.');
      }
    }
  );
}
