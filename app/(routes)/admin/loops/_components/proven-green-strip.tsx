// ============================================================================
// PROVEN-GREEN STRIP — status with an expiry date
// ============================================================================
// Spec: .claude/proven-green-tower-spec-2026-08-13.md (Director go, 2026-08-13).
// "Green" on this platform has meant three different things — genuinely
// healthy · never tested · broken in a way the check can't see. This strip
// makes the Tower say which one: GREEN means "self-test proven within
// sim_max_age_days", and it DECAYS to amber when the proof ages out.
//
// Status algebra (evaluated top-down, first match wins — spec table v1):
//   RED    Failing   latest sim audit WITHIN the recency window has
//                    verdict <> 'measure-verified'
//   GREY   Meter     any of the 5 charter legs is NULL (counts things; not
//                    yet a loop — an honest state, not a fault)
//   AMBER  Unowned   chartered but verdict_owner IS NULL
//   AMBER  Unproven  chartered + owned, but no sim audit within
//                    sim_max_age_days (includes "no self-test runner exists")
//   GREEN  Proven    chartered + owned + latest sim = 'measure-verified'
//                    and fresh
// Every non-green badge carries its reason string — a status you can act on,
// never a bare color. Walk-layer (human) audits are shown as "last walked"
// information only; NEVER part of the color (v1 — drills and gauge trips are
// explicitly v2, they have no data yet).
//
// Thresholds are platform_policies rows (loops.proven_green.*), read by the
// page with in-code fallbacks 30/180 — Director-adjustable without deploy.
//
// Server-rendered, presentational, READ-ONLY — no edit controls (the owners
// panel from #3001 owns editing). The page (super-admin-gated, service-role)
// passes the same registry rows the owners panel renders, plus the raw
// newest-first audits slice it already fetches.
// ============================================================================

import type { OwnerPanelRow } from './owners-panel';
import type { LoopAuditRow } from './types';

const DAY_MS = 86_400_000;
const PROVEN_VERDICT = 'measure-verified';

type ProvenStatus = 'failing' | 'unowned' | 'unproven' | 'proven' | 'meter';

interface StatusRow {
  row: OwnerPanelRow;
  status: ProvenStatus;
  /** Non-green rows always carry an actionable reason; green carries none. */
  reason: string | null;
  /** Latest sim audit with verdict='measure-verified' (any age). */
  lastProven: string | null;
  /** Latest walk-layer (human) audit, any verdict. */
  lastWalked: string | null;
  walkStale: boolean;
}

const BADGE_LABEL: Record<ProvenStatus, string> = {
  failing: 'failing',
  unowned: 'unowned',
  unproven: 'unproven',
  proven: 'proven',
  meter: 'meter',
};

// Same pill idiom as the owners panel's charter badge (emerald/amber), extended
// with the red and grey states this algebra adds.
const BADGE_CLS: Record<ProvenStatus, string> = {
  failing:
    'border-red-400/60 bg-red-50/60 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300',
  unowned:
    'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300',
  unproven:
    'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300',
  proven:
    'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  meter: 'border-border bg-muted/40 text-muted-foreground',
};

// Management-by-exception ordering: exceptions (failing, unowned) pinned
// first, then the work queue (unproven), then the healthy, then the meters.
const STATUS_ORDER: Record<ProvenStatus, number> = {
  failing: 0,
  unowned: 1,
  unproven: 2,
  proven: 3,
  meter: 4,
};

const d10 = (iso: string) => iso.slice(0, 10);
const ageDays = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);

function classify(
  row: OwnerPanelRow,
  latestSim: LoopAuditRow | undefined,
  latestProvenSim: LoopAuditRow | undefined,
  latestWalk: LoopAuditRow | undefined,
  simMaxAgeDays: number,
  walkMaxAgeDays: number,
): StatusRow {
  const simFresh =
    latestSim !== undefined && ageDays(latestSim.audited_at) <= simMaxAgeDays;

  let status: ProvenStatus;
  let reason: string | null;
  if (simFresh && latestSim.verdict !== PROVEN_VERDICT) {
    status = 'failing';
    reason = `self-test failed — verdict "${latestSim.verdict ?? 'none'}" on ${d10(latestSim.audited_at)}`;
  } else if (row.missing_legs.length > 0) {
    status = 'meter';
    reason = `meter — charter incomplete (${row.missing_legs.length} of 5 legs missing)`;
  } else if (row.verdict_owner === null) {
    status = 'unowned';
    reason = 'no verdict owner';
  } else if (!simFresh) {
    status = 'unproven';
    reason =
      latestSim === undefined
        ? 'unproven — no self-test runner'
        : latestProvenSim
          ? `last proven ${ageDays(latestProvenSim.audited_at)} days ago — proof expired (max ${simMaxAgeDays}d)`
          : `last self-test ${ageDays(latestSim.audited_at)} days ago never verified`;
  } else {
    status = 'proven';
    reason = null;
  }

  return {
    row,
    status,
    reason,
    lastProven: latestProvenSim ? d10(latestProvenSim.audited_at) : null,
    lastWalked: latestWalk ? d10(latestWalk.audited_at) : null,
    walkStale:
      latestWalk !== undefined && ageDays(latestWalk.audited_at) > walkMaxAgeDays,
  };
}

export function ProvenGreenStrip({
  rows,
  audits,
  openConflicts,
  simMaxAgeDays,
  walkMaxAgeDays,
}: {
  /** The #3001 owners panel's registry rows — same data, no edit controls. */
  rows: OwnerPanelRow[];
  /** The page's existing newest-first loop_audits slice (limit 500). */
  audits: LoopAuditRow[];
  openConflicts: number;
  simMaxAgeDays: number;
  walkMaxAgeDays: number;
}) {
  // Audits arrive newest-first — the first row seen per (loop, criterion) wins.
  const latestSim = new Map<string, LoopAuditRow>();
  const latestProvenSim = new Map<string, LoopAuditRow>();
  const latestWalk = new Map<string, LoopAuditRow>();
  for (const a of audits) {
    if (a.layer === 'sim') {
      if (!latestSim.has(a.loop_key)) latestSim.set(a.loop_key, a);
      if (a.verdict === PROVEN_VERDICT && !latestProvenSim.has(a.loop_key))
        latestProvenSim.set(a.loop_key, a);
    } else if (a.layer === 'walk') {
      if (!latestWalk.has(a.loop_key)) latestWalk.set(a.loop_key, a);
    }
  }

  const statusRows = rows
    .map((r) =>
      classify(
        r,
        latestSim.get(r.loop_key),
        latestProvenSim.get(r.loop_key),
        latestWalk.get(r.loop_key),
        simMaxAgeDays,
        walkMaxAgeDays,
      ),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.row.name.localeCompare(b.row.name),
    );

  const count = (s: ProvenStatus) =>
    statusRows.filter((r) => r.status === s).length;
  const exceptions = statusRows.filter(
    (r) => r.status === 'failing' || r.status === 'unowned',
  );

  const summary: { label: string; value: number; cls: string }[] = [
    { label: 'Proven', value: count('proven'), cls: BADGE_CLS.proven },
    { label: 'Failing', value: count('failing'), cls: BADGE_CLS.failing },
    { label: 'Unproven', value: count('unproven'), cls: BADGE_CLS.unproven },
    { label: 'Unowned', value: count('unowned'), cls: BADGE_CLS.unowned },
    { label: 'Meters', value: count('meter'), cls: BADGE_CLS.meter },
    { label: 'Conflicts open', value: openConflicts, cls: BADGE_CLS.meter },
  ];

  return (
    <section className="rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">
            Proven-green — status with an expiry date
          </h2>
          <p className="text-xs text-muted-foreground">
            Green means the loop&rsquo;s self-test verified it within{' '}
            {simMaxAgeDays} days — proof decays, it is never a permanent state.
            Every non-green badge names the action it needs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.map((s) => (
            <span
              key={s.label}
              className={`inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${s.cls}`}
            >
              {s.label}
              <span className="tabular-nums">{s.value}</span>
            </span>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          The loop registry is empty or unreachable — nothing to grade.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {statusRows.map((r, i) => {
            const firstNonException =
              exceptions.length > 0 && i === exceptions.length;
            return (
              <li
                key={r.row.loop_key}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm ${
                  r.row.is_active ? '' : 'opacity-60'
                } ${firstNonException ? 'border-t border-border' : ''}`}
              >
                <span
                  className={`inline-block w-20 shrink-0 rounded-full border px-2 py-0.5 text-center font-mono text-[10px] uppercase tracking-wide ${BADGE_CLS[r.status]}`}
                >
                  {BADGE_LABEL[r.status]}
                </span>
                <span className="font-medium">{r.row.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {r.row.loop_key}
                  {!r.row.is_active && ' · inactive'}
                </span>
                {r.reason && (
                  <span
                    className={`text-xs ${
                      r.status === 'failing'
                        ? 'text-red-700 dark:text-red-400'
                        : r.status === 'meter'
                          ? 'text-muted-foreground'
                          : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {r.reason}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-baseline gap-x-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                  <span>
                    last proven {r.lastProven ?? 'never'}
                  </span>
                  <span>
                    last walked{' '}
                    {r.lastWalked
                      ? `${r.lastWalked}${r.walkStale ? ` (>${walkMaxAgeDays}d ago)` : ''}`
                      : 'never'}
                  </span>
                  <span>{r.row.owner_email ?? 'no owner email'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
