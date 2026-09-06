export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/hr/leave/documents/upload
//
// Puts one supporting document on Google Drive and hands back the metadata the
// caller stores in hr_leave_applications.documents. It does NOT touch the
// application row — the drawer uploads here first, then posts the application
// with the returned metadata attached, mirroring the recruitment apply wizard.
//
// WHY UPLOAD BEFORE THE APPLICATION EXISTS. The alternative — create the
// application, then attach — leaves a required document missing whenever the
// second call fails, on exactly the requests that must not be missing one. This
// way the worst case is an orphaned Drive file, which costs nothing and is
// invisible to the applicant. The drawer defers the upload to the Submit click
// and caches the result per File, so a cancel uploads nothing and a retry
// re-uses what it already put there.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadLeaveDocument } from '@/lib/google/drive-upload';

/** Certificates and duty orders arrive as a scan or a phone photo. */
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_BYTES = 5 * 1024 * 1024;

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: 'File storage is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const employeeId = String(formData.get('employee_id') ?? '');
    const leaveTypeId = String(formData.get('leave_type_id') ?? '');
    const startDate = String(formData.get('start_date') ?? '');
    // 'comp_off_claim' files proof for a worked-day claim — no leave type
    // exists there, so the filename carries COMPOFF instead of a type code.
    const purpose = String(formData.get('purpose') ?? 'leave');
    const isCompOffClaim = purpose === 'comp_off_claim';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Attach a PDF or an image (JPG, PNG, WEBP).' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File must be under 5 MB (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 400 }
      );
    }
    if (!employeeId || (!leaveTypeId && !isCompOffClaim)) {
      return NextResponse.json(
        { error: 'employee_id and leave_type_id are required' },
        { status: 400 }
      );
    }

    // Read the staff row and the leave type THROUGH the caller's own client, so
    // RLS decides what they may see. A caller who cannot read the staff row has
    // no business filing a document against it, and the 404 below is the whole
    // authorization check — there is no service-role client in this route.
    const [{ data: staffRow }, { data: leaveType }] = await Promise.all([
      supabase
        .from('staff')
        .select('id, staff_id, institution_id, institutions(name)')
        .eq('id', employeeId)
        .maybeSingle(),
      isCompOffClaim
        ? Promise.resolve({ data: null })
        : supabase
            .from('hr_leave_types')
            .select('id, leave_type_code, hr_organization_id, hr_organizations(name)')
            .eq('id', leaveTypeId)
            .maybeSingle(),
    ]);

    if (!staffRow || (!leaveType && !isCompOffClaim)) {
      return NextResponse.json(
        { error: 'Staff member or leave type not found' },
        { status: 404 }
      );
    }

    const orgName =
      (leaveType as any)?.hr_organizations?.name ??
      (staffRow as any).institutions?.name ??
      'Unknown Organisation';

    const uploaded = await uploadLeaveDocument({
      organizationName: orgName,
      startDate,
      staffCode: (staffRow as any).staff_id ?? null,
      leaveTypeCode: isCompOffClaim
        ? 'COMPOFF'
        : ((leaveType as any)?.leave_type_code ?? 'LEAVE'),
      file,
    });

    // Shaped as a LeaveDocument so the client can push it straight into the
    // documents array without re-mapping field names.
    return NextResponse.json({
      name: uploaded.name,
      storage_path: '',
      uploaded_at: new Date().toISOString(),
      drive_file_id: uploaded.driveFileId,
      url: uploaded.url,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
    });
  } catch (err) {
    console.error('[hr/leave/documents/upload] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
