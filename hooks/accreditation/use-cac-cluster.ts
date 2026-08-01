// hooks/accreditation/use-cac-cluster.ts
// ============================================================================
// The four cluster-collaboration reads behind the CAC page's collaboration
// section.
//
// Each one is a plain SELECT from a view that has already done its aggregation
// in the database. Nothing here computes a cluster figure client-side that the
// database could have computed once, because the `authenticated` role carries an
// 8s statement_timeout and this page fires several reads at the same moment.
//
// All five views are `security_invoker`, which is the important thing to hold in
// mind when reading anything these hooks return. The rows that come back are the
// rows THIS viewer is allowed to see, not the cluster's true totals. A figure
// can therefore be lower than reality for a reason that is about the viewer and
// not about the colleges — so nothing in this file, and nothing in the section
// that consumes it, may present an absence as a finding without saying which of
// the two it is. That is the same distinction the measured-metrics section draws
// between "not captured yet" and "none recorded".
//
// Read-only throughout. There is no mutation to add later: every number here is
// derived from another module's records, and the way to change one is to use
// that module.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ----------------------------------------------------------------------------
// Row shapes, one per view.
// ----------------------------------------------------------------------------

/** One institution's stage-by-stage solution funnel. */
export interface CacFunnelRow {
  institution_id: string | null;
  institution_name: string | null;
  iqac_code: string | null;
  departments_activated: number;
  departments_producing: number;
  solutions: number;
  phases: number;
  publications: number;
}

/**
 * One giver -> receiver pair, for one kind of exchange.
 *
 * `relation` is the column that decides whether this edge means two colleges
 * chose to work together. `hub` edges are traffic to or from JKKN Main Office —
 * shared central infrastructure, which is worth counting and is not peer
 * collaboration. Folding the two together produces a headline that is
 * arithmetically true and describes a cluster that does not exist.
 */
export interface CacExchangeEdge {
  exchange_kind: 'teaching' | 'booking';
  relation: 'hub' | 'peer';
  giver_institution_id: string | null;
  giver_name: string | null;
  giver_iqac_code: string | null;
  receiver_institution_id: string | null;
  receiver_name: string | null;
  receiver_iqac_code: string | null;
  /** Assignments for teaching, reservations for bookings. */
  units: number;
  /** Distinct Senior Learners, or distinct bookers. */
  people: number;
}

/** One course title taught in more than one institution. */
export interface CacOverlapRow {
  course_title: string;
  institution_count: number;
  institution_names: string[] | null;
}

/** The denominators the overlap panel prints its share against. */
export interface CacOverlapSummary {
  distinct_titles: number;
  shared_titles: number;
  widest_span: number | null;
}

/** One teaching institution's exchange volumes, in both directions. */
export interface CacIsolationRow {
  institution_id: string;
  institution_name: string | null;
  iqac_code: string | null;
  peer_bookings_made: number;
  peer_lends_made: number;
  bookings_made_any: number;
  lends_made_any: number;
  teaching_given: number;
  teaching_received: number;
}

export const cacClusterKeys = {
  all: ['accreditation', 'cac-cluster'] as const,
  funnel: () => [...cacClusterKeys.all, 'funnel'] as const,
  edges: () => [...cacClusterKeys.all, 'edges'] as const,
  overlap: () => [...cacClusterKeys.all, 'overlap'] as const,
  overlapSummary: () => [...cacClusterKeys.all, 'overlap-summary'] as const,
  isolation: () => [...cacClusterKeys.all, 'isolation'] as const,
};

// These records move on other modules' timelines, not this page's. Five minutes
// matches what the measured-metrics read already uses, so returning to the page
// does not re-run four aggregations.
const SHARED_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

// ----------------------------------------------------------------------------
// Pure shaping helpers.
//
// Exported and free of any Supabase import so they can be exercised without a
// database — the section component itself cannot be loaded under vitest, because
// the page it belongs to constructs a Supabase client at module scope.
// ----------------------------------------------------------------------------

/**
 * How far a funnel got before it stopped.
 *
 * Returned as a stage name rather than a number so the caller cannot accidentally
 * print a bare 0, which the council's second locked decision forbids: a zero
 * reads as a measured bad result, and here it means the platform holds nothing
 * at that stage yet.
 */
export type FunnelStage =
  | 'no-departments'
  | 'departments-only'
  | 'solutions-only'
  | 'phases-only'
  | 'published';

export function funnelStage(row: CacFunnelRow): FunnelStage {
  if (row.publications > 0) return 'published';
  if (row.phases > 0) return 'phases-only';
  if (row.solutions > 0) return 'solutions-only';
  if (row.departments_activated > 0) return 'departments-only';
  return 'no-departments';
}

/** Cluster totals for the funnel, summed from whatever rows came back. */
export function summariseFunnel(rows: CacFunnelRow[]) {
  return rows.reduce(
    (acc, r) => ({
      institutions: acc.institutions + 1,
      departmentsActivated: acc.departmentsActivated + r.departments_activated,
      departmentsProducing: acc.departmentsProducing + r.departments_producing,
      solutions: acc.solutions + r.solutions,
      phases: acc.phases + r.phases,
      publications: acc.publications + r.publications,
    }),
    {
      institutions: 0,
      departmentsActivated: 0,
      departmentsProducing: 0,
      solutions: 0,
      phases: 0,
      publications: 0,
    },
  );
}

/**
 * Split the exchange edges the way the panel has to render them.
 *
 * Hub and peer are kept apart at every level, including the totals, because the
 * two answer different questions. `hubUnits` says how much the colleges lean on
 * the central office; `peerUnits` says how much they lean on each other. Only the
 * second is collaboration between colleges, and it is the smaller number.
 */
export function splitExchange(edges: CacExchangeEdge[], kind: CacExchangeEdge['exchange_kind']) {
  const ofKind = edges.filter((e) => e.exchange_kind === kind);
  const hub = ofKind.filter((e) => e.relation === 'hub');
  const peer = ofKind.filter((e) => e.relation === 'peer');
  const sum = (list: CacExchangeEdge[]) => list.reduce((n, e) => n + (e.units ?? 0), 0);
  return {
    hub,
    peer,
    hubUnits: sum(hub),
    peerUnits: sum(peer),
    totalUnits: sum(ofKind),
    peerPairs: peer.length,
  };
}

/**
 * The institution receiving the largest share of one kind of incoming exchange,
 * with that share.
 *
 * Deliberately returns the share alongside the volume. Volume alone reads as an
 * unqualified success; the share is what turns it into a question about how much
 * of one college's teaching arrives from siblings. Both readings are true at
 * once and the panel states both.
 */
export function concentration(
  edges: CacExchangeEdge[],
  kind: CacExchangeEdge['exchange_kind'],
): { name: string; units: number; total: number; sharePct: number; sources: number } | null {
  const ofKind = edges.filter((e) => e.exchange_kind === kind);
  const total = ofKind.reduce((n, e) => n + (e.units ?? 0), 0);
  if (total === 0) return null;

  const byReceiver = new Map<string, { units: number; sources: number }>();
  ofKind.forEach((e) => {
    const name = e.receiver_name ?? 'An institution outside your access';
    const prev = byReceiver.get(name) ?? { units: 0, sources: 0 };
    byReceiver.set(name, { units: prev.units + (e.units ?? 0), sources: prev.sources + 1 });
  });

  let top: { name: string; units: number; sources: number } | null = null;
  byReceiver.forEach((v, name) => {
    if (!top || v.units > top.units) top = { name, units: v.units, sources: v.sources };
  });
  if (!top) return null;

  const winner = top as { name: string; units: number; sources: number };
  return {
    name: winner.name,
    units: winner.units,
    total,
    sharePct: Math.round((100 * winner.units) / total),
    sources: winner.sources,
  };
}

/**
 * Institutions with no peer edge at all, in either direction.
 *
 * "Peer" excludes the hub throughout, so an institution that books the central
 * office every week and has never touched a sibling college still appears here.
 * That is the point: the hub relationship is real and is not collaboration
 * between colleges.
 */
export function isolatedInstitutions(rows: CacIsolationRow[]): CacIsolationRow[] {
  return rows.filter((r) => r.peer_bookings_made === 0 && r.peer_lends_made === 0);
}

/** Institutions nothing of whose has ever been booked by anyone, hub included. */
export function neverLentToAnyone(rows: CacIsolationRow[]): CacIsolationRow[] {
  return rows.filter((r) => r.lends_made_any === 0);
}

// ----------------------------------------------------------------------------
// The reads.
// ----------------------------------------------------------------------------

export function useCacSolutionFunnel() {
  return useQuery({
    queryKey: cacClusterKeys.funnel(),
    queryFn: async (): Promise<CacFunnelRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('v_cac_solution_funnel')
        .select('*')
        .order('departments_activated', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CacFunnelRow[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useCacExchangeEdges() {
  return useQuery({
    queryKey: cacClusterKeys.edges(),
    queryFn: async (): Promise<CacExchangeEdge[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('v_cac_exchange_edges')
        .select('*')
        .order('units', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CacExchangeEdge[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

/**
 * The widest-spanning shared titles only.
 *
 * The view holds one row per shared title and there are over a thousand of them.
 * Pulling all of them to show a dozen would put a payload on the wire that the
 * panel has no use for, so the limit lives here and the denominators come from
 * the summary view instead of from `data.length`.
 */
export function useCacCurriculumOverlap(limit = 15) {
  return useQuery({
    queryKey: [...cacClusterKeys.overlap(), limit],
    queryFn: async (): Promise<CacOverlapRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('v_cac_curriculum_overlap')
        .select('*')
        .order('institution_count', { ascending: false })
        .order('course_title', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CacOverlapRow[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useCacCurriculumOverlapSummary() {
  return useQuery({
    queryKey: cacClusterKeys.overlapSummary(),
    queryFn: async (): Promise<CacOverlapSummary | null> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('v_cac_curriculum_overlap_summary')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CacOverlapSummary | null;
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useCacCollaborationIsolation() {
  return useQuery({
    queryKey: cacClusterKeys.isolation(),
    queryFn: async (): Promise<CacIsolationRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('v_cac_collaboration_isolation')
        .select('*')
        .order('institution_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CacIsolationRow[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}
