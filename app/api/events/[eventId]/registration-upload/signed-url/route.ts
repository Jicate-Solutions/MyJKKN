export const dynamic = 'force-dynamic';

// GET /api/events/[eventId]/registration-upload/signed-url?path=<storage key>
//
// Mints a short-lived signed URL so an organizer can open a document a
// registrant uploaded. The bucket is PRIVATE and has no storage RLS policies,
// so this route (service-role) is the only way to read an object — and a leaked
// link stops working when it expires, unlike a public-bucket URL which would
// live forever and could not be revoked without deleting the file.
//
// TWO independent gates, because either alone is insufficient:
//
//   1. The path must sit under this event's prefix. Without it, anyone who can
//      read one event could sign a path belonging to ANOTHER event just by
//      passing it here.
//   2. The caller must be able to read this event's registration form THROUGH
//      THEIR OWN RLS CONTEXT. A session alone is not authorization: paths are
//      unguessable, but unguessable is secrecy, not access control — the moment
//      one leaks through an export, a log, or the responses JSON, gate 1 would
//      happily sign it for any logged-in learner.
//
// Gate 2 reuses the authorization that already governs this data rather than
// inventing a parallel one: event_registration_form* RLS admits super admins,
// is_admin(), fn_is_event_incharge() and sports-permission holders — exactly the
// people who can open the responses list. If you cannot read the form, you have
// no legitimate reason to sign its attachments.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'event-registration-uploads';
const EXPIRES_SECONDS = 60 * 60; // 1 hour — long enough to open, short enough to matter

export const GET = withAuth(
  async (
    request: NextRequest,
    auth,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const params = await context?.params;
    const eventId = params?.eventId;
    const path = request.nextUrl.searchParams.get('path');

    if (!eventId || !path) {
      return NextResponse.json({ error: 'eventId and path are required' }, { status: 400 });
    }

    // ── Gate 1: the path belongs to this event ──────────────────────────────
    // Uploads are stored at `${eventId}/${formId}/${uuid}${ext}`. Anything not
    // under this event's prefix belongs to a different event and must not be
    // signed here. Traversal is rejected outright.
    const segments = path.split('/');
    if (path.includes('..') || segments.length !== 3 || segments[0] !== eventId) {
      return NextResponse.json(
        { error: 'That file does not belong to this event.' },
        { status: 403 }
      );
    }
    const formId = segments[1];

    // ── Gate 2: the caller may actually read this event's forms ─────────────
    // Deliberately through auth.supabase (the caller's RLS context), NOT the
    // service-role client — the whole point is to let the existing
    // event_registration_form* policies decide. A denied read returns no row,
    // which is a 403 here rather than a signed URL.
    const { data: form } = await auth.supabase
      .from('event_registration_forms')
      .select('id')
      .eq('id', formId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (!form) {
      return NextResponse.json(
        { error: 'You do not have access to this event’s registrations.' },
        { status: 403 }
      );
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc.storage
      .from(BUCKET)
      .createSignedUrl(path, EXPIRES_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || 'Could not create a link for that file' },
        { status: 404 }
      );
    }

    return NextResponse.json({ url: data.signedUrl, expiresIn: EXPIRES_SECONDS });
  },
  { requiredPermission: 'read' }
);
