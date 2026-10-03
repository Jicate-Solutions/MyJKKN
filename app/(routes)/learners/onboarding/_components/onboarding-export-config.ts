/**
 * Export schema for the onboarding table.
 *
 * `headers` are DATA KEYS produced by `transformOnboardingRow`, never labels —
 * labels live in the column mapping (see buildExcelRows in export-utils).
 *
 * Keys that equal a table column id (`first_name`, `institution_name`,
 * `fees_due`, …) follow that column's visibility toggle; every other key
 * (`register_number`, `student_mobile`, `tier`, …) is always exported, because
 * the export is a working list for calling and chasing learners and those are
 * the fields the table has no room for.
 *
 * The fee keys exist only for `awaiting_payment` — the only tier whose rows
 * carry `payment` — mirroring getOnboardingColumns.
 */

import type { DataTransformFunction } from '@/components/data-table/utils/export-utils';
import { formatAdmissionYear } from '@/lib/utils/admission-year-format';
import {
  ONBOARDING_TIER_LABELS,
  type OnboardingProfileRow,
  type OnboardingTier
} from '@/types/learner-onboarding';

type ExportColumn = { key: string; label: string; width: number };

const LEADING: ExportColumn[] = [
  { key: 'roll_number', label: 'Roll Number', width: 15 },
  { key: 'register_number', label: 'Register Number', width: 18 },
  { key: 'first_name', label: 'Learner Name', width: 28 },
  { key: 'college_email', label: 'College Email', width: 32 },
  { key: 'student_email', label: 'Personal Email', width: 30 },
  { key: 'student_mobile', label: 'Mobile', width: 14 },
  { key: 'institution_name', label: 'Institution', width: 30 },
  { key: 'program_program_name', label: 'Program', width: 25 },
  { key: 'admission_year', label: 'Admission Year', width: 16 }
];

const TRIAGE: ExportColumn[] = [
  { key: 'missing_fields', label: 'Missing Fields', width: 40 },
  { key: 'completion', label: 'Completion', width: 12 }
];

const PAYMENT: ExportColumn[] = [
  { key: 'payment_progress', label: 'Progress to Threshold (%)', width: 14 },
  { key: 'threshold_pct', label: 'Threshold (%)', width: 12 },
  { key: 'fees_due', label: 'Fees Due', width: 14 },
  { key: 'fees_paid', label: 'Paid', width: 14 },
  { key: 'fees_balance', label: 'Balance', width: 14 },
  { key: 'next_instalment_date', label: 'Next Instalment Date', width: 16 },
  { key: 'next_instalment', label: 'Next Instalment Amount', width: 14 },
  { key: 'amount_to_threshold', label: 'Need to Admit', width: 14 }
];

const TRAILING: ExportColumn[] = [
  { key: 'lifecycle_status', label: 'Status', width: 12 },
  { key: 'tier', label: 'Onboarding Tier', width: 18 },
  { key: 'activation_blocked_reason', label: 'Activation Blocked Reason', width: 40 }
];

function columnsFor(tier: OnboardingTier): ExportColumn[] {
  return [...LEADING, ...(tier === 'awaiting_payment' ? PAYMENT : TRIAGE), ...TRAILING];
}

export function getOnboardingExportConfig(tier: OnboardingTier) {
  const columns = columnsFor(tier);
  return {
    entityName: `onboarding-${tier}-learners`,
    headers: columns.map((c) => c.key),
    columnMapping: Object.fromEntries(columns.map((c) => [c.key, c.label])),
    columnWidths: columns.map((c) => ({ wch: c.width })),
    transformFunction: transformOnboardingRow as DataTransformFunction<OnboardingProfileRow>
  };
}

/** Flatten one row into the scalar values the spreadsheet cells hold. */
export function transformOnboardingRow(row: OnboardingProfileRow): Record<string, unknown> {
  const p = row.payment;
  return {
    roll_number: row.roll_number ?? '',
    register_number: row.register_number ?? '',
    first_name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    college_email: row.college_email ?? '',
    student_email: row.student_email ?? '',
    student_mobile: row.student_mobile ?? '',
    institution_name: row.institution?.name ?? '',
    program_program_name: row.program?.program_name ?? '',
    admission_year: formatAdmissionYear(row) || '',
    missing_fields: row.missing_field_labels.join(', '),
    completion: `${row.filled_count}/4`,
    // Fee cells stay blank — never 0 — when the RPC returned nothing for this
    // learner: unknown fees are not "owes nothing".
    payment_progress: p ? p.achieved_pct : '',
    threshold_pct: p?.threshold_pct ?? '',
    fees_due: p ? p.basis_billed : '',
    fees_paid: p ? p.basis_paid : '',
    fees_balance: p ? p.basis_balance : '',
    next_instalment_date: p?.next_due_date ?? '',
    next_instalment: p?.next_due_amount ?? '',
    amount_to_threshold: p?.amount_to_threshold ?? '',
    lifecycle_status: row.lifecycle_status,
    tier: ONBOARDING_TIER_LABELS[row.tier] ?? row.tier,
    activation_blocked_reason: row.activation_blocked_reason ?? ''
  };
}
