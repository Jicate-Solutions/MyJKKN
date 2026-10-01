export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/participants
 *
 * GET  → { finalized_at, rows[], counts, access }                 (cdc.drives.view, or an assigned coordinator)
 * POST → { action: 'finalize', learner_ids?: string[] }            (cdc.drives.edit)
 *        { action: 'add' | 'remove', learner_ids, reason? }        (cdc.drives.edit)
 *
 * 'finalize' with no learner_ids takes everyone who answered Willing. It moves a
 * willingness_open drive to eligibility_locked ("Participants Finalized") and
 * notifies only the learners who were not already told they are shortlisted.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  changeParticipants,
  finalizeParticipants,
  getParticipantsView,
  resolveDriveDayAccess,
} from '@/lib/services/cdc/drive-day';

async function canReleaseContact(session: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const [{ data: a }, { data: b }] = await Promise.all([
    session.rpc('user_has_permission', { permission_name: 'learners.profiles.view' }),
    session.rpc('user_has_permission', { permission_name: 'learners.view' }),
  ]);
  return a === true || b === true;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const access = await resolveDriveDayAccess(session, service, user.id, drive);
    if (!access.canView && !access.isCoordinator) {
      return NextResponse.json({ error: 'Forbidden — you are not assigned to this drive' }, { status: 403 });
    }

    const view = await getParticipantsView(service, drive, { releaseProfileContact: await canReleaseContact(session) });
    return NextResponse.json({ ...view, access }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/participants] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: canEdit } = await session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' });
    if (canEdit !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
    }

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const ids: string[] | null = Array.isArray(body.learner_ids)
      ? body.learner_ids.filter((v: unknown): v is string => typeof v === 'string')
      : null;

    if (body.action === 'finalize') {
      const result = await finalizeParticipants(session, service, drive, ids, user.id);
      return NextResponse.json(result);
    }
    if (body.action === 'add' || body.action === 'remove') {
      if (!ids || ids.length === 0) return NextResponse.json({ error: 'learner_ids is required' }, { status: 400 });
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
      const result = await changeParticipants(service, drive, body.action, ids, user.id, reason);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "action must be 'finalize', 'add' or 'remove'" }, { status: 400 });
  } catch (err) {
    console.error('[cdc/drives/[id]/participants] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
