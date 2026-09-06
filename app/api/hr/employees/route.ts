export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import { HRPersonService } from '@/lib/services/hr/employee-service';
import type { HRPersonFilters } from '@/types/hr';

export const GET = withAuth(
  async (request: NextRequest, auth: AuthContext) => {
    const url = new URL(request.url);
    const exportAll = url.searchParams.get('export') === '1';

    // Export additionally requires hr.employees.export (view alone isn't enough).
    if (exportAll) {
      const [{ data: isSA }, { data: isAdmin }, { data: canExport }] = await Promise.all([
        auth.supabase.rpc('is_super_admin'),
        auth.supabase.rpc('is_admin'),
        auth.supabase.rpc('user_has_permission', { permission_name: 'hr.employees.export' }),
      ]);
      if (!isSA && !isAdmin && !canExport) {
        return NextResponse.json(
          { error: 'Insufficient permission. Required: hr.employees.export' },
          { status: 403 }
        );
      }
    }

    const filters: HRPersonFilters = {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      cadre_id: url.searchParams.get('cadre_id') ?? undefined,
      designation_id: url.searchParams.get('designation_id') ?? undefined,
      department_id: url.searchParams.get('department_id') ?? undefined,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      is_active:
        url.searchParams.get('is_active') === 'false' ? false :
        url.searchParams.get('is_active') === 'true' ? true : undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 25,
      exportAll,
    };

    const result = await HRPersonService.list(auth.supabase, filters);
    return NextResponse.json(result);
  },
  { allowApiKey: false, requiredPermission: 'read', requirePermission: 'hr.employees.view' }
);

// POST removed — hr_employees table no longer exists. Employee creation goes
// through the staff module.
