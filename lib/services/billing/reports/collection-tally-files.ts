// Browser-side file handling for the Collection report's Tally export: the
// XML download, the "not exported" workbook, and reading the ledger-mapping
// sheet back. xlsx is dynamic-imported so the reports page bundle does not
// carry it. The models all come from collection-tally.ts.
import {
  TALLY_MAPPING_HEADER,
  TALLY_MAPPING_SHEET,
  TALLY_REFERENCE_SHEET,
  buildMappingReferenceRows,
  buildSkippedReceiptRows,
  buildUnmappedLearnerRows,
  parseLedgerMappingRows,
  type TallyCell,
  type TallyExport,
  type TallyLedgerMapping
} from './collection-tally';

async function loadXlsx(): Promise<any> {
  const mod: any = await import('xlsx');
  return mod.default ?? mod;
}

// Neutralise spreadsheet formula injection in free-text cells (names) — same
// guard as the bulk bill upload report.
const sanitize = (v: TallyCell): TallyCell =>
  typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTallyXml(xml: string, filename: string) {
  saveBlob(new Blob([xml], { type: 'application/xml;charset=utf-8' }), filename);
}

async function downloadSheets(sheets: { name: string; rows: TallyCell[][]; widths: number[] }[], filename: string) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map((r) => r.map(sanitize)));
    ws['!cols'] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, filename);
}

/** Two sheets: the learners still to be mapped (fill in the last column and
 *  upload it back in Tally Setup), then every receipt needing attention. */
export async function downloadTallyNotExported(exp: TallyExport, filename: string) {
  await downloadSheets(
    [
      { name: TALLY_MAPPING_SHEET, rows: buildUnmappedLearnerRows(exp.skipped), widths: [16, 30, 14, 32, 50] },
      { name: 'Receipts', rows: buildSkippedReceiptRows(exp), widths: [12, 20, 30, 16, 14, 16, 14, 12, 14, 70] }
    ],
    filename
  );
}

export async function downloadTallyMappingTemplate(filename: string) {
  await downloadSheets(
    [
      { name: TALLY_MAPPING_SHEET, rows: [[...TALLY_MAPPING_HEADER]], widths: [16, 30, 14, 32, 50] },
      { name: TALLY_REFERENCE_SHEET, rows: buildMappingReferenceRows(), widths: [20, 100, 50] }
    ],
    filename
  );
}

/** Reads the first sheet that carries the two mapping columns. Null when no
 *  sheet does. */
export async function readTallyMappingFile(
  file: File
): Promise<{ entries: TallyLedgerMapping[]; blank: number } | null> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const names: string[] = [
    ...wb.SheetNames.filter((n: string) => n === TALLY_MAPPING_SHEET),
    ...wb.SheetNames.filter((n: string) => n !== TALLY_MAPPING_SHEET)
  ];
  for (const name of names) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) as unknown[][];
    const parsed = parseLedgerMappingRows(rows);
    if (parsed) return parsed;
  }
  return null;
}
