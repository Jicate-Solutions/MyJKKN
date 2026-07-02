// app/api/cdc/mentors/rollups/route.ts
// GET /api/cdc/mentors/rollups — F5 per-mentor + per-mentee activity rollups
// (BUG-004198 follow-up, D2). Reads the three rollup views, resolves names via
// the service-role client (CDC staff hold cdc.* but NOT learners.* — same RLS
// gap the picker/career-guidance routes handle), and re-imposes institution
// scope so a coordinator only sees their own institutions' mentors/mentees.
//
// Scope is resolved here via the service-role RPC get_user_accessible_institutions
// (rather than createApiInstitutionFilter) so this route is correct and testable
// independently of the shared-helper fix in PR #1566.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  PeerMentorRollup,
  IndustryMentorRollup,
  MenteeRollup,
  MentorRollupsResponse,
} from '@/types/cdc/mentor-rollups';

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
  institution_id: string | null;
}
interface IndustryMentorRow {
  id: string;
  mentor_name: string | null;
  company_name: string | null;
  institution_id: string | null;
}

function learnerName(l: LearnerRow | undefined): string {
  if (!l) return 'Unknown';
  const n = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  return n || 'Unknown';
}

export async function GET(): Promise<NextResponse> {
  // Step 1: session auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Step 2: CDC-staff gate (super-admin/admin bypass built into user_has_permission)
  const { data: canView } = await supabase.rpc('user_has_permission', {
    permission_name: 'cdc.mentors.view',
  });
  if (canView !== true) {
    return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
  }

  const svc = createServiceRoleClient();

  // Step 3: resolve the caller's institution scope.
  //  - super_admin / admission / CDC staff → see all (allowedInstitutionIds = null)
  //  - everyone else                        → only their accessible institutions
  //
  // CDC staff (cdc_head / cdc_coordinator, including multi-role) get the
  // cross-college view here to MATCH the cdc_mentor_pairings SELECT policy
  // shipped in PR #1721, which is a bare `is_cdc_staff()` with no institution
  // scope. These rollups are derived from those same pairings, so a coordinator
  // must see the same cross-college aggregates they already see on the pairings
  // list — otherwise the two surfaces silently disagree. We call the RPC
  // `is_cdc_staff()` (the exact function the RLS uses) rather than reading
  // profiles.role, so a MULTI-ROLE coordinator (cdc role in user_roles but a
  // different primary role in profiles) is correctly recognised.
  let allowedInstitutionIds: Set<string> | null = null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  const isSuperAdmin = (profile as { is_super_admin?: boolean } | null)?.is_super_admin === true;
  const { data: isCdcStaff } = await supabase.rpc('is_cdc_staff');
  if (!(isSuperAdmin || role === 'super_admin' || role === 'admission' || isCdcStaff === true)) {
    const { data: accInst } = await svc.rpc('get_user_accessible_institutions', {
      target_user_id: user.id,
    });
    allowedInstitutionIds = new Set(
      ((accInst as { institution_id: string }[] | null) || []).map((r) => r.institution_id)
    );
  }
  const inScope = (institutionId: string | null | undefined): boolean =>
    allowedInstitutionIds === null || (institutionId != null && allowedInstitutionIds.has(institutionId));

  // Step 4: read the three rollup views (service-role bypasses RLS).
  const [peerRes, indRes, menteeRes] = await Promise.all([
    svc.from('v_cdc_peer_mentor_rollup').select('*'),
    svc.from('v_cdc_industry_mentor_rollup').select('*'),
    svc.from('v_cdc_mentee_rollup').select('*'),
  ]);
  if (peerRes.error || indRes.error || menteeRes.error) {
    const msg = peerRes.error?.message || indRes.error?.message || menteeRes.error?.message;
    console.error('[cdc/mentors/rollups] view read failed:', msg);
    return NextResponse.json({ error: 'Failed to load rollups' }, { status: 500 });
  }

  const peerRows = (peerRes.data || []) as Record<string, unknown>[];
  const indRows = (indRes.data || []) as Record<string, unknown>[];
  const menteeRows = (menteeRes.data || []) as Record<string, unknown>[];

  // Step 5: resolve names. Collect every learner id (peer mentors + mentees) and
  // every industry-mentor id, then fetch in two batched queries.
  const learnerIds = new Set<string>();
  peerRows.forEach((r) => learnerIds.add(r.mentor_learner_id as string));
  menteeRows.forEach((r) => learnerIds.add(r.mentee_learner_id as string));
  const indMentorIds = indRows.map((r) => r.industry_mentor_id as string);

  const learnerMap = new Map<string, LearnerRow>();
  if (learnerIds.size > 0) {
    const { data: learners } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number, institution_id')
      .in('id', Array.from(learnerIds));
    ((learners as LearnerRow[] | null) || []).forEach((l) => learnerMap.set(l.id, l));
  }

  const indMentorMap = new Map<string, IndustryMentorRow>();
  if (indMentorIds.length > 0) {
    const { data: mentors } = await svc
      .from('industry_mentors')
      .select('id, mentor_name, company_name, institution_id')
      .in('id', indMentorIds);
    ((mentors as IndustryMentorRow[] | null) || []).forEach((m) => indMentorMap.set(m.id, m));
  }

  // Step 6: assemble + institution-scope. A peer mentor/mentee is scoped by the
  // learner's institution; an industry mentor by its own institution_id.
  const peerMentors: PeerMentorRollup[] = peerRows
    .map((r) => {
      const l = learnerMap.get(r.mentor_learner_id as string);
      return { row: r, learner: l };
    })
    .filter(({ learner }) => inScope(learner?.institution_id))
    .map(({ row, learner }) => ({
      mentor_learner_id: row.mentor_learner_id as string,
      name: learnerName(learner),
      register_number: learner?.register_number ?? null,
      mentee_count: Number(row.mentee_count ?? 0),
      pairing_count: Number(row.pairing_count ?? 0),
      active_pairing_count: Number(row.active_pairing_count ?? 0),
      session_count: Number(row.session_count ?? 0),
      total_minutes: Number(row.total_minutes ?? 0),
      last_session_at: (row.last_session_at as string | null) ?? null,
    }))
    .sort((a, b) => b.session_count - a.session_count || b.mentee_count - a.mentee_count);

  const industryMentors: IndustryMentorRollup[] = indRows
    .map((r) => ({ row: r, mentor: indMentorMap.get(r.industry_mentor_id as string) }))
    .filter(({ mentor }) => inScope(mentor?.institution_id))
    .map(({ row, mentor }) => ({
      industry_mentor_id: row.industry_mentor_id as string,
      mentor_name: mentor?.mentor_name ?? 'Unknown',
      company_name: mentor?.company_name ?? null,
      mentee_count: Number(row.mentee_count ?? 0),
      pairing_count: Number(row.pairing_count ?? 0),
      active_pairing_count: Number(row.active_pairing_count ?? 0),
      session_count: Number(row.session_count ?? 0),
      total_minutes: Number(row.total_minutes ?? 0),
      last_session_at: (row.last_session_at as string | null) ?? null,
    }))
    .sort((a, b) => b.session_count - a.session_count || b.mentee_count - a.mentee_count);

  const mentees: MenteeRollup[] = menteeRows
    .map((r) => ({ row: r, learner: learnerMap.get(r.mentee_learner_id as string) }))
    .filter(({ learner }) => inScope(learner?.institution_id))
    .map(({ row, learner }) => ({
      mentee_learner_id: row.mentee_learner_id as string,
      name: learnerName(learner),
      register_number: learner?.register_number ?? null,
      peer_mentor_count: Number(row.peer_mentor_count ?? 0),
      industry_mentor_count: Number(row.industry_mentor_count ?? 0),
      total_mentor_count: Number(row.total_mentor_count ?? 0),
      total_session_count: Number(row.total_session_count ?? 0),
      total_minutes: Number(row.total_minutes ?? 0),
      last_session_at: (row.last_session_at as string | null) ?? null,
    }))
    .sort((a, b) => b.total_session_count - a.total_session_count || b.total_mentor_count - a.total_mentor_count);

  const body: MentorRollupsResponse = { peerMentors, industryMentors, mentees };
  return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
