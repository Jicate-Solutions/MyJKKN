// app/api/hr/staff-photo/submit/route.ts
//
// A staff member photographs themselves and sends it for approval.
//
// The photograph is NOT the photograph of record when it lands here. It goes to
// a PRIVATE bucket and waits for a reviewer — see the migration header
// (20261222000000_hr_staff_photo_self_capture.sql) for why approval is not
// optional: a self-supplied picture is refused by lib/id-cards/photo-quality.ts
// and always will be. Approval is what makes it institutional.
//
// The caller never names the person or the destination. The staff row is
// resolved from the session via fn_my_hr_context, and the storage path is built
// here from that id — so a caller cannot overwrite somebody else's submission
// by choosing a path.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'hr-staff-photo-submissions';
const MAX_BYTES = 5 * 1024 * 1024; // matches the client-side compression ceiling

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }

  // Who this login is, as staff. Resolved server-side; never taken from the body.
  const { data: ctx, error: ctxErr } = await supabase
    .rpc('fn_my_hr_context')
    .maybeSingle<{ staff_id: string; institution_id: string | null }>();

  if (ctxErr) {
    return NextResponse.json(
      { success: false, error: 'Could not read your staff record.' },
      { status: 500 },
    );
  }
  if (!ctx?.staff_id) {
    // Explicit, per the standing rule that a permission failure is never a
    // silent redirect: this person has no staff record to attach a photo to.
    return NextResponse.json(
      {
        success: false,
        error:
          'This login has no staff record, so there is nothing to attach a photograph to. Ask HR to check your employee record.',
      },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'No photograph was sent.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ success: false, error: 'The photograph was empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: 'That photograph is too large. Please try again.' },
      { status: 413 },
    );
  }

  // Service role writes the private bucket: there are no storage policies on it
  // by design, so nothing but this route can put a file there.
  const admin = createServiceRoleClient();
  const path = `${ctx.staff_id}/${Date.now()}.jpg`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

  if (upErr) {
    return NextResponse.json(
      { success: false, error: 'The photograph could not be saved. Please try again.' },
      { status: 500 },
    );
  }

  // Recorded AS THE USER so the function resolves auth.uid() to them and stamps
  // status 'pending' itself. There is no argument here that could arrive approved.
  const { data: submissionId, error: rpcErr } = await supabase.rpc('fn_submit_my_staff_photo', {
    p_storage_path: path,
  });

  if (rpcErr) {
    // Do not leave an orphan file in the bucket if the record failed.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: false, error: rpcErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, submission_id: submissionId });
}
