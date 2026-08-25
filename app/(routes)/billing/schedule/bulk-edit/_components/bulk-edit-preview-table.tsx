'use client';

import { CheckCircle2, AlertCircle, ArrowRight, IndianRupee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { BulkEditPreviewResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export function BulkEditPreviewTable({ result }: { result: BulkEditPreviewResult }) {
  // Amount edits move money and cascade into balance + status, so they get
  // their own callout rather than blending into the generic change list.
  const amountRows = result.rows.filter((r) =>
    r.changes.some((c) => c.field === 'final_amount')
  );

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-violet-600' /> Change Preview
          </CardTitle>
          <CardDescription className='text-xs'>
            Nothing has been written yet. Confirm below to apply these changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <Stat label='Rows parsed' value={result.totalRows} tone='neutral' />
            <Stat label='Will change' value={result.changedRows} tone='violet' />
            <Stat label='Unchanged' value={result.unchangedRows} tone='neutral' />
            <Stat label='Errors' value={result.errorCount} tone={result.errorCount > 0 ? 'destructive' : 'neutral'} />
          </div>
          {result.fieldsAffected.length > 0 && (
            <div className='mt-3 text-xs text-muted-foreground'>
              Fields affected: <strong className='text-foreground'>{result.fieldsAffected.join(', ')}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {amountRows.length > 0 && (
        <Alert className='border-amber-300 bg-amber-50'>
          <IndianRupee className='h-4 w-4 text-amber-700' />
          <AlertDescription>
            <p className='font-medium text-amber-900'>
              {amountRows.length} bill{amountRows.length !== 1 ? 's' : ''} will have {amountRows.length !== 1 ? 'their' : 'its'} amount changed.
            </p>
            <p className='text-xs text-amber-800 mt-1'>
              Each one&apos;s balance and status are recalculated from the payments already receipted against it — a raised
              amount reopens a paid bill as partially paid, and a lowered one can settle it. This is recorded in Billing Activities.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>{result.errorCount} issue{result.errorCount !== 1 ? 's' : ''} found — those rows will be skipped.</p>
            <div className='max-h-40 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((e, i) => (
                <div key={i} className='border-l-2 border-destructive pl-2 py-0.5'>
                  <strong>{e.row > 0 ? `Row ${e.row}` : 'File'}</strong>{e.field ? ` — ${e.field}` : ''}: {e.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.rows.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Bills to update ({result.rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-80 overflow-y-auto rounded border'>
              <table className='w-full text-sm'>
                <thead className='text-xs text-muted-foreground sticky top-0 bg-background border-b'>
                  <tr>
                    <th className='text-left py-2 px-2'>Student</th>
                    <th className='text-left'>Field</th>
                    <th className='text-left'>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) =>
                    r.changes.map((c, ci) => (
                      <tr key={`${r.bill_id}-${c.field}`} className='border-t align-top'>
                        {ci === 0 && (
                          <td className='py-1.5 px-2' rowSpan={r.changes.length}>
                            <div className='font-medium'>{r.student_name}</div>
                            <div className='text-xs text-muted-foreground'>{r.roll_number}</div>
                          </td>
                        )}
                        <td className='text-xs py-1.5'>{c.label}</td>
                        <td className='text-xs py-1.5'>
                          <span className='inline-flex items-center gap-1.5'>
                            <Badge variant='outline' className='font-normal text-muted-foreground line-through'>{c.old ?? '(empty)'}</Badge>
                            <ArrowRight className='h-3 w-3 text-muted-foreground' />
                            <Badge
                              variant='outline'
                              className={`font-normal ${c.field === 'final_amount'
                                ? 'border-amber-400 bg-amber-50 text-amber-900 font-medium'
                                : 'border-violet-300 text-violet-800'}`}
                            >
                              {c.new ?? '(empty)'}
                            </Badge>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'violet' | 'destructive' }) {
  const cls = tone === 'violet'
    ? 'border-violet-200 bg-violet-50 text-violet-900'
    : tone === 'destructive'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-border bg-muted/30 text-foreground';
  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className='text-[10px] uppercase tracking-wide opacity-70'>{label}</div>
      <div className='text-lg font-semibold'>{value.toLocaleString('en-IN')}</div>
    </div>
  );
}
