export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { HRPersonService } from '@/lib/services/hr/employee-service';
import { DeactivateEmployeeSchema } from '@/features/hr/employees/types';

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

async function requireAuth() {
  const supabase = await getClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { supabase, user, response: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { supabase, response } = await requireAuth();
    if (response) return response;

    // Source hint: ?source=staff for JKKN full-time, ?source=hr_employees (default) for others
    const url = new URL(request.url);
    const source = url.searchParams.get('source') ?? 'hr_employees';

    if (source === 'staff') {
      const details = await HRPersonService.getStaffDetails(supabase!, id);
      if (!details) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ data: details });
    }

    const employee = await HRPersonService.getNonStaffEmployee(supabase!, id);
    if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: employee });
  } catch (err) {
    console.error('[hr/employees/:id] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { supabase, response } = await requireAuth();
    if (response) return response;

    const body = await request.json().catch(() => ({ reason: 'Deactivated via UI' }));
    const validation = DeactivateEmployeeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const deactivated = await HRPersonService.deactivateNonStaff(supabase!, id, validation.data.reason);
    return NextResponse.json({ data: deactivated });
  } catch (err) {
    console.error('[hr/employees/:id] DELETE error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
