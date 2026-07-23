import { NextResponse } from 'next/server';
import {
  getExternalSession,
  externalCanAccessEnrollment,
} from '@/lib/utils/external-access';
import {
  createNote,
  listNotesByInvestor,
  INVESTOR_INTEREST_LEVELS,
  type InvestorInterestLevel,
} from '@/lib/services/startup-studio/sf100-investor-notes-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { corsHeaders } from '@/lib/api-keys/cors';

export const runtime = 'nodejs';

// External investor's private notes on ONE of their ASSIGNED teams.
// These routes carry NO Supabase session (external users have no account) — auth
// is the verified external JWT (getExternalSession) + per-request scope check
// (externalCanAccessEnrollment). NEVER trust a client-supplied enrollmentId.

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function unauth() {
  return NextResponse.json(
    { success: false, error: 'unauthenticated', message: 'Please log in.' },
    { status: 401, headers: corsHeaders }
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, error: 'forbidden', message },
    { status: 403, headers: corsHeaders }
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: 'bad_request', message },
    { status: 400, headers: corsHeaders }
  );
}

/** Is this assigned contact an investor (the only role allowed to leave notes)? */
async function isInvestor(mentorId: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('ss_mentors')
    .select('mentor_type')
    .eq('id', mentorId)
    .maybeSingle();
  return data?.mentor_type === 'investor';
}

/**
 * GET ?enrollmentId= — the logged-in investor's OWN notes on that assigned team,
 * plus canWrite (true iff this contact is an investor). A mentor (non-investor)
 * gets an empty list + canWrite:false.
 */
export async function GET(request: Request) {
  const session = await getExternalSession();
  if (!session) return unauth();

  const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
  if (!enrollmentId) return badRequest('enrollmentId is required');

  const allowed = await externalCanAccessEnrollment(session.mentorId, enrollmentId);
  if (!allowed) return forbidden('You are not assigned to this team.');

  const canWrite = await isInvestor(session.mentorId);
  const notes = canWrite
    ? await listNotesByInvestor(session.mentorId, enrollmentId)
    : [];

  return NextResponse.json(
    { success: true, data: { notes, canWrite } },
    { headers: corsHeaders }
  );
}

/**
 * POST { enrollmentId, note, interestLevel? } — investor leaves a private note on
 * an assigned team. Requires: valid session, assignment to the team, AND
 * mentor_type === 'investor'. created_by is null (account-less external author).
 */
export async function POST(request: Request) {
  const session = await getExternalSession();
  if (!session) return unauth();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  const enrollmentId = (body?.enrollmentId ?? '').trim();
  const note = (body?.note ?? '').trim();
  if (!enrollmentId) return badRequest('enrollmentId is required');
  if (!note) return badRequest('note is required');

  // interestLevel is optional; if present it must be one of the allowed levels.
  let interestLevel: InvestorInterestLevel | null = null;
  if (body?.interestLevel != null && body.interestLevel !== '') {
    if (!INVESTOR_INTEREST_LEVELS.includes(body.interestLevel)) {
      return badRequest(
        `interestLevel must be one of: ${INVESTOR_INTEREST_LEVELS.join(', ')}`
      );
    }
    interestLevel = body.interestLevel;
  }

  const allowed = await externalCanAccessEnrollment(session.mentorId, enrollmentId);
  if (!allowed) return forbidden('You are not assigned to this team.');

  if (!(await isInvestor(session.mentorId))) {
    return forbidden('Only investors can leave notes.');
  }

  const result = await createNote({
    mentorId: session.mentorId,
    enrollmentId,
    note,
    interestLevel,
    createdBy: null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: 'server_error', message: result.message },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { success: true, data: { id: result.id } },
    { status: 201, headers: corsHeaders }
  );
}
