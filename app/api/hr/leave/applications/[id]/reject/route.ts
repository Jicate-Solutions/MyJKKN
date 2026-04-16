export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
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

    const body = await request.json();
    if (!body.rejection_reason) {
      return NextResponse.json({ error: 'rejection_reason is required' }, { status: 400 });
    }
    const updated = await LeaveService.rejectApplication(supabase, id, user.id, body.rejection_reason);

    // Dispatch leave_rejected notification to the requester — fire-and-forget
    void (async () => {
      try {
        const serviceSupabase = createServiceRoleClient();

        const { data: leaveType } = await serviceSupabase
          .from('leave_types')
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
    })();

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/leave/applications/:id/reject] error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
