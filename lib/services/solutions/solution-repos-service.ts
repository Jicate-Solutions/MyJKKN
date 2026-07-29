// lib/services/solutions/solution-repos-service.ts
// CRUD operations for sh_solution_repos — GitHub repositories linked to solutions.
// Capability 1 of the Solutions Hub ↔ intern-repo integration.
// Spec: specs/solutions-hub-intern-repo-integration-spec-2026-07-11.md

import { BaseService } from '../base-service';

// ============================================
// TYPES
// ============================================

export interface SolutionRepo {
  id: string;
  solution_id: string;
  repo_full_name: string;
  linked_by: string | null;
  linked_at: string;
}

/** A solution that shares the same repo (decision 8: sharing is allowed and must be visible). */
export interface SharedSolutionRef {
  id: string;
  title: string;
  solution_code: string;
}

export interface SolutionRepoWithSharing extends SolutionRepo {
  /** Other solutions linked to the same repo — powers the "also used by" cross-link. */
  shared_with: SharedSolutionRef[];
}

export interface LinkRepoInput {
  solution_id: string;
  repo_full_name: string;
  linked_by: string;
}

/** Outcome buckets for a bulk link — each is a list of repo_full_name. */
export interface BulkLinkReposResult {
  /** repos newly linked to the solution in this call */
  linked: string[];
  /** valid repos that were already linked (ON CONFLICT DO NOTHING skipped them) */
  skipped: string[];
  /** names rejected by the "org/name" shape check — never sent to the DB */
  invalid: string[];
}

const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// ============================================
// SERVICE CLASS
// ============================================

export class SolutionReposService extends BaseService {
  /**
   * Get all repos linked to a solution, each annotated with the other
   * solutions sharing that repo (decision 8 visibility requirement).
   */
  static async getRepos(solutionId: string): Promise<SolutionRepoWithSharing[]> {
    const { data: repos, error } = await this.supabase
      .from('sh_solution_repos')
      .select('*')
      .eq('solution_id', solutionId)
      .order('linked_at', { ascending: false });

    if (error) throw error;
    if (!repos || repos.length === 0) return [];

    // One query for all sharing rows across this solution's repos.
    const repoNames = repos.map((r: SolutionRepo) => r.repo_full_name);
    const { data: sharing, error: sharingError } = await this.supabase
      .from('sh_solution_repos')
      .select('repo_full_name, solution:sh_solutions(id, title, solution_code)')
      .in('repo_full_name', repoNames)
      .neq('solution_id', solutionId);

    if (sharingError) throw sharingError;

    const sharedByRepo = new Map<string, SharedSolutionRef[]>();
    for (const row of sharing ?? []) {
      const solution = (row as { repo_full_name: string; solution: SharedSolutionRef | null }).solution;
      if (!solution) continue;
      const list = sharedByRepo.get(row.repo_full_name) ?? [];
      list.push(solution);
      sharedByRepo.set(row.repo_full_name, list);
    }

    return repos.map((r: SolutionRepo) => ({
      ...r,
      shared_with: sharedByRepo.get(r.repo_full_name) ?? [],
    }));
  }

  /**
   * Link a repo to a solution. Shape-validates "org/name" here for a friendly
   * error; the DB CHECK constraint is the backstop.
   */
  static async linkRepo(input: LinkRepoInput): Promise<SolutionRepo> {
    const repoFullName = input.repo_full_name.trim();
    if (!REPO_FULL_NAME_PATTERN.test(repoFullName)) {
      throw new Error('Repository must be in "org/name" format, e.g. Jicate-Solutions/pharmacy-pos');
    }

    const { data, error } = await this.supabase
      .from('sh_solution_repos')
      .insert({
        solution_id: input.solution_id,
        repo_full_name: repoFullName,
        linked_by: input.linked_by,
      })
      .select()
      .single();

    if (error) {
      // Unique violation → already linked to THIS solution (linking to other solutions is allowed).
      if (error.code === '23505') {
        throw new Error('This repository is already linked to this solution');
      }
      throw error;
    }
    return data as SolutionRepo;
  }

  /**
   * Link MANY repos to a solution in one call. Mirrors linkRepo but is
   * conflict-safe: already-linked repos are skipped via ON CONFLICT
   * (solution_id, repo_full_name) DO NOTHING, so a bulk link NEVER throws just
   * because one repo was already linked.
   *
   * The Supabase client is passed in explicitly (per spec): it is the caller's
   * RLS-scoped, auth-context client — the same client runWithClient injects into
   * the single-link path — so RLS is enforced identically here.
   */
  static async bulkLinkRepos(
    supabase: any,
    solutionId: string,
    repoFullNames: string[],
    linkedBy: string,
  ): Promise<BulkLinkReposResult> {
    const names = Array.isArray(repoFullNames) ? repoFullNames : [];

    // Shape-validate each name with the SAME pattern the single-link path uses;
    // the DB CHECK constraint is the backstop. Invalid names never reach the DB.
    const invalid: string[] = [];
    const seen = new Set<string>();
    const uniqueValid: string[] = [];
    for (const raw of names) {
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!REPO_FULL_NAME_PATTERN.test(name)) {
        invalid.push(String(raw));
        continue;
      }
      if (seen.has(name)) continue; // collapse duplicates within the input
      seen.add(name);
      uniqueValid.push(name);
    }

    if (uniqueValid.length === 0) {
      return { linked: [], skipped: [], invalid };
    }

    const rows = uniqueValid.map((repo_full_name) => ({
      solution_id: solutionId,
      repo_full_name,
      linked_by: linkedBy,
    }));

    // ignoreDuplicates === ON CONFLICT DO NOTHING. .select() returns ONLY the
    // rows actually inserted; conflicting (already-linked) rows are omitted.
    const { data: inserted, error } = await supabase
      .from('sh_solution_repos')
      .upsert(rows, { onConflict: 'solution_id,repo_full_name', ignoreDuplicates: true })
      .select('repo_full_name');

    if (error) throw error;

    const linked = ((inserted ?? []) as { repo_full_name: string }[]).map((r) => r.repo_full_name);
    const linkedSet = new Set(linked);
    const skipped = uniqueValid.filter((n) => !linkedSet.has(n));

    return { linked, skipped, invalid };
  }

  /** Unlink a repo from a solution. The GitHub repo itself is never touched (decision 7). */
  static async unlinkRepo(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('sh_solution_repos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}

// ============================================
// SINGLETON EXPORT (matches deployments-service style)
// ============================================

export const solutionReposService = {
  getRepos: SolutionReposService.getRepos.bind(SolutionReposService),
  linkRepo: SolutionReposService.linkRepo.bind(SolutionReposService),
  bulkLinkRepos: SolutionReposService.bulkLinkRepos.bind(SolutionReposService),
  unlinkRepo: SolutionReposService.unlinkRepo.bind(SolutionReposService),
};
