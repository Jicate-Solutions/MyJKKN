/**
 * Awaiting Payment report — the pure model behind the Excel and PDF exports.
 *
 * Flattens OnboardingProfileRow (learner + fee position + blocked_reason) into
 * one plain row per learner and rolls those rows into summary tables. Both
 * writers render THIS model, so the two files can never disagree with each
 * other. The verdict itself (`blocked_reason`) is never re-derived here — it
 * comes from fn_onboarding_payment_progress, same as the on-screen column.
 */

import {
  BLOCKED_REASONS,
  BLOCKED_REASON_LABELS,
  THRESHOLD_BASIS_SHORT,
  type BlockedReason,
  type OnboardingPaymentSummary,
  type OnboardingProfileRow
} from '@/types/learner-onboarding';

export interface AwaitingPaymentReportRow {
  name: string;
  roll_number: string;
  institution: string;
  program: string;
  admission_year: string;
  status: string;
  blocked_reason: BlockedReason;
  blocked_label: string;
  /** One line, same wording as the Blocked At cell. */
  reason_detail: string;
  app_billed: number | null;
  app_paid: number | null;
  uni_billed: number | null;
  uni_paid: number | null;
  pct_billed: number;
  pct_due: number;
  fees_due: number;
  fees_paid: number;
  fees_balance: number;
  total_billed: number;
  total_paid: number;
  next_due_date: string | null;
  next_due_amount: number | null;
  need_to_admit: number | null;
  /** Rupees to settle the program's fee-structure rule for Admitted; null = no rule. */
  rule_to_admit: number | null;
  profile_filled: number;
}

export interface AwaitingPaymentReport {
  generatedAt: string;
  /** Human-readable filters the export was taken with. */
  filters: string[];
  threshold_pct: number | null;
  threshold_basis_label: string;
  target_label: string;
  rows: AwaitingPaymentReportRow[];
}

const inr = (n: number) =>
  `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

export function formatReportDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function reasonDetail(r: OnboardingProfileRow, thresholdPct: number | null): string {
  const p = r.payment;
  if (!p) return '';
  const thr = thresholdPct != null ? `${thresholdPct}%` : 'threshold';
  switch (p.blocked_reason) {
    case 'no_gate_in_program':
      return `No Application / University fee in this program — straight to Admitted${
        p.rule_to_admit != null ? ` · program rule needs ${inr(p.rule_to_admit)} more` : ''
      }`;
    case 'gate_no_bills':
      return 'No Application / University fee bills raised — cannot auto-reserve';
    case 'gate_unpaid': {
      const parts: string[] = [];
      if (p.app_bills > 0 && p.app_paid <= 0) parts.push(`Application Fee ${inr(p.app_billed)} unpaid`);
      if (p.uni_bills > 0 && p.uni_paid <= 0) parts.push(`University Fee ${inr(p.uni_billed)} unpaid`);
      return parts.join('; ') || 'Application / University fee not paid';
    }
    case 'gate_met_stuck':
      return 'Gate fees paid — status not updated (re-evaluate)';
    case 'threshold_met_stuck':
      return `${p.achieved_pct.toFixed(1)}% paid — threshold met, status not updated (re-evaluate)`;
    case 'nothing_due': {
      const bits = [p.threshold_basis === 'billed_to_date' ? 'Nothing billed yet' : 'Nothing due yet'];
      if (p.pct_billed_to_date > 0) bits.push(`${p.pct_billed_to_date.toFixed(1)}% of total bill paid in advance`);
      if (p.next_due_date) bits.push(`next due ${formatReportDate(p.next_due_date)}`);
      return bits.join(' · ');
    }
    case 'below_threshold':
      return `${p.achieved_pct.toFixed(1)}% paid of ${thr} needed · ${inr(p.amount_to_threshold ?? 0)} to go`;
    default:
      return '';
  }
}

export function toReportRows(rows: OnboardingProfileRow[]): AwaitingPaymentReportRow[] {
  return rows.map((r) => {
    const p = r.payment;
    const reason: BlockedReason = p?.blocked_reason ?? 'none';
    const ay = (r as any).admission_year_obj?.admission_year_name ?? '';
    return {
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      roll_number: r.roll_number || '',
      institution: (r as any).institution?.name ?? '',
      program: (r as any).program?.program_name ?? '',
      admission_year: ay,
      status: r.lifecycle_status ?? '',
      blocked_reason: reason,
      blocked_label: BLOCKED_REASON_LABELS[reason],
      reason_detail: reasonDetail(r, p?.threshold_pct ?? null),
      app_billed: p && p.app_bills > 0 ? p.app_billed : null,
      app_paid: p && p.app_bills > 0 ? p.app_paid : null,
      uni_billed: p && p.uni_bills > 0 ? p.uni_billed : null,
      uni_paid: p && p.uni_bills > 0 ? p.uni_paid : null,
      pct_billed: p?.pct_billed_to_date ?? 0,
      pct_due: p?.achieved_pct ?? 0,
      fees_due: p?.basis_billed ?? 0,
      fees_paid: p?.basis_paid ?? 0,
      fees_balance: p?.basis_balance ?? 0,
      total_billed: p?.total_billed ?? 0,
      total_paid: p?.total_paid ?? 0,
      next_due_date: p?.next_due_date ?? null,
      next_due_amount: p?.next_due_amount ?? null,
      need_to_admit: p?.amount_to_threshold ?? null,
      rule_to_admit: p?.rule_to_admit ?? null,
      profile_filled: r.filled_count
    };
  });
}

export function buildReport(
  rows: OnboardingProfileRow[],
  summary: OnboardingPaymentSummary | undefined,
  filters: string[],
  generatedAt: string
): AwaitingPaymentReport {
  return {
    generatedAt,
    filters,
    threshold_pct: summary?.threshold_pct ?? null,
    threshold_basis_label: THRESHOLD_BASIS_SHORT[summary?.threshold_basis ?? 'due_to_date'],
    target_label: summary?.target_label || 'Admitted',
    rows: toReportRows(rows)
  };
}

// ── Summaries ────────────────────────────────────────────────────────────────

export interface ReasonStatusLine {
  reason: BlockedReason;
  label: string;
  account: number;
  reserved: number;
  total: number;
}

/** Reasons in pipeline order; reasons with no learners are omitted. */
export function summariseByReason(rows: AwaitingPaymentReportRow[]): ReasonStatusLine[] {
  return BLOCKED_REASONS.map((reason) => {
    const inReason = rows.filter((r) => r.blocked_reason === reason);
    return {
      reason,
      label: BLOCKED_REASON_LABELS[reason],
      account: inReason.filter((r) => r.status === 'account').length,
      reserved: inReason.filter((r) => r.status === 'reserved').length,
      total: inReason.length
    };
  }).filter((l) => l.total > 0);
}

export interface InstitutionLine {
  institution: string;
  byReason: Record<BlockedReason, number>;
  total: number;
  total_billed: number;
  total_paid: number;
}

export function summariseByInstitution(rows: AwaitingPaymentReportRow[]): InstitutionLine[] {
  const map = new Map<string, InstitutionLine>();
  for (const r of rows) {
    const key = r.institution || 'Unknown';
    let line = map.get(key);
    if (!line) {
      line = {
        institution: key,
        byReason: Object.fromEntries(
          [...BLOCKED_REASONS, 'none'].map((k) => [k, 0])
        ) as Record<BlockedReason, number>,
        total: 0,
        total_billed: 0,
        total_paid: 0
      };
      map.set(key, line);
    }
    line.byReason[r.blocked_reason]++;
    line.total++;
    line.total_billed += r.total_billed;
    line.total_paid += r.total_paid;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function reportFileStem(generatedAt: string): string {
  return `awaiting-payment-report-${generatedAt.slice(0, 10)}`;
}
