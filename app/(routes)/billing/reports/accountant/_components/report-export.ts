// app/(routes)/billing/reports/accountant/_components/report-export.ts
// Excel / PDF / CSV export for the Accountant Advanced Reports hub.
import { downloadCsv, type CsvColumn } from '@/lib/utils/csv-export';
import { num } from './_utils';
import type {
  CollectionsRow, OutstandingByYearRow, SchemeRow, ReportKpis,
} from '@/types/billing-accountant-reports';

export interface ReportExportPayload {
  kpis?: ReportKpis;
  collectionsByCollege?: CollectionsRow[];
  outstanding?: OutstandingByYearRow[];
  schemes?: SchemeRow[];
  range: { from?: string; to?: string };
}

function sanitize(v: unknown): unknown {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}
function sanitizeRow<T extends Record<string, unknown>>(r: T): T {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, sanitize(v)])) as T;
}
const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportReport(
  format: 'excel' | 'pdf' | 'csv',
  d: ReportExportPayload
): Promise<void> {
  if (format === 'csv') return exportCsv(d);
  if (format === 'pdf') return exportPdf(d);
  return exportExcel(d);
}

function exportCsv(d: ReportExportPayload) {
  const cols: CsvColumn<CollectionsRow>[] = [
    { header: 'College', accessor: (r) => r.group_label },
    { header: 'Students', accessor: (r) => num(r.student_count) },
    { header: 'Collected', accessor: (r) => num(r.collected) },
    { header: 'Outstanding', accessor: (r) => num(r.outstanding) },
    { header: 'Rate %', accessor: (r) => num(r.collection_rate) },
    { header: 'Bills Cleared', accessor: (r) => num(r.cleared_bill_count) },
    { header: 'Cleared Amount', accessor: (r) => num(r.cleared_amount) },
  ];
  downloadCsv(d.collectionsByCollege ?? [], cols, 'accountant-report-collections');
}

async function exportExcel(d: ReportExportPayload) {
  const mod: any = await import('xlsx');
  const XLSX: any = mod.default ?? mod;
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) => {
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), name);
  };

  if (d.kpis) {
    add('Overview', [
      { Metric: 'Date range', Value: `${d.range.from ?? 'all'} → ${d.range.to ?? 'today'}` },
      { Metric: 'Collected', Value: num(d.kpis.collected) },
      { Metric: 'Outstanding (now)', Value: num(d.kpis.outstanding) },
      { Metric: 'Bills Cleared', Value: num(d.kpis.cleared_bill_count) },
      { Metric: 'Cleared Amount', Value: num(d.kpis.cleared_amount) },
      { Metric: 'Concessions (approved)', Value: num(d.kpis.concession_amount) },
      { Metric: 'Students Billed', Value: num(d.kpis.students_billed) },
    ]);
  }
  add('Collections (College)', (d.collectionsByCollege ?? []).map((r) => ({
    College: r.group_label, Students: num(r.student_count), Collected: num(r.collected),
    Outstanding: num(r.outstanding), 'Rate %': num(r.collection_rate),
    'Bills Cleared': num(r.cleared_bill_count), 'Cleared Amount': num(r.cleared_amount),
  })));
  add('Outstanding (Year)', (d.outstanding ?? []).map((r) => ({
    'Academic Year': r.academic_year_name, College: r.institution_name,
    'Students With Dues': num(r.students_with_dues), Bills: num(r.bill_count), Outstanding: num(r.outstanding),
  })));
  add('Schemes', (d.schemes ?? []).map((r) => ({
    Scheme: r.scheme_label, Students: num(r.student_count), Billed: num(r.billed),
    Collected: num(r.collected), Outstanding: num(r.outstanding), 'Concession (approved)': num(r.concession_amount),
  })));
  if (wb.SheetNames.length === 0)
    add('Empty', [{ Note: 'No data to export for the current filters.' }]);
  XLSX.writeFile(wb, `accountant-report-${stamp()}.xlsx`);
}

async function exportPdf(d: ReportExportPayload) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF('l', 'mm', 'a4');
  doc.setFontSize(14);
  doc.text('Accountant Report', 14, 14);
  doc.setFontSize(9);
  doc.text(`Range: ${d.range.from ?? 'all'} → ${d.range.to ?? 'today'}`, 14, 20);

  let y = 26;
  if (d.collectionsByCollege?.length) {
    autoTable(doc, {
      startY: y,
      head: [['College', 'Students', 'Collected', 'Outstanding', 'Rate %', 'Cleared', 'Cleared Amt']],
      body: d.collectionsByCollege.map((r) => [
        r.group_label, num(r.student_count), num(r.collected), num(r.outstanding),
        num(r.collection_rate), num(r.cleared_bill_count), num(r.cleared_amount),
      ]),
      styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  if (d.outstanding?.length) {
    autoTable(doc, {
      startY: y,
      head: [['Academic Year', 'College', 'Students w/ Dues', 'Bills', 'Outstanding']],
      body: d.outstanding.map((r) => [
        r.academic_year_name, r.institution_name, num(r.students_with_dues), num(r.bill_count), num(r.outstanding),
      ]),
      styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  if (d.schemes?.length) {
    autoTable(doc, {
      startY: y,
      head: [['Scheme', 'Students', 'Billed', 'Collected', 'Outstanding', 'Concession']],
      body: d.schemes.map((r) => [
        r.scheme_label, num(r.student_count), num(r.billed), num(r.collected), num(r.outstanding), num(r.concession_amount),
      ]),
      styles: { fontSize: 8 },
    });
  }
  doc.save(`accountant-report-${stamp()}.pdf`);
}
