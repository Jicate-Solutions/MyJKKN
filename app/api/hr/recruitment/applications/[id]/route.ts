export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { getErrorMessage } from '@/lib/utils';
import { purgeRejectedApplicant } from '../../_lib/purge-rejected-applicant';

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

/**
 * One application, for the screening detail page.
 *
 * No explicit permission check here on purpose: the RLS policy
 * "HR can view applications for their institution jobs" already gates this on
 * hr.recruitment.view AND role_has_institution_access(institution_id), and the
 * applicant themself is covered by "Applicant can view own application".
 * A row the caller may not see comes back as null -> 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const application = await RecruitmentService.getJobApplication(supabase, id);
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    return NextResponse.json({ data: application });
  } catch (err) {
    console.error('[hr/recruitment/applications/:id] GET error', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/** Longest screening note we accept — matches the detail page's counter. */
const MAX_REVIEW_NOTE_LENGTH = 2000;

/**
 * Two shapes, deliberately distinguished by the presence of `status`:
 *
 *   1. Screening decision — { status: 'reviewed'|'shortlisted'|'rejected', review_notes? }
 *      Omitting review_notes leaves the stored note untouched (see
 *      reviewJobApplication); only an explicit null clears it.
 *
 *   2. Note-only edit — { review_notes: string | null }, from the application
 *      detail page. Touches nothing but the note: no status change, no
 *      reviewed_at stamp, and allowed on promoted applicants.
 *
 * Both are RLS-gated on hr.recruitment.edit + role_has_institution_access.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // ---- Shape 2: note-only edit -------------------------------------------
    if (body.status === undefined) {
      if (!('review_notes' in body)) {
        return NextResponse.json(
          { error: 'Provide a status to record a screening decision, or review_notes to edit the note.' },
          { status: 400 }
        );
      }
      const raw = body.review_notes;
      if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json({ error: 'review_notes must be a string or null' }, { status: 400 });
      }
      // Blank input means "clear the note", not "store an empty string".
      const trimmed = raw === null ? null : raw.trim() || null;
      if (trimmed && trimmed.length > MAX_REVIEW_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `Note must be ${MAX_REVIEW_NOTE_LENGTH} characters or fewer.` },
          { status: 400 }
        );
      }

      const updated = await RecruitmentService.updateApplicationNotes(supabase, id, trimmed);
      return NextResponse.json({ data: updated });
    }

    // ---- Shape 1: screening decision ---------------------------------------
    if (!['reviewed', 'shortlisted', 'rejected'].includes(body.status)) {
      return NextResponse.json(
        { error: "status must be one of 'reviewed', 'shortlisted', 'rejected'" },
        { status: 400 }
      );
    }

    const updated = await RecruitmentService.reviewJobApplication(
      supabase, id, user.id, body.status, body.review_notes
    );
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/applications/:id] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

/**
 * Permanently erase a REJECTED applicant — super admins only.
 *
 * Removes the application row, the promoted candidate row (its interviews,
 * scorecards, packages and comments cascade) and the resume file in Google Drive.
 * Authorization and the rejected-only guard both live in the SECURITY DEFINER RPC,
 * so this handler cannot be tricked by a forged client. Irreversible.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await purgeRejectedApplicant(supabase, { applicationId: id });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/applications/:id] DELETE error', err);
    // The RPC's guard messages are what the user sees, and a PostgrestError is a
    // plain object — `err instanceof Error` would swallow them as "Unknown error".
    // 42501 = "not a super admin" / "not rejected"; P0002 = already deleted.
    const code = (err as { code?: string })?.code;
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: code === '42501' ? 403 : code === 'P0002' ? 404 : 400 }
    );
  }
}
