export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';

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
    const data = await LeaveService.listEncashments(supabase, {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      employee_id: url.searchParams.get('employee_id') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[hr/leave/encashment] GET error', err);
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
    const required = ['hr_organization_id', 'employee_id', 'academic_year_id', 'leave_type_id', 'days_encashed', 'per_diem_rate'];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null) {
        return NextResponse.json({ error: `${f} is required` }, { status: 400 });
      }
    }

    const created = await LeaveService.requestEncashment(supabase, {
      hr_organization_id: body.hr_organization_id,
      employee_id: body.employee_id,
      academic_year_id: body.academic_year_id,
      leave_type_id: body.leave_type_id,
      days_encashed: Number(body.days_encashed),
      per_diem_rate: Number(body.per_diem_rate),
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/leave/encashment] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
