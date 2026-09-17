export const dynamic = 'force-dynamic';

/**
 * Take an APPROVED leave / short-time-off decision back (2026-09-12).
 *
 * Modelled on the sibling reject/route.ts, with one difference that is the whole
 * point of the route existing: the attendance reversal is AWAITED and its
 * problems are RETURNED. Approving stamped LEAVE over every covered day; nothing
 * in the database puts that back, because the day evaluator is TypeScript. If
 * that reversal is allowed to fail quietly the request reads 'rejected' while the
 * monthly report and payroll still count the day as leave — the same silent
 * half-apply that regularizations shipped with for weeks.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, after, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import {
  recomputeForRevokedLeave,
  recomputeForShortTimeOff,
} from '@/lib/hr/attendance/recompute-day';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { HrDecisionEmailService } from '@/lib/services/hr/decision-email-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { error: 'A reason is required to revoke an approved request.' },
        { status: 400 }
      );
    }

    // Authority, the month-close deadline and the consumed-credit rule are all
    // enforced inside this call and again by trg_hla_revoke_gate.
    const updated = await LeaveService.revokeApplication(supabase, id, user.id, reason);

    // THE ATTENDANCE DAY. Awaited, never fire-and-forget: the client refetches
    // attendance the moment this returns, and a background write would land after
    // that read. A permission is minute-scoped and goes through its own path.
    let warning: string | undefined;
    try {
      await recomputeForShortTimeOff(updated);
      const reversal = await recomputeForRevokedLeave(updated);
      if (reversal.problems.length > 0) {
        warning =
          `The request was revoked, but the attendance record could not be re-judged for ` +
          `${reversal.problems.length} of ${reversal.days} day(s): ` +
          `${reversal.problems.slice(0, 3).join(' · ')}. ` +
          `Those days may still read LEAVE — correct them from HR > Attendance.`;
      }
    } catch (recomputeErr) {
      warning =
        'The request was revoked, but the attendance record could not be re-judged: ' +
        `${recomputeErr instanceof Error ? recomputeErr.message : 'unknown error'}. ` +
        'The covered days may still read LEAVE — correct them from HR > Attendance.';
    }

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

        const { data: revokerProfile } = await serviceSupabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        await StaffNotificationService.notifyLeaveRevoked(
          serviceSupabase,
          id,
          updated.applied_by,
          leaveTypeName,
          `${updated.start_date} → ${updated.end_date}`,
          reason,
          (revokerProfile as { full_name?: string } | null)?.full_name
        );
      } catch (notifyErr) {
        console.warn('[hr/leave/revoke] leave_revoked notification failed:', notifyErr);
      }
    });

    // The revocation queued the applicant's email (hr_decision_emails, decision
    // 'revoked', by trigger). Send it now rather than at the next 5-minute cron.
    after(() => HrDecisionEmailService.flush({ leaveApplicationId: id }));

    return NextResponse.json({ data: updated, warning });
  } catch (err) {
    console.error('[hr/leave/applications/:id/revoke] error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
