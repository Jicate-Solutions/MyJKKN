// app/api/hr/staff-photo/queue/route.ts
//
// The reviewer's list: photographs waiting for a yes or a no.
//
// Scoping is NOT done here. The rows come back under the caller's own session,
// so RLS on hr_staff_photo_submissions decides what they can see — a reviewer
// sees their institutions, a super admin sees all, anyone else sees only their
// own submissions. Re-filtering in this route would be a second, weaker copy of
// a rule that already exists in the database.
//
// The images themselves live in a private bucket, so each row carries a
// short-lived signed link minted here. Nothing about a pending photograph is
// reachable without one.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'hr-staff-photo-submissions';
const SIGNED_URL_SECONDS = 60 * 10;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }

  // A comma list is accepted so a person can be shown their own LATEST
  // submission whatever became of it. Without that, a rejected photograph
  // simply vanishes from their screen and they resubmit the same problem —
  // which is work for them and a second review for HR.
  const raw = request.nextUrl.searchParams.get('status') ?? 'pending';
  const statuses = raw.split(',').map((x) => x.trim()).filter(Boolean);
  const allowed = ['pending', 'approved', 'rejected'];
  if (statuses.length === 0 || statuses.some((x) => !allowed.includes(x))) {
    return NextResponse.json({ success: false, error: 'Unknown status filter.' }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from('hr_staff_photo_submissions')
    .select(
      // NOTE staff.staff_id is the TEXT employee code, not a foreign key, and sits
      // confusingly beside staff.id which is the uuid this row points at. There
      // is no employee_code column.
      'id, staff_id, institution_id, storage_path, status, submitted_at, reviewed_at, review_note, staff:staff_id (first_name, last_name, profile_picture, staff_id, designation)',
    )
    .in('status', statuses)
    // Oldest first for a reviewer working a queue; the caller sorts if it wants
    // its own most recent instead.
    .order('submitted_at', { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];

  // Zero rows is a legitimate answer here — an empty queue and "you may see
  // nothing" look identical on purpose, because RLS is what decided.
  if (list.length === 0) {
    return NextResponse.json({ success: true, submissions: [], count: 0 });
  }

  const admin = createServiceRoleClient();
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(
      list.map((r) => (r as { storage_path: string }).storage_path),
      SIGNED_URL_SECONDS,
    );

  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  const submissions = list.map((r) => {
    const row = r as unknown as {
      id: string;
      staff_id: string;
      storage_path: string;
      status: string;
      submitted_at: string;
      reviewed_at: string | null;
      review_note: string | null;
      staff: {
        first_name: string | null;
        last_name: string | null;
        profile_picture: string | null;
        staff_id: string | null;
        designation: string | null;
      } | null;
    };
    return {
      id: row.id,
      staff_id: row.staff_id,
      name: [row.staff?.first_name, row.staff?.last_name].filter(Boolean).join(' ') || 'Unnamed',
      // Shown to the reviewer alongside the face. A central reviewer does not
      // know 764 people by sight, so the record details are the only other
      // thing they have to go on — see the header note on what this review can
      // and cannot establish.
      employee_code: row.staff?.staff_id ?? null,
      designation: row.staff?.designation ?? null,
      current_photo: row.staff?.profile_picture ?? null,
      submitted_at: row.submitted_at,
      reviewed_at: row.reviewed_at,
      status: row.status,
      review_note: row.review_note,
      // Null when the signed link could not be minted — the screen shows the
      // row and says the picture could not be loaded rather than hiding a
      // person who is waiting.
      image_url: urlByPath.get(row.storage_path) ?? null,
    };
  });

  return NextResponse.json({ success: true, submissions, count: submissions.length });
}
