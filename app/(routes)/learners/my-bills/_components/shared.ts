import type { BillingCategoryKind } from '@/types/billing';

// Human label for the fee head (billing_categories.kind). Kept inline to avoid
// pulling the admin category form into this student-facing bundle.
export const FEE_HEAD_LABELS: Record<BillingCategoryKind, string> = {
  tuition: 'Tuition',
  university_fee: 'University',
  establishment: 'Establishment',
  hostel: 'Hostel',
  mess: 'Mess',
  transport: 'Transport',
  exam: 'Exam',
  application_fee: 'Application',
  library: 'Library',
  other: 'Other',
  penalty: 'Late Charge',
};

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

/** Compact Indian notation for chart axes — ₹5L, ₹50T, ₹1.2Cr. */
export const inrCompact = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

export const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export const isOverdue = (dueDate: string | null) =>
  Boolean(dueDate) && new Date(dueDate as string).getTime() < Date.now();

export interface YearGroup<T> {
  year: string;
  items: T[];
}

/**
 * Group by academic year, newest year first; the "Other" fallback bucket
 * (no year + no date to infer one from) always sinks to the end.
 */
export function groupByYear<T extends { academicYear: string }>(items: T[]): YearGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const list = buckets.get(item.academicYear) ?? [];
    list.push(item);
    buckets.set(item.academicYear, list);
  }
  const startYear = (label: string) => {
    const match = /^(\d{4})/.exec(label);
    return match ? Number(match[1]) : -Infinity;
  };
  return [...buckets.entries()]
    .sort((a, b) => startYear(b[0]) - startYear(a[0]))
    .map(([year, groupItems]) => ({ year, items: groupItems }));
}
