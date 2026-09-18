// ============================================================================
// LIVE LOOPS (Super-Admin) — where every loop stands right now
// ============================================================================
// Director rank-2 item (G4, 2026-09-16), behind the loop-bars lane: "a live
// loops page showing, per loop, the last measurement, its bar, and the gap,
// with in-progress numbers greyed and labelled."
//
// Reads loop_registry (43 active loops) and loop_measurements (migration
// 20261225070000). Both are super/admin SELECT-only under RLS, so the read uses
// the service-role client behind the same super-admin gate as the sibling
// /admin/loops/charters page — the canonical flag-OR-role definition, with an
// explicit "restricted" panel and never a silent redirect (rule #27).
//
// WHY ONE READ PER LOOP, NOT ONE GROUPED READ:
//   PostgREST has no "latest row per group", so a grouped read has to take a
//   shared row budget — and a single chatty loop then eats it, leaving quiet
//   loops showing "no measurement" when they have one (reviewer B killed
//   exactly that shape, limit(keys × 4), on PR #3883). Each loop therefore gets
//   its own limit(1) read that no other loop can starve, run in small
//   concurrent batches. A second limit(1) read is issued only for the loops
//   whose newest row is still in progress — the settled figure those rows must
//   not replace.
//
// On the day this ships loop_measurements is EMPTY for all 43 loops, so the
// per-loop "no measurement recorded yet" line is the page's first real state.
// Every read swallows to empty rather than 500ing, because the migration is a
// file until the Director-gated apply step runs — same contract as
// /admin/loops and /admin/loops/charters.
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Live Loops', icon: 'Activity' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import {
  createServiceRoleClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { LiveLoopsTable } from './_components/live-loops-table';
import {
  buildLiveLoopRows,
  type LoopMeasurementRow,
  type LoopRegistryBarRow,
} from './_lib/build-live-rows';

/** How many per-loop reads are in flight at once. */
const READ_CONCURRENCY = 8;

const MEASUREMENT_COLS = 'measured_at,value,bar_value,met,gap,run_id,status';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/** The newest row for one loop, whatever its status. Never throws. */
async function newestRow(
  admin: Admin,
  loopKey: string,
  status?: 'final'
): Promise<LoopMeasurementRow | null> {
  try {
    let q = admin
      .from('loop_measurements')
      .select(MEASUREMENT_COLS)
      .eq('loop_key', loopKey);
    if (status) q = q.eq('status', status);
    const r = await q.order('measured_at', { ascending: false }).limit(1);
    if (r.error) return null;
    return ((r.data ?? [])[0] ?? null) as LoopMeasurementRow | null;
  } catch {
    return null;
  }
}

export default async function LiveLoopsPage() {
  const { profile } = await getEnhancedUserProfile();
  // Canonical super-admin definition (matches /admin/loops and
  // /admin/loops/charters): the boolean flag OR the role.
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Live Loops">
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          This page is restricted to super administrators. It reports the
          cluster-wide loop registry and every loop&apos;s measurements against
          its approved bar. If you believe you should have access, contact a
          platform administrator.
        </div>
      </ContentLayout>
    );
  }

  const admin = createServiceRoleClient();

  // The bar columns land with the same Director-gated migration as
  // loop_measurements. Until it is applied the wide select errors, so fall back
  // to the columns that have always existed and render every loop barless —
  // an honest partial page beats a 500 (the /admin/loops idiom).
  const loops: LoopRegistryBarRow[] = await (async () => {
    const base = 'loop_key,name';
    try {
      const r = await admin
        .from('loop_registry')
        .select(`${base},bar,bar_kind,bar_set_at,bar_set_by,bar_miss_streak`)
        .eq('is_active', true);
      if (!r.error) return (r.data ?? []) as unknown as LoopRegistryBarRow[];
      const f = await admin.from('loop_registry').select(base).eq('is_active', true);
      return ((f.data ?? []) as { loop_key: string; name: string | null }[]).map((l) => ({
        loop_key: l.loop_key,
        name: l.name,
        bar: null,
        bar_kind: null,
        bar_set_at: null,
        bar_set_by: null,
        bar_miss_streak: 0,
      }));
    } catch {
      return [] as LoopRegistryBarRow[];
    }
  })();

  // Pass 1 — one limit(1) read per loop, so no loop can starve another.
  const newest = await inBatches(loops, READ_CONCURRENCY, async (l) => ({
    loopKey: l.loop_key,
    row: await newestRow(admin, l.loop_key),
  }));

  // Pass 2 — only where the newest row is still in progress do we need the
  // settled figure underneath it.
  const needFinal = newest.filter((n) => n.row?.status === 'in_progress');
  const finals = await inBatches(needFinal, READ_CONCURRENCY, async (n) => ({
    loopKey: n.loopKey,
    row: await newestRow(admin, n.loopKey, 'final'),
  }));

  const byKey: Record<string, LoopMeasurementRow[]> = {};
  for (const n of newest) {
    byKey[n.loopKey] = n.row ? [n.row] : [];
  }
  for (const f of finals) {
    if (f.row) byKey[f.loopKey] = [...(byKey[f.loopKey] ?? []), f.row];
  }

  const rows = buildLiveLoopRows(loops, byKey);
  const measured = rows.filter((r) => r.hasAnyMeasurement).length;
  const atRisk = rows.filter((r) => r.missStreak >= 4).length;

  return (
    <ContentLayout title="Live Loops — the last measurement, its bar, and the gap">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        One row per active loop: the last settled measurement, the bar it was
        judged against, and the distance between them. A reading that is still
        being taken appears greyed and labelled &ldquo;in progress&rdquo; below
        the settled figure — it never replaces it. A dash is &ldquo;not
        comparable&rdquo; (the loop has no numeric bar yet), never a miss. Bars
        are proposed by the machine and approved on Loop Charters; nothing on
        this page changes anything.
      </p>
      <p className="mb-6 text-xs text-muted-foreground">
        {rows.length} active {rows.length === 1 ? 'loop' : 'loops'} · {measured}{' '}
        with a measurement on record
        {atRisk > 0 ? ` · ${atRisk} at four misses or more` : ''}
      </p>
      <LiveLoopsTable rows={rows} />
    </ContentLayout>
  );
}
