export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
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

    // Dispatch leave_submitted notification to approver(s) — fire-and-forget
    // Uses service-role client to bypass RLS for cross-user lookups
    void (async () => {
      try {
        const serviceSupabase = createServiceRoleClient();

        // Resolve approver user IDs from the first pending chain step
        const chain: Array<{
          approver_user_id?: string | null;
          approver_role?: string;
          status: string;
        }> = Array.isArray(created.approval_chain) ? created.approval_chain : [];

        const firstStep = chain[created.current_step ?? 0];
        let approverUserIds: string[] = [];

        if (firstStep?.approver_user_id) {
          approverUserIds = [firstStep.approver_user_id];
        } else if (firstStep?.approver_role) {
          const { data: profiles } = await serviceSupabase
            .from('profiles')
            .select('id')
            .eq('role', firstStep.approver_role)
            .eq('is_active', true);
          approverUserIds = (profiles ?? []).map((p: { id: string }) => p.id);
        }

        if (approverUserIds.length === 0) return;

        // Resolve staff name
        const { data: staffRow } = await serviceSupabase
          .from('staff')
          .select('first_name, last_name')
          .eq('id', created.employee_id)
          .maybeSingle();
        const staffName = staffRow
          ? `${staffRow.first_name}${staffRow.last_name ? ' ' + staffRow.last_name : ''}`
          : 'A staff member';

        // Resolve leave type name
        const { data: leaveType } = await serviceSupabase
          .from('leave_types')
          .select('leave_type_name')
          .eq('id', created.leave_type_id)
          .maybeSingle();
        const leaveTypeName: string =
          (leaveType as { leave_type_name?: string } | null)?.leave_type_name ?? 'Leave';

        await StaffNotificationService.notifyLeaveSubmitted(
          serviceSupabase,
          created.id,
          approverUserIds,
          staffName,
          leaveTypeName,
          `${created.start_date} → ${created.end_date}`
        );
      } catch (notifyErr) {
        // Notification errors must never break the leave submission flow
        console.warn('[hr/leave/applications] leave_submitted notification failed:', notifyErr);
      }
    })();

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/leave/applications] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
