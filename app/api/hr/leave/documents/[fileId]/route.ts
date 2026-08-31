export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/hr/leave/documents/[fileId]
//
// Streams one leave supporting document out of Google Drive.
//
// WHY A PROXY AND NOT A LINK. These are medical certificates and duty orders.
// uploadLeaveDocument() deliberately grants the file NO public permission, so
// the Drive URL is useless to anyone outside the service account — which means
// there is no link to hand out, and the bytes have to come through here.
//
// AUTHORIZATION IS THE POINT OF THIS ROUTE. Holding a Drive file id must not be
// enough: ids leak through screenshots, logs and shared URLs. The check is
// "does an application you are allowed to see actually reference this file",
// asked THROUGH the caller's own Supabase client so hr_leave_applications' RLS
// answers it. A staff member sees their own; an approver sees the ones on their
// queue; nobody else gets a 200. An id that exists in Drive but is not attached
// to any application the caller can read is indistinguishable from one that
// does not exist, and both return 404.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { Readable } from 'node:stream';
import { createDriveClient, isDriveConfigured } from '@/lib/google/drive-client';

/** Drive ids are URL-safe base64-ish. Reject anything else before touching the API. */
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  await connection();

  const { fileId } = await params;
  if (!ID_RE.test(fileId)) {
    return NextResponse.json({ error: 'Bad fileId' }, { status: 400 });
  }
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'Drive not configured' }, { status: 503 });
  }

  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS on hr_leave_applications does the authorising. The containment
    // operator @> asks Postgres "is there an object in this array carrying this
    // drive_file_id", which is an exact match on the value — a LIKE over the
    // JSON text would match an id that merely appears inside another string.
    const { data: match, error: matchError } = await supabase
      .from('hr_leave_applications')
      .select('id')
      .filter('documents', 'cs', JSON.stringify([{ drive_file_id: fileId }]))
      .limit(1)
      .maybeSingle();

    if (matchError) throw matchError;

    let authorised = !!match;

    // Comp-off worked-day claims carry documents in the same shape; RLS on
    // hr_comp_off_credits (hcoc_select) scopes them exactly like the queue —
    // the claimant sees their own, an approver sees their organisations'.
    if (!authorised) {
      const { data: claimMatch, error: claimError } = await supabase
        .from('hr_comp_off_credits')
        .select('id')
        .filter('documents', 'cs', JSON.stringify([{ drive_file_id: fileId }]))
        .limit(1)
        .maybeSingle();
      if (claimError) throw claimError;
      authorised = !!claimMatch;
    }

    if (!authorised) {
      // Deliberately identical to a genuinely missing file: telling an
      // unauthorised caller that the id is real is itself a disclosure.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const drive = createDriveClient();
    const file = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    const headers: Record<string, string> = {
      'Content-Type': (file.headers['content-type'] as string) || 'application/octet-stream',
      // Bytes for a Drive id never change. `private` keeps it out of any shared
      // cache — this response is scoped to one authorised session.
      'Cache-Control': 'private, max-age=3600',
      // Inline so a certificate opens in the browser's viewer rather than
      // landing in Downloads; an approver checks it and moves on.
      'Content-Disposition': 'inline',
    };
    const len = file.headers['content-length'];
    if (len) headers['Content-Length'] = String(len);

    const webStream = Readable.toWeb(file.data as Readable) as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[hr/leave/documents proxy] error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
