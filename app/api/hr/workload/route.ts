export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { WorkloadService } from '@/lib/services/hr/recruitment-need/workload-service';
import type { WorkloadFilters } from '@/lib/services/hr/recruitment-need/workload-service';

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
    const filters: WorkloadFilters = {
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      academic_year: url.searchParams.get('academic_year') ?? undefined,
      semester: url.searchParams.get('semester') ? (Number(url.searchParams.get('semester')) as 1 | 2) : undefined,
      verified: url.searchParams.get('verified') === 'true' ? true : url.searchParams.get('verified') === 'false' ? false : undefined,
      staff_id: url.searchParams.get('staff_id') ?? undefined,
    };

    const data = await WorkloadService.list(supabase, filters);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.staff_id || !body.institution_id || !body.academic_year || !body.semester || body.weekly_contact_hours == null) {
      return NextResponse.json({ error: 'Missing required fields: staff_id, institution_id, academic_year, semester, weekly_contact_hours' }, { status: 400 });
    }

    const data = await WorkloadService.create(supabase, {
      staff_id: body.staff_id,
      institution_id: body.institution_id,
      academic_year: body.academic_year,
      semester: body.semester,
      weekly_contact_hours: body.weekly_contact_hours,
      weekly_admin_hours: body.weekly_admin_hours ?? null,
      weekly_research_hours: body.weekly_research_hours ?? null,
      source: body.source ?? 'manual',
      notes: body.notes ?? null,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
