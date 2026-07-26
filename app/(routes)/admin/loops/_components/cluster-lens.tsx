// ============================================================================
// CLUSTER LENS — the CAC's horizontal slice of the Loop Control Tower (C4)
// ============================================================================
// IQAC is the vertical spine per college; the CAC is ONE horizontal spine
// across institutions, working through discipline clusters (e.g. Health
// Sciences). This view aggregates the tower's live loop signals across a
// hand-picked set of institutions and compares each aggregate against the
// SAME aggregate one window earlier — the cluster's OWN baseline. Clusters are
// never ranked against each other here: the comparison unit is
// this-cluster-now vs this-cluster-before, full stop.
//
// Server-rendered, presentational only — the page (already super-admin-gated,
// service-role) computes every number and passes them down. The only client
// island is the member picker. Hollow rule inherited from the tower: a failed
// count renders "no data" (dashed), never zero, never silently healthy.
// ============================================================================

import type {
  ClusterInstitutionOption,
  ClusterPreset,
  ClusterSignal,
} from './types';
import { ClusterPicker } from './cluster-picker';

// Delta vs the cluster's own baseline. Tones: more signal = emerald, less =
// amber (quieter, worth a look — not an alarm), flat/quiet = muted. A hollow
// leg (either window unreadable) renders dashed "no data".
function DeltaPill({
  current,
  baseline,
}: {
  current: number | null;
  baseline: number | null;
}) {
  if (current === null || baseline === null) {
    return (
      <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 font-mono text-[10.5px] italic text-muted-foreground/70">
        no data
      </span>
    );
  }
  if (current === 0 && baseline === 0) {
    return (
      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
        quiet both windows
      </span>
    );
  }
  const diff = current - baseline;
  if (diff === 0) {
    return (
      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
        → unchanged
      </span>
    );
  }
  const pct =
    baseline > 0 ? ` · ${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / baseline) * 100)}%` : ' · new';
  const cls =
    diff > 0
      ? 'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300'
      : 'border-amber-400/60 bg-amber-50/60 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-400';
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold ${cls}`}>
      {diff > 0 ? '▲' : '▼'} {diff > 0 ? '+' : '−'}
      {Math.abs(diff)}
      {pct}
    </span>
  );
}

const nv = (v: number | null) => (v === null ? 'no data' : String(v));

export function ClusterLens({
  institutions,
  presets,
  selectedIds,
  signals,
  windowDays,
  asOf,
}: {
  institutions: ClusterInstitutionOption[];
  presets: ClusterPreset[];
  /** Validated member selection from the URL (may be empty). */
  selectedIds: string[];
  /** null when no members are selected yet (the empty state, not a failure). */
  signals: ClusterSignal[] | null;
  windowDays: number;
  asOf: string;
}) {
  const byId = new Map(institutions.map((i) => [i.id, i]));
  const members = selectedIds
    .map((id) => byId.get(id))
    .filter((i): i is ClusterInstitutionOption => Boolean(i));

  return (
    <div className="space-y-4">
      {/* What this lens is — and what it deliberately is not */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Cluster lens — one horizontal slice across institutions
        </p>
        <p className="max-w-[90ch] text-[13.5px] text-muted-foreground">
          IQAC runs vertically inside each college; the CAC runs horizontally
          across them through discipline clusters. Pick a cluster&apos;s member
          institutions below and the tower&apos;s live loop signals are summed
          across them, each compared against{' '}
          <strong className="font-semibold text-foreground">
            the same cluster&apos;s own prior window
          </strong>{' '}
          (last {windowDays} days vs the {windowDays} days before) — never
          against another cluster.
        </p>
      </div>

      {/* Reset the picker's draft whenever the APPLIED selection changes from
          outside (back button, bookmark) — keyed remount, no effect needed. */}
      <ClusterPicker
        key={selectedIds.join('|')}
        institutions={institutions}
        presets={presets}
        appliedIds={selectedIds}
      />

      {signals === null ? (
        // Empty state — no members picked yet. A real rendered card in the
        // same footprint (never a bare null): nothing here is "loading".
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          No cluster selected yet. Tick the member institutions above — e.g.
          the Health Sciences colleges — and this panel fills with the
          cluster&apos;s aggregate loop signals against its own baseline. The
          selection persists in the URL, so each CAC can bookmark its view.
        </div>
      ) : (
        <>
          {/* Member roster — the aggregate is only honest if you can see
              exactly which institutions are inside it. */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="font-mono text-[10.5px] uppercase tracking-wider">
              aggregating {members.length} institution
              {members.length === 1 ? '' : 's'}:
            </span>
            {members.map((m) => (
              <span
                key={m.id}
                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                title={m.name}
              >
                {m.display_name || m.name}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signals.map((s) => (
              <div key={s.key} className="rounded-xl border border-border bg-card p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                  {s.label}
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={`font-mono text-2xl font-bold leading-none tabular-nums ${
                      s.current === null
                        ? 'text-base font-normal italic text-muted-foreground/60'
                        : 'text-foreground'
                    }`}
                  >
                    {nv(s.current)}
                  </span>
                  <DeltaPill current={s.current} baseline={s.baseline} />
                </div>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground/80">
                  own baseline (prior {windowDays}d): {nv(s.baseline)}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  {s.plain}
                </p>
              </div>
            ))}
          </div>

          <p className="border-t border-border pt-3 font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground/70">
            Fetched live from production on load · {asOf} · same tables the
            Tower reads, filtered to the selected institutions. Rows carrying
            no institution tag (e.g. course-level coaching rows) are excluded
            from every cluster aggregate, so cluster numbers can run below the
            campus-wide Tower totals. A falling signal reads amber (quieter,
            worth a look), not red — window-to-window noise is expected at
            current volumes.
          </p>
        </>
      )}
    </div>
  );
}
