export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cdc/drives/[id]/documents/upload   (multipart/form-data)
 *   file, learner_id, document_type, batch_id?, mode? = skip | replace | new_version
 *
 * ONE file per request: a 200-file batch is 200 small requests from the
 * browser, never one request that exceeds the hosting body limit. The server
 * re-checks that the learner belongs to this drive, uploads to Google Drive
 * (CDC / Campus Drives / {Company} - {Date} / {Type}), then writes the row. A
 * failed Drive upload writes nothing.
 *
 * Gate: cdc.drives.edit.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { DOCUMENT_TYPES, storeDocument } from '@/lib/services/cdc/drive-documents';
import type { CdcBulkExistingMode, CdcDocumentType } from '@/types/cdc';

const MODES: CdcBulkExistingMode[] = ['skip', 'replace', 'new_version'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    if (!isDriveConfigured()) {
      return NextResponse.json({ error: 'File storage is not configured. Contact support.' }, { status: 503 });
    }
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Permission check, body parse and the drive read do not depend on each other.
    const service = createServiceRoleClient();
    const [{ data: canEdit }, form, drive] = await Promise.all([
      session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
      request.formData(),
      CdcDriveService.getDrive(service, id),
    ]);
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });

    const file = form.get('file');
    const learnerId = String(form.get('learner_id') ?? '');
    const type = String(form.get('document_type') ?? '') as CdcDocumentType;
    const batchId = String(form.get('batch_id') ?? '') || null;
    const modeRaw = String(form.get('mode') ?? '');
    const mode = (MODES as string[]).includes(modeRaw) ? (modeRaw as CdcBulkExistingMode) : null;

    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!learnerId) return NextResponse.json({ error: 'learner_id is required' }, { status: 400 });
    if (!DOCUMENT_TYPES.includes(type)) return NextResponse.json({ error: 'Unknown document_type' }, { status: 400 });

    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const [batchRes, { data: recruiter }] = await Promise.all([
      batchId
        ? service.from('cdc_drive_document_batches').select('id, drive_id, status').eq('id', batchId).maybeSingle()
        : Promise.resolve({ data: null }),
      service.from('cdc_recruiters').select('name').eq('id', drive.recruiter_id).maybeSingle(),
    ]);
    if (batchId) {
      const batch = batchRes.data as { drive_id: string; status: string } | null;
      if (!batch || batch.drive_id !== id) return NextResponse.json({ error: 'Batch does not belong to this drive' }, { status: 400 });
      if (batch.status !== 'in_progress') return NextResponse.json({ error: 'This batch is already closed' }, { status: 400 });
    }

    const result = await storeDocument(service, {
      drive,
      recruiterName: (recruiter?.name as string | undefined) ?? null,
      type,
      learnerId,
      file,
      batchId,
      mode,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cdc/drives/[id]/documents/upload] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
