'use client';

import * as XLSX from 'xlsx';
import { CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { BulkEditApplyResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export function BulkEditResult({
  result,
  onAnother,
  onClose
}: {
  result: BulkEditApplyResult;
  onAnother: () => void;
  onClose: () => void;
}) {
  // Build a flat change-report (one row per field change) from the FULL applied set.
  const downloadReport = () => {
    const aoa: (string | null)[][] = [['Bill ID', 'Roll Number', 'Student Name', 'Field', 'Old Value', 'New Value']];
    result.applied.forEach((a) =>
      a.changes.forEach((c) =>
        aoa.push([a.bill_id, a.roll_number, a.student_name, c.label, c.old, c.new])
      )
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Changes');
    XLSX.writeFile(wb, `bulk-edit-change-report-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className='space-y-4'>
      {result.changedRows > 0 && (
        <Alert className='border-violet-200 bg-violet-50'>
          <CheckCircle2 className='h-4 w-4 text-violet-600' />
          <AlertDescription>
            <p className='font-medium text-violet-900'>
              Updated {result.changedRows} bill{result.changedRows !== 1 ? 's' : ''}
              {result.unchangedRows > 0 ? ` · ${result.unchangedRows} unchanged` : ''}.
            </p>
            {result.fieldsAffected.length > 0 && (
              <p className='text-xs text-violet-700 mt-1'>Fields: {result.fieldsAffected.join(', ')}</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>{result.errorCount} row{result.errorCount !== 1 ? 's' : ''} skipped due to errors.</p>
            <div className='max-h-44 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((e, i) => (
                <div key={i} className='border-l-2 border-destructive pl-2'>
                  <strong>{e.row > 0 ? `Row ${e.row}` : 'File'}</strong>{e.field ? ` — ${e.field}` : ''}: {e.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.applied.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center justify-between'>
              Change report
              <Button size='sm' variant='outline' onClick={downloadReport}>
                <Download className='h-4 w-4 mr-1' /> Download .xlsx
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className='text-xs text-muted-foreground'>
            {result.applied.length} bill{result.applied.length !== 1 ? 's' : ''} changed. The downloadable report lists
            every field&apos;s before→after. The same change is recorded in{' '}
            <a className='underline' href='/billing/activities'>Billing Activities</a>.
          </CardContent>
        </Card>
      )}

      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={onAnother}>Edit another batch</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
