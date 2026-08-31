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
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

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
    admin
      .from('loop_charter_proposals')
      .select('id,loop_key,proposed,rationale,status,decided_at,decision_note,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(
        (r) => (r.data ?? []) as ProposalRead[],
        () => [] as ProposalRead[]
      ),
    admin
      .from('loop_registry')
      .select('loop_key,name')
      .then(
        (r) => (r.data ?? []) as { loop_key: string; name: string }[],
        () => [] as { loop_key: string; name: string }[]
      ),
  ]);

  const nameByKey = new Map(registry.map((r) => [r.loop_key, r.name]));
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
      decided_at: p.decided_at,
      decision_note: p.decision_note,
      created_at: p.created_at,
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
      <CharterProposalsPanel rows={rows} />
    </ContentLayout>
  );
}
