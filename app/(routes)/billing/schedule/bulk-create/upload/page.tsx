'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  ChevronRight,
  Loader2,
  CheckCircle2,
  X,
  FileSpreadsheet,
  ArrowLeft,
  Download,
  AlertCircle,
  IndianRupee
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { PermissionGuard } from '@/components/auth/permission-guard';
import toast from 'react-hot-toast';
import { BulkCreatePreviewTable } from './_components/bulk-create-preview-table';
import { BulkCreateValidationPanel } from './_components/bulk-create-validation-panel';
import { BulkCreateResult } from './_components/bulk-create-result';
import {
  useBulkCreatePreview,
  useBulkCreateCommit
} from '@/hooks/billing/use-bulk-create-bills-import';
import type {
  BulkCreatePreviewResult,
  ImportResult
} from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * navMeta — documents that this page is reached from a button on the
 * bulk-create page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/billing/schedule/bulk-create'
} as const;

type Step = 'upload' | 'preview' | 'validate' | 'confirm' | 'result';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'upload', label: '1. Upload' },
  { key: 'preview', label: '2. Preview' },
  { key: 'validate', label: '3. Validate' },
  { key: 'confirm', label: '4. Create' },
  { key: 'result', label: '5. Result' }
];

/**
 * Multi-step bulk bill upload.
 *
 * Replaces a single "Upload & Import" click that committed bills the moment the
 * file was accepted — every check below already ran back then, but only after
 * the write, so the only way to learn a sheet was wrong was to read the failure
 * report of bills that already existed.
 *
 * Steps 2–4 are all served by ONE dry-run request to .../import/preview, which
 * writes nothing. The commit in step 4 re-posts the same file to .../import,
 * which re-validates from scratch: the browser never sends back insert rows,
 * and a preview that has gone stale (someone else created the conflicting bill
 * meanwhile) cannot slip a now-invalid row past the guards.
 */
export default function BulkCreateUploadPage() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<BulkCreatePreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  /**
   * Explicit acceptance that invalid rows will be skipped. Only ever shown when
   * the sheet actually has invalid rows; its value is sent to the server, which
   * refuses a partial write without it — so the checkbox is a real gate, not
   * just a client-side speed bump.
   */
  const [skipInvalidAck, setSkipInvalidAck] = useState(false);

  const previewMutation = useBulkCreatePreview();
  const commitMutation = useBulkCreateCommit();

  const reset = () => {
    setStep('upload');
    setFile(null);
    setProgress(0);
    setPreview(null);
    setResult(null);
    setSkipInvalidAck(false);
  };

  const pickFile = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      toast.error('Please select a .xlsx or .xls file');
      return;
    }
    setFile(selected);
    // A new file invalidates any earlier verdict.
    setPreview(null);
    setSkipInvalidAck(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/billing/schedule/bills/template');
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-bills-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded.');
    } catch (error) {
      console.error('[BulkCreateUpload] Template download error:', error);
      toast.error('Failed to download template.');
    }
  };

  const handleReadFile = async () => {
    if (!file || previewMutation.isPending) return;
    setProgress(15);
    const ticker = setInterval(() => setProgress((p) => (p < 85 ? p + 5 : p)), 200);
    try {
      const res = await previewMutation.mutateAsync({ file });
      clearInterval(ticker);
      setProgress(100);
      setPreview(res);
      setSkipInvalidAck(false);

      if (res.fatal) {
        // The file could not be read at all — stay on the upload step, where
        // the message and the template download are both in view.
        toast.error(res.fatal, { duration: 8000 });
        return;
      }
      setStep('preview');
      if (res.totalRows === 0) {
        toast.error('No data rows found in this file.');
      } else {
        toast.success(
          `Read ${res.totalRows.toLocaleString('en-IN')} row${res.totalRows !== 1 ? 's' : ''}. Nothing created yet.`
        );
      }
    } catch (e) {
      clearInterval(ticker);
      setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Could not read the file');
    }
  };

  const handleCreate = async () => {
    // The disabled prop alone isn't enough — a fast double-click fires the
    // handler twice before React re-renders the button.
    if (!file || !preview || commitMutation.isPending) return;
    const skipInvalid = preview.errorRows === 0 ? true : skipInvalidAck;
    if (!skipInvalid) return;

    setProgress(20);
    try {
      const res = await commitMutation.mutateAsync({ file, skipInvalid });
      setProgress(100);
      setResult(res);
      setStep('result');
      if (res.successCount > 0 && res.errorCount === 0) {
        toast.success(
          `Created ${res.successCount.toLocaleString('en-IN')} bill${res.successCount !== 1 ? 's' : ''}.`
        );
      } else if (res.successCount > 0) {
        toast(
          `Created ${res.successCount.toLocaleString('en-IN')} bill${res.successCount !== 1 ? 's' : ''}; ${res.errorCount} row${res.errorCount !== 1 ? 's' : ''} skipped.`,
          { icon: '⚠️', duration: 6000 }
        );
      } else {
        toast.error('No bills were created — see the report.');
      }
    } catch (e) {
      setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Creating the bills failed');
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canCreate =
    !!preview &&
    preview.validRows > 0 &&
    (preview.errorRows === 0 || skipInvalidAck);

  // Both actions required (PermissionGuard's anyAction defaults to false):
  // bulk_create opens the Excel flow, create is what the RLS INSERT policy on
  // billing_student_bills checks.
  return (
    <PermissionGuard
      module='billing.schedule'
      action={['create', 'bulk_create']}
    >
      <ContentLayout title='Upload Bills from Excel'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/schedule'>Schedule</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/schedule/bulk-create'>Bulk Create</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Upload Excel</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-start justify-between gap-4'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Upload Bills from Excel</h1>
              <p className='text-sm text-muted-foreground'>
                One row per bill. Review the file, check the validation, then create — nothing is
                written until the last step.
              </p>
            </div>
            <Button asChild variant='outline' size='sm' className='shrink-0'>
              <Link href='/billing/schedule/bulk-create'>
                <ArrowLeft className='mr-1 h-4 w-4' /> Back
              </Link>
            </Button>
          </div>

          {/* Step indicator */}
          <div className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
            {STEPS.map((s, i) => (
              <span key={s.key} className='flex items-center gap-1'>
                {i > 0 && <ChevronRight className='h-3 w-3' />}
                <Dot active={step === s.key} done={i < stepIndex}>
                  {s.label}
                </Dot>
              </span>
            ))}
          </div>

          <Card>
            <CardContent className='p-6'>
              {/* ---- Step 1: Upload ---------------------------------- */}
              {step === 'upload' && (
                <div className='space-y-4'>
                  <Alert>
                    <FileSpreadsheet className='h-4 w-4' />
                    <AlertDescription className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                      <span className='text-sm'>
                        Need the template? Its Billing Category dropdown lists only active
                        categories, and Academic Year follows the Institution you pick.
                      </span>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={handleDownloadTemplate}
                        className='shrink-0'
                      >
                        <Download className='mr-2 h-4 w-4' />
                        Download Template
                      </Button>
                    </AlertDescription>
                  </Alert>

                  {preview?.fatal && (
                    <Alert variant='destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <AlertDescription className='text-sm'>{preview.fatal}</AlertDescription>
                    </Alert>
                  )}

                  <div
                    className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-muted-foreground/25'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      pickFile(e.dataTransfer.files[0] ?? null);
                    }}
                  >
                    <Upload className='mx-auto h-10 w-10 text-muted-foreground' />
                    <p className='mt-3 text-sm'>
                      {file ? (
                        <span className='font-medium text-violet-700 dark:text-violet-300'>
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      ) : (
                        <>Drag &amp; drop your filled template here, or click to browse</>
                      )}
                    </p>
                    <Input
                      type='file'
                      accept='.xlsx,.xls'
                      className='absolute inset-0 cursor-pointer opacity-0'
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  {file && (
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <FileSpreadsheet className='h-4 w-4 text-violet-600' />
                      Ready to read. No bills are created by this step.
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6'
                        onClick={() => setFile(null)}
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    </div>
                  )}

                  {previewMutation.isPending && (
                    <div className='space-y-2'>
                      <Progress value={progress} />
                      <p className='text-center text-xs text-muted-foreground'>
                        Reading the sheet and checking every row…
                      </p>
                    </div>
                  )}

                  <div className='flex justify-between'>
                    <Button asChild variant='outline'>
                      <Link href='/billing/schedule/bulk-create'>Cancel</Link>
                    </Button>
                    <Button onClick={handleReadFile} disabled={!file || previewMutation.isPending}>
                      {previewMutation.isPending ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Reading…
                        </>
                      ) : (
                        <>
                          Read file <ChevronRight className='ml-1 h-4 w-4' />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- Step 2: Preview -------------------------------- */}
              {step === 'preview' && preview && (
                <div className='space-y-4'>
                  <BulkCreatePreviewTable result={preview} />
                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('upload')}>
                      <ArrowLeft className='mr-1 h-4 w-4' /> Choose another file
                    </Button>
                    <Button onClick={() => setStep('validate')}>
                      Check validation <ChevronRight className='ml-1 h-4 w-4' />
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- Step 3: Validate ------------------------------- */}
              {step === 'validate' && preview && (
                <div className='space-y-4'>
                  <BulkCreateValidationPanel result={preview} />
                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('preview')}>
                      <ArrowLeft className='mr-1 h-4 w-4' /> Back to preview
                    </Button>
                    <Button onClick={() => setStep('confirm')} disabled={preview.validRows === 0}>
                      {preview.validRows === 0
                        ? 'Nothing to create'
                        : 'Continue to create'}
                      {preview.validRows > 0 && <ChevronRight className='ml-1 h-4 w-4' />}
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- Step 4: Confirm & create ----------------------- */}
              {step === 'confirm' && preview && (
                <div className='space-y-4'>
                  <Card className='border-violet-200 dark:border-violet-900'>
                    <CardHeader className='pb-3'>
                      <CardTitle className='flex items-center gap-2 text-base'>
                        <IndianRupee className='h-4 w-4 text-violet-600' />
                        Confirm bill creation
                      </CardTitle>
                      <CardDescription className='text-xs'>
                        This is the first step that writes to the database.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                        <Summary label='Bills to create' value={preview.validRows.toLocaleString('en-IN')} />
                        <Summary label='Learners' value={preview.learnerCount.toLocaleString('en-IN')} />
                        <Summary
                          label='Total value'
                          value={`₹${preview.totalAmount.toLocaleString('en-IN')}`}
                        />
                        <Summary
                          label='Rows skipped'
                          value={preview.errorRows.toLocaleString('en-IN')}
                          tone={preview.errorRows > 0 ? 'destructive' : 'neutral'}
                        />
                      </div>

                      {preview.errorRows > 0 && (
                        <Alert variant='destructive'>
                          <AlertCircle className='h-4 w-4' />
                          <AlertDescription className='space-y-3'>
                            <p className='text-sm'>
                              {preview.errorRows.toLocaleString('en-IN')} row
                              {preview.errorRows !== 1 ? 's' : ''} cannot be billed and{' '}
                              {preview.errorRows !== 1 ? 'are' : 'is'} not included in the{' '}
                              {preview.validRows.toLocaleString('en-IN')} above. You can go back and
                              fix the file instead — re-uploading a corrected sheet creates nothing
                              twice, because the rows that failed were never written.
                            </p>
                            <label className='flex cursor-pointer items-start gap-2 text-sm font-medium'>
                              <Checkbox
                                checked={skipInvalidAck}
                                onCheckedChange={(c) => setSkipInvalidAck(c === true)}
                                className='mt-0.5'
                              />
                              <span>
                                Skip {preview.errorRows.toLocaleString('en-IN')} invalid row
                                {preview.errorRows !== 1 ? 's' : ''} and create the{' '}
                                {preview.validRows.toLocaleString('en-IN')} valid one
                                {preview.validRows !== 1 ? 's' : ''}.
                              </span>
                            </label>
                          </AlertDescription>
                        </Alert>
                      )}

                      {commitMutation.isPending && (
                        <div className='space-y-2'>
                          <Progress value={progress} />
                          <p className='text-center text-xs text-muted-foreground'>
                            Creating bills — please don&apos;t close this tab.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className='flex justify-between'>
                    <Button
                      variant='outline'
                      onClick={() => setStep('validate')}
                      disabled={commitMutation.isPending}
                    >
                      <ArrowLeft className='mr-1 h-4 w-4' /> Back to validation
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={!canCreate || commitMutation.isPending}
                      className='bg-violet-600 hover:bg-violet-700'
                    >
                      {commitMutation.isPending ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Creating{' '}
                          {preview.validRows.toLocaleString('en-IN')}…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className='mr-2 h-4 w-4' />
                          Create {preview.validRows.toLocaleString('en-IN')} bill
                          {preview.validRows !== 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- Step 5: Result -------------------------------- */}
              {step === 'result' && result && (
                <BulkCreateResult result={result} onAnother={reset} />
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function Dot({
  active,
  done,
  children
}: {
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded px-2 py-1 ${
        active
          ? 'bg-violet-100 font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
          : done
            ? 'text-violet-700 dark:text-violet-300'
            : 'text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

function Summary({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'destructive';
}) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border bg-muted/30'
      }`}
    >
      <div className='text-[10px] uppercase tracking-wide opacity-70'>{label}</div>
      <div className='text-lg font-semibold tabular-nums'>{value}</div>
    </div>
  );
}
