// Audit Coverage Service — per-cycle (body × institution) coverage rollup
// Joins quality_evidence_mappings + sh_accreditation_metrics + audit_attestations
// for a specific cycle. Mirrors AccreditationService.getCoverageMatrix() but
// overlays cycle-scoped attestation progress so Selvamani's dashboard shows
// "coverage for THIS audit cycle" not "all-time coverage".
//
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §Routes + services (PR-B2)
// Consumed by: app/api/audit/coverage/route.ts, hooks/audit/use-audit-coverage.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CoverageCell } from '@/lib/types/audit';

export interface CoverageOptions {
  /** Filter to a single body (e.g., 'NAAC'). Case-insensitive; normalised to upper-case. */
  body?: string;
  /** Filter to a single institution. */
  institutionId?: string;
}

export class AuditCoverageService {
  private static supabase = createClientSupabaseClient();

  /**
   * Build per-(body, institution) coverage cells for an audit cycle.
   *
   * Algorithm:
   * 1. Fetch the cycle (to know its institution_ids scope + parameter snapshot).
   * 2. Count parameters per body from the cycle's parameter_catalog_snapshot
   *    (fallback to live audit_parameter_catalog if snapshot is null — draft cycles).
   * 3. Count evidence rows per (body, institution) from quality_evidence_mappings.
   * 4. Return one CoverageCell per (body × institution) pair.
   *
   * RLS on quality_evidence_mappings + audit_parameter_catalog scopes results
   * to the caller's role — super_admin sees all, institution-scoped users see
   * only their institution.
   */
  static async getForCycle(
    cycleId: string,
    options: CoverageOptions = {}
  ): Promise<CoverageCell[]> {
    // 1. Load cycle — need institution_ids + snapshot
    const { data: cycle, error: cycleErr } = await (this.supabase as any)
      .from('audit_cycles')
      .select('id, institution_ids, parameter_catalog_snapshot')
      .eq('id', cycleId)
      .maybeSingle();
    if (cycleErr) throw cycleErr;
    if (!cycle) return [];

    // 2. Resolve parameter list (snapshot wins; fallback to live catalog for drafts)
    const snapshotParams = ((cycle.parameter_catalog_snapshot as Record<string, unknown> | null)
      ?.parameters as Array<{ code: string; framework_mapping: Record<string, string> }> | undefined)
      ?? undefined;

    let parameters: Array<{ code: string; framework_mapping: Record<string, string> }>;
    if (snapshotParams && snapshotParams.length > 0) {
      parameters = snapshotParams;
    } else {
      const { data: liveParams, error: liveErr } = await (this.supabase as any)
        .from('audit_parameter_catalog')
        .select('code, framework_mapping')
        .eq('is_active', true);
      if (liveErr) throw liveErr;
      parameters = (liveParams ?? []) as Array<{ code: string; framework_mapping: Record<string, string> }>;
    }

    // Tally parameters per body
    const paramCountByBody: Record<string, number> = {};
    for (const p of parameters) {
      const mapping = p.framework_mapping ?? {};
      for (const [rawBody, metric] of Object.entries(mapping)) {
        if (!metric || metric === '-') continue;
        const body = rawBody.toUpperCase();
        paramCountByBody[body] = (paramCountByBody[body] ?? 0) + 1;
      }
    }

    const targetBody = options.body ? options.body.toUpperCase() : null;

    // 3. Resolve institutions in scope — cycle.institution_ids OR all institutions
    // the caller can see via RLS.
    let institutionIds: string[];
    if (cycle.institution_ids && (cycle.institution_ids as string[]).length > 0) {
      institutionIds = cycle.institution_ids as string[];
    } else {
      const { data: instRows, error: instErr } = await (this.supabase as any)
        .from('institutions')
        .select('id')
        .eq('is_active', true);
      if (instErr) throw instErr;
      institutionIds = (instRows ?? []).map((r: { id: string }) => r.id);
    }

    if (options.institutionId) {
      institutionIds = institutionIds.filter((id) => id === options.institutionId);
    }

    if (institutionIds.length === 0) return [];

    // 4. Count evidence rows per (body, institution_id)
    let evidenceQuery = (this.supabase as any)
      .from('quality_evidence_mappings')
      .select('body_code, institution_id')
      .in('institution_id', institutionIds);
    if (targetBody) {
      evidenceQuery = evidenceQuery.eq('body_code', targetBody);
    }
    const { data: evidenceRows, error: evidenceErr } = await evidenceQuery;
    if (evidenceErr) throw evidenceErr;

    const evidenceCount: Record<string, number> = {};
    for (const row of (evidenceRows ?? []) as Array<{ body_code: string; institution_id: string }>) {
      const key = `${row.body_code}::${row.institution_id}`;
      evidenceCount[key] = (evidenceCount[key] ?? 0) + 1;
    }

    // 5. Bodies to emit cells for — restricted by body filter if present
    const bodies = targetBody ? [targetBody] : Object.keys(paramCountByBody);

    const cells: CoverageCell[] = [];
    for (const body of bodies) {
      const parameterCount = paramCountByBody[body] ?? 0;
      for (const instId of institutionIds) {
        const ev = evidenceCount[`${body}::${instId}`] ?? 0;
        const coveragePct = parameterCount === 0
          ? 0
          : Math.min(100, Math.round((ev / parameterCount) * 100));
        cells.push({
          institution_id: instId,
          body_code: body,
          parameter_count: parameterCount,
          evidence_count: ev,
          coverage_pct: coveragePct,
        });
      }
    }

    // Stable order: body then institution
    cells.sort((a, b) => {
      if (a.body_code !== b.body_code) return a.body_code.localeCompare(b.body_code);
      return a.institution_id.localeCompare(b.institution_id);
    });

    return cells;
  }
}
