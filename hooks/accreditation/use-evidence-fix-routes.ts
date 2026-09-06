// hooks/accreditation/use-evidence-fix-routes.ts
// ============================================================================
// Two reads an accreditation gap needs before it can name a next step: where a
// person goes to fill the data, and who is accountable for it.
//
// Deliberately a NEW file rather than an addition to use-nirf-dashboard.ts —
// that hook is being rewritten in PR #2787 (the 10,000-row PostgREST
// truncation), and editing it here would produce a conflict in the one file
// both changes touch.
//
// ----------------------------------------------------------------------------
// WHY `select('*')` AND NOT A COLUMN LIST — THIS IS LOAD-BEARING
// ----------------------------------------------------------------------------
// fix_route / fix_hint / owner_role arrive in migration 20260809100700, which is
// FILE ONLY and Director-gated. Merging to main deploys immediately here, so
// this code WILL run against a database that does not have those columns yet.
//
// `select('fix_route, ...')` against a database missing them fails the whole
// request with PostgREST 42703 — the registry read dies, and with it the part of
// the page that was working. `select('*')` returns whatever columns exist, the
// three read as undefined, and every source normalises to fix_route = null.
// Which renders as: the gap, with NO button. The designed fallback, reached by
// doing nothing.
//
// So the ordering is: this PR can ship before the migration applies, and the
// buttons appear the day it does. Do not "tighten" the select.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { EvidenceSourceRoute } from '@/app/(routes)/accreditation/_lib/metric-gap-state';

export const evidenceFixRouteKeys = {
  all: ['accreditation', 'evidence-fix-routes'] as const,
  registry: () => [...evidenceFixRouteKeys.all, 'registry'] as const,
  owners: (bodyCode: string, institutionId: string) =>
    [...evidenceFixRouteKeys.all, 'owners', bodyCode, institutionId] as const,
};

/**
 * `public.quality_evidence_source_registry`, keyed by source_kind.
 *
 * 24 rows. RLS on that table is `auth.role() = 'authenticated'`, so any signed-in
 * reader gets all of them — this carries no institution data and no personal
 * data, only module metadata.
 */
export function useEvidenceSourceRoutes() {
  return useQuery({
    queryKey: evidenceFixRouteKeys.registry(),
    queryFn: async (): Promise<Record<string, EvidenceSourceRoute>> => {
      const sb = createClientSupabaseClient() as any;
      // See the header: '*' is required until 20260809100700 applies.
      const { data, error } = await sb
        .from('quality_evidence_source_registry')
        .select('*');
      if (error) throw error;
      const rows: any[] = data ?? [];
      const byKind: Record<string, EvidenceSourceRoute> = {};
      for (const row of rows) {
        byKind[row.source_kind] = {
          source_kind: row.source_kind,
          fix_route: row.fix_route ?? null,
          fix_hint: row.fix_hint ?? null,
          owner_role: row.owner_role ?? null,
        };
      }
      return byKind;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * metric_code → owner name, for one body.
 *
 * `undefined` as a VALUE never appears in this map; a metric with no entry is
 * simply absent, and the caller turns "absent but the map loaded" into `null`
 * (nobody assigned) and "the map failed to load" into `undefined` (unread).
 * resolveMetricGap keeps those two apart on purpose.
 *
 * ⚠️ An RLS denial on `accreditation_metric_owners` returns ZERO ROWS WITH NO
 * ERROR, so a reader who lacks `accreditation.naac.narrative.view` sees exactly
 * what a genuinely empty register looks like. The table holds 0 rows today, so
 * both readings are true at present. When it stops being empty, this needs a
 * readability probe — a denial must not keep printing "No owner assigned yet".
 */
export function useMetricOwnerNames(bodyCode: string, institutionId: string | 'cluster') {
  return useQuery({
    queryKey: evidenceFixRouteKeys.owners(bodyCode, institutionId),
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = createClientSupabaseClient() as any;

      let ownerQuery = sb
        .from('accreditation_metric_owners')
        .select('metric_code, owner_user_id')
        .eq('body_code', bodyCode);
      if (institutionId !== 'cluster') {
        ownerQuery = ownerQuery.eq('institution_id', institutionId);
      }
      const { data: owners, error } = await ownerQuery;
      if (error) throw error;
      if (!owners || owners.length === 0) return {};

      const userIds = Array.from(
        new Set(owners.map((o: any) => o.owner_user_id).filter(Boolean)),
      );
      if (userIds.length === 0) return {};

      const { data: people, error: peopleError } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (peopleError) throw peopleError;

      const nameById = new Map<string, string>(
        (people ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Owner assigned']),
      );

      // Cluster view can legitimately find several owners for one metric — one
      // per college. Naming only the first would be wrong, so say how many.
      const namesByMetric = new Map<string, Set<string>>();
      for (const row of owners as any[]) {
        if (!row.owner_user_id) continue;
        const name = nameById.get(row.owner_user_id);
        if (!name) continue;
        const set = namesByMetric.get(row.metric_code) ?? new Set<string>();
        set.add(name);
        namesByMetric.set(row.metric_code, set);
      }

      const result: Record<string, string> = {};
      namesByMetric.forEach((names, metricCode) => {
        const list = Array.from(names);
        result[metricCode] =
          list.length === 1 ? list[0]! : `${list.length} people across colleges`;
      });
      return result;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
