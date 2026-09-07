// lib/services/solutions/resident-promotion-service.ts
// The weld between the Improvement Board and the Solutions Hub.
//
// WHY THIS FILE EXISTS
//   Before this, no file in lib/services/solutions referenced improvement_ideas,
//   and no file under the Improvement Board referenced sh_builders. The two
//   halves of the same idea — "a learner finds and fixes a real problem" and
//   "a learner is paid to build" — had no join at all. sh_builders has been
//   empty since the Solutions Hub shipped, which is why it has earned nothing.
//
//   The machinery to CREATE a builder already exists and works
//   (BuildersService.createBuilder, /solutions/builders/new). What did not
//   exist was any answer to "which learner has earned it?". That is this file.

import { BaseService } from '../base-service';
import { BuildersService } from './builders-service';
import type { Builder } from './types';

// ============================================
// ELIGIBILITY RULE
// ============================================

/**
 * An idea counts towards promotion only once it reaches this status.
 *
 * 'verified' is the terminal success state of the improvement_ideas lifecycle
 * (logged -> under_review -> approved -> applied -> verified -> closed). It is
 * the first point at which somebody other than the author has confirmed the
 * fix actually held, which is the whole basis for calling the author a builder.
 *
 * NOTE FOR REVIEW: this is a policy decision and per the repo's config-table
 * pattern it should eventually live in platform_policies rather than in code.
 * It is a constant here deliberately — the Director has not yet settled the
 * rule, and inventing a policy row before the policy exists would be worse
 * than a named constant that is easy to find and change.
 */
export const PROMOTION_QUALIFYING_STATUS = 'verified' as const;

/** How many qualifying ideas a resident needs. One is deliberate: the first
 *  verified fix is the signal. Raising this is a one-line change. */
export const PROMOTION_MIN_VERIFIED_IDEAS = 1;

// ============================================
// TYPES
// ============================================

export interface PromotionCandidate {
  learner_id: string;
  user_id: string;
  name: string;
  email: string | null;
  roll_number: string | null;
  department_id: string | null;
  institution_id: string | null;
  /** which residency cohort they belong to, e.g. 'mech_resident' */
  role_key: string;
  verified_idea_count: number;
  /** null when no idea carries a verified value — see verified_value_inr note */
  verified_value_inr: number | null;
  latest_verified_at: string | null;
}

/**
 * Why the candidate list is the length it is.
 *
 * An empty candidate list is the expected result today and must not read as a
 * malfunction. These counts say where the pipeline actually stops.
 */
export interface PromotionDiagnostics {
  residents_total: number;
  ideas_total: number;
  ideas_by_status: Record<string, number>;
  ideas_qualifying: number;
  already_builders: number;
  /** human-readable reason the list is empty, or null when it is not */
  blocking_reason: string | null;
}

export interface PromotionReadiness {
  candidates: PromotionCandidate[];
  diagnostics: PromotionDiagnostics;
}

// ============================================
// SERVICE
// ============================================

export class ResidentPromotionService extends BaseService {
  /**
   * Residents who have earned promotion to builder, plus the diagnostics that
   * explain an empty list.
   */
  static async getPromotionCandidates(): Promise<PromotionReadiness> {
    // 1. Everyone currently holding a residency learner role.
    const { data: residentRoles, error: rolesError } = await this.supabase
      .from('user_roles')
      .select('user_id, custom_roles!inner(role_key)')
      .like('custom_roles.role_key', '%_resident');
    if (rolesError) throw new Error(`Failed to read residency roles: ${rolesError.message}`);

    const roleByUser = new Map<string, string>();
    for (const row of (residentRoles ?? []) as unknown as Array<{
      user_id: string;
      custom_roles: { role_key: string } | { role_key: string }[];
    }>) {
      const cr = Array.isArray(row.custom_roles) ? row.custom_roles[0] : row.custom_roles;
      if (row.user_id && cr?.role_key) roleByUser.set(row.user_id, cr.role_key);
    }

    // 2. Every idea, so the diagnostics can say where the pipeline stops.
    const { data: ideas, error: ideasError } = await this.supabase
      .from('improvement_ideas')
      .select('id, author_id, status, verified_value_inr, verified_at');
    if (ideasError) throw new Error(`Failed to read improvement ideas: ${ideasError.message}`);

    const ideasByStatus: Record<string, number> = {};
    for (const i of ideas ?? []) {
      const s = String((i as { status: string }).status);
      ideasByStatus[s] = (ideasByStatus[s] ?? 0) + 1;
    }

    const qualifying = (ideas ?? []).filter(
      (i) => String((i as { status: string }).status) === PROMOTION_QUALIFYING_STATUS,
    ) as Array<{
      author_id: string | null;
      verified_value_inr: number | null;
      verified_at: string | null;
    }>;

    // 3. Who is already a builder — never offer to promote them twice.
    const { data: existing, error: existingError } = await this.supabase
      .from('sh_builders')
      .select('user_id, learner_id');
    if (existingError) throw new Error(`Failed to read builders: ${existingError.message}`);
    const builderUserIds = new Set(
      (existing ?? []).map((b) => (b as { user_id: string | null }).user_id).filter(Boolean) as string[],
    );

    // 4. Tally qualifying ideas per resident author.
    const tally = new Map<string, { count: number; value: number | null; latest: string | null }>();
    for (const idea of qualifying) {
      const author = idea.author_id;
      if (!author || !roleByUser.has(author) || builderUserIds.has(author)) continue;
      const cur = tally.get(author) ?? { count: 0, value: null, latest: null };
      cur.count += 1;
      if (idea.verified_value_inr != null) cur.value = (cur.value ?? 0) + Number(idea.verified_value_inr);
      if (idea.verified_at && (!cur.latest || idea.verified_at > cur.latest)) cur.latest = idea.verified_at;
      tally.set(author, cur);
    }

    const qualifiedUserIds = [...tally.entries()]
      .filter(([, v]) => v.count >= PROMOTION_MIN_VERIFIED_IDEAS)
      .map(([userId]) => userId);

    const candidates = qualifiedUserIds.length
      ? await this.hydrateCandidates(qualifiedUserIds, roleByUser, tally)
      : [];

    return {
      candidates,
      diagnostics: {
        residents_total: roleByUser.size,
        ideas_total: ideas?.length ?? 0,
        ideas_by_status: ideasByStatus,
        ideas_qualifying: qualifying.length,
        already_builders: existing?.length ?? 0,
        blocking_reason: this.explainEmpty(candidates.length, roleByUser.size, qualifying.length, ideas?.length ?? 0),
      },
    };
  }

  /**
   * Say plainly why nobody is eligible. An empty list with no explanation is
   * indistinguishable from a broken query.
   */
  private static explainEmpty(
    candidateCount: number,
    residents: number,
    qualifying: number,
    ideasTotal: number,
  ): string | null {
    if (candidateCount > 0) return null;
    if (residents === 0) return 'No learner holds a residency role, so nobody can qualify yet.';
    if (ideasTotal === 0) return 'No improvement idea has ever been filed.';
    if (qualifying === 0) {
      return `${ideasTotal} ideas exist but none has reached '${PROMOTION_QUALIFYING_STATUS}'. ` +
        'Promotion is gated on a fix somebody else confirmed held — until one idea completes ' +
        'the review, approval, application and verification steps, no resident can qualify.';
    }
    return `${qualifying} idea(s) are verified, but none was authored by a resident who is not already a builder.`;
  }

  /** Attach names and identifiers to the qualified user ids. */
  private static async hydrateCandidates(
    userIds: string[],
    roleByUser: Map<string, string>,
    tally: Map<string, { count: number; value: number | null; latest: string | null }>,
  ): Promise<PromotionCandidate[]> {
    const { data: profiles, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, email, learner_id, institution_id')
      .in('id', userIds);
    if (error) throw new Error(`Failed to read profiles: ${error.message}`);

    const learnerIds = (profiles ?? [])
      .map((p) => (p as { learner_id: string | null }).learner_id)
      .filter(Boolean) as string[];

    const learnerById = new Map<string, { roll_number: string | null; department_id: string | null }>();
    if (learnerIds.length) {
      const { data: learners } = await this.supabase
        .from('learners_profiles')
        .select('id, roll_number, department_id')
        .in('id', learnerIds);
      for (const l of learners ?? []) {
        const row = l as { id: string; roll_number: string | null; department_id: string | null };
        learnerById.set(row.id, { roll_number: row.roll_number, department_id: row.department_id });
      }
    }

    const out: PromotionCandidate[] = [];
    for (const p of profiles ?? []) {
      const prof = p as {
        id: string; full_name: string | null; email: string | null;
        learner_id: string | null; institution_id: string | null;
      };
      const t = tally.get(prof.id);
      if (!t) continue;
      const learner = prof.learner_id ? learnerById.get(prof.learner_id) : undefined;
      out.push({
        learner_id: prof.learner_id ?? '',
        user_id: prof.id,
        name: prof.full_name ?? 'Unnamed',
        email: prof.email,
        roll_number: learner?.roll_number ?? null,
        department_id: learner?.department_id ?? null,
        institution_id: prof.institution_id,
        role_key: roleByUser.get(prof.id) ?? '',
        verified_idea_count: t.count,
        verified_value_inr: t.value,
        latest_verified_at: t.latest,
      });
    }
    return out.sort((a, b) => b.verified_idea_count - a.verified_idea_count);
  }

  /**
   * Promote one eligible resident into sh_builders.
   *
   * Delegates the actual write to BuildersService.createBuilder so there is
   * exactly one insert path into sh_builders. This function's only job is to
   * refuse anyone who has not earned it.
   */
  static async promoteResident(userId: string, specialization?: string): Promise<Builder> {
    const { candidates } = await this.getPromotionCandidates();
    const candidate = candidates.find((c) => c.user_id === userId);
    if (!candidate) {
      throw new Error(
        'This learner is not eligible for promotion. Eligibility requires a residency ' +
          `role and at least ${PROMOTION_MIN_VERIFIED_IDEAS} improvement idea at ` +
          `'${PROMOTION_QUALIFYING_STATUS}' that they authored.`,
      );
    }

    return BuildersService.createBuilder({
      name: candidate.name,
      email: candidate.email ?? undefined,
      user_id: candidate.user_id,
      learner_id: candidate.learner_id || undefined,
      department_id: candidate.department_id ?? undefined,
      institution_id: candidate.institution_id ?? undefined,
      specialization,
      bio:
        `Promoted from the ${candidate.role_key} residency on the strength of ` +
        `${candidate.verified_idea_count} verified improvement fix` +
        `${candidate.verified_idea_count === 1 ? '' : 'es'}.`,
    });
  }
}
