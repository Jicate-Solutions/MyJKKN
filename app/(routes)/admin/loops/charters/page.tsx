// ============================================================================
// LOOP CHARTER PROPOSALS (Super-Admin) — machine drafts, humans sign
// ============================================================================
// Created: 2026-08-13 (Wave 0 of the loop program — the chartering factory).
// The MetaLoop routine (metaloop-charter-drafts, Sundays) drafts a charter for
// each uncharted loop from live evidence and files it in
// loop_charter_proposals. This page is the human half: a super admin reviews
// the draft (5 legs + kill rule + suggested verdict owner + rationale) and
// Approves — fn_loop_apply_charter_proposal writes the legs onto
// loop_registry — or Rejects with a note. Nothing is ever auto-applied.
//
// Gated server-side on the canonical super-admin definition (same rule as
// /admin/loops and /admin/loops/pillars). The fallback is an explicit
// no-access panel — never a silent redirect (rule #27). Reads use the
// service-role client for a clean first paint; decisions go through the
// browser client (RPC re-checks super admin; the reject UPDATE is re-checked
// by the table's admin-gated RLS policy).
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Loop Charters', icon: 'ClipboardCheck' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import {
  createServiceRoleClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import {
  CharterProposalsPanel,
  type CharterProposalRow,
} from './_components/charter-proposals-panel';

type ProposalRead = {
  id: string;
  loop_key: string;
  proposed: Record<string, unknown> | null;
  rationale: string | null;
  status: 'proposed' | 'approved' | 'rejected' | 'insufficient';
  kind?: 'charter' | 'bar' | 'bar-review' | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

const PROPOSAL_COLS =
  'id,loop_key,proposed,rationale,status,decided_at,decision_note,created_at';

/**
 * Proposals, with `kind` when the bar migration (20261225070000) is applied and
 * without it when it is not — a column that does not exist yet must not blank
 * the whole page. Rows read before the apply are all charters by definition.
 */
async function readProposals(
  admin: ReturnType<typeof createServiceRoleClient>
): Promise<ProposalRead[]> {
  try {
    // Two reads with their own limits, so bar rows (one per loop, plus reviews)
    // can never push a still-waiting CHARTER proposal out of the page
    // (reviewer B, 2026-09-18: compounding eviction under one shared limit).
    const withKind = await admin
      .from('loop_charter_proposals')
      .select(`${PROPOSAL_COLS},kind`)
      .eq('kind', 'charter')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!withKind.error) {
      const bars = await admin
        .from('loop_charter_proposals')
        .select(`${PROPOSAL_COLS},kind`)
        .in('kind', ['bar', 'bar-review'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (bars.error) {
        // Not a silent empty Bars section: say so in the server log (the
        // charter read above succeeded, so the page still renders).
        console.warn('[loops/charters] bar proposals read failed:', bars.error.message);
      }
      return [...((withKind.data ?? []) as ProposalRead[]), ...((bars.data ?? []) as ProposalRead[])];
    }

    const withoutKind = await admin
      .from('loop_charter_proposals')
      .select(PROPOSAL_COLS)
      .order('created_at', { ascending: false })
      .limit(200);
    return (withoutKind.data ?? []) as ProposalRead[];
  } catch {
    return [];
  }
}

/** Last four recorded headline numbers per loop, newest first. Empty on any error (pre-migration). */
async function readRecentReadings(
  admin: ReturnType<typeof createServiceRoleClient>,
  loopKeys: string[]
): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>();
  if (loopKeys.length === 0) return out;
  try {
    const { data, error } = await admin
      .from('loop_measurements')
      .select('loop_key,value,measured_at')
      .in('loop_key', loopKeys)
      .eq('status', 'final')
      .order('measured_at', { ascending: false })
      .limit(loopKeys.length * 4);
    if (error || !data) return out;
    for (const row of data as { loop_key: string; value: number | string | null }[]) {
      const list = out.get(row.loop_key) ?? [];
      if (list.length < 4) {
        const n = row.value === null ? null : Number(row.value);
        list.push(Number.isFinite(n as number) ? (n as number) : null);
        out.set(row.loop_key, list);
      }
    }
  } catch {
    // pre-migration: the table does not exist yet
  }
  return out;
}

export default async function LoopChartersPage() {
  const { profile } = await getEnhancedUserProfile();
  // Canonical super-admin definition (matches /admin/loops and the
  // SuperAdminOnly guard): the boolean flag OR the role.
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Loop Charters">
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          This page is restricted to super administrators. It approves loop
          charters onto the cluster-wide loop registry. If you believe you
          should have access, contact a platform administrator.
        </div>
      </ContentLayout>
    );
  }

  const admin = createServiceRoleClient();
  // Both reads swallow to empty — the table lands with a Director-gated
  // migration, and this page must render its explicit empty state (never 500)
  // while that migration is pending apply. Same contract as /admin/loops.
  const [proposals, registry] = await Promise.all([
    readProposals(admin),
    admin
      .from('loop_registry')
      .select('loop_key,name')
      .then(
        (r) => (r.data ?? []) as { loop_key: string; name: string }[],
        () => [] as { loop_key: string; name: string }[]
      ),
  ]);

  const nameByKey = new Map(registry.map((r) => [r.loop_key, r.name]));
  // The bar cards ask the Director for a number; show him the scale it lives
  // on — the loop's last few recorded headline numbers (loop_measurements,
  // written by every run whether or not a bar exists). Empty until the
  // migration is applied and the loops have run; the card says so.
  const barLoopKeys = Array.from(
    new Set(proposals.filter((p) => p.kind === 'bar' || p.kind === 'bar-review').map((p) => p.loop_key))
  );
  const recentByKey = await readRecentReadings(admin, barLoopKeys);
  // Undecided first (the work queue), then decided history — both newest-first
  // (the select is already created_at DESC; the sort is stable).
  const rows: CharterProposalRow[] = [...proposals]
    .sort((a, b) =>
      a.status === b.status ? 0 : a.status === 'proposed' ? -1 : b.status === 'proposed' ? 1 : 0
    )
    .map((p) => ({
      id: p.id,
      loop_key: p.loop_key,
      loop_name: nameByKey.get(p.loop_key) ?? p.loop_key,
      proposed: p.proposed ?? {},
      rationale: p.rationale,
      status: p.status,
      // Pre-apply rows carry no kind; they are charters by definition.
      kind: p.kind ?? 'charter',
      decided_at: p.decided_at,
      decision_note: p.decision_note,
      created_at: p.created_at,
      recent_values: p.kind === 'bar' || p.kind === 'bar-review' ? (recentByKey.get(p.loop_key) ?? []) : undefined,
    }));

  return (
    <ContentLayout title="Loop Charters — machine drafts, humans sign">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        The MetaLoop routine drafts a charter (outcome metric, counter metric,
        intervention, baseline window, remeasure window, kill rule) for each
        uncharted loop from its live evidence, every Sunday; finished drafts
        surface here daily. Approving writes the five legs onto the loop
        registry; the kill rule and suggested owner stay on the record here.
        Rejecting keeps the registry untouched. When the machine judges the
        evidence too thin to charter honestly, it says so below — with the
        reason a human must act on first.
      </p>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        The same page carries <strong>Bars</strong>: every loop is judged
        against one concrete bar, the machine proposes it, and you set it by
        approving. A loop that misses its bar four runs in a row raises a
        &ldquo;bar may be wrong&rdquo; card here rather than going quietly red
        — approving it clears the bar so a fresh one is proposed, rejecting it
        says the bar is right and starts the count again.
      </p>
      <CharterProposalsPanel rows={rows} />
    </ContentLayout>
  );
}
