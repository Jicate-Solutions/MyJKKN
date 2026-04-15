export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { HRPersonService } from '@/lib/services/hr/employee-service';
import { CreateEmployeeSchema } from '@/features/hr/employees/types';
import type { HRPersonFilters, HREmploymentType } from '@/types/hr';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const filters: HRPersonFilters = {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      employment_type: (url.searchParams.get('employment_type') as HREmploymentType) ?? undefined,
      cadre_id: url.searchParams.get('cadre_id') ?? undefined,
      designation_id: url.searchParams.get('designation_id') ?? undefined,
      department_id: url.searchParams.get('department_id') ?? undefined,
      is_active:
        url.searchParams.get('is_active') === 'false' ? false :
        url.searchParams.get('is_active') === 'true' ? true : undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 25,
      include_staff: url.searchParams.get('include_staff') === 'false' ? false : undefined,
    };

    const result = await HRPersonService.list(supabase, filters);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/employees] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = CreateEmployeeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // NonStaffEmploymentTypeEnum in the Zod schema already rejects 'full_time'.
    // Full-time employees are managed via the Staff module + hr_staff_details auto-sync.
    const employee = await HRPersonService.createNonStaffEmployee(supabase, {
      ...validation.data,
      created_by: user.id,
    } as Parameters<typeof HRPersonService.createNonStaffEmployee>[1]);

    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (err) {
    console.error('[hr/employees] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
