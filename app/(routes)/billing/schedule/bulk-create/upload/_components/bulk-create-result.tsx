'use client';

import Link from 'next/link';
import { CheckCircle2, AlertCircle, Download, Upload, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import type { ImportResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * Step 5 — what was actually written.
 *
 * The .xlsx report is the record of the run: one sheet naming every learner
 * whose bill was created (with the bill id) and one naming every row that
 * didn't, with the reason. Carried over unchanged from the old import dialog —
 * it is the artefact billing staff attach to their own reconciliation.
 */
export function BulkCreateResult({
  result,
  onAnother
}: {
  result: ImportResult;
  onAnother: () => void;
}) {
  const committedAny = result.successCount > 0;

  const handleDownloadReport = async () => {
    try {
      const mod: any = await import('xlsx');
      const XLSX: any = mod.default ?? mod;

      // Neutralise spreadsheet formula injection in free-text cells (names,
      // error messages) — same guard as export-analytics.ts.
      const sanitize = (v: unknown): unknown =>
        typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      const sanitizeAoa = (rows: unknown[][]) => rows.map((r) => r.map(sanitize));

      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['Bulk Bill Upload Report'],
          ['Generated At', new Date().toLocaleString()],
          [],
          ['Total Rows Processed', result.totalRows],
          ['Bills Created Successfully', result.successCount],
          ['Rows Not Created', result.errorCount]
        ]),
        'Summary'
      );

      const successAoa: unknown[][] = [
        ['Excel Row', 'Roll Number', 'Learner', 'Billing Category', 'Due Date', 'Billing Amount', 'Academic Year', 'Bill ID', 'Status']
      ];
      (result.successes ?? []).forEach((s) =>
        successAoa.push([
          s.row,
          s.roll_number,
          s.student_name,
          s.billing_category,
          s.due_date,
          s.billing_amount,
          s.academic_year ?? '',
          s.bill_id ?? '',
          'Bill Created'
        ])
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(sanitizeAoa(successAoa)),
        'Bills Created'
      );

      const failedAoa: unknown[][] = [
        ['Excel Row', 'Roll Number', 'Learner', 'Column', 'Reason', 'Status']
      ];
      (result.errors ?? []).forEach((e) =>
        failedAoa.push([
          e.row,
          e.roll_number ?? '',
          e.student_name ?? '',
          e.field ?? '',
          e.message,
          'Not Created'
        ])
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(sanitizeAoa(failedAoa)),
        'Rows Not Created'
      );

      XLSX.writeFile(wb, `bill-upload-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Report downloaded.');
    } catch (error) {
      console.error('[BulkCreateResult] Report download error:', error);
      toast.error('Failed to generate report.');
    }
  };

  return (
    <div className='space-y-4'>
      {committedAny ? (
        <Alert className='border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'>
          <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          <AlertDescription>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='font-medium text-emerald-800 dark:text-emerald-200'>
                  {result.errorCount === 0 ? 'All bills created.' : 'Bills created, with skipped rows.'}
                </p>
                <p className='text-sm text-emerald-700 dark:text-emerald-300'>
                  Created {result.successCount.toLocaleString('en-IN')} bill
                  {result.successCount !== 1 ? 's' : ''} from{' '}
                  {result.totalRows.toLocaleString('en-IN')} row
                  {result.totalRows !== 1 ? 's' : ''}.
                </p>
              </div>
              <Badge
                variant='outline'
                className='shrink-0 border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              >
                {result.successCount}/{result.totalRows}
              </Badge>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>No bills were created.</p>
            <p className='text-sm'>
              {result.errorCount.toLocaleString('en-IN')} row
              {result.errorCount !== 1 ? 's' : ''} could not be billed. Download the report for the
              reason on each row.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className='flex justify-end'>
        <Button variant='outline' size='sm' onClick={handleDownloadReport}>
          <Download className='mr-2 h-4 w-4' />
          Download Report (.xlsx)
        </Button>
      </div>

      {(result.successes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Bills created ({result.successes!.length.toLocaleString('en-IN')})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-64 space-y-1.5 overflow-y-auto'>
              {result.successes!.map((s, i) => (
                <div
                  key={`${s.row}-${i}`}
                  className='flex items-start gap-2 rounded border bg-background px-2 py-1.5 text-xs'
                >
                  <Badge
                    variant='outline'
                    className='mt-0.5 shrink-0 border-emerald-300 font-normal tabular-nums text-emerald-800 dark:text-emerald-300'
                  >
                    Row {s.row}
                  </Badge>
                  <div className='flex-1'>
                    <span className='font-medium'>
                      {s.roll_number}
                      {s.student_name ? ` — ${s.student_name}` : ''}
                    </span>
                    <span className='text-muted-foreground'>
                      {' '}· {s.billing_category} · ₹{s.billing_amount.toLocaleString('en-IN')} · due{' '}
                      {s.due_date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(result.errors?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>
              Rows not created ({result.errors.length.toLocaleString('en-IN')})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-64 space-y-1.5 overflow-y-auto'>
              {result.errors.map((e, i) => (
                <div
                  key={`${e.row}-${i}`}
                  className='flex items-start gap-2 rounded border bg-background px-2 py-1.5 text-xs'
                >
                  {/* row 0 = a whole-request failure, not a sheet row */}
                  {e.row > 0 && (
                    <Badge variant='outline' className='mt-0.5 shrink-0 font-normal tabular-nums'>
                      Row {e.row}
                    </Badge>
                  )}
                  <div className='flex-1'>
                    {(e.roll_number || e.student_name) && (
                      <span className='font-medium'>
                        {e.roll_number}
                        {e.student_name ? ` — ${e.student_name}` : ''}
                        {': '}
                      </span>
                    )}
                    {e.field && <span className='font-medium text-destructive'>{e.field}: </span>}
                    <span className='text-muted-foreground'>{e.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className='flex justify-between'>
        <Button variant='outline' onClick={onAnother}>
          <Upload className='mr-2 h-4 w-4' />
          Upload another file
        </Button>
        <Button asChild>
          <Link href='/billing/schedule'>
            View bills <ArrowRight className='ml-2 h-4 w-4' />
          </Link>
        </Button>
      </div>
    </div>
  );
}
