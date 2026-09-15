export const dynamic = 'force-dynamic';

/**
 * GET /api/cdc/drives/[id]/notifications
 *   → { summary, rows[] }                 per-learner notification audit for the drive
 *   ?register_number=XYZ → { diagnosis }  why did THIS learner (not) get it
 *   ?status=sent|no_profile               optional row filter
 *
 * Staff only (cdc.drives.view). Reads run on the service-role client after
 * the gate so multi-college audiences are not narrowed by the caller's scope.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  CDC_WILLINGNESS_NOTIFICATION_TYPE,
  diagnoseLearnerNotification,
} from '@/lib/services/cdc/drive-notifications';
import type { CdcDriveNotificationLogRow, CdcDriveNotificationSummary } from '@/types/cdc';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.drives.view',
    });
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });
    }

    const drive = await CdcDriveService.getDrive(supabase, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const service = createServiceRoleClient();
    const registerNumber = request.nextUrl.searchParams.get('register_number');
    if (registerNumber) {
      const diagnosis = await diagnoseLearnerNotification(service, drive, registerNumber);
      return NextResponse.json({ diagnosis }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const statusFilter = request.nextUrl.searchParams.get('status');
    let q = service
      .from('cdc_drive_notification_log')
      .select('*')
      .eq('drive_id', id)
      .eq('notification_type', CDC_WILLINGNESS_NOTIFICATION_TYPE)
      .order('sent_at', { ascending: false })
      .limit(20000);
    if (statusFilter === 'sent' || statusFilter === 'no_profile') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as CdcDriveNotificationLogRow[];

    // Enrich with learner name / register number / institution name.
    const learnerIds = Array.from(new Set(rows.map((r) => r.learner_id)));
    const learners = new Map<string, { name: string; register_number: string | null }>();
    for (const ids of chunk(learnerIds, 200)) {
      const { data: ls } = await service
        .from('learners_profiles')
        .select('id, first_name, last_name, register_number')
        .in('id', ids);
      (ls ?? []).forEach((l) =>
        learners.set(l.id as string, {
          name: [l.first_name, l.last_name].filter(Boolean).join(' '),
          register_number: (l.register_number as string | null) ?? null,
        })
      );
    }
    const instIds = Array.from(new Set(rows.map((r) => r.target_institution_id).filter(Boolean))) as string[];
    const instNames = new Map<string, string>();
    if (instIds.length) {
      const { data: insts } = await service.from('institutions').select('id, name').in('id', instIds);
      (insts ?? []).forEach((i) => instNames.set(i.id as string, i.name as string));
    }

    const summary: CdcDriveNotificationSummary = {
      sent: 0,
      no_profile: 0,
      push_delivered: 0,
      push_failed: 0,
      no_subscription: 0,
      last_sent_at: null,
    };
    const enriched = rows.map((r) => {
      if (r.status === 'sent') summary.sent += 1;
      if (r.status === 'no_profile') summary.no_profile += 1;
      if (r.push_status === 'delivered') summary.push_delivered += 1;
      if (r.push_status === 'failed' || r.push_status === 'stale_removed') summary.push_failed += 1;
      if (r.push_status === 'no_subscription' || r.push_status === 'opted_out') summary.no_subscription += 1;
      if (!summary.last_sent_at || r.sent_at > summary.last_sent_at) summary.last_sent_at = r.sent_at;
      const l = learners.get(r.learner_id);
      return {
        ...r,
        learner_name: l?.name ?? null,
        register_number: l?.register_number ?? null,
        institution_name: r.target_institution_id ? instNames.get(r.target_institution_id) ?? null : null,
      };
    });

    return NextResponse.json(
      { summary, rows: enriched, total: enriched.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/drives/[id]/notifications] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
