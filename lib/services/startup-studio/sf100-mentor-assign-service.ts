/**
 * SF100 mentor/investor ⇄ team assignment (coordinator/admin side).
 *
 * These operations write ss_mentor_matches on the SF100 side (sf100_enrollment_id
 * set, candidate_id null) and read team rosters/summaries. They run with a
 * SERVICE-ROLE client because ss_mentor_matches has no authenticated write policy
 * (only ss_mentor_matches_service_all). Authorization is enforced UP-FRONT in the
 * API route via withAuth({ requirePermission: 'startup_studio.sf100.member.create' }),
 * which runs the canonical triad (is_super_admin OR is_admin OR user_has_permission)
 * — the same audience (admins + nif_coordinator) intended for coordinator actions.
 *
 * Node runtime only.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccessStatus, type AccessStatus } from './external-access-service';

const ACTIVE_MATCH_STATUSES = ['proposed', 'active'];

// mentor_type is a CATEGORY axis (resident/visiting/industry_expert/academic/
// investor/alumni/functional). For an external SF100 contact, internal-vs-external
// is carried by user_id null-ness — NOT by mentor_type. We map the coordinator's
// simple Mentor|Investor choice onto the two categories most fitting an external
// contact; the investor tag is what unlocks investor-only behaviour (Phase 2).
export type ExternalRole = 'mentor' | 'investor';
function mentorTypeForRole(role: ExternalRole): string {
  return role === 'investor' ? 'investor' : 'industry_expert';
}

export interface AssignResult {
  ok: boolean;
  matchId?: string;
  reason?: 'already_assigned' | 'error';
  message?: string;
}

/**
 * Assign an external/internal mentor or investor to an SF100 team. Idempotent:
 * a live (proposed/active) assignment for the same (mentor, team) is returned
 * rather than duplicated (also enforced by the partial unique index).
 */
export async function assignMentorToTeam(input: {
  mentorId: string;
  enrollmentId: string;
  matchedBy: string;
  primaryGoal?: string;
}): Promise<AssignResult> {
  const db = createServiceRoleClient();

  // Already assigned (live)? Return it (idempotent).
  const { data: existing } = await db
    .from('ss_mentor_matches')
    .select('id, status')
    .eq('mentor_id', input.mentorId)
    .eq('sf100_enrollment_id', input.enrollmentId)
    .in('status', ACTIVE_MATCH_STATUSES)
    .maybeSingle();
  if (existing) {
    return { ok: true, matchId: existing.id, reason: 'already_assigned' };
  }

  const { data, error } = await db
    .from('ss_mentor_matches')
    .insert({
      mentor_id: input.mentorId,
      candidate_id: null,
      sf100_enrollment_id: input.enrollmentId,
      status: 'proposed',
      matched_by: input.matchedBy,
      matched_at: new Date().toISOString(),
      primary_goal: input.primaryGoal || null,
      sessions_completed: 0,
      goals_met: [],
      goals_pending: [],
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = the partial unique index caught a race (a terminated row can't
    // conflict since the index covers all sf100 rows) — treat as already assigned.
    if (error.code === '23505') {
      return { ok: false, reason: 'already_assigned', message: error.message };
    }
    return { ok: false, reason: 'error', message: error.message };
  }
  return { ok: true, matchId: data.id };
}

/** Remove an assignment (terminate the match). By match id, service-role. */
export async function unassignMatch(
  matchId: string,
  reason?: string
): Promise<{ ok: boolean; message?: string }> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('ss_mentor_matches')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
      termination_reason: reason || 'Unassigned by coordinator',
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)
    .not('sf100_enrollment_id', 'is', null) // guard: only SF100 matches via this path
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'Match not found or not an SF100 assignment' };
  return { ok: true };
}

export interface TeamMentorRow {
  matchId: string;
  status: string;
  primaryGoal: string | null;
  mentor: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    mentorType: string;
    organization: string | null;
    isExternal: boolean;
  };
}

/** Mentors/investors currently on a team (coordinator view). */
export async function getTeamMentors(enrollmentId: string): Promise<TeamMentorRow[]> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('ss_mentor_matches')
    .select(
      `id, status, primary_goal,
       mentor:ss_mentors(id, name, email, phone, mentor_type, organization, user_id)`
    )
    .eq('sf100_enrollment_id', enrollmentId)
    .in('status', ACTIVE_MATCH_STATUSES)
    .order('matched_at', { ascending: false });

  return (data ?? []).map((r: any) => ({
    matchId: r.id,
    status: r.status,
    primaryGoal: r.primary_goal,
    mentor: {
      id: r.mentor?.id,
      name: r.mentor?.name,
      email: r.mentor?.email ?? null,
      phone: r.mentor?.phone ?? null,
      mentorType: r.mentor?.mentor_type,
      organization: r.mentor?.organization ?? null,
      isExternal: !r.mentor?.user_id,
    },
  }));
}

/**
 * Create an EXTERNAL (account-less) mentor or investor. Service-role because
 * ss_mentors has no authenticated write policy. Sets user_id null (the external
 * marker); the coordinator generates a login code separately (access-code route).
 */
export async function createExternalContact(input: {
  name: string;
  role: ExternalRole;
  email?: string;
  phone?: string;
  organization?: string;
  domainExpertise?: string[];
  createdBy: string;
}): Promise<{ ok: true; mentorId: string } | { ok: false; message: string }> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('ss_mentors')
    .insert({
      name: input.name.trim(),
      user_id: null, // external marker
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      organization: input.organization?.trim() || null,
      mentor_type: mentorTypeForRole(input.role),
      status: 'onboarded',
      domain_expertise: input.domainExpertise ?? [],
      current_mentees: 0,
      total_sessions: 0,
    })
    .select('id')
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, mentorId: data.id };
}

export interface ExternalContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  mentorType: string;
  isInvestor: boolean;
  assignedTeamCount: number;
  access: AccessStatus;
}

/** List external contacts (user_id null) with their code status + assignment count. */
export async function listExternalContacts(): Promise<ExternalContactRow[]> {
  const db = createServiceRoleClient();
  const { data: mentors } = await db
    .from('ss_mentors')
    .select('id, name, email, phone, organization, mentor_type')
    .is('user_id', null)
    .order('created_at', { ascending: false });

  const rows: ExternalContactRow[] = [];
  for (const m of mentors ?? []) {
    const { count } = await db
      .from('ss_mentor_matches')
      .select('id', { count: 'exact', head: true })
      .eq('mentor_id', m.id)
      .not('sf100_enrollment_id', 'is', null)
      .in('status', ACTIVE_MATCH_STATUSES);
    const access = await getAccessStatus(m.id);
    rows.push({
      id: m.id,
      name: m.name,
      email: m.email ?? null,
      phone: m.phone ?? null,
      organization: m.organization ?? null,
      mentorType: m.mentor_type,
      isInvestor: m.mentor_type === 'investor',
      assignedTeamCount: count ?? 0,
      access,
    });
  }
  return rows;
}

/** All SF100 teams (enrollment id + display name) for the assign picker. */
export async function listAllTeams(): Promise<
  { enrollmentId: string; teamName: string }[]
> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('sf100_enrollments')
    .select('id, status, registration:event_registrations(team_name)')
    .neq('status', 'removed');
  return (data ?? []).map((e: any) => ({
    enrollmentId: e.id,
    teamName: e.registration?.team_name || 'Unnamed team',
  }));
}

export interface TeamSummary {
  enrollmentId: string;
  teamName: string;
  problem: string | null;
  programName: string | null;
  currentPhase: string | null;
  paidUsers: number;
  paidUserTarget: number;
}

/**
 * Display summaries for a set of enrollments — powers the external contact's
 * dashboard (they only ever receive their own assigned ids from the resolver).
 */
export async function getTeamsSummary(
  enrollmentIds: string[]
): Promise<TeamSummary[]> {
  if (enrollmentIds.length === 0) return [];
  const db = createServiceRoleClient();
  const { data } = await db
    .from('sf100_enrollments')
    .select(
      `id, current_phase, cumulative_paid_users, active_paid_users,
       registration:event_registrations(team_name, problem_idea),
       program:sf100_programs(name, paid_user_target)`
    )
    .in('id', enrollmentIds);

  return (data ?? []).map((e: any) => ({
    enrollmentId: e.id,
    teamName: e.registration?.team_name || 'Unnamed team',
    problem: e.registration?.problem_idea ?? null,
    programName: e.program?.name ?? null,
    currentPhase: e.current_phase ?? null,
    paidUsers: e.cumulative_paid_users ?? 0,
    paidUserTarget: e.program?.paid_user_target || 100,
  }));
}
