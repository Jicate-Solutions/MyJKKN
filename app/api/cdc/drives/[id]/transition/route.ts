export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { logActivity } from '@/lib/services/cdc/drive-day';
import { dispatchDueCycles, ensureInitialCycle } from '@/lib/services/cdc/willingness-cycles';
import type { DriveNotifyResult } from '@/lib/services/cdc/drive-notifications';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CdcDriveNotifySummary, CdcDriveStatus } from '@/types/cdc';
import { canCoordinatorRollback, isRollback } from '@/types/cdc';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.to_status) {
      return NextResponse.json({ error: 'to_status is required' }, { status: 400 });
    }
    const toStatus = body.to_status as CdcDriveStatus;

    // Opening willingness fans a notification out to the whole audience and
    // cancelling is irreversible — RLS (is_cdc_staff) is role-based, so the
    // permission the UI uses must be enforced here too.
    // One exception (2026-09-22): an assigned coordinator may move the drive
    // back a stage within the drive-day stages they work in. Their session
    // cannot write cdc_drives (RLS), so that one move runs on the service role
    // after the check here.
    const service = createServiceRoleClient();
    const [{ data: canEdit }, { data: current }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
      service.from('cdc_drives').select('status').eq('id', id).maybeSingle(),
    ]);
    const fromStatus = (current?.status as CdcDriveStatus | undefined) ?? null;
    if (!fromStatus) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    const rollback = isRollback(fromStatus, toStatus);

    let writer = supabase;
    let coordinatorRollback = false;
    if (canEdit !== true) {
      const { data: coord } = await service
        .from('cdc_drive_coordinators')
        .select('id')
        .eq('drive_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!coord || !canCoordinatorRollback(fromStatus, toStatus)) {
        return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
      }
      writer = service;
      coordinatorRollback = true;
    }

    const updated = await CdcDriveService.transitionDrive(
      writer,
      id,
      {
        to_status: toStatus,
        reason: body.reason ?? null,
        metadata: body.metadata ?? null,
      },
      user.id
    );

    if (rollback) {
      await logActivity(service, [
        {
          drive_id: id,
          actor_id: user.id,
          actor_role: coordinatorRollback ? 'coordinator' : 'cdc',
          action: 'drive.moved_back',
          previous_value: { status: fromStatus },
          new_value: { status: updated.status },
          reason: typeof body.reason === 'string' ? body.reason : null,
        },
      ]);
    }

    // Willingness opened → start cycle 1 (window = the drive's open/close
    // columns, open_at defaults to now). If the cycle is already due it is
    // notified right here through the shared implementation (bell + web push);
    // a future-dated open is sent by /api/cron/cdc-willingness-cycles. One
    // send per cycle. Failures are reported, not fatal: the state change has
    // already been committed.
    // A step back from Participants Finalized re-opens the same cycle without
    // touching learners (and a later move forward reuses that cycle, whose
    // notification was already sent once).
    let notify: CdcDriveNotifySummary | undefined;
    let notify_error: string | undefined;
    if (updated.status === 'willingness_open' && !rollback) {
      try {
        await ensureInitialCycle(service, updated, user.id);
        const dispatched = await dispatchDueCycles(service, { driveId: id });
        const first = dispatched[0];
        if (first?.error) throw new Error(first.error);
        const result = first?.notify ?? {
          targeted_learners: 0,
          unlinked_learners: 0,
          already_notified: 0,
          notified: 0,
          skipped: 'scheduled' as const,
        } as unknown as DriveNotifyResult;
        notify = {
          targeted_learners: result.targeted_learners,
          unlinked_learners: result.unlinked_learners,
          already_notified: result.already_notified,
          notified: result.notified,
          skipped: result.skipped,
          push: result.push
            ? {
                sent: result.push.sent,
                failed: result.push.failed,
                total_subscriptions: result.push.total_subscriptions,
              }
            : undefined,
        };
      } catch (err) {
        console.error('[cdc/drives/[id]/transition] willingness notification failed', err);
        notify_error = err instanceof Error ? err.message : 'Notification failed';
      }
    }

    return NextResponse.json({ data: updated, notify, notify_error });
  } catch (err) {
    console.error('[cdc/drives/[id]/transition] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
