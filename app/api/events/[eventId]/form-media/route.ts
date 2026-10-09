export const dynamic = 'force-dynamic';
// googleapis + node:stream — the Drive client does not run on the edge runtime.
export const runtime = 'nodejs';

// POST /api/events/[eventId]/form-media
//
// Uploads an image the ORGANIZER attaches to a registration form — the event
// banner, or the picture an 'image_display' field renders. Stored in Google
// Drive (Event Form Media / <event>) since 2026-10-08; returns its public URL,
// which the caller stores as events.hero_image_url / the field's media_url.
// Older URLs point at the public Supabase `event-form-media` bucket and keep
// rendering as long as that object exists.
//
// Deliberately NOT the same route as registration-upload, and deliberately a
// different Drive helper, because the two have opposite audiences:
//
//   registration-upload  anonymous WRITE, organizer-only READ, NO sharing.
//                        Someone's ID proof.
//   form-media (here)    organizer-only WRITE, world READ, anyone:reader.
//                        Content the organizer is publishing.
//
// Keeping them apart means a mistake in one cannot expose the other: there is no
// code path where a registrant's document can be shared publicly, because this
// route never accepts an anonymous caller and that route never grants a
// permission.
//
// Public is required, not a shortcut: an anonymous visitor renders this with a
// plain <img src>.
//
// Authorization reuses the gate that already governs form editing — the caller
// must be able to read the form through THEIR OWN RLS context. If they cannot
// open the builder, they cannot put an image in it.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadEventFormMedia } from '@/lib/google/drive-upload';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

    if (!isDriveConfigured()) {
      return NextResponse.json({ error: 'File storage is not configured.' }, { status: 503 });
    }

    try {
      // Only names the Drive folder — a miss falls back to "Event [<id8>]".
      const { data: ev } = await auth.supabase
        .from('events')
        .select('name')
        .eq('id', eventId)
        .maybeSingle();

      // Folder and filename are server-generated: a client-supplied one could
      // overwrite another form's media or escape the event's folder.
      const uploaded = await uploadEventFormMedia({
        eventId,
        eventName: ev?.name ?? null,
        file,
      });
      return NextResponse.json(
        { url: uploaded.url, driveFileId: uploaded.driveFileId, name: file.name },
        { status: 201 }
      );
    } catch (err) {
      console.error('[form-media] upload failed', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Upload failed' },
        { status: 500 }
      );
    }
  },
  // Writing form content, so 'write' rather than the 'read' the signed-url
  // route uses.
  { requiredPermission: 'write' }
);
