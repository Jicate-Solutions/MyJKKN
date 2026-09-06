'use client';
// bulk-fee-structure-dialog.tsx — five-step wizard for the Bulk Import /
// Export-for-Edit flow:
//   1. Upload   — choose the filled template or edited export.
//   2. Data     — echo back the sheet EXACTLY as the server read it: which tab,
//                 which header row, which cells. This step exists because every
//                 downstream error is unreadable if the server was looking at
//                 the wrong tab, and the operator had no way to tell.
//   3. Changes  — what applying this file DOES: each structure created, each
//                 field that moves, and — the destructive one the row list can
//                 never show — each fee that gets REMOVED because its row was
//                 deleted from the sheet.
//   4. Validate — per-row Create / Update / Error, still writing nothing.
//   5. Apply    — only enabled once 0 rows have errors (the server enforces the
//                 same rule), then commits and shows the result.
//
// Steps 2-4 are all served by ONE dry-run request. Splitting them into separate
// round-trips would re-read the workbook three times to say three things about
// the same parse.
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowLeft, ArrowRight,
  ListChecks, CalendarClock, Table2, ArrowRightLeft, Plus, Trash2, Pencil, Info, CircleSlash,
} from 'lucide-react';
import toast from 'react-hot-toast';

type PreviewAction = 'create' | 'update' | 'error';

interface PreviewRow {
  row: number;
  name: string;
  action: PreviewAction;
  errors: string[];
}

interface FieldChange { field: string; from: string; to: string }

interface FeeChange {
  category: string;
  kind: 'added' | 'removed' | 'changed';
  from: string | null;
  to: string | null;
}

interface StructureChange {
  row: number;
  name: string;
  action: 'create' | 'update';
  structureId: string | null;
  identity: Array<{ label: string; value: string }>;
  fields: FieldChange[];
  fees: FeeChange[];
  unchanged: boolean;
  missing: boolean;
}

interface SheetInfo {
  name: string;
  /** False when the tab is not called "Fee Structures" and matched on columns. */
  nameMatched: boolean;
  expectedName: string;
  /** 1-based sheet row the headers were found on. >1 means a title line above. */
  headerRow: number;
  sheetNames: string[];
  headers: string[];
  totalRows: number;
  /** Structures the rows fold into — several rows are one structure on the unified tab. */
  structures: number;
  /**
   * Of those, how many carry a Fee Structure ID (an UPDATE of a structure that
   * exists) and how many leave it blank (a CREATE). Split by the ID cell alone,
   * so unlike the Validate step's create/update it still counts rows that have
   * errors — the operator sees what the file holds before it is clean.
   */
  existing: number;
  new: number;
  /** Fee items across those structures (one fee may span several instalment rows). */
  fees: number;
}

interface RawPreview {
  headers: string[];
  rows: Array<{ row: number; cells: string[] }>;
  truncated: boolean;
}

interface Preview {
  summary: { total: number; toCreate: number; toUpdate: number; errorRows: number; valid: number };
  rows: PreviewRow[];
  canApply: boolean;
  /**
   * 'unified' = the current one-tab layout, where every row carries its fee and
   * its instalment. 'legacy' = a workbook from before that, with a separate
   * "Fee Schedules" tab. The server decides from the header row; the banner has
   * to say something different for each, because on the unified sheet the
   * schedules are never "missing" — they are the rows themselves.
   */
  layout?: 'unified' | 'legacy';
  sheet?: SheetInfo;
  rawPreview?: RawPreview;
  changes?: StructureChange[];
  /** Set when the current-state read failed. The rest of the preview still stands. */
  changesError?: string | null;
  // On a legacy workbook, null means it carried no "Fee Schedules" tab at all.
  // Distinct from a tab that is present but empty.
  scheduleSummary: { structures: number; items: number } | null;
}

interface ApplyResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; name: string; error: string }>;
}

type Step = 'upload' | 'data' | 'changes' | 'validate' | 'done';

const STEPS: Step[] = ['upload', 'data', 'changes', 'validate', 'done'];
const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload',
  data: 'Data',
  changes: 'Changes',
  validate: 'Validate',
  done: 'Apply',
};

const ACTION_BADGE: Record<PreviewAction, { label: string; className: string }> = {
  create: { label: 'Create', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  update: { label: 'Update', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  error: { label: 'Error', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
};

export function BulkFeeStructureDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  /** Only the rows that need fixing, on the Validate step. */
  const [errorsOnly, setErrorsOnly] = useState(true);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setValidating(false);
    setApplying(false);
    setErrorsOnly(true);
  };

  const post = async (mode: 'validate' | 'apply') => {
    const fd = new FormData();
    fd.append('file', file!);
    fd.append('mode', mode);
    const res = await fetch('/api/admission/fees-structure/import', { method: 'POST', body: fd });
    const json = await res.json();
    return { res, json };
  };

  // Step 1 → 2: dry-run. Reads the workbook, diffs it, writes nothing.
  const handleValidate = async () => {
    if (!file || validating) return;
    setValidating(true);
    try {
      const { res, json } = await post('validate');
      if (!res.ok) throw new Error(json?.error ?? 'Validation failed');
      setPreview(json as Preview);
      setStep('data');
    } catch (e: any) {
      toast.error(e?.message ?? 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // Step 4 → 5: commit. Server re-validates and rejects (422) if anything slipped.
  const handleApply = async () => {
    if (!file || applying || !preview?.canApply) return;
    setApplying(true);
    try {
      const { res, json } = await post('apply');
      if (res.status === 422) {
        // Something changed/blocked server-side — refresh the row list, stay put.
        setPreview((prev) => ({ ...(prev ?? {} as Preview), ...(json as Preview) }));
        toast.error(json?.error ?? 'Some rows still have errors');
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? 'Import failed');
      const applied = json as ApplyResult;
      setResult(applied);
      setStep('done');
      const ok = (applied.created ?? 0) + (applied.updated ?? 0);
      if (ok > 0) {
        toast.success(`${applied.created} created, ${applied.updated} updated`);
        onImported();
      }
      if ((applied.failed?.length ?? 0) > 0) toast.error(`${applied.failed.length} row(s) failed to save`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed');
    } finally {
      setApplying(false);
    }
  };

  const s = preview?.summary;
  const sheet = preview?.sheet;
  const changes = preview?.changes ?? [];
  const creates = changes.filter((c) => c.action === 'create');
  const updates = changes.filter((c) => c.action === 'update' && !c.unchanged && !c.missing);
  const untouched = changes.filter((c) => c.unchanged);
  const removalCount = changes.reduce(
    (n, c) => n + c.fees.filter((f) => f.kind === 'removed').length,
    0,
  );
  const visibleRows = (preview?.rows ?? []).filter(
    (r) => !errorsOnly || r.action === 'error',
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden p-4 sm:w-full sm:p-6">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="text-base sm:text-lg">Bulk Import Fee Structures</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Upload a filled template (or an edited export), see what it will change, then apply.
            <span className="hidden sm:inline">
              {' '}One row = one instalment, so a structure spans several rows; a structure with a
              blank <strong>Fee Structure ID</strong> is created, one with an ID is updated.
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <ol className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {STEPS.map((st, i) => {
            const active = step === st;
            const passed = STEPS.indexOf(step) > i;
            return (
              <li key={st} className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                    active ? 'bg-primary text-primary-foreground'
                      : passed ? 'bg-emerald-500 text-white' : 'bg-muted'
                  }`}
                >
                  {passed ? '✓' : i + 1}
                </span>
                <span
                  className={
                    active
                      ? 'font-medium text-foreground'
                      : 'hidden sm:inline'
                  }
                >
                  {STEP_LABELS[st]}
                </span>
                {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-4 bg-border sm:inline-block" />}
              </li>
            );
          })}
        </ol>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {/* ---- Step 1: Upload ---- */}
        {step === 'upload' && (
          <div className="space-y-3">
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" /> {file.name}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The data tab is found by its <strong className="text-foreground">columns</strong>, not its
                name — a renamed or duplicated tab (&ldquo;Fee Structures (2)&rdquo;) still imports, and a
                title line above the headers is fine. Dates accept <code>2026-06-11</code>,{' '}
                <code>11/06/2026</code>, or a real Excel date cell.
              </span>
            </div>
          </div>
        )}

        {/* ---- Step 2: Data — what the server actually read ---- */}
        {step === 'data' && sheet && preview?.rawPreview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1">
                <Table2 className="h-3.5 w-3.5" /> Tab &ldquo;{sheet.name}&rdquo;
              </Badge>
              <Badge variant="outline">{sheet.totalRows} rows</Badge>
              {/* Rows are instalments; the operator counts in structures. Both,
                  side by side, or "216 rows" reads as 216 structures. */}
              <Badge variant="outline" className="gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                {sheet.structures} fee structure{sheet.structures === 1 ? '' : 's'}
              </Badge>
              {/* Same colours the Changes and Validate steps use: blue = update, green = create. */}
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 gap-1">
                <Pencil className="h-3.5 w-3.5" /> {sheet.existing} existing · will update
              </Badge>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 gap-1">
                <Plus className="h-3.5 w-3.5" /> {sheet.new} new · will create
              </Badge>
              <Badge variant="outline">{sheet.fees} fee{sheet.fees === 1 ? '' : 's'}</Badge>
              <Badge variant="outline">{sheet.headers.length} columns</Badge>
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                {preview.layout === 'legacy' ? 'Legacy two-tab layout' : 'One row = one instalment'}
              </Badge>
            </div>

            {/* The single most useful thing this step can say: we did NOT read the
                tab you may have assumed we read. */}
            {!sheet.nameMatched && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  This tab is called <strong>&ldquo;{sheet.name}&rdquo;</strong>, not{' '}
                  <strong>&ldquo;{sheet.expectedName}&rdquo;</strong> — it was matched by its columns.
                  {sheet.sheetNames.length > 1 && (
                    <> Other tabs in the file: {sheet.sheetNames.filter((n) => n !== sheet.name).map((n) => `"${n}"`).join(', ')}.</>
                  )}{' '}
                  Check the rows below are the ones you meant to import.
                </span>
              </div>
            )}

            {sheet.headerRow > 1 && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Column headers were found on <strong className="text-foreground">row {sheet.headerRow}</strong>,
                  not row 1 — everything above it is ignored. Row numbers below are the real
                  spreadsheet rows.
                </span>
              </div>
            )}

            <div className="max-h-[clamp(11rem,42dvh,22rem)] w-full min-w-0 overflow-auto rounded border">
              <table className="w-max min-w-full border-collapse text-[11px] sm:text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="border-b border-r px-2 py-1.5 text-left font-mono font-normal text-muted-foreground">
                      Row
                    </th>
                    {preview.rawPreview.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap border-b px-2 py-1.5 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rawPreview.rows.map((r) => (
                    <tr key={r.row} className="odd:bg-muted/30">
                      <td className="border-r px-2 py-1 font-mono text-muted-foreground">{r.row}</td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="max-w-[10rem] truncate whitespace-nowrap px-2 py-1 sm:max-w-[16rem]" title={c}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.rawPreview.truncated && (
              <p className="text-xs text-muted-foreground">
                Showing the first {preview.rawPreview.rows.length} of {sheet.totalRows} rows. All of them,
                across all {sheet.structures} fee structures, are validated and imported.
              </p>
            )}
          </div>
        )}

        {/* ---- Step 3: Changes — what applying this file does ---- */}
        {step === 'changes' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 gap-1">
                <Plus className="h-3.5 w-3.5" /> {creates.length} new
              </Badge>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 gap-1">
                <Pencil className="h-3.5 w-3.5" /> {updates.length} modified
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CircleSlash className="h-3.5 w-3.5" /> {untouched.length} unchanged
              </Badge>
              {removalCount > 0 && (
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> {removalCount} fee{removalCount === 1 ? '' : 's'} removed
                </Badge>
              )}
            </div>

            {/* Removals are the one thing this import does that cannot be undone
                by re-uploading — the row that carried the fee is gone from the
                sheet, so nothing on screen would otherwise mention it. */}
            {removalCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {removalCount} fee{removalCount === 1 ? ' is' : 's are'} in the database but not in this
                  sheet, so applying will <strong>delete</strong> {removalCount === 1 ? 'it' : 'them'} from
                  {removalCount === 1 ? ' its' : ' their'} structure. If you only meant to edit some rows,
                  check you did not delete a fee&rsquo;s row by mistake.
                </span>
              </div>
            )}

            {preview?.changesError ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  Could not read the current fee structures to compare against, so this step is blank —{' '}
                  <span className="font-mono">{preview.changesError}</span>. Validation below is
                  unaffected, but you will be applying without seeing the delta.
                </span>
              </div>
            ) : changes.length === 0 ? (
              <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
                No structure resolved cleanly enough to compare. See the Validate step for what is wrong.
              </p>
            ) : (
              <div className="max-h-[clamp(11rem,42dvh,22rem)] min-w-0 space-y-2 overflow-y-auto pr-1">
                {changes.map((c) => (
                  <StructureChangeCard key={`${c.row}-${c.structureId ?? 'new'}`} change={c} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Step 4: Validate ---- */}
        {step === 'validate' && s && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1"><ListChecks className="h-3.5 w-3.5" /> {s.total} structures</Badge>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">{s.toCreate} create</Badge>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">{s.toUpdate} update</Badge>
              {s.errorRows > 0
                ? <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">{s.errorRows} error</Badge>
                : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">0 errors</Badge>}
            </div>

            {/* Schedules are the one change a row-by-row list cannot show:
                they rewrite due dates and status rules. Silence here reads
                exactly like "the tab was ignored", so say either way, every time. */}
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              {preview!.layout === 'unified' ? (
                <span>
                  <strong className="text-foreground">
                    {preview!.scheduleSummary?.items ?? 0} fee
                    {(preview!.scheduleSummary?.items ?? 0) === 1 ? '' : 's'}
                  </strong>{' '}
                  across{' '}
                  <strong className="text-foreground">
                    {preview!.scheduleSummary?.structures ?? 0} structure
                    {(preview!.scheduleSummary?.structures ?? 0) === 1 ? '' : 's'}
                  </strong>{' '}
                  will be written exactly as this sheet lists them — amounts, instalments, due dates and
                  status rules. A fee whose row you deleted is <strong className="text-foreground">removed</strong>{' '}
                  from its structure.
                </span>
              ) : preview!.scheduleSummary ? (
                preview!.scheduleSummary.items > 0 ? (
                  <span>
                    <strong className="text-foreground">
                      {preview!.scheduleSummary.items} fee{preview!.scheduleSummary.items === 1 ? '' : 's'}
                    </strong>{' '}
                    across{' '}
                    <strong className="text-foreground">
                      {preview!.scheduleSummary.structures} structure
                      {preview!.scheduleSummary.structures === 1 ? '' : 's'}
                    </strong>{' '}
                    will have their instalments, due dates and status rules replaced from the{' '}
                    <strong className="text-foreground">Fee Schedules</strong> tab. Fees not listed there keep
                    what they have now.
                  </span>
                ) : (
                  <span>
                    The <strong className="text-foreground">Fee Schedules</strong> tab is empty — every existing
                    instalment plan and due date is left untouched.
                  </span>
                )
              ) : (
                <span>
                  This is an older single-sheet workbook with no instalment columns, so instalments and due
                  dates are left untouched. To edit them, download a fresh Export for Edit.
                </span>
              )}
            </div>

            {s.errorRows > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Fix the {s.errorRows} flagged row(s) in your file and re-upload. Nothing is saved until every row is clear.</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {errorsOnly ? 'Showing rows that need fixing' : 'Showing every structure'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setErrorsOnly((v) => !v)}
              >
                {errorsOnly ? `Show all ${preview!.rows.length}` : `Show errors only (${s.errorRows})`}
              </Button>
            </div>

            <div className="max-h-[clamp(11rem,38dvh,18rem)] min-w-0 divide-y overflow-y-auto rounded border">
              {visibleRows.length === 0 ? (
                <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Every row is clear.
                </div>
              ) : (
                visibleRows.map((r, i) => {
                  const badge = ACTION_BADGE[r.action];
                  return (
                    // Sheet-level problems all report row 0, so the row number
                    // alone is not a key.
                    <div key={`${r.row}-${i}`} className="flex items-start gap-2 p-2 text-xs">
                      <span className="w-12 shrink-0 font-mono text-muted-foreground">
                        {r.row > 0 ? `Row ${r.row}` : 'Sheet'}
                      </span>
                      <Badge variant="outline" className={`shrink-0 ${badge.className}`}>{badge.label}</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.name || <span className="text-muted-foreground">(no name)</span>}</div>
                        {r.errors.length > 0 && (
                          <ul className="mt-0.5 list-disc pl-4 text-destructive">
                            {r.errors.map((err, j) => <li key={j}>{err}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ---- Step 5: Done ---- */}
        {step === 'done' && result && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {result.created} created · {result.updated} updated
            </div>
            {result.failed.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {result.failed.length} failed to save
                </div>
                <div className="max-h-[clamp(9rem,32dvh,14rem)] divide-y overflow-y-auto rounded border">
                  {result.failed.map((f, i) => (
                    <div key={`${f.row}-${i}`} className="p-2 text-xs">
                      <span className="font-mono text-muted-foreground">Row {f.row}</span>
                      {f.name ? ` · ${f.name}` : ''} — <span className="text-destructive">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        </div>

        <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:gap-2">
          {step === 'upload' && (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => onOpenChange(false)} disabled={validating}>Close</Button>
              <Button className="w-full sm:w-auto" onClick={handleValidate} disabled={!file || validating}>
                {validating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListChecks className="mr-1 h-4 w-4" />}
                Read file
              </Button>
            </>
          )}

          {step === 'data' && (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => { setStep('upload'); setPreview(null); }}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Choose another file
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => setStep('changes')}>
                <ArrowRightLeft className="mr-1 h-4 w-4" /> See what changes
              </Button>
            </>
          )}

          {step === 'changes' && (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => setStep('data')}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to data
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => setStep('validate')}>
                Validate <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 'validate' && (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => setStep('changes')} disabled={applying}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to changes
              </Button>
              <Button className="w-full sm:w-auto" onClick={handleApply} disabled={!preview?.canApply || applying}>
                {applying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1 h-4 w-4" />}
                {preview?.canApply
                  ? `Apply ${s ? s.valid : ''} structure${s && s.valid === 1 ? '' : 's'}`
                  : 'Fix errors to apply'}
              </Button>
            </>
          )}

          {step === 'done' && (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={reset}>Import another</Button>
              <Button className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One structure's delta: what it is, which fields move, which fees move. */
function StructureChangeCard({ change: c }: { change: StructureChange }) {
  const tone = c.missing
    ? 'border-destructive/40 bg-destructive/5'
    : c.action === 'create'
      ? 'border-emerald-300 bg-emerald-50/50'
      : c.unchanged
        ? 'border-border bg-muted/30'
        : 'border-blue-300 bg-blue-50/40';

  return (
    <div className={`rounded border p-2 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-muted-foreground">Row {c.row}</span>
        {c.missing ? (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
            ID not found
          </Badge>
        ) : c.action === 'create' ? (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">New</Badge>
        ) : c.unchanged ? (
          <Badge variant="outline">Unchanged</Badge>
        ) : (
          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Modified</Badge>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{c.name || '(no name)'}</span>
      </div>

      {/* Identity is shown for a CREATE (it is the whole point of the row) and
          for a row whose ID could not be found (so the operator can recognise
          which structure they meant). An ordinary update already shows its
          name, and repeating six dimensions on every card buries the diff. */}
      {(c.action === 'create' || c.missing) && c.identity.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
          {c.identity.map((f) => (
            <span key={f.label}>
              {f.label}: <span className="text-foreground">{f.value}</span>
            </span>
          ))}
        </div>
      )}

      {c.missing && (
        <p className="mt-1.5 text-destructive">
          Fee Structure ID <span className="font-mono">{c.structureId}</span> is not in the database (or
          not visible to you). Clear the ID on those rows to create a new structure instead.
        </p>
      )}

      {c.fields.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {c.fields.map((f) => (
            <li key={f.field} className="flex flex-wrap items-baseline gap-1">
              <span className="text-muted-foreground">{f.field}:</span>
              <span className="text-muted-foreground line-through">{f.from}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">{f.to}</span>
            </li>
          ))}
        </ul>
      )}

      {c.fees.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {c.fees.map((f, i) => (
            <li key={`${f.category}-${i}`} className="flex items-start gap-1.5">
              <span
                className={`mt-px shrink-0 font-mono font-semibold ${
                  f.kind === 'added' ? 'text-emerald-600'
                    : f.kind === 'removed' ? 'text-destructive' : 'text-blue-600'
                }`}
              >
                {f.kind === 'added' ? '+' : f.kind === 'removed' ? '−' : '~'}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{f.category}</span>
                {f.kind === 'changed' ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground line-through">{f.from}</span>{' '}
                    <ArrowRight className="inline h-3 w-3 text-muted-foreground" />{' '}
                    <span className="text-foreground">{f.to}</span>
                  </>
                ) : (
                  <span className={f.kind === 'removed' ? ' text-destructive' : ' text-muted-foreground'}>
                    {' '}{f.kind === 'removed' ? f.from : f.to}
                    {f.kind === 'removed' && ' — will be deleted'}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {c.unchanged && c.fields.length === 0 && c.fees.length === 0 && (
        <p className="mt-1 text-muted-foreground">Already matches the database — nothing to write.</p>
      )}
    </div>
  );
}
