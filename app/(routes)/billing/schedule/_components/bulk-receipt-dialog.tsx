'use client';

import { useEffect, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  ReceiptIndianRupee,
  ChevronRight,
  Loader2,
  Filter,
  RotateCcw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  RadioGroup,
  RadioGroupItem
} from '@/components/ui/radio-group';
import toast from 'react-hot-toast';
import {
  useBulkReceiptImport,
  useBulkReceiptPreview
} from '@/hooks/billing/use-bulk-receipt-import';
import type {
  BulkReceiptImportResult,
  BulkReceiptCreated,
  BulkReceiptPreviewResult,
  BulkReceiptPreviewGroup
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { BillingCategory } from '@/types/billing';

// Filter keys owned by the dialog (override scheduleFilters passthrough).
// The six hierarchy levels cascade (Institution → Section); item_category_id
// and academic_year_id sit alongside them as independent scope filters that
// target the BILL's own columns rather than the learner's. Anything not
// listed here (date range, status) still flows from scheduleFilters
// untouched.
//
// academic_year_id must be listed here, not left as passthrough: otherwise
// the schedule page's year always wins and clearing it in the dialog has no
// effect on the downloaded file.
interface HierarchyFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  item_category_id?: string;
  academic_year_id?: string;
}

interface HierarchyOption {
  id: string;
  name: string;
}

interface BulkReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Schedule-page filters used to pre-fill the template. */
  scheduleFilters: Record<string, string | undefined>;
}

type Step = 'meta' | 'download' | 'upload' | 'preview' | 'result';

export function BulkReceiptDialog({
  open,
  onOpenChange,
  scheduleFilters
}: BulkReceiptDialogProps) {
  const [step, setStep] = useState<Step>('meta');
  const [meta, setMeta] = useState({
    payment_mode: 'cash' as 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque' | 'combined',
    payment_paid_date: new Date().toISOString().split('T')[0],
    payer_mode: 'student' as 'student' | 'fixed',
    payer_name_fixed: '',
    payer_contact: '',
    payment_reference_number: '',
    payment_remarks: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateBillsCount, setTemplateBillsCount] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkReceiptImportResult | null>(null);

  // Dialog-local hierarchy filter — initialized from scheduleFilters but
  // independently editable. The API merges these onto the schedule page's
  // non-hierarchy filters (status, date range, category, academic year).
  const initialHierarchy = (): HierarchyFilters => ({
    institution_id: scheduleFilters.institution_id,
    degree_id: scheduleFilters.degree_id,
    department_id: scheduleFilters.department_id,
    program_id: scheduleFilters.program_id,
    semester_id: scheduleFilters.semester_id,
    section_id: scheduleFilters.section_id,
    item_category_id: scheduleFilters.item_category_id,
    academic_year_id: scheduleFilters.academic_year_id
  });
  const [hierarchy, setHierarchy] = useState<HierarchyFilters>(initialHierarchy);

  // Live preview of how many bills the current filter set will produce.
  // Refetched on every filter change (debounced) while Step 2 is active.
  // The 5000-row cap from getOutstandingBillsForBulk is NOT applied here,
  // so the count tells the true scope of the filter — the UI shows a
  // truncation warning when count > 5000.
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Preview (dry-run) result from the upload — populated when the admin
  // clicks "Validate file" on Step 3. Acts as gate to Step 4 confirmation.
  const [previewResult, setPreviewResult] =
    useState<BulkReceiptPreviewResult | null>(null);

  const previewMutation = useBulkReceiptPreview();
  const importMutation = useBulkReceiptImport();

  const reset = () => {
    setStep('meta');
    setFile(null);
    setProgress(0);
    setResult(null);
    setTemplateBillsCount(null);
    setHierarchy(initialHierarchy());
    setPreviewCount(null);
    setPreviewError(null);
    setPreviewResult(null);
  };

  // Build the merged filter query string used by BOTH the count endpoint
  // and the download endpoint, so the live preview never drifts from the
  // file the user will actually receive.
  const buildFilterQueryString = (
    includeDefaults: boolean = false
  ): string => {
    const qs = new URLSearchParams();
    const HIERARCHY_KEYS = new Set<keyof HierarchyFilters>([
      'institution_id',
      'degree_id',
      'department_id',
      'program_id',
      'semester_id',
      'section_id',
      'item_category_id',
      'academic_year_id'
    ]);
    Object.entries(scheduleFilters).forEach(([k, v]) => {
      if (v && !HIERARCHY_KEYS.has(k as keyof HierarchyFilters)) {
        qs.set(k, v);
      }
    });
    Object.entries(hierarchy).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    // Only the download endpoint cares about per-row template defaults.
    // The count endpoint ignores them — passing them costs nothing but
    // keeps the URLs cleanly distinct.
    if (includeDefaults) {
      qs.set('default_payment_mode', meta.payment_mode);
      qs.set('default_payment_paid_date', meta.payment_paid_date);
      qs.set('default_payer_mode', meta.payer_mode);
      if (meta.payer_name_fixed)
        qs.set('default_payer_name_fixed', meta.payer_name_fixed);
      if (meta.payer_contact)
        qs.set('default_payer_contact', meta.payer_contact);
      if (meta.payment_reference_number)
        qs.set(
          'default_payment_reference_number',
          meta.payment_reference_number
        );
      if (meta.payment_remarks)
        qs.set('default_payment_remarks', meta.payment_remarks);
    }
    return qs.toString();
  };

  // Debounced live preview: when the user is on Step 2 and changes any
  // hierarchy filter, fetch the count from the lightweight count
  // endpoint after a 300ms quiet period. The race-guard via `cancelled`
  // ensures rapid cascading clears (changing institution wipes 5
  // dependent filters in one tick) only commit the final result.
  useEffect(() => {
    if (!open || step !== 'download') return;

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timer = setTimeout(async () => {
      try {
        const qs = buildFilterQueryString();
        // 30s aligns with the server's `maxDuration` for the count
        // endpoint. The previous 15s was tighter than the server's
        // own ceiling — if the query was slow we'd get a confusing
        // client-side abort instead of the real server response.
        const res = await fetch(
          `/api/billing/receipts/bulk-template/count?${qs}`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Count request failed (${res.status})`);
        }
        const data = (await res.json()) as { count: number };
        if (!cancelled) {
          setPreviewCount(data.count);
          setPreviewLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // Translate the cryptic AbortSignal "signal timed out" into a
          // message that hints at the actual situation. Other errors
          // pass through verbatim because they carry server-side detail.
          let msg = err instanceof Error ? err.message : 'Count failed';
          if (
            msg === 'signal timed out' ||
            (err instanceof DOMException && err.name === 'TimeoutError')
          ) {
            msg =
              'Counting took longer than 30 seconds. Try narrowing the hierarchy (pick an institution or department) so the query has fewer rows to scan.';
          }
          setPreviewError(msg);
          setPreviewCount(null);
          setPreviewLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    step,
    hierarchy.institution_id,
    hierarchy.degree_id,
    hierarchy.department_id,
    hierarchy.program_id,
    hierarchy.semester_id,
    hierarchy.section_id,
    hierarchy.item_category_id,
    hierarchy.academic_year_id
  ]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // -- Step transitions ----------------------------------------------------

  const goToDownload = () => {
    if (meta.payer_mode === 'fixed' && !meta.payer_name_fixed.trim()) {
      toast.error('Enter a payer name or switch to "Use student name".');
      return;
    }
    setStep('download');
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      // Include Step 1 defaults so the workbook ships with every row's
      // per-row payment columns pre-filled (admin overrides what doesn't fit).
      const qs = buildFilterQueryString(true);
      const res = await fetch(
        `/api/billing/receipts/bulk-template?${qs}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Template download failed');
      }
      const billsCount = res.headers.get('X-Bills-Count');
      if (billsCount) setTemplateBillsCount(parseInt(billsCount, 10));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulk-receipts-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        billsCount && parseInt(billsCount, 10) > 0
          ? `Template downloaded — ${billsCount} outstanding bill(s) pre-filled.`
          : 'Template downloaded.'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Download failed';
      toast.error(msg);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // -- File handling -------------------------------------------------------

  const handleFileChange = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      toast.error('Invalid file type — please select .xlsx or .xls');
      return;
    }
    setFile(selected);
    setResult(null);
  };

  // Step 3 → Step 4: parse + validate the uploaded file via dry_run. The
  // server returns the planned grouping and any per-row errors without
  // touching the database. Only on the admin's Confirm does the commit
  // mutation fire.
  //
  // Progress updates fire in steps so the user isn't staring at a frozen
  // bar during the DB roundtrips. The actual server-side work breakdown
  // is also returned in the X-Validation-Timings response header — open
  // DevTools Network tab to inspect if validation ever feels slow again.
  const handleValidate = async () => {
    if (!file) return;
    setProgress(10);
    // Tick the progress bar so the user sees "something is happening"
    // even on a slow connection. The actual API call is one POST; these
    // increments are purely visual feedback.
    const fakeTicker = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 5 : p));
    }, 250);
    try {
      const preview = await previewMutation.mutateAsync({ file });
      clearInterval(fakeTicker);
      setProgress(100);
      setPreviewResult(preview);
      setStep('preview');

      if (preview.validRows === 0 && preview.errorCount > 0) {
        toast.error(
          `Validation found ${preview.errorCount} error${preview.errorCount !== 1 ? 's' : ''} and no valid rows. Fix the file and re-upload.`
        );
      } else if (preview.errorCount > 0) {
        toast(
          `${preview.validRows} row${preview.validRows !== 1 ? 's' : ''} valid, ${preview.errorCount} error${preview.errorCount !== 1 ? 's' : ''}. Review before confirming.`,
          {
            icon: <AlertCircle className='h-4 w-4 text-orange-500' />,
            duration: 5000
          }
        );
      } else {
        toast.success(
          `${preview.validRows} row${preview.validRows !== 1 ? 's' : ''} validated — ${preview.totalReceipts} receipt${preview.totalReceipts !== 1 ? 's' : ''} ready to create.`,
          {
            icon: <CheckCircle2 className='h-4 w-4' />,
            duration: 4000
          }
        );
      }
    } catch (e) {
      clearInterval(fakeTicker);
      setProgress(0);
      const msg = e instanceof Error ? e.message : 'Validation failed';
      toast.error(msg);
    }
  };

  // Step 4 → Step 5: commit. We re-POST the same file to the commit
  // endpoint so the server can re-validate (defensive — bill statuses
  // can change between preview and commit) and write the receipts.
  const handleConfirmSubmit = async () => {
    if (!file) return;
    setProgress(20);
    try {
      const data = await importMutation.mutateAsync({ file });
      setProgress(100);
      setResult(data);
      setStep('result');

      if (data.success) {
        toast.success(
          `Generated ${data.successCount} receipt${data.successCount !== 1 ? 's' : ''} for ${data.totalStudents} student${data.totalStudents !== 1 ? 's' : ''}.`,
          { icon: <CheckCircle2 className='h-4 w-4' />, duration: 5000 }
        );
      } else if (data.successCount > 0) {
        toast(
          `Created ${data.successCount} receipts — ${data.errorCount} row(s) had errors. See the report below.`,
          {
            icon: <AlertCircle className='h-4 w-4 text-orange-500' />,
            duration: 6000
          }
        );
      } else {
        toast.error(
          `Import failed — ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}. No receipts created.`
        );
      }
    } catch (e) {
      setProgress(0);
      const msg = e instanceof Error ? e.message : 'Upload failed';
      toast.error(msg);
    }
  };

  // -- Render --------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ReceiptIndianRupee className='h-5 w-5 text-emerald-600' />
            Bulk Generate Receipts
          </DialogTitle>
          <DialogDescription>
            Generate payment receipts in bulk for outstanding student bills.
            One receipt is created per student covering all their filled rows.
            Results are limited to the institutions you have access to.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className='flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap'>
          <StepDot active={step === 'meta'} done={step !== 'meta'}>
            1. Defaults
          </StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot
            active={step === 'download'}
            done={
              step === 'upload' || step === 'preview' || step === 'result'
            }
          >
            2. Download
          </StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot
            active={step === 'upload'}
            done={step === 'preview' || step === 'result'}
          >
            3. Upload
          </StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot active={step === 'preview'} done={step === 'result'}>
            4. Preview & Confirm
          </StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot active={step === 'result'} done={false}>
            5. Result
          </StepDot>
        </div>

        {/* STEP 1 — Payment metadata */}
        {step === 'meta' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Payment Detail Defaults (pre-fill the template)
                </CardTitle>
                <CardDescription>
                  These values pre-fill the per-row Payment Mode / Paid Date /
                  Payer columns in the downloaded Excel. You can override any
                  row that doesn&apos;t match — rows with different (date +
                  mode) for the same student will become separate receipts.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div>
                    <Label>Payment Mode *</Label>
                    <Select
                      value={meta.payment_mode}
                      onValueChange={(v) =>
                        setMeta((m) => ({ ...m, payment_mode: v as typeof m.payment_mode }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='cash'>Cash</SelectItem>
                        <SelectItem value='online'>Online</SelectItem>
                        <SelectItem value='bank_transfer'>Bank Transfer</SelectItem>
                        <SelectItem value='dd'>Demand Draft</SelectItem>
                        <SelectItem value='cheque'>Cheque</SelectItem>
                        <SelectItem value='combined'>Combined Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Paid Date *</Label>
                    <Input
                      type='date'
                      value={meta.payment_paid_date}
                      onChange={(e) =>
                        setMeta((m) => ({ ...m, payment_paid_date: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Payer Name *</Label>
                  <RadioGroup
                    value={meta.payer_mode}
                    onValueChange={(v) =>
                      setMeta((m) => ({ ...m, payer_mode: v as 'student' | 'fixed' }))
                    }
                    className='mt-2'
                  >
                    <div className='flex items-center space-x-2'>
                      <RadioGroupItem value='student' id='payer-student' />
                      <Label htmlFor='payer-student' className='cursor-pointer text-sm'>
                        Use each student&apos;s name as the payer (Recommended)
                      </Label>
                    </div>
                    <div className='flex items-center space-x-2'>
                      <RadioGroupItem value='fixed' id='payer-fixed' />
                      <Label htmlFor='payer-fixed' className='cursor-pointer text-sm'>
                        Use one payer name for the entire batch
                      </Label>
                    </div>
                  </RadioGroup>
                  {meta.payer_mode === 'fixed' && (
                    <Input
                      className='mt-2'
                      placeholder='e.g. JKKN Exit Settlement Drive 2026'
                      value={meta.payer_name_fixed}
                      onChange={(e) =>
                        setMeta((m) => ({ ...m, payer_name_fixed: e.target.value }))
                      }
                    />
                  )}
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div>
                    <Label>Payer Contact (optional)</Label>
                    <Input
                      value={meta.payer_contact}
                      onChange={(e) =>
                        setMeta((m) => ({ ...m, payer_contact: e.target.value }))
                      }
                      placeholder='Phone or email'
                    />
                  </div>
                  <div>
                    <Label>Payment Reference (optional)</Label>
                    <Input
                      value={meta.payment_reference_number}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          payment_reference_number: e.target.value
                        }))
                      }
                      placeholder='Transaction / cheque / DD #'
                    />
                  </div>
                </div>

                <div>
                  <Label>Remarks (optional)</Label>
                  <Textarea
                    rows={2}
                    value={meta.payment_remarks}
                    onChange={(e) =>
                      setMeta((m) => ({ ...m, payment_remarks: e.target.value }))
                    }
                    placeholder='Internal note attached to every receipt in the batch.'
                  />
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button variant='outline' onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={goToDownload}>Next: Download template</Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 2 — Download template */}
        {step === 'download' && (
          <div className='space-y-4'>
            <Alert>
              <FileSpreadsheet className='h-4 w-4' />
              <AlertDescription className='space-y-1'>
                <p className='text-sm font-medium'>
                  Narrow the template scope below. Defaults come from the
                  schedule page&apos;s active filters.
                </p>
                <p className='text-xs text-muted-foreground'>
                  Only Unpaid and Partially Paid bills are included. Paid /
                  cancelled / refunded bills are excluded automatically.
                </p>
              </AlertDescription>
            </Alert>

            {/* Hierarchy filter panel — cascading Institution → Section. */}
            <HierarchyFilterPanel
              value={hierarchy}
              onChange={setHierarchy}
              hasScheduleDefaults={Object.entries(scheduleFilters).some(
                ([k, v]) =>
                  v &&
                  [
                    'institution_id',
                    'degree_id',
                    'department_id',
                    'program_id',
                    'semester_id',
                    'section_id',
                    'item_category_id',
                    'academic_year_id'
                  ].includes(k)
              )}
              onResetToSchedule={() => setHierarchy(initialHierarchy())}
              previewCount={previewCount}
              previewLoading={previewLoading}
              previewError={previewError}
            />

            <Card>
              <CardContent className='pt-6 space-y-3'>
                <Button
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className='w-full'
                >
                  {downloadingTemplate ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Building template…
                    </>
                  ) : (
                    <>
                      <Download className='mr-2 h-4 w-4' />
                      Download Pre-filled Template
                    </>
                  )}
                </Button>

                {templateBillsCount !== null && (
                  <div className='text-sm'>
                    {templateBillsCount === 0 ? (
                      <span className='text-orange-600'>
                        No outstanding bills match the current filters. Adjust
                        the schedule filters and try again.
                      </span>
                    ) : (
                      <span className='text-emerald-700'>
                        ✓ {templateBillsCount} outstanding bill(s) pre-filled.
                        Open the file, fill the &ldquo;Paid Amount&rdquo; column, and continue.
                      </span>
                    )}
                  </div>
                )}

                <div className='text-xs text-muted-foreground space-y-1 pt-2'>
                  <p><strong>Filling rules:</strong></p>
                  <ul className='list-disc ml-4 space-y-0.5'>
                    <li>Fill the <strong>Paid Amount</strong> column for each bill you want to receipt.</li>
                    <li>Leave a row blank to skip it.</li>
                    <li>Do not edit other columns — they&apos;re locked for a reason.</li>
                    <li>Do not reorder or delete rows.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button variant='outline' onClick={() => setStep('meta')}>
                Back
              </Button>
              <Button onClick={() => setStep('upload')}>
                Next: Upload filled file
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 3 — Upload filled file (will validate, NOT commit yet) */}
        {step === 'upload' && (
          <div className='space-y-4'>
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-muted-foreground/25'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFileChange(e.dataTransfer.files[0] ?? null);
              }}
            >
              <Upload className='mx-auto h-10 w-10 text-muted-foreground' />
              <p className='mt-3 text-sm'>
                {file ? (
                  <span className='font-medium text-emerald-700'>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                ) : (
                  <>Drag & drop your filled template here, or click to browse</>
                )}
              </p>
              <Input
                type='file'
                accept='.xlsx,.xls'
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className='absolute inset-0 cursor-pointer opacity-0'
              />
            </div>

            {previewMutation.isPending && (
              <div className='space-y-2'>
                <Progress value={progress} />
                <p className='text-xs text-center text-muted-foreground'>
                  {progress < 30
                    ? 'Uploading file…'
                    : progress < 60
                      ? 'Parsing rows & validating fields…'
                      : progress < 85
                        ? 'Cross-checking bills against the database…'
                        : 'Building preview…'}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant='outline' onClick={() => setStep('download')}>
                Back
              </Button>
              <Button
                onClick={handleValidate}
                disabled={!file || previewMutation.isPending}
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Validating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Validate & Preview
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 4 — Preview + Confirm */}
        {step === 'preview' && previewResult && (
          <PreviewPanel
            result={previewResult}
            isSubmitting={importMutation.isPending}
            onBack={() => setStep('upload')}
            onConfirm={handleConfirmSubmit}
          />
        )}

        {/* STEP 5 — Result */}
        {step === 'result' && result && (
          <ResultPanel
            result={result}
            onClose={() => handleOpenChange(false)}
            onAnother={reset}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

/**
 * Cascading hierarchy filter for the bulk-receipt template.
 *
 * Six levels: Institution → Degree → Department → Programme → Semester →
 * Section. Each child is disabled until its parent is selected, and
 * changing a parent clears every dependent below it (matches the cascade
 * in advanced-billing-schedule-filters.tsx so the API never sees an
 * orphaned child id).
 */
function HierarchyFilterPanel({
  value,
  onChange,
  hasScheduleDefaults,
  onResetToSchedule,
  previewCount,
  previewLoading,
  previewError
}: {
  value: HierarchyFilters;
  onChange: (next: HierarchyFilters) => void;
  hasScheduleDefaults: boolean;
  onResetToSchedule: () => void;
  previewCount: number | null;
  previewLoading: boolean;
  previewError: string | null;
}) {
  const [options, setOptions] = useState<{
    institutions: HierarchyOption[];
    degrees: HierarchyOption[];
    departments: HierarchyOption[];
    programs: HierarchyOption[];
    semesters: HierarchyOption[];
    sections: HierarchyOption[];
  }>({
    institutions: [],
    degrees: [],
    departments: [],
    programs: [],
    semesters: [],
    sections: []
  });
  const [loading, setLoading] = useState({
    institutions: false,
    degrees: false,
    departments: false,
    programs: false,
    semesters: false,
    sections: false
  });
  // Billing categories are independent of the cascade — fetched once and
  // never invalidated by hierarchy changes, so keep them in their own slot.
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  // Academic years hang off the institution only (academic_years.institution_id),
  // not off the degree→section cascade, so they get their own slot too.
  const [academicYears, setAcademicYears] = useState<HierarchyOption[]>([]);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  // Normalize service responses (which use *_name fields) into {id, name}.
  const normalize = (rows: any[]): HierarchyOption[] =>
    rows.map((r) => ({
      id: r.id,
      name:
        r.name ??
        r.degree_name ??
        r.department_name ??
        r.program_name ??
        r.semester_name ??
        r.section_name ??
        'Unknown'
    }));

  // Load institutions once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading((l) => ({ ...l, institutions: true }));
    OrganizationService.getInstitutionNames(true, undefined, 'all')
      .then((rows) => {
        if (!cancelled) {
          setOptions((o) => ({ ...o, institutions: normalize(rows) }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, institutions: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load active billing categories once on mount. RLS-filtered via the
  // service; no cascade dependency so this never re-runs.
  useEffect(() => {
    let cancelled = false;
    setLoadingCategories(true);
    BillingCategoryService.getActiveBillingCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Academic years for the selected institution. Keyed on institution only —
  // it is NOT part of the degree→section chain, so changing a lower level
  // must not refetch or clear it.
  useEffect(() => {
    let cancelled = false;
    if (!value.institution_id) {
      setAcademicYears([]);
      return;
    }
    setLoadingAcademicYears(true);
    AcademicYearService.getAcademicYearsByInstitution(value.institution_id)
      .then((rows) => {
        if (!cancelled) {
          setAcademicYears(
            rows.map((r: any) => ({ id: r.id, name: r.academic_year_name }))
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAcademicYears(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.institution_id]);

  // Cascade loaders. Each fires when its parent id changes, clears its
  // own options when the parent is cleared.
  useEffect(() => {
    let cancelled = false;
    if (!value.institution_id) {
      setOptions((o) => ({ ...o, degrees: [] }));
      return;
    }
    setLoading((l) => ({ ...l, degrees: true }));
    DegreeService.getDegreesByInstitution(value.institution_id)
      .then((rows) => {
        if (!cancelled) setOptions((o) => ({ ...o, degrees: normalize(rows) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, degrees: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [value.institution_id]);

  useEffect(() => {
    let cancelled = false;
    if (!value.degree_id) {
      setOptions((o) => ({ ...o, departments: [] }));
      return;
    }
    setLoading((l) => ({ ...l, departments: true }));
    DepartmentService.getDepartmentsByDegree(value.degree_id)
      .then((rows) => {
        if (!cancelled)
          setOptions((o) => ({ ...o, departments: normalize(rows) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, departments: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [value.degree_id]);

  useEffect(() => {
    let cancelled = false;
    if (!value.department_id) {
      setOptions((o) => ({ ...o, programs: [] }));
      return;
    }
    setLoading((l) => ({ ...l, programs: true }));
    ProgramService.getProgramsByDepartment(value.department_id)
      .then((rows) => {
        if (!cancelled)
          setOptions((o) => ({ ...o, programs: normalize(rows) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, programs: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [value.department_id]);

  useEffect(() => {
    let cancelled = false;
    if (!value.program_id) {
      setOptions((o) => ({ ...o, semesters: [] }));
      return;
    }
    setLoading((l) => ({ ...l, semesters: true }));
    SemesterService.getSemestersByProgram(value.program_id)
      .then((rows) => {
        if (!cancelled)
          setOptions((o) => ({ ...o, semesters: normalize(rows) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, semesters: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [value.program_id]);

  useEffect(() => {
    let cancelled = false;
    if (!value.semester_id) {
      setOptions((o) => ({ ...o, sections: [] }));
      return;
    }
    setLoading((l) => ({ ...l, sections: true }));
    SectionService.getSectionsBySemester(value.semester_id)
      .then((rows) => {
        if (!cancelled)
          setOptions((o) => ({ ...o, sections: normalize(rows) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading((l) => ({ ...l, sections: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [value.semester_id]);

  // Cascade clear: changing a parent clears every dependent below it so
  // the API never receives an orphaned child id.
  const CLEAR_MAP: Record<keyof HierarchyFilters, (keyof HierarchyFilters)[]> =
    {
      // academic_year_id is cleared by an institution change because
      // academic_years rows are institution-scoped: "2025-2026" exists as a
      // separate row per institution, so a year id from institution A matches
      // zero bills under institution B. Mirrors CASCADE_CLEAR_MAP in
      // advanced-billing-schedule-filters.tsx.
      institution_id: [
        'degree_id',
        'department_id',
        'program_id',
        'semester_id',
        'section_id',
        'academic_year_id'
      ],
      degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
      department_id: ['program_id', 'semester_id', 'section_id'],
      program_id: ['semester_id', 'section_id'],
      semester_id: ['section_id'],
      section_id: [],
      // Category is orthogonal to the hierarchy: changing it clears nothing,
      // and changing any hierarchy level shouldn't clear the category either.
      item_category_id: [],
      academic_year_id: []
    };

  const handleChange = (
    key: keyof HierarchyFilters,
    next: string | undefined
  ) => {
    const updated: HierarchyFilters = { ...value, [key]: next };
    CLEAR_MAP[key].forEach((k) => {
      updated[k] = undefined;
    });
    onChange(updated);
  };

  const handleClearAll = () => {
    onChange({});
  };

  const activeCount = Object.values(value).filter(Boolean).length;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2 flex-wrap'>
          <CardTitle className='text-sm flex items-center gap-2'>
            <Filter className='h-4 w-4 text-emerald-600' />
            Filter scope
            {activeCount > 0 && (
              <Badge variant='secondary' className='ml-1'>
                {activeCount} active
              </Badge>
            )}
          </CardTitle>
          <div className='flex items-center gap-2'>
            {hasScheduleDefaults && (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={onResetToSchedule}
                className='h-7 text-xs'
                title='Restore filters to match the schedule page'
              >
                <RotateCcw className='h-3 w-3 mr-1' />
                Reset to schedule
              </Button>
            )}
            {activeCount > 0 && (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={handleClearAll}
                className='h-7 text-xs'
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
        <CardDescription className='text-xs'>
          Pick a path through the hierarchy. Leave a level blank to include
          everything below it.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {/* Bill-level filters. These two describe the BILL (what it is for,
            which year it belongs to); the cascade below describes the
            LEARNER. Kept in their own row because they're orthogonal to the
            hierarchy — any hierarchy slice ✕ any category ✕ any year. */}
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <HierarchySelect
            label='Billing category'
            value={value.item_category_id}
            options={categories.map((c) => ({
              id: c.id,
              name: c.category_name
            }))}
            loading={loadingCategories}
            onChange={(v) => handleChange('item_category_id', v)}
            placeholder='All categories'
          />
          <HierarchySelect
            label='Academic year (of the bill)'
            value={value.academic_year_id}
            // 'unspecified' mirrors the schedule page's magic value for bills
            // with no academic year set (23 of ~6,600 outstanding bills).
            options={[
              ...academicYears,
              { id: 'unspecified', name: 'Unspecified (no year on bill)' }
            ]}
            loading={loadingAcademicYears}
            onChange={(v) => handleChange('academic_year_id', v)}
            placeholder={
              value.institution_id
                ? 'All academic years'
                : 'Select institution first'
            }
            // Academic year rows are per-institution, so a year can only be
            // resolved unambiguously once an institution is chosen.
            disabled={!value.institution_id}
          />
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <HierarchySelect
            label='Institution'
            value={value.institution_id}
            options={options.institutions}
            loading={loading.institutions}
            onChange={(v) => handleChange('institution_id', v)}
            placeholder='All institutions'
          />
          <HierarchySelect
            label='Degree'
            value={value.degree_id}
            options={options.degrees}
            loading={loading.degrees}
            onChange={(v) => handleChange('degree_id', v)}
            placeholder={
              value.institution_id ? 'All degrees' : 'Select institution first'
            }
            disabled={!value.institution_id}
          />
          <HierarchySelect
            label='Department'
            value={value.department_id}
            options={options.departments}
            loading={loading.departments}
            onChange={(v) => handleChange('department_id', v)}
            placeholder={
              value.degree_id ? 'All departments' : 'Select degree first'
            }
            disabled={!value.degree_id}
          />
          <HierarchySelect
            label='Programme'
            value={value.program_id}
            options={options.programs}
            loading={loading.programs}
            onChange={(v) => handleChange('program_id', v)}
            placeholder={
              value.department_id
                ? 'All programmes'
                : 'Select department first'
            }
            disabled={!value.department_id}
          />
          <HierarchySelect
            label='Semester'
            value={value.semester_id}
            options={options.semesters}
            loading={loading.semesters}
            onChange={(v) => handleChange('semester_id', v)}
            placeholder={
              value.program_id ? 'All semesters' : 'Select programme first'
            }
            disabled={!value.program_id}
          />
          <HierarchySelect
            label='Section'
            value={value.section_id}
            options={options.sections}
            loading={loading.sections}
            onChange={(v) => handleChange('section_id', v)}
            placeholder={
              value.semester_id ? 'All sections' : 'Select semester first'
            }
            disabled={!value.semester_id}
          />
        </div>

        {/* Live preview footer — shows how many outstanding bills the
            current filter set will produce, refetched on every change. */}
        <BillCountPreview
          count={previewCount}
          loading={previewLoading}
          error={previewError}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Renders the live "X matching bills" indicator with the right state
 * (loading / error / empty / capped / count). Kept separate so the
 * different states stay readable.
 */
function BillCountPreview({
  count,
  loading,
  error
}: {
  count: number | null;
  loading: boolean;
  error: string | null;
}) {
  // Same cap that BillingReceiptService.getOutstandingBillsForBulk
  // enforces — keep these two numbers in sync.
  const DOWNLOAD_CAP = 5000;

  if (loading && count === null) {
    return (
      <div className='flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
        <Loader2 className='h-3.5 w-3.5 animate-spin' />
        <span>Counting matching bills…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive' className='py-2'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription className='text-xs'>
          Could not count bills: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (count === null) return null;

  if (count === 0) {
    return (
      <div className='flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800'>
        <AlertCircle className='h-3.5 w-3.5' />
        <span>
          No outstanding bills match this filter. Loosen the hierarchy to
          include more rows, or there&apos;s nothing to receipt for this
          scope.
        </span>
      </div>
    );
  }

  const capped = count > DOWNLOAD_CAP;
  const formatted = count.toLocaleString('en-IN');

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
        capped
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900'
      }`}
    >
      <FileSpreadsheet
        className={`h-3.5 w-3.5 mt-0.5 ${
          capped ? 'text-amber-600' : 'text-emerald-600'
        }`}
      />
      <div className='flex-1 space-y-0.5'>
        <p className='font-medium'>
          {formatted} outstanding bill{count !== 1 ? 's' : ''} match
          {count === 1 ? 'es' : ''} this filter
          {loading && (
            <Loader2 className='inline-block h-3 w-3 animate-spin ml-1.5 text-muted-foreground' />
          )}
        </p>
        {capped && (
          <p>
            ⚠ Template caps at {DOWNLOAD_CAP.toLocaleString('en-IN')} rows
            per file. Narrow the filter (e.g. pick a department or
            semester) to bring all bills into one batch.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Lightweight wrapper around the shadcn Select so the dialog body stays
 * tidy. Provides an explicit "All …" / placeholder option that maps to
 * `undefined` (clearing the filter on the parent).
 */
function HierarchySelect({
  label,
  value,
  options,
  loading,
  onChange,
  placeholder,
  disabled
}: {
  label: string;
  value: string | undefined;
  options: HierarchyOption[];
  loading: boolean;
  onChange: (next: string | undefined) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  // Sentinel used because Radix Select disallows empty-string item values.
  // We map __ALL__ back to undefined on the way out.
  const ALL = '__ALL__';
  const current = value ?? ALL;

  return (
    <div>
      <Label className='text-xs'>{label}</Label>
      <Select
        value={current}
        onValueChange={(v) => onChange(v === ALL ? undefined : v)}
        disabled={disabled || loading}
      >
        <SelectTrigger className='mt-1'>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Step 4 — Preview the validated upload, group breakdown, and any errors.
 * Renders a summary card, the (student + date + mode) groupings that will
 * become receipts, and a scrollable error list. Confirm commits, Back
 * returns to the Upload step so the admin can fix and re-upload the file.
 */
function PreviewPanel({
  result,
  isSubmitting,
  onBack,
  onConfirm
}: {
  result: BulkReceiptPreviewResult;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const fmtCurrency = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtMode: Record<string, string> = {
    cash: 'Cash',
    online: 'Online',
    bank_transfer: 'Bank Transfer',
    dd: 'Demand Draft',
    cheque: 'Cheque',
    combined: 'Combined Payment'
  };

  const canCommit = result.groups.length > 0;

  return (
    <div className='space-y-4'>
      {/* Top-line summary */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-emerald-600' />
            Validation Summary
          </CardTitle>
          <CardDescription className='text-xs'>
            Nothing has been written yet. Confirm below to create the
            receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <SummaryStat
              label='Rows parsed'
              value={result.totalRows.toLocaleString('en-IN')}
              tone='neutral'
            />
            <SummaryStat
              label='Valid rows'
              value={result.validRows.toLocaleString('en-IN')}
              tone='emerald'
            />
            <SummaryStat
              label='Errors'
              value={result.errorCount.toLocaleString('en-IN')}
              tone={result.errorCount > 0 ? 'destructive' : 'neutral'}
            />
            <SummaryStat
              label='Total collected'
              value={fmtCurrency(result.totalCollected)}
              tone='emerald'
            />
          </div>
          <div className='mt-3 text-xs text-muted-foreground'>
            On confirm:{' '}
            <strong className='text-foreground'>
              {result.totalReceipts.toLocaleString('en-IN')} receipt
              {result.totalReceipts !== 1 ? 's' : ''}
            </strong>{' '}
            will be created for{' '}
            <strong className='text-foreground'>
              {result.totalStudents.toLocaleString('en-IN')} distinct
              student{result.totalStudents !== 1 ? 's' : ''}
            </strong>
            .
          </div>
        </CardContent>
      </Card>

      {/* Errors list */}
      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>
              {result.errorCount} validation issue
              {result.errorCount !== 1 ? 's' : ''} found.
              {result.validRows > 0 &&
                ' Valid rows can still be committed — invalid rows will be skipped.'}
            </p>
            <div className='max-h-44 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((err, i) => (
                <div
                  key={i}
                  className='border-l-2 border-destructive pl-2 py-0.5'
                >
                  <strong>
                    {err.row > 0 ? `Row ${err.row}` : 'Batch'}
                  </strong>
                  {err.field ? ` — ${err.field}` : ''}: {err.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Groups preview — each row = one future billing_receipts insert */}
      {result.groups.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Receipts to create ({result.groups.length})
            </CardTitle>
            <CardDescription className='text-xs'>
              Grouped by (student, paid date, payment mode). A student paying
              the same bills on different days appears multiple times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='max-h-72 overflow-auto rounded border'>
              <table className='w-full text-sm'>
                <thead className='text-xs text-muted-foreground sticky top-0 bg-background border-b'>
                  <tr>
                    <th className='text-left py-2 px-2'>Student</th>
                    <th className='text-left'>Paid Date</th>
                    <th className='text-left'>Mode</th>
                    <th className='text-left'>Payer</th>
                    <th className='text-right'>Bills</th>
                    <th className='text-right pr-2'>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((g: BulkReceiptPreviewGroup) => (
                    <tr key={g.group_key} className='border-t'>
                      <td className='py-1.5 px-2'>
                        <div className='font-medium'>{g.student_name}</div>
                        <div className='text-xs text-muted-foreground'>
                          {g.roll_number}
                        </div>
                      </td>
                      <td className='font-mono text-xs'>
                        {g.payment_paid_date}
                      </td>
                      <td className='text-xs'>
                        {fmtMode[g.payment_mode] ?? g.payment_mode}
                      </td>
                      <td className='text-xs truncate max-w-[180px]'>
                        {g.payer_name}
                        {g.payment_reference_number && (
                          <span className='text-muted-foreground'>
                            {' '}
                            · ref {g.payment_reference_number}
                          </span>
                        )}
                      </td>
                      <td className='text-right text-xs'>{g.bill_count}</td>
                      <td className='text-right font-medium pr-2'>
                        {fmtCurrency(g.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <DialogFooter className='flex-col sm:flex-row gap-2'>
        <Button variant='outline' onClick={onBack} disabled={isSubmitting}>
          Back to upload
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!canCommit || isSubmitting}
          className='bg-emerald-600 hover:bg-emerald-700'
        >
          {isSubmitting ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Generating {result.totalReceipts} receipt
              {result.totalReceipts !== 1 ? 's' : ''}…
            </>
          ) : (
            <>
              <ReceiptIndianRupee className='mr-2 h-4 w-4' />
              Confirm &amp; Generate {result.totalReceipts} receipt
              {result.totalReceipts !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'emerald' | 'destructive';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'destructive'
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/30 text-foreground';
  return (
    <div className={`rounded border px-3 py-2 ${toneClass}`}>
      <div className='text-[10px] uppercase tracking-wide opacity-70'>
        {label}
      </div>
      <div className='text-lg font-semibold'>{value}</div>
    </div>
  );
}

function StepDot({
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
      className={`px-2 py-1 rounded ${
        active
          ? 'bg-emerald-100 text-emerald-800 font-medium'
          : done
            ? 'text-emerald-700'
            : 'text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

function ResultPanel({
  result,
  onClose,
  onAnother
}: {
  result: BulkReceiptImportResult;
  onClose: () => void;
  onAnother: () => void;
}) {
  const totalCollected = result.receipts.reduce(
    (sum, r) => sum + r.payment_amount,
    0
  );

  return (
    <div className='space-y-4'>
      {result.successCount > 0 && (
        <Alert className='border-emerald-200 bg-emerald-50'>
          <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          <AlertDescription>
            <p className='font-medium text-emerald-900'>
              Created {result.successCount} receipt
              {result.successCount !== 1 ? 's' : ''} for{' '}
              {result.totalStudents} student
              {result.totalStudents !== 1 ? 's' : ''}.
            </p>
            <p className='text-xs text-emerald-700 mt-1'>
              Total collected: ₹{totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>
              {result.errorCount} row{result.errorCount !== 1 ? 's' : ''} had errors and were skipped.
            </p>
            <div className='max-h-48 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((err, i) => (
                <div key={i} className='border-l-2 border-destructive pl-2'>
                  <strong>
                    {err.row > 0 ? `Row ${err.row}` : 'Batch'}
                  </strong>
                  {err.field ? ` — ${err.field}` : ''}: {err.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.receipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Receipts created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-64 overflow-auto'>
              <table className='w-full text-sm'>
                <thead className='text-xs text-muted-foreground sticky top-0 bg-background'>
                  <tr>
                    <th className='text-left py-1'>Receipt #</th>
                    <th className='text-left'>Student</th>
                    <th className='text-right'>Bills</th>
                    <th className='text-right'>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.receipts.map((r: BulkReceiptCreated) => (
                    <tr key={r.receipt_id} className='border-t'>
                      <td className='py-1 font-mono text-xs'>{r.receipt_number}</td>
                      <td>
                        <div className='font-medium'>{r.student_name}</div>
                        <div className='text-xs text-muted-foreground'>{r.roll_number}</div>
                      </td>
                      <td className='text-right'>{r.bill_count}</td>
                      <td className='text-right font-medium'>
                        ₹{r.payment_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <DialogFooter>
        <Button variant='outline' onClick={onAnother}>
          Run another batch
        </Button>
        <Button asChild>
          <a href='/billing/receipts'>View all receipts</a>
        </Button>
        <Button variant='secondary' onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}
