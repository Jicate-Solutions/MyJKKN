// =====================================================================
// /pde/admin/kpi — PDE Tier 6 (T6.4) KPI dashboard
// =====================================================================
// Surfaces the Director-locked strategic metric:
//   "60% coordinator active-use ratio within 90 days of onboarding"
// (memory: project_hr_strategic_lock_2026_05_11).
//
// Server component. Heavy aggregation runs in computeKpiSnapshot();
// renders three slices: big number vs target, per-institution table,
// per-category table, and rolling daily trend (last 30 of 90 days).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { computeKpiSnapshot, getKpiTarget } from '@/lib/services/pde-kpi-service';

export const navMeta = {
  label: 'PDE KPI Dashboard',
  icon: 'Gauge',
} as const;

export const dynamic = 'force-dynamic';

function ratioBadgeClass(ratioPct: number, targetPct: number): string {
  if (ratioPct >= targetPct) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (ratioPct >= targetPct * 0.66) return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-red-100 text-red-900 border-red-300';
}

export default async function PdeKpiPage() {
  const [snapshot, target] = await Promise.all([
    computeKpiSnapshot(),
    Promise.resolve(getKpiTarget()),
  ]);

  const targetPct = target.target * 100;
  const ratio = snapshot.active_use_ratio;
  const badge = ratioBadgeClass(ratio, targetPct);
  const lastTrend = snapshot.rolling_trend.slice(-30);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE KPI Dashboard">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This dashboard is restricted to super administrators. It surfaces
            the Director-locked strategic metric (60% coordinator active-use
            ratio within 90 days of onboarding).
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE KPI Dashboard">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'KPI Dashboard' },
          ]}
        />

        {/* Big number vs target */}
        <div className={`rounded-lg border-2 p-6 mb-6 ${badge}`}>
          <div className="text-sm font-medium uppercase tracking-wide opacity-80">
            Active-use ratio (last {snapshot.lookback_days}d ÷ onboarded last {snapshot.window_days}d)
          </div>
          <div className="mt-2 flex items-baseline gap-4">
            <div className="text-5xl font-bold">{ratio.toFixed(1)}%</div>
            <div className="text-sm opacity-75">
              target {targetPct.toFixed(0)}% by {target.deadline_days}d
            </div>
          </div>
          <div className="mt-2 text-sm opacity-80">
            {snapshot.active_count} active of {snapshot.total_onboarded_count} onboarded
            {snapshot.total_onboarded_count === 0 && ' — no coordinators onboarded yet'}
          </div>
        </div>

        {/* Per-institution */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">By institution</h2>
          {snapshot.per_institution.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/30">
              No onboarding records in the {snapshot.window_days}-day window.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Institution</th>
                    <th className="text-right px-3 py-2">Active</th>
                    <th className="text-right px-3 py-2">Onboarded</th>
                    <th className="text-right px-3 py-2">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.per_institution.map((row) => (
                    <tr key={row.institution_id} className="border-t">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.active}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.total}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.ratio >= targetPct ? 'text-emerald-700' : row.ratio >= targetPct * 0.66 ? 'text-amber-700' : 'text-red-700'}`}>
                        {row.ratio.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Per-category */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Demonstrations by category (last {snapshot.lookback_days}d)</h2>
          {snapshot.per_category.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/30">
              No demonstrations submitted in the lookback window.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Demonstrations</th>
                    <th className="text-right px-3 py-2">Scored</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.per_category.map((row) => (
                    <tr key={row.category_key} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{row.category_key}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.demonstration_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.scored_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Rolling trend (last 30 of 90 days for readability) */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Daily trend (last 30 days of {snapshot.window_days}d window)</h2>
          {lastTrend.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/30">
              No trend data yet.
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-right px-3 py-2">Active</th>
                    <th className="text-right px-3 py-2">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {lastTrend.map((p) => (
                    <tr key={p.date} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{p.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.active_count}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${p.ratio >= targetPct ? 'text-emerald-700' : p.ratio >= targetPct * 0.66 ? 'text-amber-700' : 'text-red-700'}`}>
                        {p.ratio.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="text-xs text-muted-foreground">
          Computed at {new Date(snapshot.computed_at).toLocaleString()}.
          Active = validated, submitted, or triggered a bridge run in last {snapshot.lookback_days}d.
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
