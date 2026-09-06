'use client';

// Single source of truth for how every audit verdict is worded and coloured, so
// the table, the KPI cards, the filter chips and the detail drawer can never
// describe the same row differently.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  AuditVerdict,
  AuditBandVerdict,
  AuditRoomRuleVerdict,
  AuditUpgradeBillState,
  AuditBandYearSource,
} from '@/types/campus-living-allocation-audit';

// The shared Badge has no `warning` variant, so amber rides on `outline` plus a
// className — same shape as the built-in `success` (bg-*-100 / text-*-800),
// with dark-mode pairs added so the text stays legible in both themes.
const AMBER = 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200';
const GREEN = 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
const RED = 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
const GREY = 'border-transparent bg-muted text-muted-foreground';

type Tone = 'green' | 'amber' | 'red' | 'grey';
const toneClass: Record<Tone, string> = { green: GREEN, amber: AMBER, red: RED, grey: GREY };

interface VerdictMeta {
  label: string;
  tone: Tone;
  /** One line explaining what the operator is looking at. */
  hint: string;
}

export const VERDICT_META: Record<AuditVerdict, VerdictMeta> = {
  clean: {
    label: 'Correct',
    tone: 'green',
    hint: 'Room category is inside the fee band and a physical rule permits the room.',
  },
  upgrade_paid: {
    label: 'Upgrade paid',
    tone: 'green',
    hint: 'Above the fee band, legitimised by a fully collected upgrade bill.',
  },
  upgrade_partial: {
    label: 'Upgrade part-paid',
    tone: 'amber',
    hint: 'Above the fee band; the upgrade bill is raised but only partly collected.',
  },
  upgrade_unpaid: {
    label: 'Upgrade billed, unpaid',
    tone: 'amber',
    hint: 'Above the fee band; the upgrade bill exists but nothing has been collected.',
  },
  upgrade_bill_cancelled: {
    label: 'Upgrade bill cancelled',
    tone: 'red',
    hint: 'Above the fee band, and every upgrade bill raised for them was cancelled.',
  },
  upgrade_unbilled: {
    label: 'Above band, never billed',
    tone: 'red',
    hint: 'Above the fee band with no upgrade bill of any kind — nothing explains the room.',
  },
  below_band: {
    label: 'Below band',
    tone: 'amber',
    hint: 'Occupying a cheaper category than the fee band entitles them to.',
  },
  room_rule_violation: {
    label: 'Room rule violation',
    tone: 'red',
    hint: 'Correct category, but no physical-room rule permits this learner in this room.',
  },
  band_and_rule_violation: {
    label: 'Band + room rule violation',
    tone: 'red',
    hint: 'Outside the fee band AND in a room no physical rule permits.',
  },
  no_band: {
    label: 'No fee band',
    tone: 'grey',
    hint: 'No Category-Eligibility band covers this fee — the placement cannot be judged.',
  },
  unranked: {
    label: 'Unrankable',
    tone: 'grey',
    hint: 'A category involved has no published fee for the current hostel year.',
  },
};

export const BAND_META: Record<AuditBandVerdict, { label: string; tone: Tone }> = {
  in_band: { label: 'In band', tone: 'green' },
  above_band: { label: 'Above band', tone: 'amber' },
  below_band: { label: 'Below band', tone: 'amber' },
  no_band: { label: 'No band', tone: 'grey' },
  unranked: { label: 'Unranked', tone: 'grey' },
};

export const RULE_META: Record<AuditRoomRuleVerdict, { label: string; tone: Tone }> = {
  rule_matched: { label: 'Rule matched', tone: 'green' },
  open_room: { label: 'Open room', tone: 'grey' },
  violation: { label: 'Violation', tone: 'red' },
};

export const BILL_STATE_META: Record<AuditUpgradeBillState, { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'green' },
  partial: { label: 'Part-paid', tone: 'amber' },
  unpaid: { label: 'Unpaid', tone: 'amber' },
  cancelled_only: { label: 'Cancelled', tone: 'red' },
  none: { label: 'No bill', tone: 'grey' },
};

export const YEAR_SOURCE_META: Record<
  AuditBandYearSource,
  { label: string; tone: Tone; hint: string }
> = {
  admission_year: {
    label: 'Same',
    tone: 'green',
    hint: 'The fee band was read from the learner’s admission year, as intended.',
  },
  earliest_billed: {
    label: 'Fallback',
    tone: 'amber',
    hint: 'Their admission year carries no academic bill, so the band was read from their earliest billed year instead.',
  },
  no_admission_anchor: {
    label: 'No anchor',
    tone: 'amber',
    hint: 'No academic year is configured at this institution for their admission year, so the band fell back to their earliest billed year.',
  },
  none: {
    label: 'No bill',
    tone: 'grey',
    hint: 'No usable academic bill — there is no fee to resolve a band from.',
  },
};

function ToneBadge({ tone, label, title }: { tone: Tone; label: string; title?: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[tone])} title={title}>
      {label}
    </Badge>
  );
}

export function VerdictBadge({ verdict }: { verdict: AuditVerdict }) {
  const m = VERDICT_META[verdict] ?? { label: verdict, tone: 'grey' as Tone, hint: '' };
  return <ToneBadge tone={m.tone} label={m.label} title={m.hint} />;
}

export function BandBadge({ verdict }: { verdict: AuditBandVerdict }) {
  const m = BAND_META[verdict] ?? { label: verdict, tone: 'grey' as Tone };
  return <ToneBadge tone={m.tone} label={m.label} />;
}

export function RuleBadge({ verdict }: { verdict: AuditRoomRuleVerdict }) {
  const m = RULE_META[verdict] ?? { label: verdict, tone: 'grey' as Tone };
  return <ToneBadge tone={m.tone} label={m.label} />;
}

export function BillStateBadge({ state }: { state: AuditUpgradeBillState }) {
  const m = BILL_STATE_META[state] ?? { label: state, tone: 'grey' as Tone };
  return <ToneBadge tone={m.tone} label={m.label} />;
}

export function YearSourceBadge({ source }: { source: AuditBandYearSource }) {
  const m = YEAR_SOURCE_META[source] ?? { label: source, tone: 'grey' as Tone, hint: '' };
  return <ToneBadge tone={m.tone} label={m.label} title={m.hint} />;
}

/** ₹ with Indian digit grouping. `??` not `||` — ₹0 is a real, meaningful value. */
export function inr(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
