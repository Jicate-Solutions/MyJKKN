// ============================================================================
// WAITING ON THE DIRECTOR — pending decisions, with age
// ============================================================================
// Created: 2026-08-26. The Tower shows loop health, but the Director's OWN
// pending decisions were invisible on it — a promotion proposal sat 19 days
// against his own 7-day stuck-vote rule. This panel lists everything in the
// loop estate that is blocked on his signature, oldest first, colored by age
// against that rule: <5d neutral · 5–7d amber · >7d red.
//
// v1 sources (loop-estate only): prompt-graduation proposals (status=pending)
// and MetaLoop charter drafts (status=proposed). WAITING_SOURCES below is the
// extension point — a future source (owner votes, gauge trips) is ONE typed
// entry: a query that maps rows to WaitingItem, swallow-to-empty like every
// read on this page (a missing table renders as "nothing from that source",
// never a 500).
//
// Mobile-first: the Director reads this on an iPhone — single-column cards,
// the whole card is the tap target, tabular-nums for counts. Read-only; the
// deep link lands on the surface where the decision is actually made. The
// empty states — "No decisions are waiting on you." / "No finished builds
// are waiting for your merge." — are the whole point.
//
// v2 (2026-09-02, Director decision Q8, then D1–D3 + reviewer findings
// P1–P6): a finished build waiting for his merge is a decision like any
// other. Builds are NOT a WAITING_SOURCES entry: GitHub is slow (seconds,
// not milliseconds) and must never block the page (D2), so the builds block
// is its own async server component, <BuildsWaitingForMerge/>, streamed in
// under a <Suspense> boundary BELOW the decision rows — it can never bury a
// promotion or a charter review (P4). It reads lib/services/loops/pending-prs.ts:
// open, non-draft, green OR with no checks at all, not `parked`, not
// merge-conflicted, aged from the ready-for-review flip. A PR with no check
// runs (base is a feature branch, or opened while Actions was dark) is still
// his decision — it ages like the rest and its subtitle says "no checks ran"
// (reconcile round, obj. 1). When GitHub cannot be read — or times out, or
// the shared rate budget is low — the block says so in one explicit line;
// never a silent empty, never a fallback that stays forever (rule #27).
// Phone-first: at most BUILD_ROWS rows render; the rest is one counted link
// to GitHub, mirroring the "not checked" overflow notice.
// ============================================================================

import { Suspense } from 'react';
import Link from 'next/link';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadPendingPrs, PARKED_LABEL } from '@/lib/services/loops/pending-prs';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

const DAY_MS = 86_400_000;
/** The Director's stuck-vote rule: a decision pending past this many days is red. */
const STUCK_DAYS = 7;
const AMBER_FROM_DAYS = 5;

export interface WaitingItem {
  /** Stable per-row key (source key + row id). */
  key: string;
  /** What is waiting, e.g. 'Prompt promotion: reply.draft'. */
  label: string;
  /** Which queue it sits in, e.g. 'Prompt graduation'. */
  sourceLabel: string;
  /** ISO timestamp the item started waiting (row created_at). */
  waitingSince: string;
  /** Where the decision is made. */
  href: string;
  /**
   * 'decision' (default) is a row that ages and counts as pending. 'notice'
   * is a source telling the Director it could NOT be read — rendered as a
   * muted strip with no age chip, never counted, never sorted into the list.
   */
  kind?: 'decision' | 'notice';
}

// ── Extension point ──────────────────────────────────────────────────────────
// One entry per decision queue. Each load() must swallow every failure to []
// (PromiseLike has no .catch — the rejection handler is .then's 2nd arg), so
// one broken source can never blank the others or 500 the page.
interface WaitingSource {
  key: string;
  // PromiseLike, not Promise — the supabase builder's .then() returns the
  // former (which is also why the swallow lives in .then's 2nd arg).
  load: (admin: AdminClient) => PromiseLike<WaitingItem[]>;
}

const WAITING_SOURCES: WaitingSource[] = [
  {
    // Prompt graduation: a challenger prompt beat the champion and the swap
    // waits on the Director (decided on /admin/loops via the AI-models panel).
    key: 'prompt-graduation',
    load: (admin) =>
      admin
        .from('ai_prompt_graduation_proposals')
        .select('id, job_type, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100)
        .then(
          (r) =>
            ((r.data ?? []) as { id: string; job_type: string | null; created_at: string }[]).map(
              (row) => ({
                key: `prompt-graduation:${row.id}`,
                label: `Prompt promotion: ${row.job_type || row.id}`,
                sourceLabel: 'Prompt graduation',
                waitingSince: row.created_at,
                href: '/admin/loops',
              }),
            ),
          () => [] as WaitingItem[],
        ),
  },
  {
    // MetaLoop charter drafts: the machine drafted a loop charter and the
    // approval waits on a super admin at /admin/loops/charters.
    key: 'charter-proposals',
    load: (admin) =>
      admin
        .from('loop_charter_proposals')
        .select('id, loop_key, created_at')
        .eq('status', 'proposed')
        .order('created_at', { ascending: true })
        .limit(100)
        .then(
          (r) =>
            ((r.data ?? []) as { id: string; loop_key: string | null; created_at: string }[]).map(
              (row) => ({
                key: `charter-proposals:${row.id}`,
                label: `Charter to review: ${row.loop_key || row.id}`,
                sourceLabel: 'Loop charters',
                waitingSince: row.created_at,
                href: '/admin/loops/charters',
              }),
            ),
          () => [] as WaitingItem[],
        ),
  },
];

/** Load every source in parallel and merge, longest-waiting first. */
export async function loadWaitingOnDirector(admin: AdminClient): Promise<WaitingItem[]> {
  const perSource = await Promise.all(WAITING_SOURCES.map((s) => s.load(admin)));
  const all = perSource.flat();
  // Notices ride along unsorted; the panel splits them out before rendering.
  return [
    ...all.filter((i) => i.kind === 'notice'),
    ...all
      .filter((i) => i.kind !== 'notice')
      .sort(
        (a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime(),
      ),
  ];
}

// ── Presentation ─────────────────────────────────────────────────────────────

const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));

type AgeTone = 'neutral' | 'amber' | 'red';

const ageTone = (days: number): AgeTone =>
  days > STUCK_DAYS ? 'red' : days >= AMBER_FROM_DAYS ? 'amber' : 'neutral';

// Same chip idiom as the proven-green strip (amber/red pills + muted neutral).
const AGE_CLS: Record<AgeTone, string> = {
  red: 'border-red-400/60 bg-red-50/60 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300',
  amber:
    'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300',
  neutral: 'border-border bg-muted/40 text-muted-foreground',
};

const CHIP_CLS =
  'inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide';

/** One aging row — shared by decisions and builds so they read as one list. */
function AgedRow({
  href,
  label,
  subtitle,
  waitingSince,
}: {
  href: string;
  label: string;
  subtitle: string;
  waitingSince: string;
}) {
  const days = ageDays(waitingSince);
  const tone = ageTone(days);
  return (
    <Link
      href={href}
      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] tabular-nums ${AGE_CLS[tone]}`}
      >
        {tone === 'red' ? `waiting ${days} days` : `${days}d`}
      </span>
    </Link>
  );
}

const PULLS_URL = 'https://github.com/Jicate-Solutions/MyJKKN/pulls';
const BUILDS_SOURCE_LABEL = 'Builds ready to merge';
/** Every open non-draft PR minus the ones he set aside — the same list, on GitHub. */
const PULLS_OPEN_URL = `${PULLS_URL}?q=is%3Apr+is%3Aopen+draft%3Afalse+-label%3A${PARKED_LABEL}`;
/**
 * Rows rendered before the list folds into one "N more" link. Measured
 * 2026-09-02: ~40 mergeable PRs — a phone screen of the oldest waits is the
 * useful part; the overdue chip above still counts every one of them.
 */
const BUILD_ROWS = 12;

/**
 * The builds block — an async server component so the GitHub read streams in
 * under <Suspense> while the rest of the panel (and page) paints at once (D2).
 * Renders, in order: one explicit outage line OR the aging rows, then the
 * "could not be verified" rows, then the quiet conflict / overflow notices.
 */
async function BuildsWaitingForMerge() {
  const res = await loadPendingPrs();

  // Explicit `=== false` first: with strictNullChecks off, the else branch of
  // a union ternary never narrows.
  if (res.ok === false) {
    return (
      <div className="border-t border-border bg-amber-50/40 dark:bg-amber-950/20">
        <Link
          href={PULLS_URL}
          className="block px-4 py-2 text-xs text-amber-800 transition-colors hover:bg-amber-100/40 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          Could not read GitHub — builds row unavailable ({res.reason})
        </Link>
      </div>
    );
  }

  const overdue = res.prs.filter((pr) => ageDays(pr.readySince) > STUCK_DAYS).length;
  const noChecks = res.prs.filter((pr) => pr.checks === 'none').length;
  const shown = res.prs.slice(0, BUILD_ROWS);
  const folded = res.prs.length - shown.length;

  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/20 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {BUILDS_SOURCE_LABEL}
        </span>
        {res.prs.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`${CHIP_CLS} ${AGE_CLS.neutral}`}>
              waiting <span className="tabular-nums">{res.prs.length}</span>
            </span>
            {overdue > 0 && (
              <span className={`${CHIP_CLS} ${AGE_CLS.red}`}>
                past {STUCK_DAYS}d <span className="tabular-nums">{overdue}</span>
              </span>
            )}
            {/* Obj. 1: a build nothing will ever check is still counted, and
                named as such, so the number above never hides it. */}
            {noChecks > 0 && (
              <span className={`${CHIP_CLS} ${AGE_CLS.amber}`}>
                no checks <span className="tabular-nums">{noChecks}</span>
              </span>
            )}
          </span>
        )}
      </div>

      {res.prs.length === 0 && res.unverified.length === 0 ? (
        <div className="px-4 py-3 text-center text-sm text-muted-foreground">
          No finished builds are waiting for your merge.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {shown.map((pr) => (
            <li key={`ready-prs:${pr.number}`}>
              <AgedRow
                href={pr.url}
                label={`#${pr.number} ${pr.title}`}
                subtitle={[
                  pr.readySinceSource === 'unverified'
                    ? `open since ${pr.readySince.slice(0, 10)} · ready date could not be verified`
                    : `ready since ${pr.readySince.slice(0, 10)}`,
                  // Obj. 1: no workflow fires on this PR — say so on the row
                  // rather than let "ready" imply a green gate.
                  pr.checks === 'none' ? 'no checks ran' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                waitingSince={pr.readySince}
              />
            </li>
          ))}
          {/* Note 6: past BUILD_ROWS the list folds into one counted link —
              the oldest waits stay on screen, the rest is one tap away. */}
          {folded > 0 && (
            <li key="ready-prs:folded">
              <Link
                href={PULLS_OPEN_URL}
                className="block px-4 py-2 text-xs text-muted-foreground hover:underline"
              >
                <span className="tabular-nums">{folded}</span> more builds are waiting — see
                all on GitHub
              </Link>
            </li>
          )}
          {/* P2 / rule #27: an unreadable check-runs or merge-state response
              is a visible row, never a deletion. No age chip — nothing is
              known to be waiting on him yet. */}
          {res.unverified.map((pr) => (
            <li key={`ready-prs:unverified:${pr.number}`}>
              <Link
                href={pr.url}
                className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    #{pr.number} {pr.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{pr.reason}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] ${AGE_CLS.neutral}`}
                >
                  unverified
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(res.conflicted > 0 || res.unchecked > 0) && (
        <div className="flex flex-col gap-0.5 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          {/* P1: conflicted PRs cannot be merged by him — one quiet line. */}
          {res.conflicted > 0 && (
            <span>
              <span className="tabular-nums">{res.conflicted}</span> builds are blocked by code
              conflicts — not waiting on you.
            </span>
          )}
          {/* Past the reader's cap: say how many newest builds were not
              checked rather than let them vanish. */}
          {res.unchecked > 0 && (
            <Link href={PULLS_OPEN_URL} className="hover:underline">
              <span className="tabular-nums">{res.unchecked}</span> newer open builds were not
              checked this load — open GitHub to see them
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function WaitingOnDirectorPanel({ items: allItems }: { items: WaitingItem[] }) {
  const notices = allItems.filter((i) => i.kind === 'notice');
  const items = allItems.filter((i) => i.kind !== 'notice');
  const overdue = items.filter((i) => ageDays(i.waitingSince) > STUCK_DAYS).length;

  return (
    <section className="rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">
            Waiting on the Director
          </h2>
          <p className="text-xs text-muted-foreground">
            Decisions and finished builds blocked on your signature. Red means
            past your own {STUCK_DAYS}-day rule.
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${CHIP_CLS} ${AGE_CLS.neutral}`}>
              pending <span className="tabular-nums">{items.length}</span>
            </span>
            {overdue > 0 && (
              <span className={`${CHIP_CLS} ${AGE_CLS.red}`}>
                past {STUCK_DAYS}d <span className="tabular-nums">{overdue}</span>
              </span>
            )}
          </div>
        )}
      </header>

      {/* A source that could not be read says so here — an empty list below
          must never be mistaken for "nothing waiting" (rule #27). */}
      {notices.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60 border-b border-border bg-amber-50/40 dark:bg-amber-950/20">
          {notices.map((n) => (
            <li key={n.key}>
              <Link
                href={n.href}
                className="block px-4 py-2 text-xs text-amber-800 transition-colors hover:bg-amber-100/40 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No decisions are waiting on you.
        </div>
      ) : (
        // Single column on purpose — phone-first; the whole card is the tap
        // target, sized for a thumb.
        <ul className="flex flex-col divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.key}>
              <AgedRow
                href={item.href}
                label={item.label}
                subtitle={`${item.sourceLabel} · since ${item.waitingSince.slice(0, 10)}`}
                waitingSince={item.waitingSince}
              />
            </li>
          ))}
        </ul>
      )}

      {/* D2: GitHub streams in below the decisions; the page never waits for
          it. P4: placed last so builds can never bury a decision above. */}
      <Suspense
        fallback={
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Checking builds waiting for your merge…
          </div>
        }
      >
        <BuildsWaitingForMerge />
      </Suspense>
    </section>
  );
}
