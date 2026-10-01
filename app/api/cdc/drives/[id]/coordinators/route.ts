export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/coordinators
 *
 * GET → { coordinators[], staff_options[] }      (cdc.drives.view)
 *       staff_options is filled ONLY with ?options=1 — the drive page shows the
 *       assigned names on every load, but the (up to 5000-row) picker list is
 *       needed only once the Assign dialog opens.
 * PUT → { staff_ids: string[] }  replaces the set (cdc.drives.edit)
 *
 * Staff options come from the drive's OWN institutions (service-role read, so a
 * coordinator's institution scope cannot empty the list of a multi-college
 * drive). Assigned staff get scoped access to this drive's attendance page
 * through cdc_drive_coordinators.user_id, without holding any CDC permission.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { listCoordinators, setCoordinators } from '@/lib/services/cdc/drive-day';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const wantOptions = request.nextUrl.searchParams.get('options') === '1';
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: canView } = await session.rpc('user_has_permission', { permission_name: 'cdc.drives.view' });
    if (canView !== true) return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const [coordinators, staffRes] = await Promise.all([
      listCoordinators(service, id),
      wantOptions && drive.institutions.length
        ? service
            .from('staff')
            .select('id, first_name, last_name, staff_id, designation, profile_id')
            .in('institution_id', drive.institutions)
            .eq('is_active', true)
            .order('first_name', { ascending: true })
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (staffRes.error) throw staffRes.error;

    const staff_options = ((staffRes.data ?? []) as Array<Record<string, any>>).map((s) => ({
      value: s.id as string,
      label:
        `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() +
        (s.staff_id ? ` (${s.staff_id})` : '') +
        (s.designation ? ` · ${s.designation}` : ''),
      has_login: !!s.profile_id,
    }));

    return NextResponse.json({ coordinators, staff_options }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/coordinators] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: canEdit } = await session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' });
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    if (drive.status === 'closed' || drive.status === 'cancelled') {
      return NextResponse.json({ error: 'This drive can no longer be changed.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.staff_ids)) return NextResponse.json({ error: 'staff_ids must be an array' }, { status: 400 });
    const staffIds = body.staff_ids.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50);

    const result = await setCoordinators(service, drive, staffIds, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cdc/drives/[id]/coordinators] PUT error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
