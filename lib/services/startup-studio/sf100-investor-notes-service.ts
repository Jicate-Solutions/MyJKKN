/**
 * SF100 investor notes — private deal-flow notes an investor keeps on an
 * ASSIGNED team (spec Phase 2, D5).
 *
 * These are DELIBERATELY private: sf100_investor_notes has a SERVICE-ROLE-ONLY
 * RLS policy (no team visibility, no cross-investor visibility). An investor sees
 * only their OWN notes; coordinators/NIF staff see all notes for a team. Because
 * the table has no authenticated read/write policy at all, every access goes
 * through a SERVICE-ROLE client here, and authorization is enforced UP-FRONT by
 * the caller:
 *   - coordinator list  → withAuth({ requirePermission: 'startup_studio.sf100.member.create' })
 *   - external investor  → getExternalSession() + externalCanAccessEnrollment()
 *                          + mentor_type === 'investor' (only investors may write)
 *
 * Node runtime only. Mirrors sf100-mentor-assign-service.ts style.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Interest levels an investor may tag a note with (DB CHECK constraint). */
export const INVESTOR_INTEREST_LEVELS = ['high', 'medium', 'low', 'passed'] as const;
export type InvestorInterestLevel = (typeof INVESTOR_INTEREST_LEVELS)[number];

/** A single investor note, shaped for the API envelope. */
export interface InvestorNote {
  id: string;
  enrollmentId: string;
  mentorId: string;
  mentorName: string | null;
  note: string;
  interestLevel: InvestorInterestLevel | null;
  createdAt: string;
}

/** Map a joined DB row → API shape. */
function mapNote(r: any): InvestorNote {
  return {
    id: r.id,
    enrollmentId: r.enrollment_id,
    mentorId: r.mentor_id,
    mentorName: r.mentor?.name ?? null,
    note: r.note,
    interestLevel: r.interest_level ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Create an investor note on a team. Service-role INSERT (no authenticated write
 * policy on sf100_investor_notes). The caller MUST have already verified that
 * `mentorId` is an investor assigned to `enrollmentId`. `createdBy` is the staff
 * uid when a coordinator files a note on an investor's behalf, or null for a note
 * written directly by an account-less external investor.
 */
export async function createNote(input: {
  mentorId: string;
  enrollmentId: string;
  note: string;
  interestLevel?: InvestorInterestLevel | null;
  createdBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const text = (input.note ?? '').trim();
  if (!text) return { ok: false, message: 'Note text is required' };

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('sf100_investor_notes')
    .insert({
      enrollment_id: input.enrollmentId,
      mentor_id: input.mentorId,
      note: text,
      interest_level: input.interestLevel ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

/**
 * All notes for a team, newest first — the coordinator/NIF view (they see every
 * investor's notes). Joined to ss_mentors for the investor's display name.
 */
export async function listNotesForTeam(
  enrollmentId: string
): Promise<InvestorNote[]> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('sf100_investor_notes')
    .select('id, enrollment_id, mentor_id, note, interest_level, created_at, mentor:ss_mentors(name)')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapNote);
}

/**
 * A single investor's OWN notes on a single team, newest first — the external
 * investor's private view. Scoped by BOTH mentor_id and enrollment_id so one
 * investor can never read another's notes.
 */
export async function listNotesByInvestor(
  mentorId: string,
  enrollmentId: string
): Promise<InvestorNote[]> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('sf100_investor_notes')
    .select('id, enrollment_id, mentor_id, note, interest_level, created_at, mentor:ss_mentors(name)')
    .eq('mentor_id', mentorId)
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapNote);
}
