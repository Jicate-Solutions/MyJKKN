/**
 * POST /api/hr/leave/eligibility/[id]/decide — approve or reject one step of
 * an eligibility request. Created: 2026-09-21.
 *
 * The decision runs under the caller's session: the hr_leave_eligibilities
 * UPDATE policy admits only the person the current step names
 * (fn_is_designated_eligibility_approver), so this route adds no gate of its
 * own — a route-level check would be a second copy of the same rule.
 *
 * The requester is told only when the row REACHES a terminal state. A cleared
 * review step leaves it pending and forwards it, which is not news to them —
 * the same rule the leave approve route applies.
 */

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, after, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveEligibilityService } from '@/lib/services/hr/leave-eligibility-service';
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      approve?: boolean;
      note?: string | null;
    };
    if (typeof body.approve !== 'boolean') {
      return NextResponse.json({ error: 'approve (boolean) is required' }, { status: 400 });
    }

    const saved = await LeaveEligibilityService.decide(supabase, {
      eligibilityId: id,
      approve: body.approve,
      note: body.note?.trim() || null,
      deciderProfileId: user.id,
    });

    if (saved.status === 'approved' || saved.status === 'rejected') {
      const approved = saved.status === 'approved';
      after(async () => {
        try {
          const serviceSupabase = createServiceRoleClient();

          // created_by is set by the request route; a row HR granted directly
          // has none and is never decided here, but the staff link is the
          // safer answer than silently notifying nobody.
          let applicantUserId: string | null = saved.created_by;
          if (!applicantUserId) {
            const { data: staffRow } = await serviceSupabase
              .from('staff')
              .select('profile_id')
              .eq('id', saved.employee_id)
              .maybeSingle();
            applicantUserId = (staffRow as { profile_id?: string | null } | null)?.profile_id ?? null;
          }
          if (!applicantUserId) {
            console.warn('[hr/leave/eligibility/decide] no applicant user to notify', { id });
            return;
          }

          const { data: typeRow } = await serviceSupabase
            .from('hr_leave_types')
            .select('leave_type_name')
            .eq('id', saved.leave_type_id)
            .maybeSingle();
          const leaveTypeName =
            (typeRow as { leave_type_name?: string } | null)?.leave_type_name ?? 'a leave type';

          await StaffNotificationService.notifyEligibilityDecided(
            serviceSupabase,
            saved.id,
            applicantUserId,
            leaveTypeName,
            approved,
            saved.decision_note
          );
        } catch (notifyErr) {
          console.warn('[hr/leave/eligibility/decide] decision notification failed:', notifyErr);
        }
      });
    }

    return NextResponse.json({ data: saved });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 400 });
  }
}
