// app/api/student-form/[token]/photo/route.ts
//
// Public — no auth. Upload selfie via multipart. HMAC validates the token.
// Stores at student-avatars/{learner_id}/{token_id}.jpg

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StudentFormService } from '@/lib/services/admission/student-form-service';

const MAX_PRE_COMPRESS_BYTES = 5 * 1024 * 1024;  // 5 MB hard limit

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid';
    if (['malformed_token', 'bad_signature', 'bad_payload', 'token_not_found', 'token_id_mismatch'].includes(msg)) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 410 });
  }

  const formData = await request.formData();
  const file = formData.get('photo');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'photo field missing' }, { status: 400 });
  }
  if (file.size > MAX_PRE_COMPRESS_BYTES) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413 });
  }

  const svc = createServiceRoleClient();
  const path = `${ctx.learner_profile_id}/${ctx.token_id}.jpg`;
  const { error: upErr } = await (svc as any).storage
    .from('student-avatars')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed: ' + upErr.message }, { status: 500 });
  }
  const { data: urlData } = await (svc as any).storage
    .from('student-avatars')
    .getPublicUrl(path);

  return NextResponse.json({ photo_url: urlData.publicUrl });
}
