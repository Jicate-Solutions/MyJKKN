'use client';

import { useMemo, useState } from 'react';
import { FileSpreadsheet, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { BulkCreatePreviewResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

/** Rows rendered at once. A 5,000-row sheet in one <tbody> janks the tab. */
const PAGE_SIZE = 100;

type RowFilter = 'all' | 'valid' | 'error';

/**
 * Step 2 — what the importer read.
 *
 * Shows the sheet as data, deliberately: the columns are the RAW cell values,
 * so the question this screen answers is "did the importer read my file the way
 * I meant it?" — a mis-mapped column or an amount Excel stored as text is
 * obvious here in a way it never is in an error list. The database's opinion
 * (does this roll number exist, is the rule satisfied) belongs to step 3; the
 * only nod to it here is the resolved learner name shown under the roll number,
 * which is the fastest confirmation that the right people are being billed.
 */
export function BulkCreatePreviewTable({ result }: { result: BulkCreatePreviewResult }) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (filter === 'all') return result.rows;
    return result.rows.filter((r) => r.status === filter);
  }, [result.rows, filter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const setFilterAndReset = (next: RowFilter) => {
    setFilter(next);
    setPage(0);
  };

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <FileSpreadsheet className='h-4 w-4 text-violet-600' />
            File Preview — sheet &ldquo;{result.sheetName}&rdquo;
          </CardTitle>
          <CardDescription className='text-xs'>
            This is what the importer read from your file. Nothing has been created yet.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-5'>
            <Stat label='Rows read' value={result.totalRows} tone='neutral' />
            <Stat label='Ready' value={result.validRows} tone='violet' />
            <Stat
              label='Need attention'
              value={result.errorRows}
              tone={result.errorRows > 0 ? 'destructive' : 'neutral'}
            />
            <Stat label='Learners' value={result.learnerCount} tone='neutral' />
            <Stat label='Total (₹)' value={result.totalAmount} tone='neutral' currency />
          </div>

          {result.categoryBreakdown.length > 0 && (
            <div className='flex flex-wrap gap-2 text-xs'>
              {result.categoryBreakdown.map((c) => (
                <Badge key={c.category_name} variant='outline' className='font-normal'>
                  {c.category_name}
                  <span className='ml-1.5 text-muted-foreground'>
                    {c.rows} row{c.rows !== 1 ? 's' : ''} · ₹{c.amount.toLocaleString('en-IN')}
                  </span>
                </Badge>
              ))}
            </div>
          )}

          <p className='text-xs text-muted-foreground'>
            Totals count only the rows that are ready to bill. Blank rows in the sheet were
            skipped and are not counted.
          </p>
        </CardContent>
      </Card>

      {result.rowsTruncated && (
        <Alert>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription className='text-xs'>
            This file has more rows than the preview table can show, so only the first{' '}
            {result.rows.length.toLocaleString('en-IN')} are listed below. The counts above and
            the full list of problems on the next step still cover every row.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className='pb-2 flex-row items-center justify-between space-y-0'>
          <CardTitle className='text-base'>
            Rows ({rows.length.toLocaleString('en-IN')})
          </CardTitle>
          <div className='flex gap-1'>
            <FilterChip active={filter === 'all'} onClick={() => setFilterAndReset('all')}>
              All {result.totalRows}
            </FilterChip>
            <FilterChip active={filter === 'valid'} onClick={() => setFilterAndReset('valid')}>
              Ready {result.validRows}
            </FilterChip>
            <FilterChip
              active={filter === 'error'}
              onClick={() => setFilterAndReset('error')}
              tone='destructive'
            >
              Problems {result.errorRows}
            </FilterChip>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          {/* overflow-x-auto on its own container: 10 columns overflow narrow
              screens, and the page body must never scroll sideways. */}
          <div className='max-h-[28rem] overflow-auto rounded border'>
            <table className='w-full min-w-[64rem] text-sm'>
              <thead className='sticky top-0 border-b bg-background text-xs text-muted-foreground'>
                <tr>
                  <th className='px-2 py-2 text-left font-medium'>#</th>
                  <th className='px-2 py-2 text-left font-medium'>Roll / Learner</th>
                  <th className='px-2 py-2 text-left font-medium'>Institution</th>
                  <th className='px-2 py-2 text-left font-medium'>Academic Year</th>
                  <th className='px-2 py-2 text-left font-medium'>Category</th>
                  <th className='px-2 py-2 text-left font-medium'>Description</th>
                  <th className='px-2 py-2 text-left font-medium'>Due Date</th>
                  <th className='px-2 py-2 text-right font-medium'>Amount</th>
                  <th className='px-2 py-2 text-left font-medium'>Remarks</th>
                  <th className='px-2 py-2 text-left font-medium'>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const sheetName = [r.raw.first_name, r.raw.last_name]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr
                      key={r.row}
                      className={`border-t align-top ${
                        r.status === 'error' ? 'bg-destructive/5' : ''
                      }`}
                    >
                      <td className='px-2 py-1.5 tabular-nums text-xs text-muted-foreground'>
                        {r.row}
                      </td>
                      <td className='px-2 py-1.5'>
                        <div className='font-medium'>{r.raw.roll_number || '—'}</div>
                        {/* Prefer the name the DB matched; fall back to what the
                            sheet said so an unresolved row still names someone. */}
                        <div className='text-xs text-muted-foreground'>
                          {r.resolved.student_name || sheetName || '—'}
                        </div>
                      </td>
                      <td className='px-2 py-1.5 text-xs'>
                        {r.raw.institution_name || (
                          <span className='text-muted-foreground'>
                            {r.resolved.institution_name ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className='px-2 py-1.5 text-xs'>{r.raw.academic_year_name || '—'}</td>
                      <td className='px-2 py-1.5 text-xs'>
                        {r.raw.billing_category_name || '—'}
                      </td>
                      <td className='max-w-[14rem] truncate px-2 py-1.5 text-xs'>
                        {r.raw.bill_description || '—'}
                      </td>
                      <td className='whitespace-nowrap px-2 py-1.5 text-xs'>
                        {r.raw.due_date || '—'}
                      </td>
                      {/* When the cell wasn't a number, show the text it held
                          rather than a dash — that text is the thing the user
                          has to go and correct. */}
                      <td className='px-2 py-1.5 text-right text-xs tabular-nums'>
                        {r.raw.billing_amount !== null ? (
                          `₹${r.raw.billing_amount.toLocaleString('en-IN')}`
                        ) : (
                          <span className='text-destructive'>
                            {r.raw.billing_amount_raw || '—'}
                          </span>
                        )}
                      </td>
                      <td className='max-w-[10rem] truncate px-2 py-1.5 text-xs'>
                        {r.raw.remarks || '—'}
                      </td>
                      <td className='px-2 py-1.5'>
                        {r.status === 'valid' ? (
                          <span className='inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400'>
                            <CheckCircle2 className='h-3 w-3' /> Ready
                          </span>
                        ) : (
                          <span className='inline-flex items-center gap-1 text-xs text-destructive'>
                            <AlertCircle className='h-3 w-3' />
                            {r.issues.length} issue{r.issues.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={10} className='px-2 py-8 text-center text-sm text-muted-foreground'>
                      No rows match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>
                Showing {safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of{' '}
                {rows.length.toLocaleString('en-IN')}
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7'
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className='h-3 w-3' />
                </Button>
                <span className='tabular-nums'>
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7'
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  <ChevronRight className='h-3 w-3' />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  tone = 'violet',
  children
}: {
  active: boolean;
  onClick: () => void;
  tone?: 'violet' | 'destructive';
  children: React.ReactNode;
}) {
  const activeCls =
    tone === 'destructive'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : 'border-violet-300 bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200';
  return (
    <button
      type='button'
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs transition-colors ${
        active ? activeCls : 'border-border text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
  currency = false
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'violet' | 'destructive';
  currency?: boolean;
}) {
  const cls =
    tone === 'violet'
      ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200'
      : tone === 'destructive'
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/30 text-foreground';
  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className='text-[10px] uppercase tracking-wide opacity-70'>{label}</div>
      <div className='text-lg font-semibold tabular-nums'>
        {currency ? '₹' : ''}
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}
