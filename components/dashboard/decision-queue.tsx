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
      <div className='mt-2 text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed'>
        New items (approvals, escalations, cold-lead rescues, anomalies) will
        appear here. Unacked items auto-escalate to the Chief of Staff after 2h.
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
type QueueEntry = { item: QueueItem; repeats: number };

function collapseDigests(items: QueueItem[]): QueueEntry[] {
  const entries: QueueEntry[] = [];
  const indexByDigestKey = new Map<string, number>();

  for (const item of items) {
    const cfg = item.action_config as { digest?: unknown } | null | undefined;
    if (cfg?.digest !== true) {
      entries.push({ item, repeats: 1 });
      continue;
    }
    const key = item.category;
    const at = indexByDigestKey.get(key);
    if (at === undefined) {
      indexByDigestKey.set(key, entries.length);
      entries.push({ item, repeats: 1 });
      continue;
    }
    const kept = entries[at];
    kept.repeats += 1;
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
          <p className='text-xs text-neutral-500 mt-0.5'>
            Items awaiting your action · auto-escalates to Chief of Staff after 2h
          </p>
        </div>
        <FilterChipRow counts={counts} active={filter} chipHref={chipHref} />
      </div>

      <div className='p-3 sm:p-4'>
        {entries.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className='space-y-2.5'>
            {entries.map(({ item, repeats }) => (
              <QueueItemCard
                key={item.user_notification_id}
                item={item}
                repeats={repeats}
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
