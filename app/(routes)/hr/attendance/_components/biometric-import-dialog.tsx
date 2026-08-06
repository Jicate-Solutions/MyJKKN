'use client';

// ============================================================================
// Biometric punch import — 5-step wizard
// ----------------------------------------------------------------------------
//   1. Select file    drag/drop the .xlsx (template downloadable from here)
//   2. Preview        what the parser actually made of the file, grouped into
//                     the punch-days that will be written
//   3. Validate       every row that failed to parse, every unmatched code and
//                     every staff member the role filter will skip
//   4. Submit         commit
//   5. Result         what landed
//
// Steps 2 and 3 are two views of ONE dry-run response (`dryRun=true`), so the
// preview cannot disagree with what Submit commits — the API shares every line
// up to the write.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  UserX,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type DayStatus = 'ok' | 'skipped_role' | 'unmatched';

interface PreviewRow {
  code: string;
  file_name: string;
  staff_name: string | null;
  role: string | null;
  work_date: string;
  in_time: string;
  out_time: string;
  punches: number;
  status: DayStatus;
}

interface RowError {
  row: number;
  reason: string;
  value?: string;
}

interface SkippedStaff {
  code: string;
  name: string;
  role: string | null;
  days: number;
}

interface ImportReport {
  success: boolean;
  dry_run: boolean;
  total_rows: number;
  total_punches: number;
  parse_errors: RowError[];
  parse_errors_truncated: boolean;
  employees_in_file: number;
  total_punch_days: number;
  date_from: string | null;
  date_to: string | null;
  ok_days: number;
  skipped_role_days: number;
  unmatched_days: number;
  preview: PreviewRow[];
  preview_truncated: boolean;
  non_faculty_skipped: SkippedStaff[];
  unmatched_codes: string[];
  loaded: number;
  faculty_matched: number;
  message?: string;
}

type Step = 'select-file' | 'analyzing' | 'preview' | 'validate' | 'submitting' | 'results';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'select-file', label: '1. Upload' },
  { key: 'preview', label: '2. Preview' },
  { key: 'validate', label: '3. Validate' },
  { key: 'submitting', label: '4. Submit' },
  { key: 'results', label: '5. Result' },
];

const ORDER: Step[] = ['select-file', 'preview', 'validate', 'submitting', 'results'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const STATUS_META: Record<DayStatus, { label: string; className: string }> = {
  ok: { label: 'Will import', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  skipped_role: { label: 'Skipped — role', className: 'bg-amber-100 text-amber-900 hover:bg-amber-100' },
  unmatched: { label: 'Unmatched code', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
};

export function BiometricImportDialog({ open, onOpenChange, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('select-file');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const reset = useCallback(() => {
    setStep('select-file');
    setFile(null);
    setReport(null);
    setErrorMsg(null);
    setProgress(0);
    setIsDragging(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // ---- Template ------------------------------------------------------------
  const downloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/hr/attendance/import/template');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `Template download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'biometric-attendance-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Template download failed');
    } finally {
      setDownloading(false);
    }
  }, []);

  // ---- Upload → dry run ----------------------------------------------------
  const post = useCallback(async (f: File, dryRun: boolean): Promise<ImportReport> => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', dryRun ? 'true' : 'false');
    const res = await fetch('/api/hr/attendance/import', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
    return body as ImportReport;
  }, []);

  const analyse = useCallback(
    async (f: File) => {
      setStep('analyzing');
      setErrorMsg(null);
      setProgress(20);
      try {
        const r = await post(f, true);
        setProgress(100);
        setReport(r);
        setStep('preview');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not read the file');
        setStep('select-file');
      } finally {
        setProgress(0);
      }
    },
    [post],
  );

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f) return;
      if (!f.name.endsWith('.xlsx')) {
        toast.error('Please upload the biometric .xlsx export.');
        return;
      }
      setFile(f);
      setReport(null);
      setErrorMsg(null);
      void analyse(f);
    },
    [analyse],
  );

  const submit = useCallback(async () => {
    if (!file) return;
    setStep('submitting');
    setProgress(30);
    try {
      const r = await post(file, false);
      setProgress(100);
      setReport(r);
      setStep('results');
      onImportComplete?.();
      toast.success(r.message ?? 'Import complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStep('validate');
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setProgress(0);
    }
  }, [file, post, onImportComplete]);

  const stepIndex = useMemo(() => {
    if (step === 'analyzing') return 0;
    return Math.max(0, ORDER.indexOf(step));
  }, [step]);

  const nothingToImport = (report?.ok_days ?? 0) === 0;
  const issueCount =
    (report?.parse_errors.length ?? 0) +
    (report?.unmatched_codes.length ?? 0) +
    (report?.non_faculty_skipped.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Import biometric punches</DialogTitle>
              <DialogDescription>
                Upload the device export, check what it parsed to, then commit.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download template
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1">
            {STEPS.map((s, i) => {
              const isCurrent = s.key === step || (step === 'analyzing' && s.key === 'select-file');
              const isDone = i < stepIndex;
              return (
                <div key={s.key} className="flex items-center">
                  <div
                    className={`rounded-md px-3 py-1 text-sm font-medium ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isDone
                          ? 'bg-green-100 text-green-700'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step === 'analyzing' && s.key === 'select-file' ? '1. Reading file…' : s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="mx-1 h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* ---------------- Step 1: select file ---------------- */}
          {(step === 'select-file' || step === 'analyzing') && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
            >
              {step === 'analyzing' ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="mt-4 text-sm font-medium">Reading {file?.name}…</p>
                  <Progress value={progress} className="mt-4 w-64" />
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-4 text-sm font-medium">
                    Drop the biometric .xlsx export here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    One row per punch · columns: Employee Id · Name · Biometric Id · Date/Time
                  </p>
                  <input
                    id="biometric-file"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  <Button asChild className="mt-4" variant="secondary">
                    <label htmlFor="biometric-file" className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Choose file
                    </label>
                  </Button>
                  <p className="mt-4 text-xs text-muted-foreground">
                    New to this? Download the template — it includes every valid Employee Id.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ---------------- Step 2: preview ---------------- */}
          {step === 'preview' && report && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Punches read" value={report.total_punches} />
                <Stat label="Employees in file" value={report.employees_in_file} />
                <Stat label="Punch-days" value={report.total_punch_days} />
                <Stat
                  label="Date range"
                  value={
                    report.date_from && report.date_to
                      ? report.date_from === report.date_to
                        ? report.date_from
                        : `${report.date_from} → ${report.date_to}`
                      : '—'
                  }
                  small
                />
              </div>

              <Alert>
                <FileSpreadsheet className="h-4 w-4" />
                <AlertDescription>
                  Each row below is one <strong>day</strong>, not one punch — the earliest punch
                  becomes IN and the latest becomes OUT. Everything in between is discarded.
                </AlertDescription>
              </Alert>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Employee Id</th>
                      <th className="px-3 py-2 font-medium">Name in MyJKKN</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Out</th>
                      <th className="px-3 py-2 font-medium">Punches</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.preview.map((r, i) => (
                      <tr key={`${r.code}-${r.work_date}-${i}`} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                        <td className="px-3 py-2">
                          {r.staff_name ?? (
                            <span className="text-muted-foreground">
                              {r.file_name || '—'}{' '}
                              <span className="text-xs">(not in MyJKKN)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{r.work_date}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.in_time}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.out_time}</td>
                        <td className="px-3 py-2">{r.punches}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className={STATUS_META[r.status].className}>
                            {STATUS_META[r.status].label}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.preview_truncated && (
                <p className="text-xs text-muted-foreground">
                  Showing the first {report.preview.length} of {report.total_punch_days} punch-days.
                  All {report.total_punch_days} will be processed.
                </p>
              )}
            </div>
          )}

          {/* ---------------- Step 3: validate ---------------- */}
          {step === 'validate' && report && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Will import" value={report.ok_days} tone="good" />
                <Stat label="Skipped — role filter" value={report.skipped_role_days} tone="warn" />
                <Stat label="Unmatched Employee Id" value={report.unmatched_days} tone="bad" />
              </div>

              {issueCount === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    No problems found. All {report.ok_days} punch-days are ready to import.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant={nothingToImport ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {nothingToImport
                      ? 'Nothing in this file can be imported. Fix the issues below and upload again.'
                      : `${report.ok_days} punch-day(s) will import. The rest are listed below and will be left untouched.`}
                  </AlertDescription>
                </Alert>
              )}

              {report.parse_errors.length > 0 && (
                <Section
                  title={`Rows that could not be read (${report.parse_errors.length}${report.parse_errors_truncated ? '+' : ''})`}
                  tone="bad"
                >
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Excel row</th>
                          <th className="px-3 py-2 font-medium">Problem</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.parse_errors.map((e) => (
                          <tr key={e.row} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{e.row}</td>
                            <td className="px-3 py-2">{e.reason}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {e.value ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {report.unmatched_codes.length > 0 && (
                <Section
                  title={`Employee Ids not found in MyJKKN (${report.unmatched_codes.length})`}
                  tone="bad"
                >
                  <p className="mb-2 text-xs text-muted-foreground">
                    These codes match no staff record, so their punches cannot be attributed.
                    Check them against the &ldquo;Valid Employee Ids&rdquo; sheet in the template.
                  </p>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {report.unmatched_codes.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </Section>
              )}

              {report.non_faculty_skipped.length > 0 && (
                <Section
                  title={`Staff skipped by the role filter (${report.non_faculty_skipped.length})`}
                  tone="warn"
                >
                  <p className="mb-2 text-xs text-muted-foreground">
                    The importer currently loads only <strong>faculty</strong> and{' '}
                    <strong>HOD</strong>. These people were matched but will not be imported.
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Employee Id</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 font-medium">Days lost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.non_faculty_skipped.map((s) => (
                          <tr key={s.code} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                            <td className="px-3 py-2">{s.name || '—'}</td>
                            <td className="px-3 py-2">{s.role ?? '—'}</td>
                            <td className="px-3 py-2">{s.days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* ---------------- Step 4: submitting ---------------- */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-sm font-medium">Importing…</p>
              <Progress value={progress} className="mt-4 w-64" />
            </div>
          )}

          {/* ---------------- Step 5: results ---------------- */}
          {step === 'results' && report && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{report.message ?? 'Import complete.'}</AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Punch-days loaded" value={report.loaded} tone="good" />
                <Stat label="Employees updated" value={report.faculty_matched} tone="good" />
                <Stat label="Skipped — role" value={report.skipped_role_days} tone="warn" />
                <Stat label="Unmatched" value={report.unmatched_days} tone="bad" />
              </div>

              {(report.non_faculty_skipped.length > 0 || report.unmatched_codes.length > 0) && (
                <Alert>
                  <UserX className="h-4 w-4" />
                  <AlertDescription>
                    {report.non_faculty_skipped.length} staff member(s) were skipped by the role
                    filter and {report.unmatched_codes.length} Employee Id(s) matched nobody. Their
                    attendance was not recorded.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-xs text-muted-foreground">
                Import never removes attendance — it only records present days from the device.
                Lateness and half-days are not derived here.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-4">
          <div className="text-xs text-muted-foreground">
            {file ? file.name : 'No file selected'}
          </div>

          <div className="flex gap-2">
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={reset}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Choose another file
                </Button>
                <Button onClick={() => setStep('validate')}>
                  Next: validate
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}

            {step === 'validate' && (
              <>
                <Button variant="outline" onClick={() => setStep('preview')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={submit} disabled={nothingToImport}>
                  Import {report?.ok_days ?? 0} punch-day
                  {(report?.ok_days ?? 0) === 1 ? '' : 's'}
                </Button>
              </>
            )}

            {step === 'results' && (
              <>
                <Button variant="outline" onClick={reset}>
                  Import another file
                </Button>
                <Button onClick={() => handleOpenChange(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </>
            )}

            {(step === 'select-file' || step === 'analyzing') && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: number | string;
  tone?: 'good' | 'warn' | 'bad';
  small?: boolean;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : '';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold ${small ? 'text-sm' : 'text-2xl'} ${toneClass}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'warn' | 'bad';
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4
        className={`text-sm font-semibold ${tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}
