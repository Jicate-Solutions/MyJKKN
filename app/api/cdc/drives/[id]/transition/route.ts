export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { dispatchDueCycles, ensureInitialCycle } from '@/lib/services/cdc/willingness-cycles';
import type { DriveNotifyResult } from '@/lib/services/cdc/drive-notifications';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CdcDriveNotifySummary, CdcDriveStatus } from '@/types/cdc';

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

    // Opening willingness fans a notification out to the whole audience and
    // cancelling is irreversible — RLS (is_cdc_staff) is role-based, so the
    // permission the UI uses must be enforced here too.
    const { data: canEdit } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' });
    if (canEdit !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.to_status) {
      return NextResponse.json({ error: 'to_status is required' }, { status: 400 });
    }

    const updated = await CdcDriveService.transitionDrive(
      supabase,
      id,
      {
        to_status: body.to_status as CdcDriveStatus,
        reason: body.reason ?? null,
        metadata: body.metadata ?? null,
      },
      user.id
    );

    // Willingness opened → start cycle 1 (window = the drive's open/close
    // columns, open_at defaults to now). If the cycle is already due it is
    // notified right here through the shared implementation (bell + web push);
    // a future-dated open is sent by /api/cron/cdc-willingness-cycles. One
    // send per cycle. Failures are reported, not fatal: the state change has
    // already been committed.
    let notify: CdcDriveNotifySummary | undefined;
    let notify_error: string | undefined;
    if (updated.status === 'willingness_open') {
      try {
        const service = createServiceRoleClient();
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
