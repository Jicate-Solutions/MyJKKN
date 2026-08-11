'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, ChevronRight, Loader2, CheckCircle2, X, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { PermissionGuard } from '@/components/auth/permission-guard';
import toast from 'react-hot-toast';
import { BulkEditFilterPanel } from './_components/bulk-edit-filter-panel';
import { BulkEditPreviewTable } from './_components/bulk-edit-preview-table';
import { BulkEditResult } from './_components/bulk-edit-result';
import { useBulkEditPreview, useBulkEditApply } from '@/hooks/billing/use-bulk-edit-bills';
import type { BulkEditPreviewResult, BulkEditApplyResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

type Step = 'download' | 'upload' | 'preview' | 'result';

export default function BulkEditBillsPage() {
  const [step, setStep] = useState<Step>('download');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<BulkEditPreviewResult | null>(null);
  const [result, setResult] = useState<BulkEditApplyResult | null>(null);

  const previewMutation = useBulkEditPreview();
  const applyMutation = useBulkEditApply();

  const reset = () => {
    setStep('download'); setFile(null); setProgress(0); setPreview(null); setResult(null);
  };

  const pickFile = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      toast.error('Please select a .xlsx or .xls file');
      return;
    }
    setFile(selected);
  };

  const handleValidate = async () => {
    if (!file) return;
    setProgress(15);
    const ticker = setInterval(() => setProgress((p) => (p < 85 ? p + 5 : p)), 200);
    try {
      const res = await previewMutation.mutateAsync({ file });
      clearInterval(ticker); setProgress(100);
      setPreview(res); setStep('preview');
      if (res.changedRows === 0 && res.errorCount > 0) {
        toast.error(`No applicable changes — ${res.errorCount} error(s). Fix the file and re-upload.`);
      } else if (res.changedRows === 0) {
        toast('No changes detected — every row matches the current values.', { icon: 'ℹ️' });
      } else {
        toast.success(`${res.changedRows} bill(s) will change.`);
      }
    } catch (e) {
      clearInterval(ticker); setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Validation failed');
    }
  };

  const handleConfirm = async () => {
    if (!file || applyMutation.isPending) return; // double-submit guard
    setProgress(20);
    try {
      const res = await applyMutation.mutateAsync({ file });
      setProgress(100); setResult(res); setStep('result');
      if (res.changedRows > 0) toast.success(`Updated ${res.changedRows} bill(s).`);
      else toast('No bills were changed.', { icon: 'ℹ️' });
    } catch (e) {
      setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Apply failed');
    }
  };

  const canConfirm = !!preview && preview.changedRows > 0;

  return (
    <PermissionGuard module='billing.schedule' action='update'>
      <ContentLayout title='Bulk Edit Bills'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href='/'>Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href='/billing/schedule'>Schedule</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Bulk Edit</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Bulk Edit Bills</h1>
              <p className='text-sm text-muted-foreground'>
                Download existing bills, edit them (Final Amount, Academic Year, Category, Description, Due Date, Remarks), and apply with a preview.
              </p>
            </div>
            <Button asChild variant='outline' size='sm'>
              <Link href='/billing/schedule'><ArrowLeft className='h-4 w-4 mr-1' /> Back to schedule</Link>
            </Button>
          </div>

          {/* Step indicator */}
          <div className='flex items-center gap-1 text-xs text-muted-foreground flex-wrap'>
            <Dot active={step === 'download'} done={step !== 'download'}>1. Filter & Download</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'upload'} done={step === 'preview' || step === 'result'}>2. Upload</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'preview'} done={step === 'result'}>3. Preview</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'result'} done={false}>4. Result</Dot>
          </div>

          <Card>
            <CardContent className='p-6'>
              {step === 'download' && (
                <div className='space-y-4'>
                  <BulkEditFilterPanel onDownloaded={() => setStep('upload')} />
                  <div className='flex justify-end'>
                    <Button variant='ghost' onClick={() => setStep('upload')}>
                      I already have a file — skip to upload <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>
                </div>
              )}

              {step === 'upload' && (
                <div className='space-y-4'>
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragging ? 'border-violet-500 bg-violet-50' : 'border-muted-foreground/25'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0] ?? null); }}
                  >
                    <Upload className='mx-auto h-10 w-10 text-muted-foreground' />
                    <p className='mt-3 text-sm'>
                      {file
                        ? <span className='font-medium text-violet-700'>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                        : <>Drag & drop your edited file here, or click to browse</>}
                    </p>
                    <Input type='file' accept='.xlsx,.xls' className='absolute inset-0 cursor-pointer opacity-0'
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  </div>

                  {file && (
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <FileSpreadsheet className='h-4 w-4 text-violet-600' />
                      Ready to validate.
                      <Button variant='ghost' size='sm' className='h-6' onClick={() => setFile(null)}>
                        <X className='h-3 w-3' />
                      </Button>
                    </div>
                  )}

                  {previewMutation.isPending && (
                    <div className='space-y-2'>
                      <Progress value={progress} />
                      <p className='text-xs text-center text-muted-foreground'>Validating & diffing…</p>
                    </div>
                  )}

                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('download')}>Back</Button>
                    <Button onClick={handleValidate} disabled={!file || previewMutation.isPending}>
                      {previewMutation.isPending
                        ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Validating…</>
                        : <><CheckCircle2 className='mr-2 h-4 w-4' /> Validate & Preview</>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 'preview' && preview && (
                <div className='space-y-4'>
                  <BulkEditPreviewTable result={preview} />
                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('upload')} disabled={applyMutation.isPending}>
                      Back to upload
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canConfirm || applyMutation.isPending}
                      className='bg-violet-600 hover:bg-violet-700'>
                      {applyMutation.isPending
                        ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Applying {preview.changedRows}…</>
                        : <>Confirm & Update {preview.changedRows} bill{preview.changedRows !== 1 ? 's' : ''}</>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 'result' && result && (
                <BulkEditResult result={result} onAnother={reset} onClose={reset} />
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function Dot({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-1 rounded ${active ? 'bg-violet-100 text-violet-800 font-medium' : done ? 'text-violet-700' : 'text-muted-foreground'}`}>
      {children}
    </span>
  );
}
