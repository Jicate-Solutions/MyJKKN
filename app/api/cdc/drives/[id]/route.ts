export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { notifyDriveWillingnessOpen, type DriveNotifyResult } from '@/lib/services/cdc/drive-notifications';
import { currentCycle } from '@/lib/services/cdc/willingness-cycles';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CdcDriveNotifySummary, CdcDriveUpdate } from '@/types/cdc';

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

export async function GET(
  _request: NextRequest,
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

    // Full detail (history, recruiter, counts, notification summary) is team-member
    // data. Learners read their own view through ../willingness; assigned
    // coordinators through ../attendance.
    const [{ data: canView }, { data: canTrack }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.view' }),
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.willingness.view' }),
    ]);
    if (canView !== true && canTrack !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });
    }

    const detail = await CdcDriveService.getDriveDetail(supabase, id);
    if (!detail) {
      return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error('[cdc/drives/[id]] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cdc/drives/[id] — edit a drive.
 *
 * Content edits never re-notify. When the audience (institutions / semesters)
 * changes on a drive that is already open for willingness, ONLY the newly
 * eligible learners are notified — cdc_drive_notification_log holds who was
 * already reached, so nobody gets the drive twice.
 *
 * Gate: cdc.drives.edit; RLS on cdc_drives (is_cdc_staff) still applies.
 */
export async function PATCH(
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

    const { data: canEdit } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.drives.edit',
    });
    if (canEdit !== true) {
      return NextResponse.json(
        { error: 'Forbidden — cdc.drives.edit required' },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as CdcDriveUpdate | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const { drive, targeting_changed } = await CdcDriveService.updateDrive(supabase, id, body, user.id);

    let notify: CdcDriveNotifySummary | undefined;
    let notify_error: string | undefined;
    if (targeting_changed && drive.status === 'willingness_open') {
      try {
        const service = createServiceRoleClient();
        // Delta send belongs to the current cycle; a cycle whose open time has
        // not arrived is left to the cron so nobody is notified early.
        const cycle = await currentCycle(service, id);
        const cycleDue = !cycle || (cycle.notification_sent && new Date(cycle.open_at).getTime() <= Date.now());
        const result = cycleDue
          ? await notifyDriveWillingnessOpen(service, drive, user.id, cycle?.cycle_no ?? 1)
          : { targeted_learners: 0, unlinked_learners: 0, already_notified: 0, notified: 0, skipped: 'scheduled' as const } as unknown as DriveNotifyResult;
        notify = {
          targeted_learners: result.targeted_learners,
          unlinked_learners: result.unlinked_learners,
          already_notified: result.already_notified,
          notified: result.notified,
          skipped: result.skipped,
          push: result.push
            ? { sent: result.push.sent, failed: result.push.failed, total_subscriptions: result.push.total_subscriptions }
            : undefined,
        };
      } catch (err) {
        console.error('[cdc/drives/[id]] PATCH delta notification failed', err);
        notify_error = err instanceof Error ? err.message : 'Notification failed';
      }
    }

    return NextResponse.json({ data: drive, targeting_changed, notify, notify_error });
  } catch (err) {
    console.error('[cdc/drives/[id]] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
