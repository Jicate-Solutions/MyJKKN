export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadRefundAttachment } from '@/lib/google/drive-upload';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  const institutionName = (form.get('institutionName') as string) || 'Unknown Institution';
  const requestRef = (form.get('requestRef') as string) || 'general';
  if (!file) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large_10mb' }, { status: 400 });

  try {
    const uploaded = await uploadRefundAttachment({ institutionName, requestRef, file });
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
