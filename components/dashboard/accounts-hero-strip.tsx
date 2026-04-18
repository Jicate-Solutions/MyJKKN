/**
 * Dashboard v2 — Accounts Hero Strip (4 KPI tiles)
 *
 * Server component. Consumes AccountsMetrics from getAccountsMetrics().
 * Tiles: (1) Today's Collection vs Plan (2) Overdue Bills (3) Reconciliation Gap (4) Pending Refunds
 *
 * Styling kept parallel to hero-strip.tsx and counselor-hero-strip.tsx
 * (helpers duplicated by design — per agent scope, hero-strip.tsx must remain untouched).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import Link from 'next/link';
import {
  AccountsMetrics,
  AccountsBand,
  formatInrAccounts
} from '@/lib/services/dashboard/accounts-metrics-service';

type TileColor = AccountsBand | 'neutral';

const TILE_COLOR_CLASS: Record<TileColor, string> = {
  green:
    'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
  amber:
    'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  red: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100',
  neutral:
    'border-neutral-200 bg-white/90 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
};

const BAND_DOT: Record<TileColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-neutral-400'
};

type HeroTileProps = {
  label: string;
  value: React.ReactNode;
  subtitle: string;
  hint?: string;
  color: TileColor;
  href?: string;
  footer?: React.ReactNode;
};

function HeroTile({
  label,
  value,
  subtitle,
  hint,
  color,
  href,
  footer
}: HeroTileProps) {
  const Wrapper: React.ElementType = href ? Link : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all ${href ? 'hover:shadow-xl hover:-translate-y-0.5 cursor-pointer' : ''}`}
    >
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium uppercase tracking-wider opacity-75'>
          {label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${BAND_DOT[color]}`}
          aria-hidden
        />
      </div>
      <div className='mt-3 text-4xl font-bold tabular-nums leading-none'>
        {value}
      </div>
      <div className='mt-2 text-xs opacity-70 line-clamp-2'>{subtitle}</div>
      {hint && <div className='mt-1 text-[11px] opacity-60'>{hint}</div>}
      {footer && (
        <div className='mt-4 pt-3 border-t border-current/10 text-[11px] opacity-80'>
          {footer}
        </div>
      )}
    </Wrapper>
  );
}

// ============================================================================
// Tile builders per accounts metric
// ============================================================================
function collectionTile(metrics: AccountsMetrics): HeroTileProps {
  const { collected_today, daily_target, pct } = metrics.collection;
  let color: TileColor = 'neutral';
  if (pct >= 100) color = 'green';
  else if (pct >= 50) color = 'amber';
  else if (daily_target > 0 && collected_today > 0) color = 'red';

  return {
    label: "Today's Collection",
    value: (
      <span>
        <span className='text-lg align-top'>&#8377;</span>
        {formatInrAccounts(collected_today)}
      </span>
    ),
    subtitle: `Target: \u20B9${formatInrAccounts(daily_target)} per day`,
    hint: `${pct}% of daily plan achieved`,
    color,
    href: '/billing/receipts',
    footer: (
      <div className='h-1.5 w-full rounded-full bg-current/10 overflow-hidden'>
        <div
          className='h-full bg-current/60 transition-all'
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    )
  };
}

function overdueBillsTile(metrics: AccountsMetrics): HeroTileProps {
  const { count } = metrics.overdue_bills;
  let color: TileColor = 'green';
  if (count >= 10) color = 'red';
  else if (count >= 1) color = 'amber';

  return {
    label: 'Overdue Bills',
    value: count,
    subtitle:
      count === 0
        ? 'All bills are within due date'
        : `${count} bill${count === 1 ? '' : 's'} past due date, unpaid`,
    hint:
      count > 0
        ? 'Review and follow up with defaulters'
        : undefined,
    color,
    href: '/billing/student-bills?status=overdue'
  };
}

function reconciliationTile(metrics: AccountsMetrics): HeroTileProps {
  const { gap, invoiced, receipted } = metrics.reconciliation;
  const absGap = Math.abs(gap);
  let color: TileColor = 'neutral';
  if (absGap === 0) color = 'green';
  else if (absGap <= 50000) color = 'amber';
  else color = 'red';

  return {
    label: 'Reconciliation Gap',
    value: (
      <span>
        <span className='text-lg align-top'>&#8377;</span>
        {formatInrAccounts(absGap)}
      </span>
    ),
    subtitle: 'Invoiced minus receipted this month',
    hint: gap > 0
      ? 'Collections behind invoicing'
      : gap < 0
        ? 'Collections ahead of invoicing'
        : 'Perfectly reconciled',
    color,
    footer: (
      <div className='grid grid-cols-2 gap-1 text-center'>
        <div>
          <div className='text-[9px] uppercase opacity-60'>Invoiced</div>
          <div className='text-xs font-semibold tabular-nums'>
            {'\u20B9'}{formatInrAccounts(invoiced)}
          </div>
        </div>
        <div>
          <div className='text-[9px] uppercase opacity-60'>Receipted</div>
          <div className='text-xs font-semibold tabular-nums'>
            {'\u20B9'}{formatInrAccounts(receipted)}
          </div>
        </div>
      </div>
    )
  };
}

function pendingRefundsTile(metrics: AccountsMetrics): HeroTileProps {
  const { count } = metrics.pending_refunds;
  let color: TileColor = 'green';
  if (count >= 5) color = 'red';
  else if (count >= 1) color = 'amber';

  return {
    label: 'Pending Refunds',
    value: count,
    subtitle:
      count === 0
        ? 'No refunds awaiting approval'
        : `${count} refund${count === 1 ? '' : 's'} awaiting approval`,
    hint:
      count > 0
        ? 'Approve or reject in refunds queue'
        : undefined,
    color,
    href: '/billing/refunds?status=pending'
  };
}

// ============================================================================
// Public component
// ============================================================================
type AccountsHeroStripProps = {
  metrics: AccountsMetrics;
};

export function AccountsHeroStrip({ metrics }: AccountsHeroStripProps) {
  const tiles: HeroTileProps[] = [
    collectionTile(metrics),
    overdueBillsTile(metrics),
    reconciliationTile(metrics),
    pendingRefundsTile(metrics)
  ];

  return (
    <section aria-label='Accounts dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
