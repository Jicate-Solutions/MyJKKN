import { num } from './_utils';
import type {
  BillingAnalyticsOverview,
  BillingInstitutionAnalytics,
  BillingCategoryAnalytics,
  BillingCollectionSplit,
  BillingAgingBucketRow,
  BillingUserActivityRow,
  BillingDailyActivityRow,
} from '@/types/billing-analytics';

export interface AnalyticsExportData {
  overview?: BillingAnalyticsOverview;
  collectionSplit?: BillingCollectionSplit;
  byInstitution?: BillingInstitutionAnalytics[];
  byCategory?: BillingCategoryAnalytics[];
  aging?: BillingAgingBucketRow[];
  userActivity?: BillingUserActivityRow[];
  dailyActivity?: BillingDailyActivityRow[];
  range: { from?: string; to?: string };
}

// Neutralise spreadsheet formula injection: a free-text cell (student/payer/
// institution name) that starts with = + - @ (or tab/CR) would execute as a
// formula when the .xlsx is opened. Prefix with a single quote so Excel/Sheets
// treat it as literal text. Mirrors escapeCsvField() in lib/utils/csv-export.ts.
function sanitizeCell(v: unknown): unknown {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, sanitizeCell(v)])
  ) as T;
}

/**
 * Build and download a multi-sheet .xlsx of the current dashboard view.
 * `xlsx` is imported dynamically so it never lands in the initial page bundle.
 */
export async function exportAnalyticsWorkbook(d: AnalyticsExportData): Promise<void> {
  // xlsx is CJS; under different bundler interop the exports may sit on
  // `.default`. Normalise so .utils/.writeFile resolve either way.
  const mod: any = await import('xlsx');
  const XLSX: any = mod.default ?? mod;
  const wb = XLSX.utils.book_new();

  if (d.overview) {
    const o = d.overview;
    const rows = [
      { Metric: 'Date range', Value: `${d.range.from ?? 'all'} → ${d.range.to ?? 'today'}` },
      { Metric: 'Total Billed', Value: num(o.total_billed) },
      { Metric: 'Total Collected', Value: num(o.total_collected) },
      { Metric: 'Net Collected (after refunds)', Value: num(o.net_collected) },
      { Metric: 'Total Outstanding (now)', Value: num(o.total_outstanding) },
      { Metric: 'Collection Rate %', Value: num(o.collection_rate) },
      { Metric: 'Students Billed', Value: num(o.students_billed) },
      { Metric: 'Total Bills', Value: num(o.total_bills) },
      { Metric: 'Bills Paid', Value: num(o.bills_paid) },
      { Metric: 'Bills Unpaid', Value: num(o.bills_unpaid) },
      { Metric: 'Bills Partially Paid', Value: num(o.bills_partially_paid) },
      { Metric: 'Total Discounts', Value: num(o.total_discounts) },
      { Metric: 'Total Refunds', Value: num(o.total_refunds) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'Overview');
  }

  if (d.byInstitution?.length) {
    const rows = d.byInstitution.map((r) => ({
      Institution: r.institution_name,
      Billed: num(r.total_billed),
      Collected: num(r.total_collected),
      Outstanding: num(r.total_outstanding),
      'Rate %': num(r.collection_rate),
      Bills: num(r.bill_count),
      'Students Billed': num(r.student_count),
      'Students With Dues': num(r.students_with_dues),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'Institutions');
  }

  if (d.collectionSplit) {
    const s = d.collectionSplit;
    const rows = [
      {
        Bucket: 'Management',
        Collected: num(s.management_collected),
        Refunds: num(s.management_refunds),
        Net: num(s.management_net),
        Billed: num(s.management_billed),
        'Outstanding (now)': num(s.management_outstanding),
      },
      {
        Bucket: 'Government',
        Collected: num(s.government_collected),
        Refunds: num(s.government_refunds),
        Net: num(s.government_net),
        Billed: num(s.government_billed),
        'Outstanding (now)': num(s.government_outstanding),
      },
      {
        Bucket: 'Unallocated',
        Collected: num(s.unallocated_collected),
        Refunds: num(s.unallocated_refunds),
        Net: num(s.unallocated_net),
        Billed: '',
        'Outstanding (now)': '',
      },
      {
        Bucket: 'TOTAL',
        Collected: num(s.total_collected),
        Refunds: num(s.management_refunds) + num(s.government_refunds) + num(s.unallocated_refunds),
        Net: num(s.management_net) + num(s.government_net) + num(s.unallocated_net),
        Billed: num(s.management_billed) + num(s.government_billed),
        'Outstanding (now)': num(s.management_outstanding) + num(s.government_outstanding),
      },
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.map(sanitizeRow)),
      'Collection Split'
    );
  }

  if (d.byCategory?.length) {
    const rows = d.byCategory.map((r) => ({
      Category: r.kind,
      Collection: r.collection_type,
      Billed: num(r.total_billed),
      Outstanding: num(r.total_outstanding),
      'Paid to date (accrual)': num(r.paid_to_date),
      'Collected (receipt-traced)': num(r.collected_actual),
      Bills: num(r.bill_count),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'By Category');
  }

  if (d.aging?.length) {
    const rows = d.aging.map((r) => ({
      Bucket: r.bucket,
      'Bills': num(r.bill_count),
      'Outstanding Balance': num(r.balance),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'Aging');
  }

  if (d.userActivity?.length) {
    const rows = d.userActivity.map((r) => ({
      User: r.full_name,
      Role: r.role,
      Actions: num(r.actions_count),
      Receipts: num(r.receipts_count),
      'Amount Collected': num(r.amount_collected),
      Discounts: num(r.discounts_count),
      Refunds: num(r.refunds_count),
      'Last Active': r.last_active ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'User Activity');
  }

  if (d.dailyActivity?.length) {
    const rows = d.dailyActivity.map((r) => ({
      Date: r.activity_date,
      Institution: r.institution_name,
      'Bills Created': num(r.bills_created),
      'Amount Billed': num(r.amount_billed),
      'Students Billed': num(r.students_billed),
      'Receipts Generated': num(r.receipts_created),
      'Amount Collected': num(r.amount_collected),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), 'Daily Activity');
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Note: 'No data to export for the current filters.' }]),
      'Empty'
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `billing-analytics-${stamp}.xlsx`);
}
