export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/willingness-cycles
 *
 * GET  → { cycles, current, drive_status, can_reopen }      (cdc.drives.view)
 * POST → { action: 'update', open_at, close_at }             (cdc.drives.edit)
 *        { action: 'reopen', open_at, close_at, reason? }    (cdc.drives.edit)
 *      ← { cycle, drive, dispatched: CycleDispatchResult[] }
 *
 * Timestamps are ISO 8601 with offset; the edit page builds them in IST.
 * Any cycle whose open_at has already passed is notified immediately from the
 * POST, otherwise the cron sends it when the time comes.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  dispatchDueCycles,
  listCycles,
  reopenCycle,
  updateCurrentCycleWindow,
} from '@/lib/services/cdc/willingness-cycles';
import type { CdcWillingnessCyclesResponse } from '@/types/cdc';

async function gate(permission: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: ok } = await supabase.rpc('user_has_permission', { permission_name: permission });
  if (ok !== true) {
    return { error: NextResponse.json({ error: `Forbidden — ${permission} required` }, { status: 403 }) };
  }
  return { supabase, user };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const g = await gate('cdc.drives.view');
    if ('error' in g) return g.error;
    const drive = await CdcDriveService.getDrive(g.supabase, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    const cycles = await listCycles(createServiceRoleClient(), id);
    const body: CdcWillingnessCyclesResponse = {
      cycles,
      current: cycles.length ? cycles[cycles.length - 1] : null,
      drive_status: drive.status,
      can_reopen: drive.status === 'willingness_open' || drive.status === 'eligibility_locked',
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/willingness-cycles] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const g = await gate('cdc.drives.edit');
    if ('error' in g) return g.error;
    const drive = await CdcDriveService.getDrive(g.supabase, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const openAt = typeof body.open_at === 'string' ? body.open_at : null;
    const closeAt = typeof body.close_at === 'string' && body.close_at ? body.close_at : null;
    if (!openAt) return NextResponse.json({ error: 'open_at is required' }, { status: 400 });

    const service = createServiceRoleClient();
    let result;
    if (body.action === 'reopen') {
      result = await reopenCycle(service, drive, { open_at: openAt, close_at: closeAt, reason: typeof body.reason === 'string' ? body.reason : null }, g.user.id);
    } else if (body.action === 'update') {
      result = await updateCurrentCycleWindow(service, id, { open_at: openAt, close_at: closeAt }, g.user.id);
    } else {
      return NextResponse.json({ error: 'action must be "update" or "reopen"' }, { status: 400 });
    }

    const dispatched = await dispatchDueCycles(service, { driveId: id });
    return NextResponse.json({ cycle: result.cycle, drive: result.drive, dispatched }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/willingness-cycles] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
