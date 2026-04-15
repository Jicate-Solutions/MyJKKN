export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import type { LeaveApplicationStatus } from '@/types/hr';

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
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const statuses = url.searchParams.getAll('status') as LeaveApplicationStatus[];
    const result = await LeaveService.listApplications(supabase, {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      employee_id: url.searchParams.get('employee_id') ?? undefined,
      status: statuses.length > 0 ? statuses : undefined,
      start_from: url.searchParams.get('start_from') ?? undefined,
      start_to: url.searchParams.get('start_to') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/leave/applications] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // Decision 8: applied_by is always the logged-in user. If employee_id differs, user must be HR officer.
    const applied_by = user.id;

    const created = await LeaveService.applyLeave(supabase, {
      ...body,
      applied_by,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/leave/applications] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
