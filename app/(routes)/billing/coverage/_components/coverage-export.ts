import type {
  BillCoverageFilters,
  BillCoverageRow
} from '@/types/billing-coverage';

/**
 * Export the coverage list to .xlsx.
 *
 * xlsx is imported dynamically to keep it out of the page bundle, matching
 * app/(routes)/billing/analytics/_components/export-analytics.ts.
 */
export async function exportCoverageToExcel(
  rows: BillCoverageRow[],
  filters: BillCoverageFilters
): Promise<void> {
  const mod: any = await import('xlsx');
  const XLSX: any = mod.default ?? mod;

  // Neutralise spreadsheet formula injection in free-text cells (names,
  // institution names) — same guard as export-analytics.ts.
  const sanitize = (v: unknown): unknown =>
    typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  const sanitizeAoa = (aoa: unknown[][]) => aoa.map((r) => r.map(sanitize));

  const wb = XLSX.utils.book_new();

  const summaryAoa: unknown[][] = [
    ['Bill Coverage Export'],
    ['Generated At', new Date().toLocaleString()],
    [],
    ['Coverage State', filters.coverage_state ?? 'not_generated'],
    ['Academic Year', filters.academic_year_id ?? "Each learner's own year"],
    [
      'Lifecycle Statuses',
      (filters.lifecycle_statuses ?? []).join(', ') || 'default'
    ],
    ['Billing Category', filters.billing_category_id ?? 'Any'],
    [
      'Non-billing institutions',
      filters.include_non_billing_institutions ? 'Included' : 'Excluded'
    ],
    ['Search', filters.search ?? ''],
    [],
    ['Rows In This File', rows.length]
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sanitizeAoa(summaryAoa)),
    'Summary'
  );

  const dataAoa: unknown[][] = [
    [
      'Roll Number',
      'Register Number',
      'Learner Name',
      'Institution',
      'Programme',
      'Academic Year',
      'Lifecycle Status',
      'Bills',
      'Total Billed',
      'Coverage'
    ]
  ];
  rows.forEach((r) =>
    dataAoa.push([
      r.roll_number ?? '',
      r.register_number ?? '',
      r.full_name,
      r.institution_name ?? '',
      r.program_name ?? '',
      r.academic_year_name ?? '',
      r.lifecycle_status,
      r.bill_count,
      r.total_billed,
      r.coverage_state
    ])
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sanitizeAoa(dataAoa)),
    'Coverage'
  );

  const stamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `bill-coverage-${stamp}.xlsx`);
}
