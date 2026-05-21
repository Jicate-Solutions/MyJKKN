import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BosAttendanceStatus } from '@/types/bos';
import { computeClaimAmounts } from '@/lib/utils/bos/ta-da-rates';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// Mirror of the helper in /api/bos/meetings/[id]/route.ts — CAS sibling
// expansion via counselling_code self-join. Kept inline so the attendance
// route doesn't need to import internals of the meeting detail route. If
// either copy diverges, prefer factoring into lib/utils/bos/bos-access.ts.
async function casExpandedIds(
  db: ReturnType<typeof createServiceRoleClient>,
  primaryInstitutionId: string | null | undefined,
  seedIds: readonly string[],
): Promise<string[]> {
  const out = new Set<string>(seedIds);
  if (primaryInstitutionId) out.add(primaryInstitutionId);
  if (!primaryInstitutionId) return Array.from(out);

  const { data: inst } = await db
    .from('institutions')
    .select('counselling_code')
    .eq('id', primaryInstitutionId)
    .maybeSingle();

  if (inst?.counselling_code) {
    const { data: siblings } = await db
      .from('institutions')
      .select('id')
      .eq('counselling_code', inst.counselling_code)
      .eq('is_active', true);
    for (const s of siblings ?? []) out.add((s as { id: string }).id);
  }
  return Array.from(out);
}

// ── GET /api/bos/meetings/[id]/attendance ─────────────────────────────────────
// Reads bos_meeting_attendees via service-role with route-level authz, mirroring
// the meeting-detail GET. The previous anon/RLS-only flow caused a "ghost zero"
// for CAS-sibling viewers: the meeting-detail badge correctly counted 9 rows
// (service-role aggregate), but this endpoint returned [] (RLS dropped every
// row), which made the Documents tab's "Minutes of Meeting" PDF download
// disable itself with "Record attendance first" even though attendance had
// been saved. See memory/project_bos_cas_principal_sibling_gap.md.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const db = createServiceRoleClient();

    // Resolve the meeting first so we can authz on its institution + composition.
    // A direct attendance read against a meeting the caller can't see should
    // still 404, not leak rows.
    const { data: meeting, error: meetingErr } = await db
      .from('bos_meetings')
      .select('institutions_id, composition_id')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingErr) {
      console.error('[bos/attendance] meeting lookup failed:', meetingErr);
      return NextResponse.json({ error: 'Meeting lookup failed' }, { status: 500 });
    }
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Authz — replicate what RLS *should* have done, but CAS-sibling-aware.
    // Same shape as /api/bos/meetings/[id]/route.ts so a viewer who can see
    // the meeting detail can also see its attendance.
    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      const meetingRow = meeting as {
        institutions_id: string | null;
        composition_id: string | null;
      };
      const allowedInstitutions = await casExpandedIds(
        db,
        scope.institutionsId,
        scope.allInstitutionIds,
      );
      const institutionOk =
        !meetingRow.institutions_id ||
        allowedInstitutions.includes(meetingRow.institutions_id);
      const compositionOk =
        scope.isPrincipal ||
        (meetingRow.composition_id
          ? scope.memberOf.has(meetingRow.composition_id)
          : false);
      if (!institutionOk || !compositionOk) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }
    }

    const { data, error } = await db
      .from('bos_meeting_attendees')
      .select(`
        *,
        member:bos_members (
          id, display_name, display_designation, display_institution,
          address,
          member_type, is_active, sort_order, expert_id, display_distance_km
        )
      `)
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/attendance] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}

// ── POST /api/bos/meetings/[id]/attendance ────────────────────────────────────
// Accepts an array of attendance records and upserts them in bulk.
// Each record: { member_id, attendance_status, absence_reason?, ta_da_eligible? }
//
// Post-upsert side effect (2026-05-21 SOP redesign):
// After the attendance rows are written, runs autoSyncClaims() which inserts
// TA/DA claim rows for every present+eligible attendee and deletes orphan
// claims for attendees who flipped to non-present. Uses a service-role client
// because the caller may have bos.meetings.edit but not bos.ta_da.create —
// claim management is now a system-driven invariant, not a separate user
// action.
interface AttendanceUpsertRecord {
  member_id: string;
  attendance_status: BosAttendanceStatus;
  absence_reason?: string;
  ta_da_eligible?: boolean;
  institutions_id: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const records: AttendanceUpsertRecord[] = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records array is required' }, { status: 400 });
    }

    const upsertData = records.map((r) => ({
      meeting_id: meetingId,
      member_id: r.member_id,
      institutions_id: r.institutions_id,
      attendance_status: r.attendance_status,
      absence_reason: r.absence_reason ?? null,
      ta_da_eligible: r.ta_da_eligible ?? false,
    }));

    const { data, error } = await supabase
      .from('bos_meeting_attendees')
      .upsert(upsertData, { onConflict: 'meeting_id,member_id', ignoreDuplicates: false })
      .select(`
        *,
        member:bos_members (
          id, display_name, display_designation, display_institution,
          address,
          member_type, is_active, sort_order, expert_id, display_distance_km
        )
      `);

    if (error) throw error;

    // Post-step: keep TA/DA claims in sync with the just-saved attendance.
    // Failures here are logged but do NOT fail the request — attendance is
    // the user's primary intent; claim regeneration can be rerun by toggling
    // attendance again. This keeps the UX forgiving of a transient claim-side
    // error (e.g., service-role env var misconfig in a dev environment).
    let autoClaims: AutoClaimSyncResult = { created: 0, deleted: 0, skippedLocked: 0 };
    try {
      autoClaims = await autoSyncClaims(meetingId);
    } catch (claimErr) {
      console.error('[bos/attendance] auto-claim sync failed:', claimErr);
    }

    return NextResponse.json(
      { attendees: data ?? [], autoClaims },
      { status: 201 },
    );
  } catch (error) {
    console.error('[bos/attendance] POST error:', error);
    return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
  }
}

// ── Auto-claim sync ───────────────────────────────────────────────────────────
// Reconciles bos_ta_da_claims with the current attendance state of a meeting:
//   • For each attendee with status='present' AND ta_da_eligible=true → upsert
//     a claim row with SOP-computed amounts (idempotent via the existing
//     UNIQUE(meeting_id, member_id) constraint).
//   • For each attendee with status!='present' OR ta_da_eligible=false →
//     delete any existing claim, BUT only when claim_status is 'draft' or
//     'submitted'. Approved/paid claims are preserved to maintain the
//     payment audit trail.
//
// Uses the service-role client so the RLS policies on bos_ta_da_claims
// (bos.ta_da.create / admin-only delete) don't block users whose only
// granted permission is bos.meetings.edit.
interface AutoClaimSyncResult {
  created: number;
  deleted: number;
  /** Count of orphan claims preserved because they were approved/paid. */
  skippedLocked: number;
}

type AttendeeRow = {
  member_id: string;
  institutions_id: string;
  attendance_status: BosAttendanceStatus;
  ta_da_eligible: boolean;
  member: {
    expert_id: string | null;
    display_distance_km: number | null;
  } | null;
};

type ClaimRow = {
  id: string;
  member_id: string;
  claim_status: 'draft' | 'submitted' | 'approved' | 'paid';
};

async function autoSyncClaims(meetingId: string): Promise<AutoClaimSyncResult> {
  const admin = createServiceRoleClient();

  // Pull the current attendance state — must be the *post-upsert* truth, so
  // we re-fetch through the service-role client to bypass any read-side RLS
  // skew between calls.
  const { data: attendees, error: attErr } = await admin
    .from('bos_meeting_attendees')
    .select(`
      member_id,
      institutions_id,
      attendance_status,
      ta_da_eligible,
      member:bos_members ( expert_id, display_distance_km )
    `)
    .eq('meeting_id', meetingId);

  if (attErr) throw attErr;

  const { data: existingClaims, error: claimErr } = await admin
    .from('bos_ta_da_claims')
    .select('id, member_id, claim_status')
    .eq('meeting_id', meetingId);

  if (claimErr) throw claimErr;

  const claimsByMember = new Map<string, ClaimRow>(
    (existingClaims ?? []).map((c) => [c.member_id, c as ClaimRow]),
  );

  let created = 0;
  let deleted = 0;
  let skippedLocked = 0;

  // Build the insert + delete sets in memory, then execute as batches so the
  // attendance request stays a single round-trip from the user's perspective.
  const toInsert: Array<Record<string, unknown>> = [];
  const toDelete: string[] = [];

  // Per the 2026-05-21 SOP refinement: ANY present member receives a claim.
  // ta_da_eligible is no longer a gate — the column is preserved for
  // historical/reporting reasons, but auto-claim generation runs purely off
  // attendance status. computeClaimAmounts() already encodes the per-role
  // shape (external = honorarium + TA, internal = honorarium only) using
  // the member.expert_id discriminator, so no additional flag is needed
  // to decide who gets what.
  for (const a of (attendees ?? []) as unknown as AttendeeRow[]) {
    const isPresent = a.attendance_status === 'present';
    const shouldHaveClaim = isPresent;
    const existing = claimsByMember.get(a.member_id);

    if (shouldHaveClaim) {
      if (existing) continue; // idempotent — leave the existing claim alone
      const isExternal = a.member?.expert_id != null;
      const amounts = computeClaimAmounts({
        isExternal,
        oneWayKm: a.member?.display_distance_km ?? null,
      });
      toInsert.push({
        institutions_id: a.institutions_id,
        meeting_id: meetingId,
        member_id: a.member_id,
        expert_id: a.member?.expert_id ?? null,
        travel_amount: amounts.travel,
        // Legacy DA columns retained for back-compat; on a fresh auto-claim
        // we encode the honorarium as units=1, rate=amount, amount=amount so
        // the GENERATED total_amount stays correct without a schema change.
        honorarium_units: 1,
        honorarium_rate: amounts.honorarium,
        honorarium_amount: amounts.honorarium,
        other_amount: 0,
        claim_status: 'draft',
      });
    } else if (existing) {
      if (existing.claim_status === 'approved' || existing.claim_status === 'paid') {
        skippedLocked++;
      } else {
        toDelete.push(existing.id);
      }
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from('bos_ta_da_claims').insert(toInsert);
    if (insErr) throw insErr;
    created = toInsert.length;
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await admin
      .from('bos_ta_da_claims')
      .delete()
      .in('id', toDelete);
    if (delErr) throw delErr;
    deleted = toDelete.length;
  }

  return { created, deleted, skippedLocked };
}
