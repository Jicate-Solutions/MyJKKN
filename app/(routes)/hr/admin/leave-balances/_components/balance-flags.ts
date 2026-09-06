/**
 * Per-cell vocabulary for the Staff Balances tab, shared by the table and the
 * adjust dialog.
 *
 * Extracted for the same reason as coverage-status.ts next door: two copies of
 * these labels drift apart the first time v_hr_leave_balance_src gains an
 * entitlement tier, and the tone strings are what tell an operator whether a
 * cell is a problem or just unusual.
 */

import type {
  HRLeaveEntitlementSource,
  HRStaffBalanceCell,
} from '@/types/hr-leave-staff-balances';

/**
 * Which of the three entitlement tiers supplied the number. `policy` is the
 * healthy default and covers the overwhelming majority of rows — 4,283 of
 * 6,641 balance rows carry a NULL `entitled` precisely so they keep tracking
 * hr_leave_types.default_entitled_days.
 */
export const SOURCE_META: Record<
  HRLeaveEntitlementSource,
  { label: string; tone: string; hint: string }
> = {
  policy: {
    label: 'Policy',
    tone: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    hint: 'Follows the leave type default and will track any change to it.',
  },
  override: {
    label: 'Override',
    tone: 'border-blue-600/30 bg-blue-600/10 text-blue-700 dark:text-blue-400',
    hint: 'A per-person entitlement was set deliberately for this year.',
  },
  frozen: {
    label: 'Frozen',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    hint: 'A literal is stored on the balance row, so this person no longer tracks the policy default.',
  },
};

/**
 * `sto_exhausted` is the odd one out: it is a ROW-level flag only, never
 * returned by cellFlags(). The other four describe a day cell's entitlement
 * ledger; this one describes a Short Time Off cell's per-period minute budget,
 * which has no ledger at all. It earns a place in the same vocabulary because
 * the attention filter and the row tint are shared.
 */
export type BalanceFlag =
  | 'no_row'
  | 'negative'
  | 'overdrawn'
  | 'off_policy'
  | 'sto_exhausted';

export const FLAG_META: Record<BalanceFlag, { label: string; hint: string }> = {
  no_row: {
    label: 'Not provisioned',
    hint: 'No balance row. Approving leave here writes one seeded from zero, which can leave the person permanently negative — run Generate.',
  },
  negative: {
    label: 'Negative',
    hint: 'More days consumed than available. Correct the used figure or raise the entitlement.',
  },
  overdrawn: {
    label: 'Overdrawn',
    hint: 'Used exceeds entitled plus carried forward.',
  },
  off_policy: {
    label: 'Off policy',
    hint: 'Entitlement comes from an override or a frozen literal rather than the leave type default.',
  },
  sto_exhausted: {
    label: 'Short time off spent',
    hint: 'The whole Short Time Off budget for this period is committed — pending requests count too. Further requests will be refused until the period rolls over.',
  },
};

/** Every flag that applies to a single cell, worst-first. */
export function cellFlags(cell: HRStaffBalanceCell): BalanceFlag[] {
  const out: BalanceFlag[] = [];
  if (cell.available < 0) out.push('negative');
  if (cell.used > cell.entitled + cell.carried) out.push('overdrawn');
  if (!cell.has_row) out.push('no_row');
  if (cell.source !== 'policy') out.push('off_policy');
  return out;
}

/**
 * Tailwind tint for a cell. Ordered by severity, not by flag count: a negative
 * balance is a live problem, an override is merely worth knowing about, and a
 * cell carrying both should read as the problem.
 */
export function cellTone(flags: BalanceFlag[]): string {
  if (flags.includes('negative') || flags.includes('overdrawn')) {
    return 'text-red-600 dark:text-red-400';
  }
  if (flags.includes('no_row')) return 'text-amber-600 dark:text-amber-400';
  if (flags.includes('off_policy')) return 'text-blue-600 dark:text-blue-400';
  return '';
}

/** True when any cell on the row needs attention — drives the filter toggle. */
export function rowNeedsAttention(flags: {
  missing_rows: number;
  negative: number;
  overdrawn: number;
  off_policy: number;
  sto_exhausted?: number;
}): boolean {
  return (
    flags.missing_rows > 0 ||
    flags.negative > 0 ||
    flags.overdrawn > 0 ||
    flags.off_policy > 0 ||
    // Optional so a caller holding a pre-STO flags object still type-checks;
    // the RPC always sends it.
    (flags.sto_exhausted ?? 0) > 0
  );
}

/* ─────────────────── Short Time Off cell vocabulary ─────────────────── */

/**
 * Tint for one STO cell. Only two states are worth colouring: the budget is
 * spent (red — every further request is refused), or the period could not be
 * resolved (amber — the database refuses submissions but the reason is a
 * misconfiguration, not the person's own usage). Everything else is normal.
 */
export function stoCellTone(cell: {
  exhausted: boolean;
  window_unresolved: boolean;
}): string {
  if (cell.window_unresolved) return 'text-amber-600 dark:text-amber-400';
  if (cell.exhausted) return 'text-red-600 dark:text-red-400';
  return '';
}
