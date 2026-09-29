export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, after, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import { recomputeForShortTimeOff } from '@/lib/hr/attendance/recompute-day';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { HrDecisionEmailService } from '@/lib/services/hr/decision-email-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordFeatureUse, FEATURE_KEYS } from '@/lib/usage/record';
import { errorMessage } from '@/lib/utils/supabase-error';

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

    const body = await request.json();
    if (!body.rejection_reason) {
      return NextResponse.json({ error: 'rejection_reason is required' }, { status: 400 });
    }
    const updated = await LeaveService.rejectApplication(supabase, id, user.id, body.rejection_reason);

    // A permission's approval state changes which halves it excuses, so the day
    // is re-judged through the same evaluator the importer uses. Awaited, not
    // fire-and-forget: the client refetches attendance right after this returns,
    // and a background write would land after that read.
    await recomputeForShortTimeOff(updated);


    // after(), not a floating promise: the platform may freeze the function the
    // moment the response is sent, and after() is kept alive until it finishes.
    after(async () => {
      try {
        const serviceSupabase = createServiceRoleClient();

        const { data: leaveType } = await serviceSupabase
          .from('hr_leave_types')
          .select('leave_type_name')
          .eq('id', updated.leave_type_id)
          .maybeSingle();
        const leaveTypeName: string =
          (leaveType as { leave_type_name?: string } | null)?.leave_type_name ?? 'Leave';

        await StaffNotificationService.notifyLeaveRejected(
          serviceSupabase,
          id,
          updated.applied_by,
          leaveTypeName,
          `${updated.start_date} → ${updated.end_date}`,
          body.rejection_reason
        );
      } catch (notifyErr) {
        console.warn('[hr/leave/reject] leave_rejected notification failed:', notifyErr);
      }
    });

    // The rejection queued the applicant's email (hr_decision_emails, by
    // trigger). Send it now rather than at the next 5-minute cron.
    after(() => HrDecisionEmailService.flush({ leaveApplicationId: id }));

    // Adoption loop: an approver decided this application.
    await recordFeatureUse(supabase, FEATURE_KEYS.HR_LEAVE_DECIDE);

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/leave/applications/:id/reject] error', err);
    // LeaveService throws the PostgREST error as-is (`if (error) throw error`),
    // which is a PLAIN OBJECT, not an Error — so `instanceof Error` dropped the
    // database's own refusal sentence (a trigger's RAISE, a policy refusal) and
    // the approver read "Unknown error". errorMessage reads `.message` from both.
    return NextResponse.json({ error: errorMessage(err, 'Unknown error') }, { status: 400 });
  }
}
