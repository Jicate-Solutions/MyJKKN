export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadRefundAttachment } from '@/lib/google/drive-upload';

// Supporting documents for consultant commission payment requests. Same upload
// as the billing refund route, filed under its own Drive folder:
// Consultant Commission Payments/<Consultant>/<RequestRef>.

// These values become Google Drive folder-path segments, so restrict them to a
// safe allowlist to prevent path traversal / folder injection from the client.
function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = (value || '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Uploads land on institutional Drive with link sharing, so only people who
  // work commission money may add files — not every signed-in user.
  const [{ data: isSuper }, { data: canView }] = await Promise.all([
    (supabase as any).rpc('is_super_admin'),
    (supabase as any).rpc('user_has_permission', { permission_name: 'admission.consultants.commissions.view' }),
  ]);
  if (!isSuper && !canView) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  // The shared field posts the folder name as institutionName; here it is the consultant.
  const consultantName = sanitizeSegment(form.get('institutionName') as string, 'Unknown Consultant');
  const requestRef = sanitizeSegment(form.get('requestRef') as string, 'general');
  if (!file) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large_10mb' }, { status: 400 });

  try {
    const uploaded = await uploadRefundAttachment({
      rootFolder: 'Consultant Commission Payments',
      institutionName: consultantName,
      requestRef,
      file,
    });
    return NextResponse.json({
      name: uploaded.name,
      drive_file_id: uploaded.driveFileId,
      drive_url: uploaded.url,
      mime: file.type,
      size: file.size,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'upload_failed' }, { status: 500 });
  }
}
