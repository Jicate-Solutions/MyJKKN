export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/registration-upload
//
// Accepts ONE file for one 'file' / 'image' field on a public registration form
// and stores it in the private `event-registration-uploads` bucket. Returns the
// EventFormUpload object the client puts into custom_fields.
//
// THIS ENDPOINT IS REACHABLE WITHOUT A SESSION, by necessity: the public
// registration page has no login, and /api/upload 401s for guests. An open
// upload endpoint is a storage-flooding vector, so every request must earn its
// write. In order, before a single byte is stored:
//
//   1. the event exists, is not draft/cancelled, and its registration window
//      is open  — so uploads stop when registration stops;
//   2. the form belongs to THIS event and is open — a closed form cannot be
//      used as free storage, and a form id from another event is rejected;
//   3. the named field exists ON THAT FORM and is of type file|image — you
//      cannot invent a field key to upload against;
//   4. size and MIME are checked SERVER-SIDE against the field's type. An
//      'image' field refuses a PDF here even though the bucket allows PDFs for
//      'file' fields.
//
// Only then does the service-role client write. The bucket has NO storage RLS
// policies at all, so `anon` and `authenticated` can do nothing against it
// directly — this route is the only door, and the checks above cannot be
// side-stepped by talking to storage.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isFormOpen, UPLOAD_FIELD_TYPES } from '@/types/tournament';
import type { FormFieldType } from '@/types/tournament';

const BUCKET = 'event-registration-uploads';

/** Tighter than the bucket's 10 MB: a passport photo has no business being 10 MB. */
const MAX_BYTES: Record<'file' | 'image', number> = {
  file: 10 * 1024 * 1024,
  image: 5 * 1024 * 1024,
};

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const FILE_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ...IMAGE_MIMES,
];

/** Keep an extension for round-tripping, drop everything else from the name. */
function safeExtension(filename: string, mime: string): string {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1]?.toLowerCase();
  if (fromName) return `.${fromName}`;
  const fromMime: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return fromMime[mime] ?? '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const file = formData.get('file');
    const formId = formData.get('form_id')?.toString();
    const fieldKey = formData.get('field_key')?.toString();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!formId || !fieldKey) {
      return NextResponse.json({ error: 'form_id and field_key are required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // ---- 1. event open ----
    const { data: ev } = await (svc as any)
      .from('events')
      .select('id, status, registration_open_date, registration_close_date')
      .eq('id', eventId)
      .maybeSingle();
    if (!ev || ['draft', 'cancelled'].includes(ev.status)) {
      return NextResponse.json({ error: 'Event not open for registration' }, { status: 404 });
    }
    const now = new Date();
    if (ev.registration_open_date && now < new Date(ev.registration_open_date)) {
      return NextResponse.json({ error: 'Registration has not opened yet' }, { status: 422 });
    }
    if (ev.registration_close_date && now > new Date(ev.registration_close_date)) {
      return NextResponse.json({ error: 'Registration has closed' }, { status: 422 });
    }

    // ---- 2. form belongs to this event AND is open ----
    const { data: form } = await (svc as any)
      .from('event_registration_forms')
      .select('id, is_enabled, starts_at, ends_at')
      .eq('id', formId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!form) {
      return NextResponse.json(
        { error: 'That registration form does not belong to this event.' },
        { status: 422 }
      );
    }
    // Same window rule as the submit route. Without it an expired form would
    // still accept uploads — filling the bucket for a registration that can
    // never be completed.
    if (!isFormOpen(form)) {
      return NextResponse.json({ error: 'This registration form is closed.' }, { status: 422 });
    }

    // ---- 3. the field exists on that form and accepts an upload ----
    const { data: field } = await (svc as any)
      .from('event_registration_form_fields')
      .select('id, field_type, field_label')
      .eq('form_id', form.id)
      .eq('field_key', fieldKey)
      .maybeSingle();
    if (!field) {
      return NextResponse.json({ error: 'Unknown field for this form.' }, { status: 422 });
    }
    const fieldType = field.field_type as FormFieldType;
    if (!UPLOAD_FIELD_TYPES.has(fieldType)) {
      return NextResponse.json(
        { error: `"${field.field_label}" does not accept a file.` },
        { status: 422 }
      );
    }

    // ---- 4. size + MIME, enforced against the FIELD's type ----
    const kind = fieldType === 'image' ? 'image' : 'file';
    const limit = MAX_BYTES[kind];
    if (file.size === 0) {
      return NextResponse.json({ error: 'That file is empty.' }, { status: 422 });
    }
    if (file.size > limit) {
      return NextResponse.json(
        { error: `File is too large. Maximum ${Math.round(limit / 1024 / 1024)} MB.` },
        { status: 422 }
      );
    }
    const allowed = kind === 'image' ? IMAGE_MIMES : FILE_MIMES;
    // file.type is browser-supplied and therefore untrusted, but the bucket's
    // own allowed_mime_types is a second, server-side gate behind this one.
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            kind === 'image'
              ? 'Please upload a JPG, PNG, WebP or GIF image.'
              : 'Please upload a PDF, Word document or image.',
        },
        { status: 422 }
      );
    }

    // ---- store ----
    // Path is server-generated: a client-supplied path could traverse into
    // another event's folder or overwrite an existing registrant's document.
    const objectPath = `${eventId}/${form.id}/${crypto.randomUUID()}${safeExtension(file.name, file.type)}`;

    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'Upload failed' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        path: objectPath,
        // Stored for display only, never used to build a filesystem path.
        name: file.name.slice(0, 200),
        size: file.size,
        mime: file.type,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
