// =====================================================================
// /pde/admin/bridge — PDE Tier 4 (T4.1) legacy → demonstrations bridge
// =====================================================================
// Lists recent bridge runs + form to trigger a new run. Dry-run is the
// default; admin must explicitly opt-in to apply (writes to
// pde_demonstrations). Old tables stay intact (parallel-run safety) per
// Director's strategy lock (c) Bridge old → new categories.
//
// Director-only (super_admin). The action runs against the public REST
// surface which is auth-gated; this page just sets up the UI shell.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BridgeRunner } from './_components/BridgeRunner';

export const navMeta = {
  label: 'PDE Bridge (legacy → new)',
  icon: 'GitMerge',
} as const;

export const dynamic = 'force-dynamic';

interface RunSummary {
  run_id: string;
  started_at: string | null;
  completed_at: string | null;
  dry_run: boolean;
  total: number;
  applied: number;
  dry_runs: number;
  failed: number;
  per_source: Record<string, number>;
}

async function fetchRecentRuns(): Promise<RunSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pde_bridge_audit')
    .select('run_id, source_table, status, dry_run, run_started_at, run_completed_at')
    .order('run_started_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error || !data) return [];

  const grouped = new Map<string, RunSummary>();
  for (const row of data as Array<{
    run_id: string;
    source_table: string;
    status: string;
    dry_run: boolean;
    run_started_at: string | null;
    run_completed_at: string | null;
  }>) {
    const existing = grouped.get(row.run_id) ?? {
      run_id: row.run_id,
      started_at: row.run_started_at,
      completed_at: row.run_completed_at,
      dry_run: row.dry_run,
      total: 0,
      applied: 0,
      dry_runs: 0,
      failed: 0,
      per_source: {},
    };
    existing.total++;
    if (row.status === 'applied') existing.applied++;
    else if (row.status === 'dry_run') existing.dry_runs++;
    else if (row.status === 'failed') existing.failed++;
    existing.per_source[row.source_table] = (existing.per_source[row.source_table] ?? 0) + 1;
    grouped.set(row.run_id, existing);
  }
  return Array.from(grouped.values())
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    .slice(0, 50);
}

export default async function PdeBridgePage() {
  const runs = await fetchRecentRuns();

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Bridge (legacy → new)">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. It runs the
            one-time bridge from legacy PDE artifacts onto the new
            <code className="mx-1">pde_demonstrations</code> substrate.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Bridge (legacy → new)">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Bridge' },
          ]}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          Bridges learner-earned legacy artifacts (capabilities, certificates,
          passed quests) onto the new 7-category{' '}
          <code>pde_demonstrations</code> substrate. Director strategy lock:{' '}
          <em>(c) Bridge old → new categories</em>. Old tables stay intact —
          parallel-run safety.
        </p>

        <BridgeRunner />

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Recent runs</h2>
          {runs.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No bridge runs yet. Trigger a dry-run above to preview what
              would be written.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Run ID</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Applied</th>
                    <th className="px-3 py-2">Dry-run</th>
                    <th className="px-3 py-2">Failed</th>
                    <th className="px-3 py-2">Per source</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{r.run_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">
                        {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.dry_run ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">dry-run</span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">applied</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.total}</td>
                      <td className="px-3 py-2">{r.applied}</td>
                      <td className="px-3 py-2">{r.dry_runs}</td>
                      <td className="px-3 py-2">{r.failed}</td>
                      <td className="px-3 py-2 text-xs">
                        {Object.entries(r.per_source)
                          .map(([k, v]) => `${k.replace('pde_', '')}: ${v}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
