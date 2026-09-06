'use client';

import { CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert, Download, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import type {
  BulkCreatePreviewResult,
  BulkCreatePreviewRow,
  RowIssueKind
} from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * Step 3 — the verdict, before anything is written.
 *
 * Issues are grouped by KIND rather than listed by row, because each kind is
 * fixed somewhere different and a flat list of 300 messages hides that:
 *   • format    → edit the spreadsheet cell
 *   • lookup    → the value names nothing in the system; fix the value or the
 *                 master record
 *   • condition → the row is fine but a configured billing rule forbids it;
 *                 cancel the existing bill or change the category
 *
 * The rule check gets its own card ABOVE the issues, and renders even when
 * everything passes. A clerk uploading 400 tuition bills needs to see that the
 * once-per-learner rule was evaluated and satisfied — an absence of red is not
 * the same reassurance as "checked 400 rows, 0 conflicts".
 */

const KIND_META: Record<
  RowIssueKind,
  { title: string; hint: string }
> = {
  format: {
    title: 'Cell problems',
    hint: 'The value in the cell is missing or unreadable. Fix these in the spreadsheet and re-upload.'
  },
  lookup: {
    title: 'Not found in the system',
    hint: 'The value is readable but does not match any record. Correct the cell, or create/activate the master record first.'
  },
  condition: {
    title: 'Blocked by a billing rule',
    hint: 'Nothing is wrong with the sheet — these bills are simply not allowed to exist yet. Cancel the existing bill, or change the category setting.'
  }
};

export function BulkCreateValidationPanel({ result }: { result: BulkCreatePreviewResult }) {
  const clean = result.errorRows === 0 && result.validRows > 0;

  const handleDownloadIssues = async () => {
    try {
      const mod: any = await import('xlsx');
      const XLSX: any = mod.default ?? mod;

      // Neutralise spreadsheet formula injection in free-text cells (names,
      // messages) — same guard as export-analytics.ts.
      const sanitize = (v: unknown): unknown =>
        typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

      const aoa: unknown[][] = [
        ['Excel Row', 'Roll Number', 'Learner', 'Column', 'Problem']
      ];
      result.errors.forEach((e) =>
        aoa.push([e.row, e.roll_number ?? '', e.student_name ?? '', e.field ?? '', e.message])
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map(sanitize))),
        'Issues'
      );
      XLSX.writeFile(wb, `bill-upload-issues-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Issue list downloaded.');
    } catch (error) {
      console.error('[BulkCreateValidationPanel] Issue download error:', error);
      toast.error('Failed to generate the issue list.');
    }
  };

  return (
    <div className='space-y-4'>
      {/* -- Verdict ---------------------------------------------------- */}
      {clean ? (
        <Alert className='border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'>
          <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          <AlertDescription>
            <p className='font-medium text-emerald-800 dark:text-emerald-200'>
              All {result.validRows.toLocaleString('en-IN')} row
              {result.validRows !== 1 ? 's' : ''} passed every check.
            </p>
            <p className='text-sm text-emerald-700 dark:text-emerald-300'>
              Total to be billed: ₹{result.totalAmount.toLocaleString('en-IN')} across{' '}
              {result.learnerCount.toLocaleString('en-IN')} learner
              {result.learnerCount !== 1 ? 's' : ''}. Still nothing written — continue to confirm.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='font-medium'>
                  {result.errorRows.toLocaleString('en-IN')} of{' '}
                  {result.totalRows.toLocaleString('en-IN')} row
                  {result.totalRows !== 1 ? 's' : ''} cannot be billed.
                </p>
                <p className='text-sm'>
                  {result.validRows > 0
                    ? `${result.validRows.toLocaleString('en-IN')} row${result.validRows !== 1 ? 's are' : ' is'} ready. You can fix the file and re-upload, or continue and create only the ready rows.`
                    : 'No row is ready to bill. Fix the problems below and upload again.'}
                </p>
              </div>
              <Button variant='outline' size='sm' className='shrink-0' onClick={handleDownloadIssues}>
                <Download className='mr-2 h-4 w-4' />
                Issues (.xlsx)
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* -- Configured billing rules ----------------------------------- */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <ShieldCheck className='h-4 w-4 text-violet-600' />
            Billing category rules
          </CardTitle>
          <CardDescription className='text-xs'>
            Categories with <strong>Once per learner</strong> enabled allow a learner only one live
            bill in that category, ever. Cancelled and superseded bills do not count, so a mistake
            can always be corrected and re-billed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.conditionChecks.length === 0 ? (
            <div className='flex items-start gap-2 rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
              <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <span>
                No category used in this file has <strong>Once per learner</strong> enabled, so
                nothing was restricted. Repeat bills in these categories are allowed — Transport
                Fee, for example, is billed twice a year on purpose.
              </span>
            </div>
          ) : (
            <div className='overflow-x-auto rounded border'>
              <table className='w-full min-w-[36rem] text-sm'>
                <thead className='border-b bg-muted/30 text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-3 py-2 text-left font-medium'>Category</th>
                    <th className='px-3 py-2 text-left font-medium'>Rule</th>
                    <th className='px-3 py-2 text-right font-medium'>Rows checked</th>
                    <th className='px-3 py-2 text-right font-medium'>Already billed</th>
                    <th className='px-3 py-2 text-right font-medium'>Repeated in file</th>
                    <th className='px-3 py-2 text-left font-medium'>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.conditionChecks.map((c) => {
                    const blocked = c.conflictsExisting + c.conflictsInFile;
                    return (
                      <tr key={c.category_name} className='border-t'>
                        <td className='px-3 py-2 font-medium'>{c.category_name}</td>
                        <td className='px-3 py-2 text-xs text-muted-foreground'>
                          Once per learner
                        </td>
                        <td className='px-3 py-2 text-right text-xs tabular-nums'>
                          {c.rowsChecked.toLocaleString('en-IN')}
                        </td>
                        <td className='px-3 py-2 text-right text-xs tabular-nums'>
                          {c.conflictsExisting > 0 ? (
                            <span className='text-destructive'>{c.conflictsExisting}</span>
                          ) : (
                            <span className='text-muted-foreground'>0</span>
                          )}
                        </td>
                        <td className='px-3 py-2 text-right text-xs tabular-nums'>
                          {c.conflictsInFile > 0 ? (
                            <span className='text-destructive'>{c.conflictsInFile}</span>
                          ) : (
                            <span className='text-muted-foreground'>0</span>
                          )}
                        </td>
                        <td className='px-3 py-2'>
                          {blocked === 0 ? (
                            <span className='inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400'>
                              <ShieldCheck className='h-3.5 w-3.5' /> Satisfied
                            </span>
                          ) : (
                            <span className='inline-flex items-center gap-1 text-xs text-destructive'>
                              <ShieldAlert className='h-3.5 w-3.5' /> {blocked} blocked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* -- Issues, grouped by what you have to do about them ---------- */}
      {(['condition', 'lookup', 'format'] as RowIssueKind[])
        .filter((kind) => result.issueCounts[kind] > 0)
        .map((kind) => (
          <IssueGroup key={kind} kind={kind} rows={result.rows} count={result.issueCounts[kind]} />
        ))}
    </div>
  );
}

function IssueGroup({
  kind,
  rows,
  count
}: {
  kind: RowIssueKind;
  rows: BulkCreatePreviewRow[];
  count: number;
}) {
  const meta = KIND_META[kind];
  // Flatten to one entry per issue, keeping sheet order.
  const entries = rows.flatMap((r) =>
    r.issues
      .filter((i) => i.kind === kind)
      .map((i) => ({
        row: r.row,
        field: i.field,
        message: i.message,
        rollNumber: r.raw.roll_number,
        name:
          r.resolved.student_name ||
          [r.raw.first_name, r.raw.last_name].filter(Boolean).join(' ')
      }))
  );

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base flex items-center gap-2'>
          <AlertCircle className='h-4 w-4 text-destructive' />
          {meta.title}
          <Badge variant='outline' className='ml-1 border-destructive/40 text-destructive'>
            {count.toLocaleString('en-IN')}
          </Badge>
        </CardTitle>
        <CardDescription className='text-xs'>{meta.hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='max-h-64 space-y-1.5 overflow-y-auto'>
          {entries.map((e, i) => (
            <div
              key={`${e.row}-${e.field ?? ''}-${i}`}
              className='flex items-start gap-2 rounded border bg-background px-2 py-1.5 text-xs'
            >
              <Badge variant='outline' className='mt-0.5 shrink-0 font-normal tabular-nums'>
                Row {e.row}
              </Badge>
              <div className='flex-1'>
                {(e.rollNumber || e.name) && (
                  <span className='font-medium'>
                    {e.rollNumber}
                    {e.name ? ` — ${e.name}` : ''}
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
  );
}
