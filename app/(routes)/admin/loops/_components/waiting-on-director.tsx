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
// empty state — "Nothing is waiting on you." — is the whole point.
//
// v2 (2026-09-02, Director decision Q8): a finished build waiting for his
// merge is a decision like any other. Third source = open, non-draft pull
// requests on Jicate-Solutions/MyJKKN whose checks are green, read via
// lib/services/loops/pending-prs.ts. Aged from the PR's `created_at` (when
// the build was opened) — GitHub exposes no "became ready" timestamp on the
// PR object, and in this repo a draft is itself waiting on the Director's
// answers to its [risky] assumptions, so the open date is the honest start
// of the wait. When GitHub cannot be read, the source returns a `notice` row
// so the panel says so — never a silent empty (rule #27).
// ============================================================================

import Link from 'next/link';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { loadPendingPrs } from '@/lib/services/loops/pending-prs';

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
  {
    // Builds ready to merge: open, non-draft PRs with green checks — the
    // Director merges everything, so each one waits on him. Read from
    // GitHub (memoised 5 min in-process); an unreadable GitHub is a notice
    // row, not an empty list. loadPendingPrs never throws, and the admin
    // client is not needed for this source.
    key: 'ready-prs',
    load: () =>
      loadPendingPrs().then(
        (res): WaitingItem[] => {
          // Explicit `=== false` first: with strictNullChecks off, the else
          // branch of a union ternary never narrows.
          if (res.ok === false) {
            return [
              {
                key: 'ready-prs:unreadable',
                label: `Could not read GitHub — builds waiting for merge are not shown (${res.reason})`,
                sourceLabel: 'Builds ready to merge',
                waitingSince: new Date().toISOString(),
                href: 'https://github.com/Jicate-Solutions/MyJKKN/pulls',
                kind: 'notice',
              },
            ];
          }
          const rows: WaitingItem[] = res.prs.map((pr) => ({
            key: `ready-prs:${pr.number}`,
            label: `Build waiting for merge: #${pr.number} ${pr.title}`,
            sourceLabel: 'Builds ready to merge',
            waitingSince: pr.createdAt,
            href: pr.url,
          }));
          // Past the reader's cap: say how many newest builds were not
          // checked rather than let them vanish.
          if (res.unchecked > 0) {
            rows.push({
              key: 'ready-prs:unchecked',
              label: `${res.unchecked} newer open builds were not checked this load — open GitHub to see them`,
              sourceLabel: 'Builds ready to merge',
              waitingSince: new Date().toISOString(),
              href: 'https://github.com/Jicate-Solutions/MyJKKN/pulls?q=is%3Apr+is%3Aopen+draft%3Afalse',
              kind: 'notice',
            });
          }
          return rows;
        },
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
            <span
              className={`inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${AGE_CLS.neutral}`}
            >
              pending <span className="tabular-nums">{items.length}</span>
            </span>
            {overdue > 0 && (
              <span
                className={`inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${AGE_CLS.red}`}
              >
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
          Nothing is waiting on you.
        </div>
      ) : (
        // Single column on purpose — phone-first; the whole card is the tap
        // target, sized for a thumb.
        <ul className="flex flex-col divide-y divide-border/60">
          {items.map((item) => {
            const days = ageDays(item.waitingSince);
            const tone = ageTone(days);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.sourceLabel} · since {item.waitingSince.slice(0, 10)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] tabular-nums ${AGE_CLS[tone]}`}
                  >
                    {tone === 'red'
                      ? `waiting ${days} days`
                      : `${days}d`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
