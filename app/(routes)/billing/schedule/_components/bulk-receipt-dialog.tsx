'use client';

import { useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Receipt,
  ChevronRight,
  Loader2
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
import { useBulkReceiptImport } from '@/hooks/billing/use-bulk-receipt-import';
import type {
  BulkReceiptImportResult,
  BulkReceiptCreated
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

interface BulkReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Schedule-page filters used to pre-fill the template. */
  scheduleFilters: Record<string, string | undefined>;
}

type Step = 'meta' | 'download' | 'upload' | 'result';

export function BulkReceiptDialog({
  open,
  onOpenChange,
  scheduleFilters
}: BulkReceiptDialogProps) {
  const [step, setStep] = useState<Step>('meta');
  const [meta, setMeta] = useState({
    payment_mode: 'cash' as 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque',
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

  const importMutation = useBulkReceiptImport();

  const reset = () => {
    setStep('meta');
    setFile(null);
    setProgress(0);
    setResult(null);
    setTemplateBillsCount(null);
  };

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
      const qs = new URLSearchParams();
      Object.entries(scheduleFilters).forEach(([k, v]) => {
        if (v) qs.set(k, v);
      });
      const res = await fetch(
        `/api/billing/receipts/bulk-template?${qs.toString()}`
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

  const handleUpload = async () => {
    if (!file) return;
    setProgress(20);
    try {
      const data = await importMutation.mutateAsync({
        file,
        payment_mode: meta.payment_mode,
        payment_paid_date: meta.payment_paid_date,
        payer_mode: meta.payer_mode,
        payer_name_fixed:
          meta.payer_mode === 'fixed' ? meta.payer_name_fixed : undefined,
        payer_contact: meta.payer_contact || undefined,
        payment_reference_number: meta.payment_reference_number || undefined,
        payment_remarks: meta.payment_remarks || undefined
      });
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
          { icon: <AlertCircle className='h-4 w-4 text-orange-500' />, duration: 6000 }
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
            <Receipt className='h-5 w-5 text-emerald-600' />
            Bulk Generate Receipts
            <Badge variant='outline' className='ml-2 border-emerald-600 text-emerald-700'>
              Super Admin
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Generate payment receipts in bulk for outstanding student bills.
            One receipt is created per student covering all their filled rows.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className='flex items-center gap-2 text-xs text-muted-foreground mb-2'>
          <StepDot active={step === 'meta'} done={step !== 'meta'}>1. Payment details</StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot active={step === 'download'} done={step === 'upload' || step === 'result'}>
            2. Download template
          </StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot active={step === 'upload'} done={step === 'result'}>3. Upload filled file</StepDot>
          <ChevronRight className='h-3 w-3' />
          <StepDot active={step === 'result'} done={false}>4. Result</StepDot>
        </div>

        {/* STEP 1 — Payment metadata */}
        {step === 'meta' && (
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Payment Details (applied to all receipts)</CardTitle>
                <CardDescription>
                  These values are written onto every receipt in the batch. If
                  different students paid with different methods, run separate batches.
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
                  Template will be pre-filled with bills matching your current schedule filters.
                </p>
                <p className='text-xs text-muted-foreground'>
                  Only Unpaid and Partially Paid bills are included. Paid /
                  cancelled / refunded bills are excluded automatically.
                </p>
              </AlertDescription>
            </Alert>

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

        {/* STEP 3 — Upload */}
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

            {importMutation.isPending && (
              <div className='space-y-2'>
                <Progress value={progress} />
                <p className='text-xs text-center text-muted-foreground'>
                  Processing rows and creating receipts…
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant='outline' onClick={() => setStep('download')}>
                Back
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Generating receipts…
                  </>
                ) : (
                  <>
                    <Receipt className='mr-2 h-4 w-4' />
                    Generate Receipts
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 4 — Result */}
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
            <div className='max-h-64 overflow-y-auto'>
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
