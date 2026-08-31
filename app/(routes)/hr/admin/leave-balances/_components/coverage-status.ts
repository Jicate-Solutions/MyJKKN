/**
 * Coverage-status vocabulary, shared by the Analytics and Generate tabs.
 *
 * Extracted when Generate became institution-aware: both tabs now render the
 * same per-institution status, and a second copy of these labels would drift
 * from the first the next time hr_leave_balance_analytics gained or lost a
 * status.
 */

import type { HRLeaveCoverageStatus } from '@/types/hr-leave-analytics';

export const STATUS_META: Record<
  HRLeaveCoverageStatus,
  { label: string; tone: string; hint: string }
> = {
  complete: {
    label: 'Complete',
    tone: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    hint: 'Every active team member has balance rows for this year.',
  },
  partial: {
    label: 'Partial',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    hint: 'Some team members have balances, some do not — re-run the generator.',
  },
  not_generated: {
    label: 'Not generated',
    tone: 'border-orange-600/30 bg-orange-600/10 text-orange-700 dark:text-orange-400',
    hint: 'Configured and ready, but nobody has run the generator yet.',
  },
  no_types: {
    label: 'No leave types',
    tone: 'border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400',
    hint: 'Zero active leave types — the generator would write 0 rows and still report success.',
  },
  no_staff: {
    label: 'No team members',
    tone: 'border-muted-foreground/30 bg-muted text-muted-foreground',
    hint: 'No active team members to provision.',
  },
};

/**
 * Blocking states — the generator physically cannot fix these, so the Generate
 * tab disables the row rather than letting an operator queue a run that would
 * write nothing and still report success.
 *
 * 'no_academic_year' used to sit here. It cannot occur now that one group-wide
 * HR year serves every institution: a missing year is a page-level condition,
 * not a per-institution badge.
 */
export const BLOCKED: HRLeaveCoverageStatus[] = ['no_types'];

/** Statuses the generator would actually change. Drives "Select all needing". */
export const NEEDS_GENERATION: HRLeaveCoverageStatus[] = ['not_generated', 'partial'];

const nf = new Intl.NumberFormat('en-IN');
export const fmt = (n: number) => nf.format(Math.round(n));
