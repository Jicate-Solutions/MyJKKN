export const dynamic = 'force-dynamic';

// app/api/learners-council/members/[id]/change-position/route.ts
// POST /api/learners-council/members/:id/change-position — move a sitting
// Learners Council member from the seat they hold to a different one.
//
// WHY A ROUTE AND NOT A DIRECT UPDATE
// -----------------------------------
// Two reasons, and the second is the important one.
//
// 1. It is not one write. Moving a member is "end the old seat, open the new
//    one", which is two statements that must not half-happen. Doing it from
//    the browser means a network drop between them leaves a council member
//    holding no seat at all, or holding two.
//
// 2. lc_members carries no policy this codebase can point at, so what a
//    non-admin browser session may write to it is not something the
//    application can state with confidence. The Learners Council issues board
//    shipped with exactly that assumption and every write an office bearer
//    made was silently refused — 0 rows, for months, reported as a message
//    about JSON shape. This route does not repeat that: authorisation is
//    decided here, in the open, and the write itself runs with a service-role
//    client so its outcome does not depend on a policy nobody has read.
//
// WHY THE OLD ROW IS ENDED RATHER THAN EDITED
// -------------------------------------------
// The obvious implementation is `UPDATE lc_members SET position_id = ...`.
// This route deliberately does not do that. lc_members IS the council's
// history — the Positions tab has a "who has held this seat" viewer that reads
// it, and rewriting position_id in place would make a past holder vanish from
// the seat they actually held. A governance record that quietly rewrites the
// past is worse than one that is tedious to update. So the move is recorded as
// what it is: one appointment ended, another begun, both rows kept.
//
// THE SEAT RULE THIS MUST RESPECT
// -------------------------------
// `lc_members_one_active_holder_per_seat` is a partial unique index on
// (term_id, position_id) WHERE status = 'active'. A second active holder of a
// filled seat raises 23505. This route checks occupancy first so the caller
// gets the sitting holder's name instead of a raw constraint violation, and
// the index remains the backstop if that check races.

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

// The same five roles the Members and Positions screens already gate their
// controls on. Kept identical on purpose: this route adds a new action, not a
// new class of person who may perform it.
const STRUCTURE_EDITOR_ROLES = ['admin', 'super_admin', 'staff', 'hod', 'principal'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  positionId?: string;
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: memberId } = await params;

  if (!UUID_RE.test(memberId)) {
    return NextResponse.json({ error: 'Invalid member id' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const newPositionId = body.positionId;
  if (!newPositionId || !UUID_RE.test(newPositionId)) {
    return NextResponse.json({ error: 'Pick a position to move them to.' }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  // ── 1. May this caller edit the council's structure? ─────────────────────
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[lc/members] Caller profile lookup failed:', profileError);
    return NextResponse.json({ error: 'Could not confirm your access. Try again.' }, { status: 500 });
  }

  const mayEdit =
    profile?.is_super_admin === true ||
    STRUCTURE_EDITOR_ROLES.includes(profile?.role ?? '');

  if (!mayEdit) {
    return NextResponse.json(
      {
        error:
          'You do not have permission to change council positions. This needs ' +
          'an administrator, principal, HOD or staff account.'
      },
      { status: 403 }
    );
  }

  // ── 2. The member being moved ────────────────────────────────────────────
  const { data: member, error: memberError } = await admin
    .from('lc_members')
    .select('id, term_id, position_id, user_id, institution_id, status')
    .eq('id', memberId)
    .maybeSingle();

  if (memberError) {
    console.error('[lc/members] Member lookup failed:', memberError);
    return NextResponse.json({ error: 'Could not load that member. Try again.' }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  if (member.position_id === newPositionId) {
    return NextResponse.json(
      { error: 'They already hold that position.' },
      { status: 400 }
    );
  }
  if (member.status !== 'active') {
    return NextResponse.json(
      {
        error:
          'This appointment has already ended, so there is nothing to move. ' +
          'Use Assign Member to give them a new seat.'
      },
      { status: 400 }
    );
  }

  // ── 3. The seat they are moving into ─────────────────────────────────────
  const { data: position, error: positionError } = await admin
    .from('lc_positions')
    .select('id, title, category, max_holders, is_active')
    .eq('id', newPositionId)
    .maybeSingle();

  if (positionError) {
    console.error('[lc/members] Position lookup failed:', positionError);
    return NextResponse.json({ error: 'Could not load that position. Try again.' }, { status: 500 });
  }
  if (!position) {
    return NextResponse.json({ error: 'Position not found' }, { status: 404 });
  }
  if (position.is_active === false) {
    return NextResponse.json(
      { error: `"${position.title}" is retired and cannot be filled.` },
      { status: 400 }
    );
  }

  // Occupancy, checked here so the caller is told WHO is sitting there rather
  // than being handed a unique-violation from the index. Floored at 1 because
  // max_holders has no CHECK constraint and a stored 0 would otherwise block
  // every seat — the same reasoning the assign dialog already uses.
  const { data: sitting, error: sittingError } = await admin
    .from('lc_members')
    .select('id, user:profiles!user_id(full_name)')
    .eq('term_id', member.term_id)
    .eq('position_id', newPositionId)
    .eq('status', 'active');

  if (sittingError) {
    console.error('[lc/members] Occupancy check failed:', sittingError);
    return NextResponse.json({ error: 'Could not check that seat. Try again.' }, { status: 500 });
  }

  const capacity = Math.max(1, position.max_holders ?? 1);
  if ((sitting?.length ?? 0) >= capacity) {
    const holder =
      (sitting?.[0] as { user?: { full_name?: string | null } | null })?.user?.full_name?.trim() ||
      'someone';
    return NextResponse.json(
      {
        error:
          `"${position.title}" is already held by ${holder}. End that ` +
          `appointment first, then move this member in.`
      },
      { status: 409 }
    );
  }

  // ── 4. End the old seat, then open the new one ───────────────────────────
  //
  // Order matters. Ending first frees (term_id, position_id) on the OLD seat,
  // and the new seat was just confirmed free, so the insert cannot collide.
  // Doing it the other way round would briefly leave the member holding two
  // active seats, which is exactly the state the September index exists to
  // make impossible.
  const now = new Date().toISOString();

  const { error: endError } = await admin
    .from('lc_members')
    .update({
      status: 'inactive',
      ended_at: now,
      appointment_notes: `Moved to ${position.title} on ${now.slice(0, 10)}`
    })
    .eq('id', memberId)
    .eq('status', 'active'); // no-op if someone else ended it first

  if (endError) {
    console.error('[lc/members] Ending the old appointment failed:', endError);
    return NextResponse.json(
      { error: 'Could not end the current appointment. Nothing was changed.' },
      { status: 500 }
    );
  }

  const { data: created, error: createError } = await admin
    .from('lc_members')
    .insert({
      term_id: member.term_id,
      position_id: newPositionId,
      user_id: member.user_id,
      institution_id: member.institution_id,
      status: 'active',
      appointed_at: now,
      appointment_notes: body.notes?.trim() || position.title
    })
    .select(
      `
      *,
      position:lc_positions!position_id(id, title, category, tier),
      user:profiles!user_id(id, full_name, email, avatar_url),
      term:lc_terms(id, name, status)
    `
    )
    .maybeSingle();

  if (createError || !created) {
    // The old seat was already ended. Put it back rather than leaving a
    // council member holding nothing — a half-applied move is the one outcome
    // this route must not produce.
    console.error('[lc/members] New appointment failed, rolling back:', createError);

    const { error: rollbackError } = await admin
      .from('lc_members')
      .update({ status: 'active', ended_at: null })
      .eq('id', memberId);

    if (rollbackError) {
      console.error('[lc/members] ROLLBACK FAILED — member left with no seat:', memberId, rollbackError);
      return NextResponse.json(
        {
          error:
            'The move failed and could not be undone. This member now holds no ' +
            'seat. Reassign them manually and report this.'
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Could not create the new appointment. Nothing was changed.' },
      { status: 500 }
    );
  }

  // ── 5. Keep lc_position_history in step ──────────────────────────────────
  //
  // The Positions tab's "who has held this seat" viewer reads
  // lc_position_history, NOT lc_members. assignMember() opens a row there and
  // updateMemberStatus() closes it, so a move that skipped this would leave
  // the old seat looking permanently occupied by this member and the new seat
  // looking as though nobody ever took it.
  //
  // Deliberately after the move and deliberately non-fatal: the appointment
  // itself is already correct, and the existing service treats a history write
  // the same way. A failure here is logged loudly rather than rolling back a
  // move that succeeded.
  try {
    const { error: closeError } = await admin
      .from('lc_position_history')
      .update({ ended_at: now, end_reason: 'position_change' })
      .eq('user_id', member.user_id)
      .eq('position_id', member.position_id)
      .eq('term_id', member.term_id)
      .is('ended_at', null);

    if (closeError) {
      console.warn('[lc/members] Could not close old position history:', closeError);
    }

    const { error: openError } = await admin.from('lc_position_history').insert({
      position_id: newPositionId,
      user_id: member.user_id,
      term_id: member.term_id,
      started_at: now
    });

    if (openError) {
      console.warn('[lc/members] Could not open new position history:', openError);
    }
  } catch (historyErr) {
    console.warn('[lc/members] Position history bookkeeping failed:', historyErr);
  }

  return NextResponse.json({ member: created }, { status: 200 });
}
