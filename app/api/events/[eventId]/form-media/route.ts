export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/form-media
//
// Uploads an image the ORGANIZER attaches to a registration form — the picture
// an 'image_display' field renders. Returns its public URL, which the builder
// stores on the field as media_url.
//
// Deliberately NOT the same route as registration-upload, and deliberately a
// different bucket, because the two have opposite audiences:
//
//   registration-upload  anonymous WRITE, organizer-only READ, PRIVATE bucket.
//                        Someone's ID proof.
//   form-media (here)    organizer-only WRITE, world READ, PUBLIC bucket.
//                        Content the organizer is publishing.
//
// Keeping them apart means a mistake in one cannot expose the other: there is no
// code path where a registrant's document can be written to the public bucket,
// because this route never accepts an anonymous caller and that route never
// touches this bucket.
//
// Public is required, not a shortcut: an anonymous visitor renders this with a
// plain <img src>, and a signed URL would expire while the form is still live.
//
// Authorization reuses the gate that already governs form editing — the caller
// must be able to read the form through THEIR OWN RLS context. If they cannot
// open the builder, they cannot put an image in it.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'event-form-media';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const POST = withAuth(
  async (
    request: NextRequest,
    auth,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const params = await context?.params;
    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const file = formData.get('file');
    const formId = formData.get('form_id')?.toString();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    if (!formId) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }

    // Authorization: read the form through the CALLER's RLS context, not
    // service-role. No row means the existing event_registration_form* policies
    // denied them, which is a 403 here rather than an upload.
    const { data: form } = await auth.supabase
      .from('event_registration_forms')
      .select('id')
      .eq('id', formId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (!form) {
      return NextResponse.json(
        { error: 'You do not have access to this event’s registration forms.' },
        { status: 403 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'That image is empty.' }, { status: 422 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large. Maximum 5 MB.' }, { status: 422 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: 'Please upload a JPG, PNG, WebP or GIF image.' },
        { status: 422 }
      );
    }

    // Server-generated path: a client-supplied one could overwrite another
    // form's media or escape the event's folder.
    const objectPath = `${eventId}/${formId}/${crypto.randomUUID()}${EXT_BY_MIME[file.type] ?? ''}`;

    const svc = createServiceRoleClient();
    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'Upload failed' },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = svc.storage.from(BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({ url: publicUrl, path: objectPath, name: file.name }, { status: 201 });
  },
  // Writing form content, so 'write' rather than the 'read' the signed-url
  // route uses.
  { requiredPermission: 'write' }
);
