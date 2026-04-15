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
    const employee_id = url.searchParams.get('employee_id');
    const academic_year_id = url.searchParams.get('academic_year_id');
    if (!employee_id || !academic_year_id) {
      return NextResponse.json(
        { error: 'employee_id and academic_year_id required' },
        { status: 400 }
      );
    }

    const balances = await LeaveService.getBalance(supabase, employee_id, academic_year_id);
    return NextResponse.json({ data: balances });
  } catch (err) {
    console.error('[hr/leave/balance] error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
