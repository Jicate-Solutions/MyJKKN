// app/api/hr/staff-photo/review/route.ts
//
// The institutional act. Approving here is the ONLY thing in the product that
// writes a self-taken photograph to staff.profile_picture, which is the column
// lib/id-cards/photo-quality.ts trusts when it decides whether a card may print.
//
// ORDER OF OPERATIONS, AND WHY
//   1. Read the submission under the REVIEWER'S OWN session. If RLS will not
//      show it to them, they cannot review it, and we stop before touching
//      storage. This is a cheap first gate, not the real one.
//   2. Copy the file from the private bucket to the public staff-images path
//      the card renderer already reads. Approved photographs deliberately keep
//      the storage shape every other staff photograph has: photo-quality.ts
//      documents that its checks are only sound while every URL in these
//      columns is unsigned and non-expiring, and a signed URL here would
//      quietly break that guarantee.
//   3. Call the review function, which re-checks the permission and the
//      institution itself. It is SECURITY DEFINER, so it cannot lean on this
//      route having been careful.
//   4. If step 3 refuses, remove the file step 2 created. A refused approval
//      must not leave a public picture behind.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const PRIVATE_BUCKET = 'hr-staff-photo-submissions';
const PUBLIC_BUCKET = 'staff-images';

/**
 * Delete one storage object and tell the truth about whether it went.
 *
 * Three things the first version got wrong, all found by review:
 *
 *  - It read only the RETURNED error. Supabase surfaces most storage failures
 *    that way, but a fetch/abort THROWS, and a throw here escaped into an
 *    unhandled 500 *after* the decision had already committed — the caller saw
 *    failure for a review that succeeded. Both are caught now.
 *  - The retry fired instantly, so for the transient blip it exists for it
 *    landed inside the same failure window. There is a short delay now.
 *  - Nothing bounded the call, and the retry doubled the worst case. Each
 *    attempt now loses to a timeout rather than hanging the route.
 */
async function removeObject(
  admin: ReturnType<typeof createServiceRoleClient>,
  bucket: string,
  path: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const outcome = await Promise.race([
        admin.storage.from(bucket).remove([path]),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'timed out' } }), 5000),
        ),
      ]);
      if (!outcome.error) return true;
      if (attempt === 1) {
        console.error('[hr/staff-photo/review] object left behind:', bucket, path, outcome.error.message);
      }
    } catch (e) {
      if (attempt === 1) {
        console.error(
          '[hr/staff-photo/review] object left behind (threw):',
          bucket,
          path,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }
  return false;
}

/**
 * Record, on the submission row itself, that an object was left behind.
 *
 * Written with the service-role client because the table carries no UPDATE
 * policy for anyone — that is deliberate, the two functions are the only write
 * path for decisions. This is not a decision; it is a note for whoever sweeps.
 * Best-effort by design: it must never turn a committed review into an error.
 */
async function recordOrphan(
  admin: ReturnType<typeof createServiceRoleClient>,
  submissionId: string,
  path: string,
): Promise<void> {
  try {
    await admin
      .from('hr_staff_photo_submissions')
      .update({ orphaned_object: path })
      .eq('id', submissionId);
  } catch (e) {
    console.error('[hr/staff-photo/review] could not record orphan:', path, e);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }

  let body: { submission_id?: string; approve?: boolean; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Malformed request.' }, { status: 400 });
  }

  const { submission_id, approve, note } = body;
  if (!submission_id || typeof approve !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'A submission and a decision are both required.' },
      { status: 400 },
    );
  }

  // Step 1 — visible to this reviewer at all?
  const { data: sub, error: readErr } = await supabase
    .from('hr_staff_photo_submissions')
    .select('id, staff_id, storage_path, status')
    .eq('id', submission_id)
    .maybeSingle<{ id: string; staff_id: string; storage_path: string; status: string }>();

  if (readErr) {
    return NextResponse.json({ success: false, error: readErr.message }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json(
      {
        success: false,
        error: 'That photograph is not one you can review. Ask a super admin if you believe it should be.',
      },
      { status: 403 },
    );
  }
  if (sub.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `This photograph has already been ${sub.status}.` },
      { status: 409 },
    );
  }

  const admin = createServiceRoleClient();

  // --- Rejection needs no file movement --------------------------------------
  if (!approve) {
    const { data, error } = await supabase.rpc('fn_review_staff_photo_submission', {
      p_submission_id: submission_id,
      p_approve: false,
      p_public_url: null,
      p_note: note ?? null,
    });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    // The rejected picture has no further use and is a photograph of a person.
    const cleaned = await removeObject(admin, PRIVATE_BUCKET, sub.storage_path);
    if (!cleaned) await recordOrphan(admin, submission_id, sub.storage_path);
    return NextResponse.json({
      success: true,
      result: data,
      status: 'rejected',
      // Surfaced rather than swallowed: the decision stands either way, but a
      // photograph nobody agreed to keep is still sitting in the bucket.
      pending_copy_removed: cleaned,
    });
  }

  // --- Step 2: private -> public ---------------------------------------------
  const { data: fileBlob, error: dlErr } = await admin.storage
    .from(PRIVATE_BUCKET)
    .download(sub.storage_path);

  if (dlErr || !fileBlob) {
    return NextResponse.json(
      { success: false, error: 'The submitted photograph could not be read back.' },
      { status: 500 },
    );
  }

  // Path carries the staff id, which the review function checks for: an
  // approved URL must belong to the person it is being set on.
  const publicPath = `${sub.staff_id}/${Date.now()}.jpg`;
  const { error: upErr } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, fileBlob, { upsert: false, contentType: 'image/jpeg' });

  if (upErr) {
    return NextResponse.json(
      { success: false, error: 'The photograph could not be published. Nothing was changed.' },
      { status: 500 },
    );
  }

  const { data: urlData } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath);
  const publicUrl = urlData?.publicUrl ?? null;

  if (!publicUrl) {
    await removeObject(admin, PUBLIC_BUCKET, publicPath);
    return NextResponse.json(
      { success: false, error: 'The photograph could not be published. Nothing was changed.' },
      { status: 500 },
    );
  }

  // --- Step 3: the decision, re-checked in the database ----------------------
  const { data, error } = await supabase.rpc('fn_review_staff_photo_submission', {
    p_submission_id: submission_id,
    p_approve: true,
    p_public_url: publicUrl,
    p_note: note ?? null,
  });

  if (error) {
    // Step 4 — undo the publish. Checked, unlike the first version: this bucket
    // is PUBLIC, so an object left here after a refused approval is a
    // world-readable photograph of a person. That is a worse orphan than the
    // private one and it was going unrecorded.
    const undone = await removeObject(admin, PUBLIC_BUCKET, publicPath);
    if (!undone) await recordOrphan(admin, submission_id, publicPath);
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }

  // The pending copy has served its purpose; the approved one is the record.
  const cleaned = await removeObject(admin, PRIVATE_BUCKET, sub.storage_path);
  if (!cleaned) await recordOrphan(admin, submission_id, sub.storage_path);

  return NextResponse.json({
    success: true,
    result: data,
    status: 'approved',
    photo_url: publicUrl,
    pending_copy_removed: cleaned,
  });
}
