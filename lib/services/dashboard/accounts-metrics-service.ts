/**
 * Dashboard v2 — Accounts Metrics Service (server-side)
 *
 * Calls `fn_accounts_metrics()` RPC which reads auth.uid() and returns
 * accounts-scoped hero tile data (collection vs plan, overdue bills,
 * reconciliation gap, pending refunds).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import { createClient } from '@/lib/supabase/server';

export type AccountsBand = 'red' | 'amber' | 'green';

export type AccountsMetrics = {
  collection: {
    collected_today: number;
    daily_target: number;
    pct: number;
  };
  overdue_bills: {
    count: number;
  };
  reconciliation: {
    gap: number;
    invoiced: number;
    receipted: number;
  };
  pending_refunds: {
    count: number;
  };
  scope: {
    user_id: string | null;
    institution_id: string | null;
    computed_at: string;
  };
};

const EMPTY_ACCOUNTS_METRICS: AccountsMetrics = {
  collection: { collected_today: 0, daily_target: 100000, pct: 0 },
  overdue_bills: { count: 0 },
  reconciliation: { gap: 0, invoiced: 0, receipted: 0 },
  pending_refunds: { count: 0 },
  scope: { user_id: null, institution_id: null, computed_at: new Date().toISOString() }
};

/**
 * Format INR amount with Indian comma grouping (e.g. 1,25,000).
 */
export function formatInrAccounts(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs < 1000) return `${sign}${abs.toFixed(0)}`;
  // Indian grouping: last 3 digits, then groups of 2
  const str = abs.toFixed(0);
  const lastThree = str.slice(-3);
  const rest = str.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${grouped ? grouped + ',' : ''}${lastThree}`;
}

/**
 * Fetches all 4 accounts hero tile metrics in a single RPC call.
 * Returns EMPTY_ACCOUNTS_METRICS on error (resilient to DB hiccups).
 */
export async function getAccountsMetrics(): Promise<AccountsMetrics> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_accounts_metrics');

    if (error) {
      console.error('[dashboard/accounts-metrics] RPC error:', error);
      return EMPTY_ACCOUNTS_METRICS;
    }

    return (data as AccountsMetrics) ?? EMPTY_ACCOUNTS_METRICS;
  } catch (err) {
    console.error('[dashboard/accounts-metrics] unexpected error:', err);
    return EMPTY_ACCOUNTS_METRICS;
  }
}
