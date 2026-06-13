'use client';
// bulk-fee-structure-dialog.tsx — three-step wizard for the Bulk Import /
// Export-for-Edit flow:
//   1. Select   — choose the filled template or edited export.
//   2. Preview  — server dry-run validates every row and reports per-row
//                 Create / Update / Error WITHOUT writing anything.
//   3. Apply    — only enabled once 0 rows have errors (server enforces the
//                 same rule), then commits and shows the result.
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowLeft, ListChecks,
} from 'lucide-react';
import toast from 'react-hot-toast';

type PreviewAction = 'create' | 'update' | 'error';

interface PreviewRow {
  row: number;
  name: string;
  action: PreviewAction;
  errors: string[];
}

interface Preview {
  summary: { total: number; toCreate: number; toUpdate: number; errorRows: number; valid: number };
  rows: PreviewRow[];
  canApply: boolean;
}

interface ApplyResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; name: string; error: string }>;
}

type Step = 'select' | 'preview' | 'done';

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
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const reset = () => {
    setStep('select');
    setFile(null);
    setPreview(null);
    setResult(null);
    setValidating(false);
    setApplying(false);
  };

  const post = async (mode: 'validate' | 'apply') => {
    const fd = new FormData();
    fd.append('file', file!);
    fd.append('mode', mode);
    const res = await fetch('/api/admission/fees-structure/import', { method: 'POST', body: fd });
    const json = await res.json();
    return { res, json };
  };

  // Step 1 → 2: dry-run validate, never writes.
  const handleValidate = async () => {
    if (!file || validating) return;
    setValidating(true);
    try {
      const { res, json } = await post('validate');
      if (!res.ok) throw new Error(json?.error ?? 'Validation failed');
      setPreview(json as Preview);
      setStep('preview');
    } catch (e: any) {
      toast.error(e?.message ?? 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // Step 2 → 3: commit. Server re-validates and rejects (422) if anything slipped.
  const handleApply = async () => {
    if (!file || applying || !preview?.canApply) return;
    setApplying(true);
    try {
      const { res, json } = await post('apply');
      if (res.status === 422) {
        // Something changed/blocked server-side — refresh the preview, stay on step 2.
        setPreview(json as Preview);
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Fee Structures</DialogTitle>
          <DialogDescription>
            Upload a filled template (or an edited export), preview what will change, then apply.
            Rows with a blank <strong>Fee Structure ID</strong> are created; rows with an ID are updated.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <ol className="flex items-center gap-2 text-xs text-muted-foreground">
          {(['select', 'preview', 'done'] as Step[]).map((st, i) => {
            const labels = { select: 'Upload', preview: 'Preview & Validate', done: 'Apply' };
            const active = step === st;
            const passed = (['select', 'preview', 'done'] as Step[]).indexOf(step) > i;
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
                <span className={active ? 'font-medium text-foreground' : ''}>{labels[st]}</span>
                {i < 2 && <span className="mx-1 h-px w-5 bg-border" />}
              </li>
            );
          })}
        </ol>

        {/* ---- Step 1: Select ---- */}
        {step === 'select' && (
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
            <p className="text-xs text-muted-foreground">
              Dates accept common formats — <code>2026-06-11</code>, <code>11/06/2026</code>, or a real Excel date cell.
            </p>
          </div>
        )}

        {/* ---- Step 2: Preview & Validate ---- */}
        {step === 'preview' && s && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1"><ListChecks className="h-3.5 w-3.5" /> {s.total} rows</Badge>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">{s.toCreate} create</Badge>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">{s.toUpdate} update</Badge>
              {s.errorRows > 0
                ? <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">{s.errorRows} error</Badge>
                : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">0 errors</Badge>}
            </div>

            {s.errorRows > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Fix the {s.errorRows} flagged row(s) in your file and re-upload. Nothing is saved until every row is clear.</span>
              </div>
            )}

            <div className="max-h-72 overflow-auto rounded border divide-y">
              {preview!.rows.map((r) => {
                const badge = ACTION_BADGE[r.action];
                return (
                  <div key={r.row} className="flex items-start gap-2 p-2 text-xs">
                    <span className="font-mono text-muted-foreground w-12 shrink-0">Row {r.row}</span>
                    <Badge variant="outline" className={`shrink-0 ${badge.className}`}>{badge.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.name || <span className="text-muted-foreground">(no name)</span>}</div>
                      {r.errors.length > 0 && (
                        <ul className="mt-0.5 list-disc pl-4 text-destructive">
                          {r.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- Step 3: Done ---- */}
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
                <div className="max-h-56 overflow-auto rounded border divide-y">
                  {result.failed.map((f) => (
                    <div key={f.row} className="p-2 text-xs">
                      <span className="font-mono text-muted-foreground">Row {f.row}</span>
                      {f.name ? ` · ${f.name}` : ''} — <span className="text-destructive">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={validating}>Close</Button>
              <Button onClick={handleValidate} disabled={!file || validating}>
                {validating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListChecks className="mr-1 h-4 w-4" />}
                Validate &amp; Preview
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => { setStep('select'); setPreview(null); }} disabled={applying}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Choose another file
              </Button>
              <Button onClick={handleApply} disabled={!preview?.canApply || applying}>
                {applying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1 h-4 w-4" />}
                {preview?.canApply
                  ? `Apply ${s ? s.valid : ''} row${s && s.valid === 1 ? '' : 's'}`
                  : 'Fix errors to apply'}
              </Button>
            </>
          )}

          {step === 'done' && (
            <>
              <Button variant="ghost" onClick={reset}>Import another</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
