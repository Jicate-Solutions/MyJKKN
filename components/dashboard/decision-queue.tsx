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
  QueueCounts
} from '@/lib/services/dashboard/decision-queue-service';
import { QueueItemCard } from '@/components/dashboard/decision-queue-item';

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
// Main container
// ============================================================================
export async function DecisionQueue({
  filter = 'all',
  basePath = '/dashboard'
}: DecisionQueueProps) {
  const { items, counts } = await listQueueItems(filter);

  const chipHref = (f: QueueFilter) =>
    f === 'all' ? `${basePath}#decision-queue` : `${basePath}?queue=${f}#decision-queue`;

  return (
    <div
      id='decision-queue'
      className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm scroll-mt-24'
    >
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
        {items.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className='space-y-2.5'>
            {items.map((item) => (
              <QueueItemCard key={item.user_notification_id} item={item} />
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
