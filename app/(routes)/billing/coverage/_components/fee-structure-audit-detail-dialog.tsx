'use client';
/**
 * Audit details for ONE learner: every item their fee structure expects,
 * side by side with the bills that actually exist, plus any bill that matches
 * no structure item. "Generate missing bills" opens the preview → confirm flow
 * for this learner only.
 */

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FilePlus2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { formatCurrency, getErrorMessage } from '@/lib/utils';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import {
  FEE_STRUCTURE_AUDIT_ISSUE_LABELS,
  NO_STRUCTURE_REASON_LABELS,
  type FeeStructureAuditLearnerRow,
  type FeeStructureDetailItem
} from '@/types/billing-coverage';
import { billAuditKeys } from '@/hooks/billing/use-bill-coverage-audit';
import { ISSUE_STYLE } from './audit-fee-structure-columns';

const rs = (n: number | null) => (n == null ? '—' : formatCurrency(n, { showDecimals: false }));

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className='rounded-lg border bg-muted/30 p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function ItemRow({ it }: { it: FeeStructureDetailItem }) {
  const differs =
    it.bill_count > 0 && it.expected_amount != null && Math.abs(it.billed_amount - it.expected_amount) > 1;
  const also: string[] = [];
  if (it.issue !== 'amount_mismatch' && it.flag_amount_mismatch) also.push('amount differs');
  if (it.issue !== 'other_structure' && it.flag_other_structure) also.push('other structure');
  if (it.issue !== 'not_linked' && it.flag_not_linked) also.push('not linked');
  if (it.issue !== 'split_missing' && it.flag_split_missing) also.push('no instalments');

  return (
    <tr className={`border-t align-top ${it.issue === 'missing_bill' ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}>
      <td className='px-3 py-2'>
        <div className='font-medium'>{it.category_name}</div>
        {it.schedule_mode === 'split' && (
          <div className='text-xs text-muted-foreground'>
            split · {it.expected_instalments ?? '—'} instalments
          </div>
        )}
      </td>
      <td className='px-3 py-2 text-right tabular-nums'>{rs(it.expected_amount)}</td>
      <td className='px-3 py-2'>
        {it.bills.length === 0 ? (
          <span className='text-sm font-medium text-red-600 dark:text-red-400'>No bill</span>
        ) : (
          <div className='space-y-1'>
            {it.bills.map((b) => (
              <div key={b.bill_id} className='text-sm'>
                <span className={`tabular-nums ${differs ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}`}>
                  {rs(b.amount)}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {' '}· paid {rs(b.paid)} · {b.status.replace('_', ' ')} · due {formatDate(b.due_date)}
                  {b.linked_to_structure === false ? ' · not linked' : ''}
                </span>
              </div>
            ))}
            {it.schedule_mode === 'split' && (
              <div className='text-xs text-muted-foreground'>
                {it.bill_instalments} / {it.expected_instalments ?? '—'} instalments on the bill
              </div>
            )}
          </div>
        )}
      </td>
      <td className='px-3 py-2'>
        <Badge className={ISSUE_STYLE[it.issue] ?? ''}>{FEE_STRUCTURE_AUDIT_ISSUE_LABELS[it.issue]}</Badge>
        {also.length > 0 && <div className='mt-0.5 text-xs text-muted-foreground'>also: {also.join(', ')}</div>}
      </td>
    </tr>
  );
}

export function FeeStructureAuditDetailDialog({
  learner,
  open,
  onOpenChange,
  canGenerate,
  onGenerate
}: {
  learner: FeeStructureAuditLearnerRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canGenerate: boolean;
  /** Opens the preview → confirm flow for this learner. */
  onGenerate: (learnerIds: string[]) => void;
}) {
  // Under the audit's query root, so a generation (which invalidates it)
  // also refreshes an open detail.
  const query = useQuery({
    queryKey: [...billAuditKeys.all, 'fee-structure', 'detail', learner?.learner_id],
    queryFn: () => BillCoverageAuditService.getFeeStructureLearnerDetail(learner!.learner_id),
    enabled: open && !!learner
  });
  const detail = query.data ?? null;
  const loading = query.isLoading;
  const error = query.error
    ? getErrorMessage(query.error)
    : query.isSuccess && !query.data
      ? 'This learner is not visible to you.'
      : null;

  if (!learner) return null;

  const items = detail?.items.filter((i) => i.issue !== 'no_structure') ?? [];
  const noStructure = detail?.items.find((i) => i.issue === 'no_structure');
  const missing = items.filter((i) => i.issue === 'missing_bill');
  const expectedTotal = items
    .filter((i) => i.issue !== 'other_module')
    .reduce((s, i) => s + (i.expected_amount ?? 0), 0);
  const billedTotal = items.reduce((s, i) => s + i.billed_amount, 0);
  const missingTotal = missing.reduce((s, i) => s + (i.expected_amount ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no height cap of its own. */}
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader className='space-y-2'>
          <DialogTitle className='flex flex-wrap items-center gap-2 text-xl'>
            {learner.full_name}
            <LifecycleStatusBadge status={learner.lifecycle_status as LifecycleStatus} />
          </DialogTitle>
          <DialogDescription asChild>
            <div className='grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2'>
              <p>
                <span className='text-muted-foreground'>Roll No: </span>
                <span className='text-foreground'>{learner.roll_number || '—'}</span>
              </p>
              <p>
                <span className='text-muted-foreground'>Admission year: </span>
                <span className='text-foreground'>{learner.admission_year ?? '—'}</span>
              </p>
              <p className='sm:col-span-2'>
                <span className='text-muted-foreground'>Institution / Program: </span>
                <span className='text-foreground'>
                  {learner.institution_name ?? '—'} · {learner.program_name ?? '—'}
                </span>
              </p>
              <p className='sm:col-span-2'>
                <span className='text-muted-foreground'>Fee structure: </span>
                <span className='text-foreground'>{learner.structure_name ?? 'None matched'}</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading audit details…
          </div>
        )}
        {error && <p className='text-sm text-red-600'>{error}</p>}

        {detail && !loading && (
          <div className='space-y-5'>
            {noStructure ? (
              <div className='rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-950/30'>
                No fee structure matches this learner —{' '}
                {noStructure.no_structure_reason
                  ? NO_STRUCTURE_REASON_LABELS[noStructure.no_structure_reason]
                  : 'no matching combination'}
                . Fix the learner&apos;s details or add a structure; nothing can be compared or generated.
              </div>
            ) : (
              <>
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                  <Stat label='Structure items' value={items.length} />
                  <Stat
                    label='Missing bills'
                    value={missing.length}
                    tone={missing.length ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}
                  />
                  <Stat label='Structure total' value={rs(expectedTotal)} />
                  <Stat
                    label='Billed total'
                    value={rs(billedTotal)}
                    tone={Math.abs(billedTotal - expectedTotal) > 1 ? 'text-orange-600 dark:text-orange-400' : ''}
                  />
                </div>

                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>Fee structure vs bills</h3>
                  <div className='overflow-x-auto rounded-md border'>
                    <table className='w-full text-sm'>
                      <thead className='bg-muted/50 text-xs text-muted-foreground'>
                        <tr>
                          <th className='px-3 py-2 text-left'>Fee item (structure)</th>
                          <th className='px-3 py-2 text-right'>Structure ₹</th>
                          <th className='px-3 py-2 text-left'>Bills raised</th>
                          <th className='px-3 py-2 text-left'>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <ItemRow key={it.category_id ?? it.category_name ?? ''} it={it} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Hostel, mess and transport items are billed by Campus Living / Transport, not
                    by the fee structure, so they are never generated here.
                  </p>
                </section>

                {detail.extra_bills.length > 0 && (
                  <section className='space-y-2'>
                    <h3 className='text-sm font-semibold'>Bills not in the fee structure</h3>
                    <div className='overflow-x-auto rounded-md border'>
                      <table className='w-full text-sm'>
                        <thead className='bg-muted/50 text-xs text-muted-foreground'>
                          <tr>
                            <th className='px-3 py-2 text-left'>Category</th>
                            <th className='px-3 py-2 text-right'>Amount</th>
                            <th className='px-3 py-2 text-right'>Paid</th>
                            <th className='px-3 py-2 text-left'>Status</th>
                            <th className='px-3 py-2 text-left'>Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.extra_bills.map((b) => (
                            <tr key={b.bill_id} className='border-t'>
                              <td className='px-3 py-2'>{b.category_name}</td>
                              <td className='px-3 py-2 text-right tabular-nums'>{rs(b.amount)}</td>
                              <td className='px-3 py-2 text-right tabular-nums'>{rs(b.paid)}</td>
                              <td className='px-3 py-2'>{b.status.replace('_', ' ')}</td>
                              <td className='px-3 py-2'>{formatDate(b.due_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button variant='outline' asChild>
            <a href={`/billing/schedule/students/${learner.learner_id}`} target='_blank' rel='noopener noreferrer'>
              View bills
              <ExternalLink className='ml-2 h-4 w-4' />
            </a>
          </Button>
          {canGenerate && (
            <Button
              disabled={missing.length === 0 || loading}
              onClick={() => onGenerate([learner.learner_id])}
            >
              <FilePlus2 className='mr-2 h-4 w-4' />
              Generate {missing.length} missing bill{missing.length === 1 ? '' : 's'}
              {missing.length > 0 ? ` (${rs(missingTotal)})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
