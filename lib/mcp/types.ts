// lib/mcp/types.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiModule } from '@/lib/api-keys/authenticate';

/**
 * User roles that determine data scoping in MCP tool queries.
 *
 * - student: sees only their own records (filtered by user_id -> student profile id)
 * - faculty: sees their department's records (filtered by department_id)
 * - admin: sees all records within their institution
 * - super_admin: sees all records across all institutions (platform-level)
 */
export type McpUserRole = 'student' | 'faculty' | 'admin' | 'super_admin';

/**
 * Authentication context passed to every MCP tool via `extra.authInfo.extra`.
 * Created by the auth bridge from a validated `jkkn_xxxx` API key.
 */
export interface McpAuthContext {
  keyId: string;
  keyName: string;
  userId: string | null;
  userRole: McpUserRole;
  institutionId: string;
  departmentId: string | null;
  permissions: {
    read: ApiModule[] | true;
    write: ApiModule[] | true;
  };
  supabase: SupabaseClient;
}

/**
 * Configuration for the scoping middleware.
 * Each tool specifies which columns to use for role-based filtering
 * because different tables use different column names.
 */
export interface ScopeConfig {
  /** Column that stores the student/user reference (e.g., 'student_id', 'requester_id', 'owner_id') */
  studentIdColumn?: string;
  /** Column that stores the department reference (e.g., 'department_id') */
  departmentIdColumn?: string;
  /** Column that stores the institution reference. Defaults to 'institution_id'. */
  institutionIdColumn?: string;
}

/**
 * Standard pagination params accepted by all module tools.
 */
export interface McpPaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Standard paginated response shape returned by module tools.
 */
export interface McpPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
