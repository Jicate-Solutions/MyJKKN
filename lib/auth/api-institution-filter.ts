import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';
import { UserInstitutionAccessService } from '@/lib/services/users/user-institution-access-service';

export interface ApiInstitutionFilterOptions {
  bypassForSuperAdmin?: boolean; // Default: true
  requireInstitutionAccess?: boolean; // Default: true (user must have access to at least one institution)
  allowSpecificInstitution?: string; // If provided, only allow access to this specific institution
}

export interface ApiInstitutionFilterResult {
  isAllowed: boolean;
  institutionIds: string[];
  reason?: string;
  userRole?: string;
  isSuperAdmin: boolean;
}

/**
 * Helper function to create institution filters for API routes based on user permissions
 */
export async function createApiInstitutionFilter(
  request: NextRequest,
  options: ApiInstitutionFilterOptions = {}
): Promise<ApiInstitutionFilterResult> {
  const {
    bypassForSuperAdmin = true,
    requireInstitutionAccess = true,
    allowSpecificInstitution
  } = options;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        isAllowed: false,
        institutionIds: [],
        reason: 'User not authenticated',
        isSuperAdmin: false
      };
    }

    // Get user profile with role information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return {
        isAllowed: false,
        institutionIds: [],
        reason: 'User profile not found',
        isSuperAdmin: false
      };
    }

    const isSuperAdmin = profile.role === 'super_admin';

    // Super admin bypass
    if (bypassForSuperAdmin && isSuperAdmin) {
      return {
        isAllowed: true,
        institutionIds: [], // Empty means access to all
        reason: 'Super admin bypass',
        userRole: profile.role,
        isSuperAdmin: true
      };
    }

    // Get user's accessible institutions
    const accessibleInstitutionIds =
      await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
        user.id
      );

    // Check if user has access to at least one institution
    if (requireInstitutionAccess && accessibleInstitutionIds.length === 0) {
      return {
        isAllowed: false,
        institutionIds: [],
        reason: 'User has no institution access',
        userRole: profile.role,
        isSuperAdmin
      };
    }

    // Check specific institution access if required
    if (allowSpecificInstitution) {
      if (!accessibleInstitutionIds.includes(allowSpecificInstitution)) {
        return {
          isAllowed: false,
          institutionIds: [],
          reason: `User does not have access to institution: ${allowSpecificInstitution}`,
          userRole: profile.role,
          isSuperAdmin
        };
      }

      return {
        isAllowed: true,
        institutionIds: [allowSpecificInstitution],
        reason: 'Specific institution access granted',
        userRole: profile.role,
        isSuperAdmin
      };
    }

    return {
      isAllowed: true,
      institutionIds: accessibleInstitutionIds,
      reason: 'Institution access granted',
      userRole: profile.role,
      isSuperAdmin
    };
  } catch (error) {
    console.error('Error in createApiInstitutionFilter:', error);
    return {
      isAllowed: false,
      institutionIds: [],
      reason: `Filter error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      isSuperAdmin: false
    };
  }
}

/**
 * Apply institution filter to a Supabase query
 */
export function applyInstitutionFilterToQuery<T>(
  query: any,
  filterResult: ApiInstitutionFilterResult,
  institutionColumnName: string = 'institution_id'
): any {
  // If super admin or no filtering needed, return query as-is
  if (filterResult.isSuperAdmin || filterResult.institutionIds.length === 0) {
    return query;
  }

  // Apply institution filter
  if (filterResult.institutionIds.length === 1) {
    return query.eq(institutionColumnName, filterResult.institutionIds[0]);
  } else if (filterResult.institutionIds.length > 1) {
    return query.in(institutionColumnName, filterResult.institutionIds);
  }

  // If no accessible institutions, return query that returns no results
  return query.eq(institutionColumnName, 'no-access');
}

/**
 * Get SQL WHERE clause for institution filtering
 */
export function getInstitutionFilterClause(
  filterResult: ApiInstitutionFilterResult,
  institutionColumnName: string = 'institution_id'
): string {
  // If super admin or no filtering needed, return permissive clause
  if (filterResult.isSuperAdmin || filterResult.institutionIds.length === 0) {
    return '1=1';
  }

  // If no accessible institutions, return restrictive clause
  if (filterResult.institutionIds.length === 0) {
    return '1=0';
  }

  // Create IN clause for accessible institutions
  const quotedIds = filterResult.institutionIds
    .map((id) => `'${id}'`)
    .join(',');
  return `${institutionColumnName} IN (${quotedIds})`;
}
