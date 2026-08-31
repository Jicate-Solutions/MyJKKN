/**
 * Dashboard v2 — Decision Queue container
 * Server component. Fetches via listQueueItems(), renders filter chips + list.
 * Filter state via URL query param `?queue=<type>` (bookmarkable + no-JS fallback).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.2, §7.2
 */

import Link from 'next/link';
import {
  listQueueItems,
  QueueFilter,
  QueueCounts,
  QueueItem
} from '@/lib/services/dashboard/decision-queue-service';
import { QueueItemCard } from '@/components/dashboard/decision-queue-item';
import { TabTitleBadge } from '@/components/dashboard/tab-title-badge';

type DecisionQueueProps = {
  filter?: QueueFilter;
  /** Optional override: absolute base path for filter chip links */
  basePath?: string;
};

// ============================================================================
// Filter chip — server-rendered link (URL drives state)
// ============================================================================
function FilterChip({
  label,
  count,
  active,
  href
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  const cls = active
    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
    : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800';
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${cls}`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`tabular-nums font-semibold ${active ? 'opacity-90' : 'opacity-60'}`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// ============================================================================
// Empty state
// ============================================================================
function EmptyState({ filter }: { filter: QueueFilter }) {
  const label = filter === 'all' ? 'any' : `any ${filter}`;
  return (
    <div className='py-12 text-center'>
      <div className='text-5xl mb-3'>✓</div>
      <div className='text-sm font-medium text-neutral-900 dark:text-neutral-100'>
        Inbox zero — no {label} items awaiting your action
      </div>
      {/* 2026-08-09 (mobile audit finding 05, moved here from PR #2941 so one
          PR owns this file): the auto-escalation sentence was removed because
          it promised something that was not happening — fn_dashboard_queue_escalate
          required notifications.requires_acknowledgment = TRUE while
          fn_create_dashboard_work_item writes FALSE, so no work item had ever
          escalated even at 107 days overdue.

          That filter was FIXED in production later the same day (migration
          20260817000100, applied 2026-08-09 12:58 UTC). Escalation now runs —
          but only for items created after dashboard_config.escalation_start_at,
          because un-gating it against the existing backlog would have sent
          9,087 items to one person. So the sentence is still not restored: it
          would be true for new items and false for everything already in the
          queue. Restore it once the pre-cutoff backlog is cleared, at which
          point "auto-escalates after 2h" is true of every item on screen. */}
      <div className='mt-2 text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed'>
        New items (approvals, escalations, cold-lead rescues, anomalies) will
        appear here.
      </div>
    </div>
  );
}

// ============================================================================
// Collapse repeated daily digests
// ----------------------------------------------------------------------------
// The digest work item is raised once a day per category (its DB key ends in
// the date), so every day it goes unacknowledged adds another near-identical
// card. On a phone one card fills most of the screen, and two copies of
// "Daily digest — 7426 stale lead(s)" push real items out of sight. Keep the
// newest run of each digest category and say how many runs it stands for.
// Non-digest items are never merged.
// ============================================================================
// `ids` lists every user_notification row the card stands for, so acting on
// the card can clear all of them. Without it, dismissing the visible digest
// only acknowledged the newest row and the next-oldest instantly replaced it.
type QueueEntry = { item: QueueItem; repeats: number; ids: string[] };

function collapseDigests(items: QueueItem[]): QueueEntry[] {
  const entries: QueueEntry[] = [];
  const indexByDigestKey = new Map<string, number>();

  for (const item of items) {
    const cfg = item.action_config as { digest?: unknown } | null | undefined;
    if (cfg?.digest !== true) {
      entries.push({ item, repeats: 1, ids: [item.user_notification_id] });
      continue;
    }
    const key = item.category;
    const at = indexByDigestKey.get(key);
    if (at === undefined) {
      indexByDigestKey.set(key, entries.length);
      entries.push({ item, repeats: 1, ids: [item.user_notification_id] });
      continue;
    }
    const kept = entries[at];
    kept.repeats += 1;
    kept.ids.push(item.user_notification_id);
    // Newest run wins — its counts are the ones still worth acting on.
    if (item.age_seconds < kept.item.age_seconds) kept.item = item;
  }

  return entries;
}

// ============================================================================
// Main container
// ============================================================================
export async function DecisionQueue({
  filter = 'all',
  basePath = '/dashboard'
}: DecisionQueueProps) {
  const { items, counts } = await listQueueItems(filter);
  const entries = collapseDigests(items);

  // 2026-08-09 (verifier finding on this PR): the chips and the browser-tab
  // badge report RPC aggregates, the list below reports rendered cards, and
  // the two numbers are not the same thing. Two separate reasons they differ:
  //   * listQueueItems caps the fetch at 50 rows, so a queue of 101 has always
  //     rendered at most 50 cards — this predates the PR.
  //   * this PR merges repeat daily digest rows into one card each.
  // Recomputing the chips from the rendered rows would be worse, not better:
  // the chips would then read 50 and the other 51 open items would vanish with
  // nothing on screen admitting they exist. So the aggregates stay honest and
  // the header states what they count against what is drawn.
  // NOTE: counts.total is the all-types total regardless of the active filter,
  // so a filtered view has to compare against that filter's own count.
  const filterTotal = filter === 'all' ? counts.total : counts[filter];
  const mergedAway = items.length - entries.length;
  const beyondPage = Math.max(0, filterTotal - items.length);

  const chipHref = (f: QueueFilter) =>
    f === 'all' ? `${basePath}#decision-queue` : `${basePath}?queue=${f}#decision-queue`;

  return (
    <div
      id='decision-queue'
      className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm scroll-mt-24'
    >
      {/* Side-effect: update browser tab title with unread count (WhatsApp-style pull) */}
      <TabTitleBadge count={counts.total} />
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800'>
        <div>
          <h2 className='text-base sm:text-lg font-semibold'>Decision Queue</h2>
          {/* 2026-08-09 (mobile audit finding 05, moved here from PR #2941 so
              one PR owns this file): dropped the 2-hour auto-escalation claim —
              see EmptyState above for why it is not true today. Replaced with
              the sort order, which the RPC really does apply
              (severity_order ASC, created_at ASC). */}
          <p className='text-xs text-neutral-500 mt-0.5'>
            Items awaiting your action · highest priority first, then oldest
          </p>
          {(mergedAway > 0 || beyondPage > 0) && (
            <p className='text-xs text-neutral-500 mt-0.5'>
              Showing {entries.length} of {filterTotal}
              {mergedAway > 0 && (
                <>
                  {' '}
                  · {mergedAway} repeat daily{' '}
                  {mergedAway === 1 ? 'digest' : 'digests'} merged
                </>
              )}
              {beyondPage > 0 && <> · {beyondPage} not on this page</>}
            </p>
          )}
        </div>
        <FilterChipRow counts={counts} active={filter} chipHref={chipHref} />
      </div>

      <div className='p-3 sm:p-4'>
        {entries.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className='space-y-2.5'>
            {entries.map(({ item, repeats, ids }) => (
              <QueueItemCard
                key={item.user_notification_id}
                item={item}
                repeats={repeats}
                groupIds={ids}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChipRow({
  counts,
  active,
  chipHref
}: {
  counts: QueueCounts;
  active: QueueFilter;
  chipHref: (f: QueueFilter) => string;
}) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      <FilterChip
        label='All'
        count={counts.total}
        active={active === 'all'}
        href={chipHref('all')}
      />
      <FilterChip
        label='Approvals'
        count={counts.approval}
        active={active === 'approval'}
        href={chipHref('approval')}
      />
      <FilterChip
        label='Escalations'
        count={counts.escalation}
        active={active === 'escalation'}
        href={chipHref('escalation')}
      />
      <FilterChip
        label='Rescues'
        count={counts.rescue}
        active={active === 'rescue'}
        href={chipHref('rescue')}
      />
      <FilterChip
        label='Anomalies'
        count={counts.anomaly}
        active={active === 'anomaly'}
        href={chipHref('anomaly')}
      />
    </div>
  );
}
