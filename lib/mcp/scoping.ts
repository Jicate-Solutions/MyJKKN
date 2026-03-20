// lib/mcp/scoping.ts
import type { McpAuthContext, ScopeConfig } from '@/lib/mcp/types';

/**
 * Applies institution + role-based scoping filters to a Supabase query.
 *
 * Security model:
 * - Layer 1 (MANDATORY): `.eq('institution_id', ctx.institutionId)` — always applied
 * - Layer 2 (role-based):
 *   - student: `.eq(studentIdColumn, ctx.userId)` — only their own records
 *   - faculty: `.eq(departmentIdColumn, ctx.departmentId)` — only their department
 *   - admin: no additional filter (sees full institution)
 *   - super_admin: no additional filter (should not exist for MCP keys)
 *
 * IMPORTANT: This function uses the service role client which bypasses RLS.
 * The institution scoping here IS the security boundary.
 *
 * @param query - A Supabase PostgREST query builder (from .from().select())
 * @param context - The authenticated MCP context from the auth bridge
 * @param config - Column name mappings for this specific table
 * @returns The same query with scoping filters applied
 */
export function applyScopeFilters<T>(
  query: T,
  context: McpAuthContext,
  config: ScopeConfig = {}
): T {
  const {
    institutionIdColumn = 'institution_id',
    studentIdColumn,
    departmentIdColumn,
  } = config;

  // Layer 1: ALWAYS scope to institution (mandatory — this is the security boundary)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).eq(institutionIdColumn, context.institutionId);

  // Layer 2: Role-based scoping
  switch (context.userRole) {
    case 'student':
      // Students see only their own records
      if (studentIdColumn && context.userId) {
        q = q.eq(studentIdColumn, context.userId);
      }
      break;

    case 'faculty':
      // Faculty see their department's records
      if (departmentIdColumn && context.departmentId) {
        q = q.eq(departmentIdColumn, context.departmentId);
      }
      break;

    case 'admin':
    case 'super_admin':
      // Admins see full institution — no additional filter
      break;
  }

  return q as T;
}

/**
 * Standard pagination helper. Clamps page/limit to safe values
 * and returns the offset for Supabase .range() calls.
 */
export function parsePagination(params: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; offset: number } {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
