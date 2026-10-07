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
import { insertEntryWithAccessCode } from '../entry-access-code';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Event statuses that no longer take entries (events status CHECK values). */
const CLOSED_EVENT_STATUSES = ['draft', 'cancelled', 'post_event', 'archived'];
const GENDERS = ['male', 'female', 'other'];
const MEMBER_ROLES = ['captain', 'player', 'substitute', 'coach', 'manager'];

/** The entry already created for this form submission (idempotent retry / double click). */
async function existingSpotEntry(svc: any, eventId: string, requestKey: string) {
  const { data: reg } = await svc
    .from('events_registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('source', 'tournament_spot')
    .eq('custom_data->spot_entry->>request_key', requestKey)
    .maybeSingle();
  if (!reg) return null;
  const { data: entry } = await svc
    .from('tournament_entries')
    .select('id, access_code')
    .eq('registration_id', reg.id)
    .maybeSingle();
  return entry ? { entry_id: entry.id as string, access_code: (entry.access_code as string | null) ?? null } : null;
}

/** A trimmed string, or null for blank / non-string input. */
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;

/** Undo a half-made spot entry; a failed undo is logged, never swallowed silently. */
async function undo(svc: any, table: string, id: string) {
  const { error } = await svc.from(table).delete().eq('id', id);
  if (error) console.error(`[tournament/spot-entry] could not roll back ${table} ${id}:`, error.message);
}

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

    // Same form submitted again (double click, retry): hand back what it made.
    const again = await existingSpotEntry(svc, eventId, dto.request_key);
    if (again) return NextResponse.json({ ...again, duplicate: true }, { status: 200 });

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

    // One active entry per learner per division. A team's learner is its captain
    // (on the entry); an individual's sits on the registration.
    if (learner) {
      let already = false;
      if (entryType === 'team') {
        const { data: dup } = await (svc as any)
          .from('tournament_entries')
          .select('id')
          .eq('division_id', dto.division_id)
          .in('status', ['registered', 'confirmed'])
          .eq('captain_learner_id', learner.id)
          .limit(1);
        already = (dup?.length ?? 0) > 0;
      } else {
        const { data: regs } = await (svc as any)
          .from('events_registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('learner_id', learner.id);
        const regIds = (regs ?? []).map((r: { id: string }) => r.id);
        if (regIds.length) {
          const { data: inDivision } = await (svc as any)
            .from('tournament_entries')
            .select('id')
            .eq('division_id', dto.division_id)
            .in('status', ['registered', 'confirmed'])
            .in('registration_id', regIds)
            .limit(1);
          already = (inDivision?.length ?? 0) > 0;
        }
      }
      if (already) {
        return NextResponse.json(
          { error: `${regNo} already has an entry in this division` },
          { status: 409 }
        );
      }
    }

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

    const { data: reg, error: regErr } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        category_id: null,
        participant_type: dto.is_external ? 'external' : 'internal',
        participant_name: entryName,
        participant_phone: str(dto.participant_phone),
        participant_age: age ?? null,
        participant_gender: learner?.gender ?? gender,
        learner_id: entryType === 'individual' ? (learner?.id ?? null) : null,
        institution_id: institutionId,
        institution_name: institutionName,
        status: 'registered',
        payment_status: fee > 0 ? 'paid' : 'not_required',
        payment_amount: fee,
        payment_method: fee > 0 ? 'offline' : null,
        payment_reference: fee > 0 ? (reference ?? `${methodLabel} at the desk`) : null,
        source: 'tournament_spot',
        registered_by: user.id,
        custom_data: {
          spot_entry: {
            request_key: dto.request_key,
            added_by: user.id,
            added_by_name: organiserName,
            fee_method: fee > 0 ? dto.payment_method : null,
          },
        },
      })
      .select('id')
      .single();
    if (regErr?.code === '23505' && /spot_request_key/i.test(`${regErr.message} ${regErr.details ?? ''}`)) {
      // The same submission raced in twice; the other one won. Return its entry.
      const winner = await existingSpotEntry(svc, eventId, dto.request_key);
      if (winner) return NextResponse.json({ ...winner, duplicate: true }, { status: 200 });
      return NextResponse.json({ error: 'This entry is already being saved. Reload to see it.' }, { status: 409 });
    }
    if (regErr || !reg) {
      return NextResponse.json({ error: regErr?.message || 'Failed to add the entry' }, { status: 500 });
    }

    const { entry, accessCode, error: entryErr } = await insertEntryWithAccessCode(
      svc,
      {
        event_id: eventId,
        division_id: dto.division_id,
        registration_id: reg.id,
        entry_type: entryType,
        entry_name: entryName,
        institution_id: institutionId,
        institution_name: institutionName,
        is_external: !!dto.is_external,
        captain_learner_id: entryType === 'team' ? (learner?.id ?? null) : null,
        status: 'registered',
        notes: `Spot entry added by ${organiserName} on ${today}`,
      },
      null
    );
    if (entryErr || !entry) {
      await undo(svc, 'events_registrations', reg.id);
      return NextResponse.json({ error: entryErr?.message || 'Failed to add the entry' }, { status: 500 });
    }

    if (entryType === 'team' && members.length) {
      const { error: rosterErr } = await (svc as any).from('tournament_team_members').insert(
        members.map((m) => ({ entry_id: entry.id, learner_id: null, ...m }))
      );
      if (rosterErr) {
        await undo(svc, 'tournament_entries', entry.id);
        await undo(svc, 'events_registrations', reg.id);
        return NextResponse.json({ error: rosterErr.message || 'Failed to save the roster' }, { status: 500 });
      }
    }

    return NextResponse.json({ entry_id: entry.id, access_code: accessCode }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add the entry' },
      { status: 500 }
    );
  }
}
