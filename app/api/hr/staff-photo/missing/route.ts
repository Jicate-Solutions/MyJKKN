// app/api/hr/staff-photo/missing/route.ts
//
// Who still has no usable photograph — the chase list.
//
// WHY THIS EXISTS
//   The tool that lets people photograph themselves does not, on its own,
//   produce photographs. Somebody has to know who to ask. The equivalent list
//   for learners has existed since 2026-08-26
//   (app/(routes)/admin/id-cards/photo-check) and is what turns a printer
//   refusal at the counter into a job somebody can do beforehand. There has
//   never been one for staff, which is a fair part of why coverage sat where it
//   did.
//
// WHY IT REUSES THE PRINTER'S OWN TEST
//   "Missing" is decided by isRenderablePhotoRef() from lib/id-cards/
//   photo-quality.ts — the SAME function the card guard uses. A list built on
//   `profile_picture IS NULL` would disagree with the printer the moment a row
//   holds a non-empty value the renderer cannot draw, and would then send
//   nobody to chase the people actually being turned away. Agreeing by
//   construction beats agreeing by coincidence.
//
//   Its documented limit applies here too: this is a SHAPE test on a stored
//   value, not a fetch. A well-formed URL whose object was deleted counts as
//   present here and still fails at print time. That is the same claim the
//   guard makes, deliberately, not a gap introduced by this list.
//
// SCOPING
//   Rows come back under the caller's own session, so RLS on `staff` decides
//   what they see. A central reviewer whose role carries institution_scope
//   'all' sees all eleven; anyone else sees their own.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isRenderablePhotoRef } from '@/lib/id-cards/photo-quality';

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  designation: string | null;
  profile_picture: string | null;
  institution_id: string;
  institution: { name: string | null } | null;
};

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('staff')
    .select(
      'id, first_name, last_name, staff_id, designation, profile_picture, institution_id, institution:institution_id (name)',
    )
    .eq('is_active', true)
    .order('institution_id', { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  const missing = rows.filter((r) => !isRenderablePhotoRef(r.profile_picture));

  // Grouped by college, because chasing is organised that way — one list per
  // place, handed to the person who can walk over and ask.
  const byInstitution = new Map<
    string,
    { institution_id: string; institution_name: string; total: number; missing: { id: string; name: string; employee_code: string | null; designation: string | null }[] }
  >();

  for (const r of rows) {
    const key = r.institution_id;
    if (!byInstitution.has(key)) {
      byInstitution.set(key, {
        institution_id: key,
        institution_name: r.institution?.name ?? 'Unnamed',
        total: 0,
        missing: [],
      });
    }
    byInstitution.get(key)!.total += 1;
  }

  for (const r of missing) {
    byInstitution.get(r.institution_id)?.missing.push({
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed',
      employee_code: r.staff_id,
      designation: r.designation,
    });
  }

  const groups = [...byInstitution.values()]
    // Worst first: the point of the list is to show where the hole is.
    .sort((a, b) => b.missing.length - a.missing.length);

  return NextResponse.json({
    success: true,
    total_active: rows.length,
    total_missing: missing.length,
    groups,
  });
}
