export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/documents/bulk
 *
 * GET  → { batches[] }                                           upload history for the drive
 * POST → { action: 'preview', document_type, files: [{name,size}] }
 *          ← { rows, candidates, summary, pool }                 nothing stored
 *        { action: 'start', document_type, totals }
 *          ← { batch }                                           batch row (OFF-2026-0001)
 *        { action: 'finish', batch_id, results: [...] }
 *          ← { batch }                                           totals + audit
 *
 * Files themselves go one per request to ../upload. Gate: cdc.drives.edit.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  DOCUMENT_TYPES,
  MAX_BULK_FILES,
  finishBatch,
  listBatches,
  previewBulkUpload,
  startBatch,
  type BatchFileResult,
} from '@/lib/services/cdc/drive-documents';
import type { CdcDocumentType } from '@/types/cdc';

async function gate(permission: string) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const { data: ok } = await session.rpc('user_has_permission', { permission_name: permission });
  if (ok !== true) return { error: NextResponse.json({ error: `Forbidden — ${permission} required` }, { status: 403 }) } as const;
  return { user } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const g = await gate('cdc.drives.view');
    if ('error' in g) return g.error;
    const batches = await listBatches(createServiceRoleClient(), id);
    return NextResponse.json({ batches }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/documents/bulk] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const g = await gate('cdc.drives.edit');
    if ('error' in g) return g.error;

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    if (drive.status === 'cancelled') return NextResponse.json({ error: 'This drive is cancelled.' }, { status: 400 });

    const body = await request.json().catch(() => ({}));

    if (body.action === 'finish') {
      if (typeof body.batch_id !== 'string') return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
      const results: BatchFileResult[] = Array.isArray(body.results)
        ? body.results
            .filter((r: unknown): r is BatchFileResult => !!r && typeof r === 'object' && typeof (r as BatchFileResult).file_name === 'string')
            .map((r: BatchFileResult) => ({
              file_name: String(r.file_name).slice(0, 255),
              outcome: r.outcome,
              learner_id: r.learner_id ?? null,
              register_number: r.register_number ?? null,
              reason: r.reason ? String(r.reason).slice(0, 300) : null,
            }))
        : [];
      const batch = await finishBatch(service, body.batch_id, id, results, g.user.id);
      return NextResponse.json({ batch });
    }

    const type = body.document_type as CdcDocumentType;
    if (!DOCUMENT_TYPES.includes(type)) return NextResponse.json({ error: 'Unknown document_type' }, { status: 400 });

    if (body.action === 'preview') {
      const files: Array<{ name: string; size: number }> = Array.isArray(body.files)
        ? body.files
            .filter((f: unknown): f is { name: string; size: number } => !!f && typeof (f as { name?: unknown }).name === 'string')
            .map((f: { name: string; size: number }) => ({ name: f.name.slice(0, 255), size: Number(f.size) || 0 }))
        : [];
      if (files.length === 0) return NextResponse.json({ error: 'Select at least one file.' }, { status: 400 });
      if (files.length > MAX_BULK_FILES) {
        return NextResponse.json({ error: `Upload at most ${MAX_BULK_FILES} files at a time.` }, { status: 400 });
      }
      const preview = await previewBulkUpload(service, drive, type, files);
      return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (body.action === 'start') {
      const t = body.totals ?? {};
      const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
      const batch = await startBatch(
        service,
        drive,
        type,
        {
          total_files: num(t.total_files),
          matched: num(t.matched),
          no_match: num(t.no_match),
          multiple_match: num(t.multiple_match),
          existing_found: num(t.existing_found),
        },
        g.user.id
      );
      return NextResponse.json({ batch });
    }

    return NextResponse.json({ error: "action must be 'preview', 'start' or 'finish'" }, { status: 400 });
  } catch (err) {
    console.error('[cdc/drives/[id]/documents/bulk] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
