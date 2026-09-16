export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cdc/drives/circular/upload  (multipart/form-data: file, title?, recruiter_id?)
 *
 * Uploads a drive circular to Google Drive (CDC Drives / {Recruiter}) and
 * returns the Drive reference the create / PATCH drive calls persist on
 * cdc_drives. The bytes never touch Supabase storage or the DB.
 *
 * Gate: cdc.drives.create OR cdc.drives.edit — whoever may write a drive may
 * attach its circular. A failed Drive upload returns an error and nothing is
 * recorded, so a circular is never marked uploaded when it isn't.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadCdcDriveCircular } from '@/lib/google/drive-upload';

/** Circulars are documents — PDF first, plus the image/office types already permitted elsewhere. */
export const CDC_CIRCULAR_ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  await connection();
  try {
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: 'File storage is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [{ data: canCreate }, { data: canEdit }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.create' }),
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
    ]);
    if (canCreate !== true && canEdit !== true) {
      return NextResponse.json(
        { error: 'Forbidden — cdc.drives.create or cdc.drives.edit required' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const title = String(formData.get('title') ?? '').trim();
    const recruiterId = String(formData.get('recruiter_id') ?? '').trim();

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!CDC_CIRCULAR_ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Attach a PDF, Word document or an image (JPG, PNG, WEBP).' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File must be under 10 MB (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 400 }
      );
    }

    let recruiterName: string | null = null;
    if (recruiterId) {
      const { data: recruiter } = await supabase
        .from('cdc_recruiters')
        .select('name')
        .eq('id', recruiterId)
        .maybeSingle();
      recruiterName = (recruiter?.name as string | undefined) ?? null;
    }

    const uploaded = await uploadCdcDriveCircular({
      driveTitle: title || 'drive',
      recruiterName,
      file,
    });

    return NextResponse.json({
      circular: {
        drive_file_id: uploaded.driveFileId,
        file_name: uploaded.name,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.sizeBytes,
        url: uploaded.url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user.id,
      },
    });
  } catch (err) {
    console.error('[cdc/drives/circular/upload] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
