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
    const hr_academic_year_id = url.searchParams.get('hr_academic_year_id');
    if (!employee_id || !hr_academic_year_id) {
      return NextResponse.json(
        { error: 'employee_id and hr_academic_year_id required' },
        { status: 400 }
      );
    }

    // Reading someone else's entitlements requires hr.leave.approve. Without
    // this, employee_id is attacker-controlled and the only check is "is
    // anyone logged in" — an IDOR: change one query param, read a colleague's
    // leave balance. (RLS hlb_select now also enforces this, but the route
    // must not depend on the database to catch its own missing authorisation.)
    //
    // Identity comes from fn_my_staff_ids(), NOT from querying `staff`
    // directly. That query ran under the caller's own RLS, and
    // staff_select_scope_aware is `user_has_permission('staff.view') AND
    // <scope>` with no "always see your own row" arm — so a librarian or lab
    // assistant, whose role sets staff.view = false, read back zero rows,
    // failed this check against their OWN employee_id, and was told "No leave
    // balance is configured for you this academic year". Eight active staff
    // were locked out of applying for leave by a permission that has nothing
    // to do with leave. fn_my_staff_ids() is SECURITY DEFINER precisely so
    // self-identification does not depend on staff-directory visibility; it is
    // what every RLS policy in this module already uses, so the route and the
    // database now agree on who the caller is.
    const { data: myStaffIds, error: identityError } = await supabase.rpc('fn_my_staff_ids');
    if (identityError) {
      // A failed identity resolution is a server fault, not an authorisation
      // decision — 500 rather than a 403 that would look like a policy denial.
      console.error('[hr/leave/balance] fn_my_staff_ids failed', identityError);
      return NextResponse.json(
        { error: 'Could not resolve your team member record' },
        { status: 500 }
      );
    }
    const isSelf = ((myStaffIds ?? []) as string[]).includes(employee_id);

    if (!isSelf) {
      const { data: canApprove } = await supabase.rpc('user_has_permission', {
        permission_name: 'hr.leave.approve',
      });
      if (!canApprove) {
        return NextResponse.json(
          { error: 'Insufficient permission to read another employee\'s balance' },
          { status: 403 }
        );
      }
    }

    const balances = await LeaveService.getBalance(supabase, employee_id, hr_academic_year_id);
    return NextResponse.json({ data: balances });
  } catch (err) {
    console.error('[hr/leave/balance] error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
