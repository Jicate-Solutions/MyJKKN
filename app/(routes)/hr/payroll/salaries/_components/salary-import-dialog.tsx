'use client';

/**
 * Import the "Salary data import" workbook.
 *
 * SAME TWO-PASS SHAPE AS THE BIOMETRIC IMPORT: a dry run produces the verdict,
 * the user reads it, and the commit re-runs the identical code path with
 * dryRun=false. Nothing is written until the second call, and because both
 * calls share one evaluator the preview cannot disagree with the outcome.
 *
 * THE EFFECTIVE DATE IS ASKED FOR, NEVER GUESSED. Every row of the reference
 * file ships a blank Effective_Date, so the date cannot come from the sheet.
 * Defaulting it to today would silently backdate or postdate 52 salaries by
 * however long the file sat in someone's inbox, so the field is required and
 * the API rejects a request without it.
 *
 * SKIPPED ROWS MUST BE ACKNOWLEDGED. Unmatched employee codes are a warning
 * rather than a block — the instruction was to import the matched ones — but a
 * partial import that reports itself as a plain success is how ten people
 * quietly end up unpaid, so the confirmation is explicit.
 */

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getErrorMessage } from '@/lib/utils';
import type { SalaryImportResponse } from '@/types/hr-payroll';
import type { SalaryValidationBlock } from '@/lib/hr/payroll/validate-salary-upload';

type Step = 'select-file' | 'preview' | 'submitting' | 'results';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Today in IST as yyyy-MM-dd — the date input's max, so nobody types 2027. */
function todayIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

function BlockCard({ block }: { block: SalaryValidationBlock }) {
  const tone =
    block.severity === 'hard'
      ? { icon: XCircle, cls: 'border-destructive/50 bg-destructive/5 text-destructive' }
      : block.severity === 'acknowledgeable'
        ? { icon: AlertTriangle, cls: 'border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400' }
        : { icon: Info, cls: 'border-border bg-muted/40 text-muted-foreground' };
  const Icon = tone.icon;

  return (
    <div className={`rounded-lg border p-3 text-sm ${tone.cls}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{block.message}</p>
          {block.detail.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs opacity-80">
              {block.detail.slice(0, 12).map((d) => (
                <li key={d} className="truncate font-mono">{d}</li>
              ))}
              {block.detail.length > 12 && (
                <li className="italic">…and {block.detail.length - 12} more</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function SalaryImportDialog({ open, onOpenChange, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('select-file');
  const [file, setFile] = useState<File | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [report, setReport] = useState<SalaryImportResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('select-file');
    setFile(null);
    setEffectiveFrom('');
    setAcknowledged(false);
    setReport(null);
    setErrorMsg(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && step === 'submitting') return; // never abandon a running write
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset, step]
  );

  const post = useCallback(
    async (dryRun: boolean): Promise<SalaryImportResponse | null> => {
      if (!file) return null;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dryRun', String(dryRun));
      fd.append('effectiveFrom', effectiveFrom);
      fd.append('acknowledge', String(acknowledged));

      const res = await fetch('/api/hr/payroll/salaries/import', { method: 'POST', body: fd });
      const json = (await res.json()) as SalaryImportResponse;

      if (!res.ok) {
        setErrorMsg(json.message || json.error || `Request failed (${res.status})`);
        // A 400 carrying a validation body is still worth showing: it explains
        // WHICH rows blocked the import, which a bare message cannot.
        return json.validation ? json : null;
      }
      setErrorMsg(null);
      return json;
    },
    [acknowledged, effectiveFrom, file]
  );

  const handleAnalyze = useCallback(async () => {
    if (!file || !effectiveFrom) return;
    setStep('submitting');
    try {
      const json = await post(true);
      if (json) {
        setReport(json);
        setStep('preview');
      } else {
        setStep('select-file');
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('select-file');
    }
  }, [effectiveFrom, file, post]);

  const handleCommit = useCallback(async () => {
    setStep('submitting');
    try {
      const json = await post(false);
      if (json?.success) {
        setReport(json);
        setStep('results');
        toast.success(json.message ?? `${json.written} salary record(s) imported.`);
        onImportComplete?.();
      } else {
        if (json) setReport(json);
        setStep('preview');
        toast.error(json?.message ?? 'Import failed.');
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setStep('preview');
      toast.error(getErrorMessage(err));
    }
  }, [onImportComplete, post]);

  const counts = report?.validation.counts;
  const needsAck = report?.validation.requires_acknowledgement ?? false;
  const canImport = report?.validation.can_import ?? false;
  const canSubmit = canImport && (!needsAck || acknowledged);

  const changedLabel = useMemo(() => {
    if (!counts) return '';
    if (counts.unchanged === 0) return `${counts.changed} new or changed`;
    return `${counts.changed} new or changed · ${counts.unchanged} unchanged`;
  }, [counts]);

  const totalMonthly = useMemo(() => {
    if (!report) return 0;
    return report.validation.rows
      .filter((r) => r.importable)
      .reduce((sum, r) => sum + (r.monthly_gross ?? 0), 0);
  }, [report]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import employee salaries
          </DialogTitle>
          <DialogDescription>
            Upload the &ldquo;Salary data import&rdquo; workbook. Rows are matched on Employee ID
            against the staff records, and nothing is written until you confirm the preview.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {step === 'select-file' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="salary-file">Salary workbook (.xls / .xlsx)</Label>
              <Input
                id="salary-file"
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setErrorMsg(null);
                }}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary-effective">Effective from</Label>
              <Input
                id="salary-effective"
                type="date"
                max={todayIST()}
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The sheet leaves Effective Date blank, so this date applies to every row that
                does not carry its own. Payslips before this date keep the previous salary.
              </p>
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Working through the file…</p>
          </div>
        )}

        {step === 'preview' && report && counts && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Rows read</p>
                <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Will import</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {counts.importable}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Monthly total</p>
                <p className="text-2xl font-semibold tabular-nums">{INR.format(totalMonthly)}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Sheet <span className="font-mono">{report.sheet_name}</span> · effective{' '}
              <span className="font-mono">{report.effective_from}</span> · {changedLabel}
            </p>

            {report.parser_warnings.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <ul className="space-y-0.5 text-xs">
                    {report.parser_warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {report.validation.blocks.length > 0 && (
              <ScrollArea className="max-h-64">
                <div className="space-y-2 pr-3">
                  {report.validation.blocks.map((b, i) => (
                    <BlockCard key={`${b.kind}-${i}`} block={b} />
                  ))}
                </div>
              </ScrollArea>
            )}

            {needsAck && canImport && (
              <>
                <Separator />
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(v) => setAcknowledged(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    I understand that {counts.total - counts.importable} of {counts.total} row(s)
                    will be skipped and only {counts.importable} salaries will be written.
                  </span>
                </label>
              </>
            )}
          </div>
        )}

        {step === 'results' && report && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-medium">{report.written} salary record(s) imported</p>
                <p className="text-xs text-muted-foreground">
                  Effective {report.effective_from}. Earlier figures are kept as history.
                </p>
              </div>
            </div>

            {report.failures.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-1 font-medium">{report.failures.length} row(s) failed to write:</p>
                  <ul className="space-y-0.5 text-xs">
                    {report.failures.slice(0, 12).map((f) => (
                      <li key={f.employee_code}>
                        <span className="font-mono">{f.employee_code}</span> — {f.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {report.validation.counts.unmatched > 0 && (
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1.5">
                  {report.validation.counts.unmatched} skipped
                </Badge>
                Employee IDs with no staff record. Add them under Employees, then re-upload.
              </p>
            )}

            {report.validation.counts.not_in_hr > 0 && (
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1.5">
                  {report.validation.counts.not_in_hr} skipped
                </Badge>
                Employment categories excluded from HR. Turn on “Included in HR” for the
                category if they should be paid through payroll.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'select-file' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleAnalyze} disabled={!file || !effectiveFrom}>
                <Upload className="mr-2 h-4 w-4" />
                Check the file
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => { setReport(null); setStep('select-file'); }}>
                Back
              </Button>
              <Button onClick={handleCommit} disabled={!canSubmit}>
                Import {counts?.importable ?? 0} salaries
              </Button>
            </>
          )}
          {step === 'results' && (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
