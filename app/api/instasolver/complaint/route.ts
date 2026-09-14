// app/api/instasolver/complaint/route.ts
// ============================================================================
// Insta Solver — file a complaint from any login.
//
// Decisions (Director, 2026-09-14): I1 anyone signed in may file · I7 filing
// without a name is allowed and returns a private code · I8 a complaint about
// the filer's own head of department or manager goes past them.
// The rules themselves live in lib/instasolver/complaint.ts; this file is the
// door: authenticate, validate, write once, answer explicitly.
//
// ── WHY A SERVICE-ROLE WRITE ────────────────────────────────────────────────
// Same posture as app/api/campus-walk/observations/route.ts. The gate is the
// code below, not RLS: grievance_tickets_insert admits an authenticated caller
// but has no branch that understands "this row must be hidden from the person
// it names", and an anonymous filing writes columns (is_anonymous,
// anonymous_token) that the filer must never be able to set for somebody
// else's row. Establishing identity here and writing with the elevated client
// keeps that decision in one readable place.
//
// ── WHY NO HEAD-OF-DEPARTMENT NOTIFICATION FIRES FOR I8 ─────────────────────
// This was checked rather than assumed, because "suppress the notification"
// only means something if a notification exists:
//   1. LCIssueService.createLCIssue sends none. The Learners Council service
//      notifies on ASSIGN (assignIssue) and on STATUS CHANGE, never on create.
//      This route pre-assigns inside the insert instead of calling assignIssue
//      afterwards, so the assignment notification is never reached — that is
//      the gate, and it is why the assignment is an insert field rather than a
//      follow-up call.
//   2. No INSERT trigger on grievance_tickets sends anything. The only trigger
//      is emit_grievance_evidence_on_resolve, AFTER UPDATE OF status.
//   3. The dashboard work-item generator (fn_generate_unresolved_*_items)
//      targets COALESCE(assigned_to, the institution's Director) — never the
//      filer's department head. Tickets from this route also carry no
//      department_id, so there is no department path to walk to him either.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { LCIssueService } from '@/lib/services/learners-council/issue-service';
import { validateGrievanceDescription } from '@/lib/validations/grievance-ticket';
import {
  INSTASOLVER_SOURCE,
  mapRoleToRaisedByType,
  mintAnonymousToken,
  readComplaintCategories,
  resolveSuperiorRouteProfileId,
  validateSubject,
} from '@/lib/instasolver/complaint';

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

interface ComplaintBody {
  category_id?: unknown;
  subject?: unknown;
  description?: unknown;
  anonymous?: unknown;
  about_superior?: unknown;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail('You are not signed in. Sign in and try again.', 401);
  }

  // ── I1: any login with a profile, no role check ───────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return fail(
      'Your account is signed in but has no profile on this platform, so a complaint cannot be filed against your name yet. Contact the IT helpdesk.',
      403
    );
  }

  const institutionId = profile.institution_id;
  if (!institutionId) {
    return fail(
      'Your account is not linked to a college yet, so there is nowhere to send this complaint. Contact the IT helpdesk to have your college set on your profile.',
      403
    );
  }

  let body: ComplaintBody;
  try {
    body = (await request.json()) as ComplaintBody;
  } catch {
    return fail('Expected a JSON body.', 400);
  }

  const categoryId = typeof body.category_id === 'string' ? body.category_id.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const wantsAnonymous = body.anonymous === true;
  const aboutSuperior = body.about_superior === true;

  if (!categoryId) {
    return fail('Please choose what this complaint is about.', 400);
  }

  const subjectError = validateSubject(subject);
  if (subjectError) {
    return fail(subjectError, 400, { field: 'subject' });
  }

  // Mirrors grievance_tickets_description_check exactly once, from the module
  // that already owns that mirror — so this route cannot drift from the form.
  const descriptionError = validateGrievanceDescription(description);
  if (descriptionError) {
    return fail(descriptionError, 400, { field: 'description' });
  }

  const admin = createServiceRoleClient();

  // ── The category must be this person's own institution's ──────────────────
  // grievance_categories.institution_id is NOT NULL in the live schema, so
  // there are no platform-wide categories to admit alongside them.
  const { categories, anonymousColumnPresent } = await readComplaintCategories(admin, institutionId);
  const category = categories.find((c) => c.id === categoryId);

  if (!category) {
    return fail(
      'That is not a complaint type your college offers. Reload the page and pick one from the list.',
      422,
      { field: 'category_id' }
    );
  }

  // ── I7: filing without a name ─────────────────────────────────────────────
  let anonymousToken: string | null = null;

  if (wantsAnonymous) {
    if (!anonymousColumnPresent) {
      return fail('Anonymous filing opens once the database update lands', 503);
    }
    if (!category.allow_anonymous) {
      return fail(
        `"${category.name}" has to be filed with your name on it. Choose a different type, or file this one normally.`,
        422,
        { field: 'category_id' }
      );
    }
    anonymousToken = mintAnonymousToken();
  }

  // ── I8: a complaint about the filer's own head of department or manager ───
  let assignedTo: string | null = null;
  let notice: string | null = null;
  const extraMetadata: Record<string, unknown> = {};

  if (aboutSuperior) {
    assignedTo = await resolveSuperiorRouteProfileId(supabase);
    if (assignedTo) {
      extraMetadata.routing = 'superior_bypass';
    } else {
      // Fails closed as UNASSIGNED, which the work-item generator hands to the
      // institution's Director — never back to the person it is about.
      extraMetadata.route_pending_policy = true;
      notice = 'Routed to central review; assignment pending';
    }
  }

  let ticket: { ticket_number?: string | null } | null = null;
  try {
    ticket = await LCIssueService.createLCIssue(
      {
        institution_id: institutionId,
        subject,
        description,
        category: categoryId,
        priority: 'medium',
      },
      user.id,
      {
        source: INSTASOLVER_SOURCE,
        client: admin,
        raisedByType: mapRoleToRaisedByType(profile.role),
        isAnonymous: wantsAnonymous,
        anonymousToken,
        assignedTo,
        extraMetadata,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Your complaint could not be filed.';
    console.error('[instasolver/complaint] create failed:', message);
    return fail(message, 400);
  }

  const ticketNumber = ticket?.ticket_number ?? null;

  return NextResponse.json({
    success: true,
    ticket_number: ticketNumber,
    ...(anonymousToken
      ? { tracking_code: anonymousToken, tracking_url: `/instasolver/track/${anonymousToken}` }
      : {}),
    ...(notice ? { notice } : {}),
  });
}
