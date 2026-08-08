export const dynamic = 'force-dynamic';

// /api/school-of-influence/apply  — the School of Influence application door
// (spec §7 S4). Spec: specs/school-of-influence-batches-2026-07-30.md
//
//   GET  ?eventId=…   the apply context: who you are, whether you may apply,
//                     the batches, the questions — and, when you may not, the
//                     REASON, as a sentence meant to be read on screen.
//   POST { eventId, answers, batchCohortId? }
//                     records ONE application for the signed-in person.
//
// SELF-APPLICATION ONLY. Identity comes from the session and nowhere else — the
// body has no name, email, profile id or learner id, and none would be read if
// it did. This is the structural fix for the failure spec §1 names: SF100's 23
// fabricated roster rows were typed in by somebody registering OTHER people.
//
// Every refusal is answered with a real status and a message the page prints
// verbatim (CLAUDE.md rule 27 — never a silent redirect, never an empty form).
//
// This endpoint NEVER grants access. It creates an application; acceptance is
// S5's, and membership in a batch is the access gate (D6).

import { NextRequest, NextResponse } from 'next/server';
import {
  buildSoiApplyContext,
  submitSoiApplication,
  type SoiApplySubmission,
} from '@/lib/services/school-of-influence/apply-service';
import { alertCooWhenNoActiveCoordinator } from '@/lib/services/cohorts/coordinator-notifications';
import { createServiceRoleClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')?.trim() ?? '';
  if (!UUID_RE.test(eventId)) {
    return NextResponse.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  try {
    const context = await buildSoiApplyContext(eventId);
    // Always 200: a refusal is DATA here, not a transport failure. The page has
    // to render the reason, and an error status would push it into a generic
    // "something went wrong" branch that hides exactly what the applicant needs
    // to read. POST is where a refusal becomes a status code.
    return NextResponse.json(context, { status: 200 });
  } catch (error) {
    console.error('SoI apply: failed to build the apply context', error);
    return NextResponse.json(
      { error: 'Could not load the application form. Please try again in a moment.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    eventId?: string;
    answers?: Record<string, unknown> | null;
    batchCohortId?: string | null;
  };

  const eventId = (body.eventId ?? '').trim();
  if (!UUID_RE.test(eventId)) {
    return NextResponse.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  // Exactly two things are carried across from the client. Anything else in the
  // body is dropped here, so it cannot reach a write.
  const submission: SoiApplySubmission = {
    answers: body.answers ?? {},
    batchCohortId:
      typeof body.batchCohortId === 'string' && UUID_RE.test(body.batchCohortId)
        ? body.batchCohortId
        : null,
  };

  try {
    const { result, refusal } = await submitSoiApplication(eventId, submission);
    if (refusal) {
      return NextResponse.json(
        { error: refusal.message, code: refusal.code },
        { status: refusal.status }
      );
    }
    // D8 — an application has landed. If NOBODY is appointed to read it, the COO
    // hears about it now rather than when someone notices the queue standing
    // still. At most one message per programme per day (the idempotency key
    // carries the date), and it can never affect the applicant: the application
    // is already recorded, so a failure here is swallowed and logged.
    try {
      await alertCooWhenNoActiveCoordinator(createServiceRoleClient(), 'school_of_influence');
    } catch (notifyError) {
      console.error('SoI apply: could not check for a missing coordinator', notifyError);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('SoI apply: failed to record the application', error);
    return NextResponse.json(
      { error: 'Could not record your application. Please try again in a moment.' },
      { status: 500 }
    );
  }
}
