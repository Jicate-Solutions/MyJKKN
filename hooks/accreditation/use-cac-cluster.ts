// hooks/accreditation/use-cac-cluster.ts
// ============================================================================
// The four cluster-collaboration reads behind the CAC page's collaboration
// section.
//
// ALL OF THEM COME FROM ONE CALL: `fn_cac_cluster_totals()`, a SECURITY DEFINER
// function gated on `accreditation.cac.view`. The five hooks below are five
// views of one cached payload, sharing a query key so React Query issues exactly
// one request no matter how many panels mount.
//
// WHY THIS STOPPED READING THE VIEWS DIRECTLY.
// It used to run five `.from('v_cac_...')` selects. Those views are
// `security_invoker`, so each returned the rows the CALLER may see — and the
// caller here is a Cluster Academic Council member, whose access rules are
// usually scoped to one institution. The council was being shown a slice of the
// cluster it exists to look across, and from the client a hidden row and an
// absent row are the same empty array. Measured on production 2026-08-01 for a
// real own-scope council member: the exchange map read 0 hub and 0 peer
// bookings and the overlap panel read 0 shared course titles, where the cluster
// truly holds 63, 15 and 1,067. The page's honest "this may be narrower than the
// cluster" footnote was doing the only thing a page can do about that, and it
// was not enough for a body whose entire output is the cluster-wide reading.
//
// The function reads the same five views as its definer, so the figures below
// are now the cluster's, identically for every council member. The views
// themselves no longer grant `authenticated` anything — the permission is
// enforced on the data and not only on the screen.
//
// Read-only throughout. There is no mutation to add later: every number here is
// derived from another module's records, and the way to change one is to use
// that module.
// ============================================================================

import { useCallback } from 'react';
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

/**
 * One key, deliberately.
 *
 * There were five — one per view — when there were five requests. Now there is
 * one request, and five keys would be five cache entries fetching the same
 * payload. Every hook below reads this key and narrows the result with `select`,
 * which is what makes four panels cost one round trip.
 */
export const cacClusterKeys = {
  all: ['accreditation', 'cac-cluster'] as const,
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
    // Null only when the LEFT JOIN to `institutions` found no row, now that the
    // read is cluster-wide. It is no longer a viewer-scope effect.
    const name = e.receiver_name ?? 'An institution with no row on record';
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
// The read.
// ----------------------------------------------------------------------------

/** Everything `fn_cac_cluster_totals()` returns, in one payload. */
export interface CacClusterTotals {
  funnel: CacFunnelRow[];
  edges: CacExchangeEdge[];
  /** The widest-spanning shared titles only — see OVERLAP_CAP. */
  overlap: CacOverlapRow[];
  overlap_summary: CacOverlapSummary | null;
  isolation: CacIsolationRow[];
}

/**
 * How many shared course titles the function returns, which is NOT how many
 * exist. There were 1,067 on production on 2026-08-01 and the panel shows a
 * dozen. The true count is never taken from `overlap.length` — it comes from
 * `overlap_summary.shared_titles`, which is computed over all of them — so the
 * denominator on screen stays honest while the payload stays small.
 */
export const OVERLAP_CAP = 50;

async function fetchClusterTotals(): Promise<CacClusterTotals> {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_cac_cluster_totals');
  if (error) throw error;

  // The function always returns all five keys, but defaulting here means a
  // future key rename surfaces as an empty panel rather than a crash inside a
  // `.filter` on undefined.
  const payload = (data ?? {}) as Partial<CacClusterTotals>;
  return {
    funnel: payload.funnel ?? [],
    edges: payload.edges ?? [],
    overlap: payload.overlap ?? [],
    overlap_summary: payload.overlap_summary ?? null,
    isolation: payload.isolation ?? [],
  };
}

/**
 * The shared read. Every hook below goes through here with the same query key,
 * so the four panels share one request and one cache entry, each narrowing the
 * payload with its own `select`.
 */
function useClusterTotals<TSelected>(select: (totals: CacClusterTotals) => TSelected) {
  return useQuery({
    queryKey: cacClusterKeys.all,
    queryFn: fetchClusterTotals,
    select,
    ...SHARED_QUERY_OPTIONS,
  });
}

const pickFunnel = (t: CacClusterTotals) => t.funnel;
const pickEdges = (t: CacClusterTotals) => t.edges;
const pickOverlapSummary = (t: CacClusterTotals) => t.overlap_summary;
const pickIsolation = (t: CacClusterTotals) => t.isolation;

export function useCacSolutionFunnel() {
  return useClusterTotals(pickFunnel);
}

export function useCacExchangeEdges() {
  return useClusterTotals(pickEdges);
}

/**
 * The widest-spanning shared titles, longest span first.
 *
 * `limit` can only narrow what the function already returned; asking for more
 * than OVERLAP_CAP yields OVERLAP_CAP.
 */
export function useCacCurriculumOverlap(limit = 15) {
  const select = useCallback(
    (t: CacClusterTotals) => t.overlap.slice(0, limit),
    [limit],
  );
  return useClusterTotals(select);
}

export function useCacCurriculumOverlapSummary() {
  return useClusterTotals(pickOverlapSummary);
}

export function useCacCollaborationIsolation() {
  return useClusterTotals(pickIsolation);
}
