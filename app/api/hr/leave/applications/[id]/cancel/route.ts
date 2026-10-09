export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import {
  recomputeForRevokedLeave,
  recomputeForShortTimeOff,
} from '@/lib/hr/attendance/recompute-day';

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const updated = await LeaveService.cancelApplication(supabase, id, user.id);

    // THE ATTENDANCE DAY. Approving stamped LEAVE over every covered day and no
    // trigger puts it back (the stamp fires only on the transition INTO approved),
    // so a cancelled leave would keep reading LEAVE in the monthly report and in
    // payroll. A permission's approval state also changes which halves it excuses.
    // Both go through the same evaluator the importer uses, awaited (the client
    // refetches attendance the moment this returns) and RETURNED as a warning,
    // never swallowed: the cancellation itself has already stuck.
    let warning: string | undefined;
    try {
      await recomputeForShortTimeOff(updated);
      const reversal = await recomputeForRevokedLeave(updated);
      if (reversal.problems.length > 0) {
        warning =
          `The leave was cancelled, but the attendance record could not be re-judged for ` +
          `${reversal.problems.length} of ${reversal.days} day(s): ` +
          `${reversal.problems.slice(0, 3).join(' · ')}. ` +
          `Those days may still read LEAVE — correct them from HR > Attendance.`;
      }
    } catch (recomputeErr) {
      warning =
        'The leave was cancelled, but the attendance record could not be re-judged: ' +
        `${recomputeErr instanceof Error ? recomputeErr.message : 'unknown error'}. ` +
        'The covered days may still read LEAVE — correct them from HR > Attendance.';
    }

    return NextResponse.json({ data: updated, warning });
  } catch (err) {
    console.error('[hr/leave/applications/:id/cancel] error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
