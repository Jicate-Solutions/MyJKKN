// POST /api/events/tournament/[eventId]/spot-entry
// An ORGANISER registers someone at the venue (2026-10-06). Self-service
// registration (public-register) is the only other way an entry is created;
// this path exists for walk-ins after the window closed and is gated on manage
// access instead of the window. Everything else public-register enforces still
// applies here:
//   - doubles needs exactly two named players; a team needs a roster;
//   - division eligibility (students-only / gender / age) — a JKKN learner is
//     linked by register or roll number so students-only divisions can check it;
//   - a division with an entry fee needs the fee collected at the desk first
//     (method + reference), recorded as paid offline. No unpaid spot entries.
// The organiser who added it is recorded (events_registrations.registered_by,
// custom_data.spot_entry, and a note on the entry). Custom registration-form
// questions are not asked here — they belong to the self-service form.
// Writes go through fn_tournament_add_spot_entry: one transaction under the
// division lock, idempotent per request_key, one active entry per learner.
// A new entry is not placed in an already generated bracket; the organiser
// places it with "Edit teams" / "Fill bye" (fn_tournament_set_match_side).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import { checkEligibility, type EligibilitySubject } from '@/lib/services/events/tournament/eligibility';
import {
  DOUBLES_ROSTER_SIZE,
  SPOT_ENTRY_PAYMENT_METHODS,
  divisionPlayType,
  isTeamDivision,
} from '@/types/tournament';
import type { CreateSpotEntryDto, EligibilityRules } from '@/types/tournament';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Event statuses that no longer take entries (events status CHECK values). */
const CLOSED_EVENT_STATUSES = ['draft', 'cancelled', 'post_event', 'archived'];
const GENDERS = ['male', 'female', 'other'];
const MEMBER_ROLES = ['captain', 'player', 'substitute', 'coach', 'manager'];

/** A trimmed string, or null for blank / non-string input. */
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'A JSON object body is required' }, { status: 400 });
    }
    const dto = raw as CreateSpotEntryDto;
    if (typeof dto.request_key !== 'string' || !UUID_RE.test(dto.request_key)) {
      return NextResponse.json({ error: 'request_key must be a uuid' }, { status: 400 });
    }
    if (typeof dto.division_id !== 'string' || !UUID_RE.test(dto.division_id)) {
      return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    }
    const entryName = typeof dto.entry_name === 'string' ? dto.entry_name.trim() : '';
    if (!entryName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    // Typed checks before eligibility sees them.
    const age = dto.participant_age;
    if (age != null && (!Number.isInteger(age) || age < 3 || age > 100)) {
      return NextResponse.json({ error: 'Age must be a whole number between 3 and 100' }, { status: 400 });
    }
    const gender = typeof dto.participant_gender === 'string' && dto.participant_gender.trim()
      ? dto.participant_gender.trim().toLowerCase()
      : null;
    if (gender && !GENDERS.includes(gender)) {
      return NextResponse.json({ error: 'Gender must be male, female or other' }, { status: 400 });
    }
    if (dto.members != null && !Array.isArray(dto.members)) {
      return NextResponse.json({ error: 'members must be a list' }, { status: 400 });
    }

    const svc = createServiceRoleClient();


    const { data: ev } = await (svc as any)
      .from('events')
      .select('id, status')
      .eq('id', eventId)
      .eq('event_type', 'sports_tournament')
      .maybeSingle();
    if (!ev || CLOSED_EVENT_STATUSES.includes(ev.status)) {
      return NextResponse.json({ error: 'This tournament is not taking entries' }, { status: 404 });
    }

    const { data: division } = await (svc as any)
      .from('tournament_divisions')
      .select('id, sport, eligibility, config, is_active')
      .eq('id', dto.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) return NextResponse.json({ error: 'Division not found' }, { status: 404 });
    if (division.is_active === false) {
      return NextResponse.json({ error: 'This division is closed' }, { status: 422 });
    }
    const rules = (division.eligibility ?? {}) as EligibilityRules;

    // Team vs individual follows the division, never the caller.
    const entryType: 'team' | 'individual' = isTeamDivision(division) ? 'team' : 'individual';
    // Roster names only: a client-supplied learner_id is never trusted on this
    // service-role path, the role is limited to the DB's values, jersey is short text.
    const members = (dto.members ?? [])
      .filter((m) => m && typeof m.member_name === 'string' && m.member_name.trim())
      .map((m) => ({
        member_name: m.member_name.trim().slice(0, 120),
        jersey_no: typeof m.jersey_no === 'string' && m.jersey_no.trim() ? m.jersey_no.trim().slice(0, 10) : null,
        role: typeof m.role === 'string' && MEMBER_ROLES.includes(m.role) ? m.role : 'player',
      }));
    if (divisionPlayType(division.config) === 'doubles' && members.length !== DOUBLES_ROSTER_SIZE) {
      return NextResponse.json(
        { error: `A doubles entry needs exactly ${DOUBLES_ROSTER_SIZE} players.` },
        { status: 400 }
      );
    }
    if (entryType === 'team' && members.length === 0) {
      return NextResponse.json({ error: 'A team entry needs at least one roster member' }, { status: 400 });
    }

    // ---- optional JKKN learner link (the player, or the team captain) ----
    let learner: {
      id: string;
      gender: string | null;
      date_of_birth: string | null;
      institution_id: string | null;
    } | null = null;
    const regNo = str(dto.learner_register_number);
    if (regNo) {
      // Goes into a PostgREST filter string, so only the characters a register
      // or roll number uses — a comma or bracket would change the filter.
      if (!/^[A-Za-z0-9/.-]{2,40}$/.test(regNo)) {
        return NextResponse.json({ error: 'Register / roll number has unexpected characters' }, { status: 400 });
      }
      if (dto.is_external) {
        return NextResponse.json(
          { error: 'An external entry cannot carry a JKKN register number' },
          { status: 400 }
        );
      }
      const { data: found } = await (svc as any)
        .from('learners_profiles')
        .select('id, gender, date_of_birth, institution_id')
        .or(`register_number.ilike.${regNo},roll_number.ilike.${regNo}`)
        .limit(2);
      if (!found?.length) {
        return NextResponse.json({ error: `No JKKN learner found with number ${regNo}` }, { status: 422 });
      }
      if (found.length > 1) {
        return NextResponse.json(
          { error: `${regNo} matches more than one learner — check the number` },
          { status: 422 }
        );
      }
      learner = found[0];
    }

    // ---- eligibility (same rules as self-registration) ----
    const subject: EligibilitySubject = {
      isLearner: !!learner,
      gender: learner?.gender ?? gender,
      dateOfBirth: learner?.date_of_birth ?? null,
      age: age ?? null,
      label: entryName,
    };
    const elig = checkEligibility(rules, subject);
    if (!elig.ok) return NextResponse.json({ error: elig.reason }, { status: 422 });

    // ---- fee: a spot entry in a fee division is paid at the desk, first ----
    const fee = Number((division.config as any)?.entry_fee ?? 0) || 0;
    const methodLabel = SPOT_ENTRY_PAYMENT_METHODS.find((m) => m.value === dto.payment_method)?.label ?? null;
    const reference = str(dto.payment_reference);
    if (fee > 0) {
      if (dto.fee_collected !== true || !methodLabel) {
        return NextResponse.json(
          { error: `This division has an entry fee of ₹${fee}. Collect it and record how it was paid.` },
          { status: 422 }
        );
      }
      if (dto.payment_method !== 'cash' && !reference) {
        return NextResponse.json(
          { error: `Enter the ${methodLabel} transaction reference.` },
          { status: 422 }
        );
      }
    }

    const { data: organiser } = await (svc as any)
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const organiserName = organiser?.full_name?.trim() || 'an organiser';
    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    const institutionId = dto.is_external ? null : (learner?.institution_id ?? null);
    const institutionName = str(dto.institution_name);

    // One transaction under the division lock (fn_tournament_add_spot_entry):
    // the same request_key returns its first entry, a learner already entered in
    // this division is refused, and registration + entry + roster land together.
    const { data: made, error: rpcErr } = await (svc as any).rpc('fn_tournament_add_spot_entry', {
      p_actor: user.id,
      p_event_id: eventId,
      p_division_id: dto.division_id,
      p_request_key: dto.request_key,
      p_entry_type: entryType,
      p_entry_name: entryName,
      p_learner_id: learner?.id ?? null,
      p_is_external: !!dto.is_external,
      p_institution_id: institutionId,
      p_institution_name: institutionName,
      p_phone: str(dto.participant_phone),
      p_age: age ?? null,
      p_gender: learner?.gender ?? gender,
      p_members: entryType === 'team' ? members : null,
      p_fee: fee,
      p_payment_reference: fee > 0 ? (reference ?? `${methodLabel} at the desk`) : null,
      p_custom_data: {
        spot_entry: {
          added_by: user.id,
          added_by_name: organiserName,
          fee_method: fee > 0 ? dto.payment_method : null,
        },
      },
      p_notes: `Spot entry added by ${organiserName} on ${today}`,
    });
    if (rpcErr) {
      if (/learner_already_entered/.test(rpcErr.message ?? '')) {
        return NextResponse.json(
          { error: `${regNo} already has an entry in this division` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: rpcErr.message || 'Failed to add the entry' }, { status: 500 });
    }
    const result = made as { entry_id: string; access_code: string | null; duplicate: boolean };
    // duplicate = this exact form was already saved (double click / lost response):
    // nothing new was written, and the caller is told so rather than "added".
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add the entry' },
      { status: 500 }
    );
  }
}
