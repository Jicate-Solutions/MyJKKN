/**
 * POST /api/hr/leave/eligibility — file an eligibility request for a gated
 * leave type. Created: 2026-09-21.
 *
 * A SERVER ROUTE, NOT A DIRECT SERVICE CALL FROM THE HOOK, for one reason: the
 * approvers on the frozen step must be told, and resolving "who holds this
 * role at this institution" needs the service-role client — user_roles and
 * custom_roles are not readable by the member of staff filing the request.
 * The insert itself still runs under the caller's session, so RLS (own staff
 * id, status pending, not granted_directly) is what admits it.
 *
 * Mirrors app/api/hr/leave/applications/route.ts: the notification runs in
 * after(), its failure is logged and never fails the request.
 */

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, after, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import {
  LeaveEligibilityService,
  type RequestEligibilityInput,
} from '@/lib/services/hr/leave-eligibility-service';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';

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

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Partial<
      Omit<RequestEligibilityInput, 'createdBy'>
    >;
    if (!body.employeeId || !body.leaveTypeId || !body.hrOrgId) {
      return NextResponse.json(
        { error: 'employeeId, leaveTypeId and hrOrgId are required' },
        { status: 400 }
      );
    }

    const created = await LeaveEligibilityService.request(supabase, {
      employeeId: body.employeeId,
      leaveTypeId: body.leaveTypeId,
      hrOrgId: body.hrOrgId,
      departmentId: body.departmentId ?? null,
      documents: Array.isArray(body.documents) ? body.documents : [],
      reason: body.reason ?? null,
      // From the session, never the body: it is who the decision goes back to.
      createdBy: user.id,
    });

    after(async () => {
      try {
        const serviceSupabase = createServiceRoleClient();

        const { data: ids, error: rpcErr } = await serviceSupabase.rpc(
          'fn_hr_eligibility_step_approver_user_ids',
          { p_eligibility_id: created.id }
        );
        if (rpcErr) {
          console.error('[hr/leave/eligibility] approver resolution failed', rpcErr);
          return;
        }
        const approverUserIds = ((ids as string[] | null) ?? []).filter(Boolean);

        if (approverUserIds.length === 0) {
          // Loud, not silent: an unroutable step is a flow-config bug, and this
          // module has already shipped the silent-no-recipients failure twice.
          console.warn('[hr/leave/eligibility] no approver resolved', {
            eligibility: created.id,
            step: created.approval_chain[created.current_step] ?? null,
          });
          return;
        }

        const [{ data: staffRow }, { data: typeRow }] = await Promise.all([
          serviceSupabase
            .from('staff')
            .select('first_name, last_name')
            .eq('id', created.employee_id)
            .maybeSingle(),
          serviceSupabase
            .from('hr_leave_types')
            .select('leave_type_name')
            .eq('id', created.leave_type_id)
            .maybeSingle(),
        ]);
        const staffName = staffRow
          ? `${staffRow.first_name}${staffRow.last_name ? ' ' + staffRow.last_name : ''}`
          : 'A staff member';
        const leaveTypeName =
          (typeRow as { leave_type_name?: string } | null)?.leave_type_name ?? 'a leave type';

        await StaffNotificationService.notifyEligibilitySubmitted(
          serviceSupabase,
          created.id,
          approverUserIds,
          staffName,
          leaveTypeName
        );
      } catch (notifyErr) {
        console.warn('[hr/leave/eligibility] eligibility_submitted notification failed:', notifyErr);
      }
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    // The service throws real Error instances with the friendly text (duplicate
    // request, missing document, unroutable flow); pass that through verbatim.
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 400 });
  }
}
