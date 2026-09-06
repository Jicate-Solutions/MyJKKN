import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireProcurement, PROC_GRN_CREATE } from '@/lib/utils/procurement-auth';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadProcurementInvoice } from '@/lib/google/drive-upload';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const isAllowedType = (t: string) =>
  t === 'application/pdf' || t.startsWith('image/');

/**
 * POST /api/procurement/grn/upload  (multipart/form-data)
 * Fields: file, institutionId, poNumber
 * Returns { attachment: { name, driveFileId, url } } to persist on
 * procurement_grn.invoice_document_url.
 */
export async function POST(req: NextRequest) {
  const user = await requireProcurement(PROC_GRN_CREATE);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: 'File uploads are not configured on the server.' },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = form.get('file');
  const institutionId = String(form.get('institutionId') ?? '');
  const poNumber = String(form.get('poNumber') ?? 'PO');

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds the 25 MB limit.' }, { status: 400 });
  if (!isAllowedType(file.type))
    return NextResponse.json({ error: 'Only PDF or image files are allowed.' }, { status: 400 });

  const db = createServiceRoleClient();
  const { data: inst } = institutionId
    ? await db.from('institutions').select('name').eq('id', institutionId).maybeSingle()
    : { data: null };
  const institutionName = (inst?.name as string) || 'Unknown Institution';

  try {
    const attachment = await uploadProcurementInvoice({ institutionName, poNumber, file });
    return NextResponse.json({ attachment });
  } catch (err) {
    console.error('[procurement grn invoice upload] error:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
