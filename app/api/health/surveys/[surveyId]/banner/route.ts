export const dynamic = 'force-dynamic';

// POST   /api/health/surveys/[surveyId]/banner  — upload / replace the header banner
// DELETE /api/health/surveys/[surveyId]/banner  — remove it
//
// Manager-only WRITE, world READ (public bucket health-survey-media): the banner
// renders on the no-login public survey page with a plain <img>.
// Pattern: app/api/events/[eventId]/form-media/route.ts.
//
// Authorization is self-proving: banner_url is written through the CALLER's RLS
// client (health_surveys_write = health.programs.manage). If that update touches
// no row, the caller can't edit this survey — the just-uploaded object is
// removed and the request is refused. updated_at is deliberately NOT bumped so
// an open survey editor keeps its unsaved draft.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'health-survey-media';
const MAX_BYTES = 5 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Object path inside our bucket, from a public URL we issued (else null). */
function objectPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

async function surveyIdFrom(context?: { params?: Promise<Record<string, string>> }) {
  const params = await context?.params;
  return params?.surveyId ?? null;
}

export const POST = withAuth(
  async (request: NextRequest, auth, context?: { params?: Promise<Record<string, string>> }) => {
    const surveyId = await surveyIdFrom(context);
    if (!surveyId) return NextResponse.json({ error: 'surveyId is required' }, { status: 400 });

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That image is empty.' }, { status: 422 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large. Maximum 5 MB.' }, { status: 422 });
    }
    if (!EXT_BY_MIME[file.type]) {
      return NextResponse.json(
        { error: 'Please upload a JPG, PNG, WebP or GIF image.' },
        { status: 422 }
      );
    }

    // Current banner (through the caller's RLS) — replaced below.
    const { data: current } = await auth.supabase
      .from('health_surveys')
      .select('id, banner_url')
      .eq('id', surveyId)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const svc = createServiceRoleClient();
    const objectPath = `${surveyId}/${crypto.randomUUID()}${EXT_BY_MIME[file.type]}`;
    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || 'Upload failed' }, { status: 500 });
    }
    const {
      data: { publicUrl },
    } = svc.storage.from(BUCKET).getPublicUrl(objectPath);

    const { data: updated } = await auth.supabase
      .from('health_surveys')
      .update({ banner_url: publicUrl })
      .eq('id', surveyId)
      .select('id');
    if (!updated || updated.length === 0) {
      await svc.storage.from(BUCKET).remove([objectPath]);
      return NextResponse.json(
        { error: 'You do not have permission to edit this survey.' },
        { status: 403 }
      );
    }

    const oldPath = objectPathFromUrl(current.banner_url);
    if (oldPath) await svc.storage.from(BUCKET).remove([oldPath]);

    return NextResponse.json({ url: publicUrl }, { status: 201 });
  },
  { requiredPermission: 'write' }
);

export const DELETE = withAuth(
  async (_request: NextRequest, auth, context?: { params?: Promise<Record<string, string>> }) => {
    const surveyId = await surveyIdFrom(context);
    if (!surveyId) return NextResponse.json({ error: 'surveyId is required' }, { status: 400 });

    const { data: current } = await auth.supabase
      .from('health_surveys')
      .select('id, banner_url')
      .eq('id', surveyId)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: 'Survey not found' }, { status: 404 });

    const { data: updated } = await auth.supabase
      .from('health_surveys')
      .update({ banner_url: null })
      .eq('id', surveyId)
      .select('id');
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this survey.' },
        { status: 403 }
      );
    }

    const oldPath = objectPathFromUrl(current.banner_url);
    if (oldPath) await createServiceRoleClient().storage.from(BUCKET).remove([oldPath]);

    return NextResponse.json({ url: null });
  },
  { requiredPermission: 'write' }
);
