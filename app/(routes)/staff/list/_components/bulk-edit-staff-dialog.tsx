'use client';

// ============================================
// BULK EDIT STAFF DIALOG
// ============================================
// Five-step shell: select -> preview -> validate -> uploading -> result.
//
// The validation gate is the point of this dialog. `skipInvalid` is a REQUEST, not a
// decision: BulkStaffEditService.apply() enforces it server-side and returns
// `refused: true` (HTTP 400 + a full report) when rows failed and the switch was off.
// The client never decides whether a write happens.
//
// Why this reads the report instead of res.ok: a refused batch comes back at 400 WITH the
// complete report so it can be rendered. The equivalent learners feature once threw the
// whole report away on one bad row out of 400 and left the user unable to tell that the
// other 399 HAD been written. `total_rows === undefined` is the only real failure signal.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { CategoryService } from '@/lib/services/staff/category-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { getErrorMessage } from '@/lib/utils';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Filter,
  Info,
  Loader2,
  Pencil,
  Upload,
  X
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
// Two different `staffKeys` exist — lib/query-keys.ts:116 and hooks/staff/use-staff.ts:28.
// The staff list reads through the hook's copy, so import THAT one. Both root at ['staff'],
// and React Query matches by prefix, so invalidating `staffKeys.all` clears list and stats.
import { staffKeys } from '@/hooks/staff/use-staff';
// `import type` is required, not stylistic: bulk-staff-edit-service imports BaseService, so a
// value import would pull the server service into the client bundle. Types erase at compile.
import type { BulkEditReport, BulkEditRow } from '@/lib/services/staff/bulk-staff-edit-service';

type Step = 'select' | 'preview' | 'validate' | 'uploading' | 'result';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'select', label: 'Upload' },
  { key: 'preview', label: 'Review' },
  { key: 'validate', label: 'Validation' },
  { key: 'result', label: 'Summary' }
];

const STEP_BLURB: Record<Step, string> = {
  select: 'Download the sheet, change only the cells you want to update, and upload it back',
  preview: 'What will change — nothing has been written yet',
  validate: 'Every rule the update enforces, checked before anything is written',
  uploading: 'Applying your changes…',
  result: 'Finished — this is exactly what was written'
};

function resultBanner(r: BulkEditReport): { tone: 'neutral' | 'success' | 'error' | 'warning'; text: string } {
  const { updated, skipped, failed } = r.counts;
  if (updated === 0 && failed === 0) {
    return { tone: 'neutral', text: 'Nothing needed changing — every row already matched the sheet.' };
  }
  if (failed === 0) {
    return {
      tone: 'success',
      text: `All done. ${updated} staff updated${skipped ? `, ${skipped} already up to date` : ''}.`
    };
  }
  if (updated === 0) {
    return { tone: 'error', text: `Nothing was written. ${failed} rows have problems that need fixing first.` };
  }
  return { tone: 'warning', text: `Partly done. ${updated} updated, ${failed} skipped because of problems.` };
}

const TONE_CLASS: Record<'neutral' | 'success' | 'error' | 'warning', string> = {
  neutral: 'border-muted-foreground/20 bg-muted/40',
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-destructive/30 bg-destructive/10',
  warning: 'border-amber-500/30 bg-amber-500/10'
};

export function BulkEditStaffDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<BulkEditReport | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Template scope. These narrow WHICH staff the downloaded sheet contains; they do not
  // affect upload, which always matches on Institution Email regardless of any filter.
  const [institutionId, setInstitutionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // Unlike the three above this does NOT narrow who is in the sheet — it pre-fills the
  // "Biometric Machine" cell for anyone not already enrolled, so a code-only edit stops
  // failing staff_biometric_scope_chk. Same idea as the HR "Link codes" step, which picks
  // the machine once for a whole file instead of once per person.
  const [biometricMachineId, setBiometricMachineId] = useState('');
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string; is_teaching?: boolean }>
  >([]);
  const [departments, setDepartments] = useState<Array<{ id: string; department_name: string }>>([]);

  // Loaded on open rather than on mount — most users of this page never open the dialog.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [institutionsData, categoriesData] = await Promise.all([
          // The third arg is the entity-type scope. Without 'all' the list silently
          // omits institutions whose entity_type is not the default.
          OrganizationService.getInstitutionNames(true, undefined, 'all'),
          // getCategories defaults to limit=10 and silently truncates the dropdown once
          // active categories grow past 10 — same fix already in staff-filters.tsx,
          // staff-form.tsx, download-staff-template.tsx and bulk-upload-staff.tsx.
          CategoryService.getCategories({ isActive: true, limit: 100 })
        ]);
        if (cancelled) return;
        setInstitutions(institutionsData ?? []);
        setCategories((categoriesData?.data ?? []) as any);
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Departments cascade from the chosen institution.
  useEffect(() => {
    if (!open) return;
    if (!institutionId) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const deps = await DepartmentService.getDepartmentsByInstitution(institutionId);
        if (!cancelled) setDepartments(deps ?? []);
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, institutionId]);

  const reset = () => {
    setStep('select');
    setFile(null);
    setReport(null);
    setSkipInvalid(false);
    setInstitutionId('');
    setDepartmentId('');
    setCategoryId('');
    setBiometricMachineId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  async function downloadTemplate() {
    setDownloading(true);
    try {
      // Only send the keys that are actually set — an empty string would reach the route
      // as a real parameter and match zero rows.
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (departmentId) params.set('department_id', departmentId);
      if (categoryId) params.set('category_id', categoryId);
      if (biometricMachineId) params.set('biometric_institution_id', biometricMachineId);
      const qs = params.toString();

      const res = await fetch(`/api/staff/bulk-edit/template${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? 'Could not build the template.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-bulk-edit-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded with your current staff data.');
    } catch {
      toast.error('Could not download the template.');
    } finally {
      setDownloading(false);
    }
  }

  async function runPreview() {
    if (!file) return;
    setPreviewing(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/staff/bulk-edit/preview', { method: 'POST', body });
      const json = await res.json();
      // A report is the success signal, not res.ok — see the header note.
      if (!res.ok && json?.total_rows === undefined) {
        toast.error(json?.error ?? 'Could not read that file.');
        return;
      }
      setReport(json as BulkEditReport);
      setStep('preview');
    } catch {
      toast.error('Could not read that file.');
    } finally {
      setPreviewing(false);
    }
  }

  async function runApply() {
    if (!file) return;
    setStep('uploading');
    try {
      const body = new FormData();
      body.append('file', file);
      // The switch only SENDS this. BulkStaffEditService.apply is what enforces it.
      body.append('skipInvalid', String(skipInvalid));

      const res = await fetch('/api/staff/bulk-edit/apply', { method: 'POST', body });
      const json = await res.json();

      // A refused batch comes back at 400 WITH a full report. Render it. Only a body with
      // no report at all (transport / permission) is a real failure.
      if (json?.total_rows === undefined) {
        toast.error(json?.error ?? 'The update could not be applied.');
        setStep('validate');
        return;
      }

      setReport(json as BulkEditReport);
      setStep('result');

      if ((json.counts?.updated ?? 0) > 0) {
        await queryClient.invalidateQueries({ queryKey: staffKeys.all });
      }
    } catch {
      toast.error('The update could not be applied.');
      setStep('validate');
    }
  }

  const rows: BulkEditRow[] = report?.rows ?? [];
  const changeRows = rows.filter(r => r.status === 'change');
  const errorRows = rows.filter(r => r.status === 'error');
  const formatRows = errorRows.filter(r => r.issues.some(i => i.kind === 'format'));
  const recordRows = errorRows.filter(r => r.issues.some(i => i.kind === 'record'));

  const canSubmit =
    !!report && report.counts.updated > 0 && (report.counts.failed === 0 || skipInvalid);

  const activeIndex = STEPS.findIndex(s => s.key === (step === 'uploading' ? 'validate' : step));

  function issueList(list: BulkEditRow[], kind: 'format' | 'record') {
    return (
      <div className='space-y-2'>
        {list.map(r => (
          <div key={`${kind}-${r.rowNumber}`} className='rounded-md border bg-background p-3 text-xs sm:text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='font-mono text-[10px]'>
                Row {r.rowNumber}
              </Badge>
              <span className='font-medium'>{r.name || r.institutionEmail}</span>
              <span className='text-muted-foreground'>{r.institutionEmail}</span>
            </div>
            <ul className='mt-2 space-y-1'>
              {r.issues
                .filter(i => i.kind === kind)
                .map((i, idx) => (
                  <li key={idx} className='flex items-start gap-2 text-muted-foreground'>
                    <AlertCircle className='mt-0.5 h-3 w-3 flex-shrink-0 text-destructive' />
                    <span>
                      <span className='font-medium text-foreground'>{i.field}</span> — {i.message}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' className='w-full sm:w-auto'>
          <Pencil className='mr-2 h-4 w-4' />
          Bulk Edit
        </Button>
      </DialogTrigger>
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl'>
        <DialogHeader className='flex-shrink-0 border-b bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-5'>
          <div className='flex items-center gap-3'>
            <div className='rounded-lg bg-primary/10 p-2'>
              <Pencil className='h-5 w-5 text-primary' />
            </div>
            <div>
              <DialogTitle className='flex flex-wrap items-center gap-2 text-xl font-bold'>
                Bulk Edit Staff
                {step === 'uploading' && <Badge className='bg-blue-500 text-xs'>Updating</Badge>}
                {step === 'result' && report && (
                  <Badge
                    className={`text-xs ${report.counts.updated > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  >
                    {report.counts.updated > 0 ? 'Complete' : 'Not applied'}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className='mt-1 text-xs sm:text-sm'>
                {STEP_BLURB[step]}
              </DialogDescription>
            </div>
          </div>

          {/* Wizard rail — makes it explicit that a validation gate stands between
              the file and the write. */}
          <div className='mt-4 flex items-center gap-1 overflow-x-auto sm:gap-2'>
            {STEPS.map((s, idx) => {
              const done = idx < activeIndex;
              const active = idx === activeIndex;
              return (
                <div key={s.key} className='flex flex-shrink-0 items-center gap-1 sm:gap-2'>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors sm:text-xs ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        active ? 'bg-primary-foreground/20' : done ? 'bg-primary/20' : 'bg-foreground/10'
                      }`}
                    >
                      {done ? <CheckCircle className='h-3 w-3' /> : idx + 1}
                    </span>
                    {s.label}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`h-px w-3 sm:w-6 ${done ? 'bg-primary/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className='min-h-0 flex-1 overflow-y-auto p-4 sm:p-6'>
          {/* ── STEP 1: SELECT ─────────────────────────────────────── */}
          {step === 'select' && (
            <div className='mx-auto max-w-3xl space-y-6'>
              <Alert className='border-primary/20 bg-primary/5'>
                <Info className='h-4 w-4 text-primary' />
                <AlertTitle className='font-semibold text-primary'>How bulk edit works</AlertTitle>
                <AlertDescription className='mt-2 space-y-2 text-xs sm:text-sm'>
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                    <span>1. Download the sheet — it comes pre-filled with current values</span>
                    <span>2. Change only the cells you want to correct</span>
                    <span>3. Upload it back and review what will change</span>
                    <span>4. Confirm to write</span>
                  </div>
                  <p className='mt-3 border-t border-primary/10 pt-3 text-xs font-medium'>
                    A <strong>blank cell leaves the field unchanged</strong> — bulk edit never clears a
                    field and never creates staff. Do not edit the <strong>Institution Email</strong>{' '}
                    column; it is the match key.
                  </p>
                </AlertDescription>
              </Alert>

              <div className='rounded-lg border-2 border-dashed p-6'>
                <div className='text-center'>
                  <FileSpreadsheet className='mx-auto h-10 w-10 text-muted-foreground' />
                  <p className='mt-3 text-sm font-medium'>Start with the pre-filled sheet</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Contains the staff you can access, with their current values.
                  </p>
                </div>

                <div className='mt-5 space-y-3'>
                  <div className='flex items-center gap-2'>
                    <Filter className='h-3.5 w-3.5 text-muted-foreground' />
                    <span className='text-xs font-medium text-muted-foreground'>
                      Narrow the sheet (optional)
                    </span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                    <Select
                      value={institutionId || 'all'}
                      onValueChange={value => {
                        setInstitutionId(value === 'all' ? '' : value);
                        // Department belongs to an institution, so it cannot survive the change.
                        setDepartmentId('');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Institution' />
                      </SelectTrigger>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='all'>All Institutions</SelectItem>
                        {institutions.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={departmentId || 'all'}
                      onValueChange={value => setDepartmentId(value === 'all' ? '' : value)}
                      disabled={!institutionId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Department' />
                      </SelectTrigger>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='all'>All Departments</SelectItem>
                        {departments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={categoryId || 'all'}
                      onValueChange={value => setCategoryId(value === 'all' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Category' />
                      </SelectTrigger>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='all'>All Categories</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.category_name}
                            {typeof cat.is_teaching === 'boolean' &&
                              (cat.is_teaching ? ' (Teaching)' : ' (Non-Teaching)')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className='text-xs text-muted-foreground'>
                    Filters change who is <em>in</em> the sheet. They do not affect the upload —
                    every row is matched on Institution Email whatever the filter was.
                  </p>

                  <div className='space-y-2 rounded-md border bg-muted/30 p-3'>
                    <Label htmlFor='staff-bulk-edit-machine' className='text-xs font-medium'>
                      Enrolling biometric codes? Pick the machine (optional)
                    </Label>
                    <Select
                      value={biometricMachineId || 'none'}
                      onValueChange={value => setBiometricMachineId(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id='staff-bulk-edit-machine'>
                        <SelectValue placeholder='No machine' />
                      </SelectTrigger>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='none'>Leave the machine column blank</SelectItem>
                        {institutions.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className='text-xs text-muted-foreground'>
                      A biometric code is meaningless without the machine that issued it — each
                      machine numbers its own enrolments from 1 — so a code with an empty{' '}
                      <strong>Biometric Machine</strong> cell is rejected. Pick the machine here
                      and the column arrives pre-filled, leaving you only the codes to type.
                      Anyone already enrolled keeps the machine they are on.
                    </p>
                  </div>

                  <div className='text-center'>
                    <Button variant='outline' onClick={downloadTemplate} disabled={downloading}>
                      {downloading ? (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      ) : (
                        <Download className='mr-2 h-4 w-4' />
                      )}
                      Download template
                    </Button>
                  </div>
                </div>
              </div>

              <div className='rounded-lg border p-4'>
                <Label htmlFor='staff-bulk-edit-file' className='text-sm font-medium'>
                  Upload your edited sheet
                </Label>
                <input
                  id='staff-bulk-edit-file'
                  ref={fileInputRef}
                  type='file'
                  accept='.xlsx,.xls'
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className='mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground'
                />
                {file && (
                  <p className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
                    <FileSpreadsheet className='h-3 w-3' />
                    {file.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: PREVIEW ────────────────────────────────────── */}
          {step === 'preview' && report && (
            <div className='space-y-4'>
              <div className='grid grid-cols-3 gap-3'>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold'>{report.counts.updated}</p>
                  <p className='text-xs text-muted-foreground'>will change</p>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold'>{report.counts.skipped}</p>
                  <p className='text-xs text-muted-foreground'>already up to date</p>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold text-destructive'>{report.counts.failed}</p>
                  <p className='text-xs text-muted-foreground'>have problems</p>
                </div>
              </div>

              <p className='text-xs text-muted-foreground'>
                Read from {report.total_rows} data rows. Nothing has been written yet.
              </p>

              {changeRows.length > 0 && (
                <div className='space-y-2'>
                  {changeRows.map(r => (
                    <div key={r.rowNumber} className='rounded-md border bg-background p-3 text-xs sm:text-sm'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='outline' className='font-mono text-[10px]'>
                          Row {r.rowNumber}
                        </Badge>
                        <span className='font-medium'>{r.name || r.institutionEmail}</span>
                        <span className='text-muted-foreground'>{r.institutionEmail}</span>
                      </div>
                      <ul className='mt-2 space-y-1'>
                        {r.changes.map((c, idx) => (
                          <li key={idx} className='flex flex-wrap items-center gap-2'>
                            <span className='font-medium'>{c.field}</span>
                            <span className='text-muted-foreground line-through'>{c.from || '(empty)'}</span>
                            <ArrowRight className='h-3 w-3 text-muted-foreground' />
                            <span className='font-medium text-primary'>{c.to || '(empty)'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {changeRows.length === 0 && errorRows.length === 0 && (
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription className='text-sm'>
                    No row in this sheet differs from what is stored.
                  </AlertDescription>
                </Alert>
              )}

              {/* Problem rows have to be shown HERE, not only on the validation step.
                  evaluate() reports a row with any issue as status 'error' with an EMPTY
                  changes list, so the edits on it vanish from the list above. Showing only
                  the change rows meant a sheet where every row had a problem rendered
                  "No row in this sheet differs from what is stored." — which reads as
                  "the system ignored my edit" and is why biometric edits were reported as
                  unrecognised: a code with no machine fails staff_biometric_scope_chk, so
                  every such row is an error row and the preview looked empty. */}
              {errorRows.length > 0 && (
                <div className='space-y-3'>
                  <Alert className='border-destructive/30 bg-destructive/10'>
                    <AlertCircle className='h-4 w-4 text-destructive' />
                    <AlertTitle className='font-semibold'>
                      {errorRows.length === 1
                        ? '1 row has a problem — its edits are not counted above'
                        : `${errorRows.length} rows have problems — their edits are not counted above`}
                    </AlertTitle>
                    <AlertDescription className='text-sm'>
                      A row with any problem is reported with no changes at all, so a good edit
                      sitting next to a bad cell will not appear until the problem is fixed.
                    </AlertDescription>
                  </Alert>
                  {formatRows.length > 0 && issueList(formatRows, 'format')}
                  {recordRows.length > 0 && issueList(recordRows, 'record')}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: VALIDATE ───────────────────────────────────── */}
          {step === 'validate' && report && (
            <div className='space-y-6'>
              {errorRows.length === 0 ? (
                <Alert className='border-green-500/30 bg-green-500/10'>
                  <CheckCircle className='h-4 w-4 text-green-600' />
                  <AlertTitle className='font-semibold'>Every row passed</AlertTitle>
                  <AlertDescription className='text-sm'>
                    {report.counts.updated} rows are ready to write.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {formatRows.length > 0 && (
                    <div className='space-y-2'>
                      <div>
                        <h4 className='text-sm font-semibold'>Fix the cell</h4>
                        <p className='text-xs text-muted-foreground'>
                          These values are the wrong shape. Correct them in the sheet and upload again.
                        </p>
                      </div>
                      {issueList(formatRows, 'format')}
                    </div>
                  )}

                  {recordRows.length > 0 && (
                    <div className='space-y-2'>
                      <div>
                        <h4 className='text-sm font-semibold'>Fix the record</h4>
                        <p className='text-xs text-muted-foreground'>
                          These rows point at something that does not exist or is already taken.
                        </p>
                      </div>
                      {issueList(recordRows, 'record')}
                    </div>
                  )}

                  <div className='flex items-start gap-3 rounded-lg border bg-muted/40 p-4'>
                    <Switch
                      id='staff-bulk-edit-skip-invalid'
                      checked={skipInvalid}
                      onCheckedChange={setSkipInvalid}
                    />
                    <div>
                      <Label htmlFor='staff-bulk-edit-skip-invalid' className='text-sm font-medium'>
                        Skip the rows with problems and update the rest
                      </Label>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        Off: nothing is written until every row is clean.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: UPLOADING ──────────────────────────────────── */}
          {step === 'uploading' && (
            <div className='flex flex-col items-center justify-center py-16'>
              <Loader2 className='h-10 w-10 animate-spin text-primary' />
              <p className='mt-4 text-sm font-medium'>Applying your changes…</p>
              <p className='mt-1 text-xs text-muted-foreground'>Do not close this dialog.</p>
            </div>
          )}

          {/* ── STEP 5: RESULT ─────────────────────────────────────── */}
          {step === 'result' && report && (
            <div className='space-y-4'>
              {(() => {
                const banner = resultBanner(report);
                return (
                  <div className={`rounded-lg border p-4 ${TONE_CLASS[banner.tone]}`}>
                    <p className='text-sm font-medium'>{banner.text}</p>
                  </div>
                );
              })()}

              <div className='grid grid-cols-3 gap-3'>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold text-green-600'>{report.counts.updated}</p>
                  <p className='text-xs text-muted-foreground'>updated</p>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold'>{report.counts.skipped}</p>
                  <p className='text-xs text-muted-foreground'>unchanged</p>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <p className='text-2xl font-bold text-destructive'>{report.counts.failed}</p>
                  <p className='text-xs text-muted-foreground'>not written</p>
                </div>
              </div>

              {errorRows.length > 0 && (
                <div className='space-y-2'>
                  <h4 className='text-sm font-semibold'>Rows that were not written</h4>
                  {/* formatRows/recordRows, not errorRows twice: issueList renders a card per
                      row in the list it is given and only filters the ISSUES by kind, so
                      passing errorRows to both calls rendered every failed row twice — once
                      with an empty bullet list. */}
                  {formatRows.length > 0 && issueList(formatRows, 'format')}
                  {recordRows.length > 0 && issueList(recordRows, 'record')}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className='flex-shrink-0 gap-2 border-t px-6 py-4'>
          {step === 'select' && (
            <>
              <Button variant='outline' onClick={() => handleOpenChange(false)}>
                <X className='mr-2 h-4 w-4' />
                Cancel
              </Button>
              <Button onClick={runPreview} disabled={!file || previewing}>
                {previewing ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Upload className='mr-2 h-4 w-4' />
                )}
                Preview changes
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant='outline' onClick={reset}>
                Start over
              </Button>
              <Button onClick={() => setStep('validate')}>
                Continue to validation
                <ArrowRight className='ml-2 h-4 w-4' />
              </Button>
            </>
          )}

          {step === 'validate' && (
            <>
              <Button variant='outline' onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button onClick={runApply} disabled={!canSubmit}>
                <CheckCircle className='mr-2 h-4 w-4' />
                {report && report.counts.failed > 0 && skipInvalid
                  ? `Update ${report.counts.updated} and skip ${report.counts.failed}`
                  : `Update ${report?.counts.updated ?? 0} staff`}
              </Button>
            </>
          )}

          {step === 'result' && (
            <>
              <Button variant='outline' onClick={reset}>
                Edit another sheet
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
