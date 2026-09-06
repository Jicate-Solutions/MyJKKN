'use client';

// ============================================================================
// Biometric monthly-report import — 5-step wizard
// ----------------------------------------------------------------------------
//   1. Upload    the machine's monthly export (.xls or .xlsx)
//   2. Preview   what the parser made of it, day by day, with our verdict
//                beside the machine's own P/A
//   3. Validate  unmapped codes, days needing review, parser warnings
//   4. Submit    commit
//   5. Result    what landed
//
// Steps 2 and 3 are two views of ONE dryRun response, and the API shares every
// line above the write — so the preview cannot disagree with the commit.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet,
  Loader2, Upload, UserX, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ANOMALY_LABEL, SHIFT_SCOPE_LABEL, VERDICT_CLASS, VERDICT_LABEL,
  type BiometricAnomalyKind, type BiometricImportReport,
  type BiometricSuggestResponse, type ImportVerdict,
} from '@/types/hr-biometric';
import { usePermissions } from '@/hooks/use-permissions';
import { useSuggestMappings } from '@/hooks/hr/use-biometric-mapping';
import { LinkCodesStep } from './link-codes-step';

type Step = 'select-file' | 'analyzing' | 'link-codes' | 'preview' | 'validate' | 'submitting' | 'results';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'select-file', label: '1. Upload' },
  { key: 'link-codes', label: '2. Link codes' },
  { key: 'preview', label: '3. Preview' },
  { key: 'validate', label: '4. Validate' },
  { key: 'submitting', label: '5. Submit' },
  { key: 'results', label: '6. Result' },
];
const ORDER: Step[] = ['select-file', 'link-codes', 'preview', 'validate', 'submitting', 'results'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function BiometricImportDialog({ open, onOpenChange, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('select-file');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<BiometricImportReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [suggestion, setSuggestion] = useState<BiometricSuggestResponse | null>(null);

  // The wired useAuth() exposes only { profile, isLoading, error } — permission
  // checks live in usePermissions(). can() already folds in super-admin and
  // fails closed while the permission query loads.
  const { can } = usePermissions();
  const canEditStaff = can('staff.edit');
  const suggest = useSuggestMappings();

  const reset = useCallback(() => {
    setStep('select-file'); setFile(null); setReport(null); setSuggestion(null);
    setErrorMsg(null); setProgress(0); setIsDragging(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

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
      a.download = 'biometric-monthly-report-template.xlsx';
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

  const post = useCallback(async (f: File, dryRun: boolean): Promise<BiometricImportReport> => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', dryRun ? 'true' : 'false');
    const res = await fetch('/api/hr/attendance/import', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
    return body as BiometricImportReport;
  }, []);

  /**
   * Dry-run the file. When codes are unmapped we fetch mapping suggestions from
   * the SAME file already in memory and route through the Link codes step — the
   * user still only ever picks a file once.
   */
  const analyse = useCallback(async (f: File, forcePreview = false) => {
    setStep('analyzing'); setErrorMsg(null); setProgress(25);
    try {
      const r = await post(f, true);
      setReport(r);
      setProgress(70);

      if (!forcePreview && r.unmatched_codes.length > 0) {
        try {
          const s = await suggest.mutateAsync(f);
          setSuggestion(s);
          setProgress(100);
          setStep('link-codes');
          return;
        } catch {
          // Suggestions are a convenience; a failure here must not block the
          // import of everyone who IS mapped.
          toast.error('Could not load mapping suggestions — continuing to preview.');
        }
      }
      setProgress(100);
      setStep('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read the file');
      setStep('select-file');
    } finally { setProgress(0); }
  }, [post, suggest]);

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.(xls|xlsx)$/i.test(f.name)) {
      toast.error('Upload the machine export as .xls or .xlsx.');
      return;
    }
    setFile(f); setReport(null); setErrorMsg(null);
    void analyse(f);
  }, [analyse]);

  const submit = useCallback(async () => {
    if (!file) return;
    setStep('submitting'); setProgress(35);
    try {
      const r = await post(file, false);
      setProgress(100); setReport(r); setStep('results');
      onImportComplete?.();
      toast.success(r.message ?? 'Import complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStep('validate');
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally { setProgress(0); }
  }, [file, post, onImportComplete]);

  const stepIndex = useMemo(
    () => (step === 'analyzing' ? 0 : Math.max(0, ORDER.indexOf(step))),
    [step],
  );

  const writable = report ? report.total_day_cells - report.counts.EXCEPTION : 0;
  const nothingToImport = !report || report.matched_employees === 0 || writable === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Import biometric attendance</DialogTitle>
              <DialogDescription>
                Upload the machine&apos;s monthly report unchanged. Check what it resolved to, then commit.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Sample format
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1">
            {STEPS.map((s, i) => {
              const isCurrent = s.key === step || (step === 'analyzing' && s.key === 'select-file');
              const isDone = i < stepIndex;
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`rounded-md px-3 py-1 text-sm font-medium ${
                    isCurrent ? 'bg-primary text-primary-foreground'
                      : isDone ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'}`}>
                    {step === 'analyzing' && s.key === 'select-file' ? '1. Reading file…' : s.label}
                  </div>
                  {i < STEPS.length - 1 && <ArrowRight className="mx-1 h-4 w-4 text-muted-foreground" />}
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

          {(step === 'select-file' || step === 'analyzing') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
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
                  <p className="mt-4 text-sm font-medium">Drop the machine&apos;s monthly report here</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    .xls or .xlsx, exactly as exported — no reshaping needed
                  </p>
                  <input id="biometric-file" type="file" accept=".xls,.xlsx" className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  <Button asChild className="mt-4" variant="secondary">
                    <label htmlFor="biometric-file" className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" /> Choose file
                    </label>
                  </Button>
                  <p className="mt-4 max-w-md text-xs text-muted-foreground">
                    Codes must be linked to staff first, on the Biometric Mapping page. An unlinked
                    code imports nothing.
                  </p>
                </>
              )}
            </div>
          )}

          {step === 'link-codes' && suggestion && (
            <LinkCodesStep
              suggestion={suggestion}
              canEdit={canEditStaff}
              onSkip={() => setStep('preview')}
              onSaved={() => { if (file) void analyse(file, true); }}
            />
          )}

          {step === 'preview' && report && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Machine" value={report.institution?.name ?? '—'} small />
                <Stat label="Month" value={report.month_label || '—'} small />
                <Stat label="Employees matched" value={`${report.matched_employees} / ${report.employees_in_file}`} small />
                <Stat label="Day records" value={report.total_day_cells} />
              </div>

              <div className="flex flex-wrap gap-2">
                {(Object.keys(VERDICT_LABEL) as ImportVerdict[]).map((v) => (
                  <Badge key={v} variant="secondary" className={VERDICT_CLASS[v]}>
                    {VERDICT_LABEL[v]}: {report.counts[v] ?? 0}
                  </Badge>
                ))}
              </div>

              <Alert>
                <FileSpreadsheet className="h-4 w-4" />
                <AlertDescription>
                  <strong>Our verdict overrides the machine&apos;s.</strong> The machines have no weekly
                  off configured and mark every Sunday Absent; the configured shift timings decide
                  instead. The machine&apos;s own value is stored alongside ours so the difference stays
                  auditable.
                </AlertDescription>
              </Alert>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Staff</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Out</th>
                      <th className="px-3 py-2 font-medium">Worked</th>
                      {/* The machine's own P/A used to sit here. It is still
                          parsed, still stored on the row and still grades our
                          totals in the Validate step — but showing it per row
                          invited the reading that a machine "P" outranks our
                          "Half day". The verdict comes from the shift timing.
                          The shift is shown instead, so the rule that produced
                          the verdict is visible next to it. */}
                      <th className="px-3 py-2 font-medium">Shift applied</th>
                      <th className="px-3 py-2 font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.preview.map((r, i) => (
                      <tr key={`${r.code}-${r.work_date}-${i}`} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                        <td className="px-3 py-2">
                          {r.staff_name ?? <span className="text-muted-foreground">{r.device_name}</span>}
                          {r.staff_code && <span className="ml-1 text-xs text-muted-foreground">({r.staff_code})</span>}
                        </td>
                        <td className="px-3 py-2">{r.work_date} <span className="text-xs text-muted-foreground">{r.weekday}</span></td>
                        <td className="px-3 py-2 font-mono text-xs">{r.in_time ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.out_time ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{fmtMinutes(r.work_minutes)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {r.shift_window ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className={VERDICT_CLASS[r.verdict]}>
                            {VERDICT_LABEL[r.verdict]}
                          </Badge>
                          {r.late_minutes ? <span className="ml-1 text-xs text-amber-700">late {r.late_minutes}m</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.preview_truncated && (
                <p className="text-xs text-muted-foreground">
                  Showing the first {report.preview.length} of {report.total_day_cells} day records. All will be processed.
                </p>
              )}
            </div>
          )}

          {step === 'validate' && report && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Will import" value={writable} tone="good" />
                <Stat label="Need review" value={report.counts.EXCEPTION} tone="warn" />
                <Stat label="Unmapped codes" value={report.unmatched_codes.length} tone="bad" />
              </div>

              {/* --- which shift rule applied to whom --- */}
              {report.shift_coverage.length > 0 && (() => {
                const noTiming = report.shift_coverage.filter((r) => r.days_without_timing > 0);
                const byScope = report.shift_coverage.reduce<Record<string, number>>((acc, r) => {
                  const k = r.matched_by ?? 'none';
                  acc[k] = (acc[k] ?? 0) + 1;
                  return acc;
                }, {});
                return (
                  <Section
                    title={`Shift timings applied — ${report.shift_coverage.length} employee(s)`}
                    tone={noTiming.length > 0 ? 'bad' : 'warn'}
                  >
                    <p className="mb-2 text-xs text-muted-foreground">
                      A timing can be set for <strong>Teaching</strong>, <strong>Non-teaching</strong>,
                      or as a <strong>category override</strong>, and the override wins. Which one
                      matched decides every verdict below, so it is worth checking here rather than
                      after committing. A day with no timing at all cannot be judged and lands in
                      needs-review.
                    </p>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {Object.entries(byScope).map(([k, n]) => (
                        <Badge
                          key={k}
                          variant="outline"
                          className={k === 'none' ? 'border-red-300 text-red-700' : undefined}
                        >
                          {k === 'none' ? 'No timing' : SHIFT_SCOPE_LABEL[k] ?? k}: {n}
                        </Badge>
                      ))}
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-md border">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-muted/50">
                          <tr className="text-left">
                            <th className="px-3 py-2 font-medium">Code</th>
                            <th className="px-3 py-2 font-medium">Staff</th>
                            <th className="px-3 py-2 font-medium">Category</th>
                            <th className="px-3 py-2 font-medium">Matched by</th>
                            <th className="px-3 py-2 font-medium">Shift</th>
                            <th className="px-3 py-2 text-right font-medium">Days w/o timing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Anyone missing a timing first — they are the reason to read this. */}
                          {[...report.shift_coverage]
                            .sort((a, b) => b.days_without_timing - a.days_without_timing)
                            .map((r) => (
                              <tr key={r.code} className="border-t">
                                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                                <td className="px-3 py-2">{r.staff_name ?? '—'}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {r.category_name ?? '—'}
                                  {r.is_teaching === null ? '' : r.is_teaching ? ' · teaching' : ' · non-teaching'}
                                </td>
                                <td className="px-3 py-2">
                                  {r.matched_by ? (
                                    <Badge variant="outline">
                                      {SHIFT_SCOPE_LABEL[r.matched_by] ?? r.matched_by}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-red-300 text-red-700">
                                      None
                                    </Badge>
                                  )}
                                  {r.mixed && (
                                    <span className="ml-1 text-xs text-amber-700">mixed</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {r.window ?? '—'}
                                  {r.grace_minutes ? ` +${r.grace_minutes}m` : ''}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right tabular-nums ${
                                    r.days_without_timing > 0 ? 'font-semibold text-red-700' : 'text-muted-foreground'
                                  }`}
                                >
                                  {r.days_without_timing} / {r.days_total}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                );
              })()}

              {/* --- the machine's own totals grading our arithmetic --- */}
              <Section
                title={`Reconciliation against the machine's own totals — ${report.reconciled_employees} of ${report.reconciliation.length} agree`}
                tone={report.reconciled_employees === report.reconciliation.length ? 'warn' : 'bad'}
              >
                <p className="mb-2 text-xs text-muted-foreground">
                  The machine counts any day with a punch as Present and everything else — including
                  every Sunday — as Absent. So its Present should equal our present + half day +
                  needs-review, and its Absent should equal our absent + weekly off. A row that does
                  not add up means one of the two is wrong.
                </p>
                {report.reconciliation.filter((r) => !r.reconciled).length === 0 ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Every employee&apos;s totals add back up to the machine&apos;s own counts.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Code</th>
                          <th className="px-3 py-2 font-medium">Staff</th>
                          <th className="px-3 py-2 font-medium">Machine P / A</th>
                          <th className="px-3 py-2 font-medium">Ours (P / half / abs / WO / review)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.reconciliation.filter((r) => !r.reconciled).map((r) => (
                          <tr key={r.code} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                            <td className="px-3 py-2">{r.staff_name ?? r.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {r.machine_present ?? '—'} / {r.machine_absent ?? '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {r.our_present} / {r.our_half_day} / {r.our_absent} / {r.our_weekly_off} / {r.our_exception}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* --- the new machine fields --- */}
              <Section title="Machine fields" tone="warn">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Late arrivals" value={report.field_totals.late_days} small />
                  <Stat label="Half days" value={report.field_totals.half_days} small />
                  <Stat label="Days with OT" value={report.field_totals.ot_days} small />
                  <Stat label="Total OT" value={fmtMinutes(report.field_totals.ot_minutes)} small />
                  <Stat label="Total worked" value={fmtMinutes(report.field_totals.work_minutes)} small />
                  <Stat label="Days with break" value={report.field_totals.break_days} small />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.field_totals.expected_weekly_off_flips} day(s) the machine marked Absent
                  are weekly offs under the configured shift timings — that flip is expected and is
                  not counted as a disagreement.
                  {report.field_totals.status_disagreements > 0 && (
                    <> {report.field_totals.status_disagreements} genuine disagreement(s) remain, listed below.</>
                  )}
                </p>
              </Section>

              {report.anomalies.length > 0 && (
                <Section title={`Field anomalies (${report.anomalies_total})`} tone="warn">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {Object.entries(
                      report.anomalies.reduce<Record<string, number>>((acc, a) => {
                        acc[a.kind] = (acc[a.kind] ?? 0) + 1;
                        return acc;
                      }, {}),
                    ).map(([kind, n]) => (
                      <Badge key={kind} variant="outline">
                        {ANOMALY_LABEL[kind as BiometricAnomalyKind]}: {n}
                      </Badge>
                    ))}
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Code</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">What</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.anomalies.map((a, i) => (
                          <tr key={`${a.code}-${a.work_date}-${a.kind}-${i}`} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                            <td className="px-3 py-2">{a.work_date}</td>
                            <td className="px-3 py-2 text-xs">{a.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    These do not block the import — the machine&apos;s values are stored as reported so
                    they stay auditable.
                  </p>
                </Section>
              )}

              {report.unmatched_codes.length > 0 && (
                <Section title={`Enrolment codes not linked to any staff (${report.unmatched_codes.length})`} tone="bad">
                  <p className="mb-2 text-xs text-muted-foreground">
                    These punches cannot be attributed and will be skipped entirely. Link them on the
                    Biometric Mapping page, then upload again.
                  </p>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {report.unmatched_codes.map((u) => (
                      <Badge key={u.code} variant="outline" className="font-mono text-xs">
                        {u.code}{u.name ? ` · ${u.name}` : ''}
                      </Badge>
                    ))}
                  </div>
                </Section>
              )}

              {report.exceptions.length > 0 && (
                <Section title={`Days that could not be judged (${report.exceptions_total})`} tone="warn">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Usually a single punch — the machine files a lone evening punch under IN, so it
                    cannot be read as an arrival. These are raised as attendance exceptions for
                    regularization rather than guessed at.
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Code</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.exceptions.map((e, i) => (
                          <tr key={`${e.code}-${e.work_date}-${i}`} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{e.code}</td>
                            <td className="px-3 py-2">{e.name || '—'}</td>
                            <td className="px-3 py-2">{e.work_date}</td>
                            <td className="px-3 py-2 text-xs">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {report.parser_warnings.length > 0 && (
                <Section title={`Parser warnings (${report.parser_warnings.length})`} tone="warn">
                  <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                    {report.parser_warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </Section>
              )}

              {report.skipped_no_organization > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {report.skipped_no_organization} day record(s) have a staff member whose
                    institution has no HR organization, and cannot be stored.
                  </AlertDescription>
                </Alert>
              )}

              {report.unmatched_codes.length === 0
                && report.counts.EXCEPTION === 0
                && report.anomalies_total === 0
                && report.reconciled_employees === report.reconciliation.length && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    No problems found. Every code is linked, every day was judged, the machine
                    fields are consistent, and all totals reconcile. {writable} day records are ready.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-sm font-medium">Importing…</p>
              <Progress value={progress} className="mt-4 w-64" />
            </div>
          )}

          {step === 'results' && report && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{report.message ?? 'Import complete.'}</AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Day records written" value={report.written} tone="good" />
                <Stat label="Employees" value={report.matched_employees} tone="good" />
                <Stat label="Exceptions raised" value={report.exceptions_written} tone="warn" />
                <Stat label="Unmapped codes" value={report.unmatched_codes.length} tone="bad" />
              </div>
              {report.unmatched_codes.length > 0 && (
                <Alert>
                  <UserX className="h-4 w-4" />
                  <AlertDescription>
                    {report.unmatched_codes.length} enrolment code(s) are still unlinked; their
                    attendance was not recorded. Map them and re-upload — re-importing the same
                    month overwrites cleanly.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-4">
          <div className="text-xs text-muted-foreground">{file ? file.name : 'No file selected'}</div>
          <div className="flex gap-2">
            {step === 'link-codes' && (
              <Button variant="outline" onClick={reset}>
                <ArrowLeft className="mr-2 h-4 w-4" />Choose another file
              </Button>
            )}

            {step === 'preview' && (
              <>
                {suggestion ? (
                  <Button variant="outline" onClick={() => setStep('link-codes')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Back to linking
                  </Button>
                ) : (
                  <Button variant="outline" onClick={reset}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Choose another file
                  </Button>
                )}
                <Button onClick={() => setStep('validate')}>Next: validate<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </>
            )}
            {step === 'validate' && (
              <>
                <Button variant="outline" onClick={() => setStep('preview')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                <Button onClick={submit} disabled={nothingToImport}>
                  Import {writable} day record{writable === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {step === 'results' && (
              <>
                <Button variant="outline" onClick={reset}>Import another file</Button>
                <Button onClick={() => handleOpenChange(false)}><X className="mr-2 h-4 w-4" />Close</Button>
              </>
            )}
            {(step === 'select-file' || step === 'analyzing') && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtMinutes(m: number | null): string {
  if (m === null || m === undefined) return '—';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function Stat({ label, value, tone, small }: {
  label: string; value: number | string; tone?: 'good' | 'warn' | 'bad'; small?: boolean;
}) {
  const toneClass = tone === 'good' ? 'text-green-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'bad' ? 'text-red-700' : '';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold ${small ? 'text-sm' : 'text-2xl'} ${toneClass}`}>{value}</p>
    </div>
  );
}

function Section({ title, tone, children }: {
  title: string; tone: 'warn' | 'bad'; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className={`text-sm font-semibold ${tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>{title}</h4>
      {children}
    </div>
  );
}
