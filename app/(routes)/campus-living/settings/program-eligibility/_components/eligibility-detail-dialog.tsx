'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatDateShort, formatDateTimeDMY } from '@/lib/utils/date-format';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';
import { formatFeeBand } from './format';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ProgramEligibilityRow;
}

// A single label/value pair in the read-only details grid.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <dt className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

export function EligibilityDetailDialog({ open, onOpenChange, row }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Eligibility Rule Details</DialogTitle>
          <DialogDescription>
            Read-only view of this category-eligibility rule — which room and mess
            categories a cohort may use for the matched academic-fee band. Learners
            are matched on their admission-year academic fee.
          </DialogDescription>
        </DialogHeader>

        <dl className='grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2'>
          <Field label='Institution'>{row.institution_name || '—'}</Field>
          <Field label='Scope'>
            {row.program_name ?? (
              <Badge variant='secondary' className='font-normal'>
                All programs — default
              </Badge>
            )}
          </Field>
          <Field label='Quota'>
            {row.quota_names.length === 0 ? (
              <Badge variant='secondary' className='font-normal'>
                Any quota
              </Badge>
            ) : (
              <span className='flex flex-wrap gap-1'>
                {row.quota_names.map((n) => (
                  <Badge key={n} variant='outline' className='font-normal'>
                    {n}
                  </Badge>
                ))}
              </span>
            )}
          </Field>
          <Field label='Academic Fee Band'>
            <span className='tabular-nums'>
              {formatFeeBand(row.fee_min, row.fee_max)}
            </span>
          </Field>
          <Field label='Room Category'>{row.room_category_name || '—'}</Field>
          <Field label='Mess Category'>{row.mess_category_name || '—'}</Field>
          <Field label='Monthly Mess Allowed'>
            <Badge variant={row.is_monthly_mess_allowed ? 'default' : 'outline'}>
              {row.is_monthly_mess_allowed ? 'Yes' : 'No'}
            </Badge>
          </Field>
          <Field label='Status'>
            <Badge variant={row.is_active ? 'default' : 'outline'}>
              {row.is_active ? 'Allowed' : 'Disabled'}
            </Badge>
          </Field>
          <Field label='Effective From'>{formatDateShort(row.effective_from)}</Field>
          <Field label='Created'>{formatDateTimeDMY(row.created_at)}</Field>
          <Field label='Last Updated'>{formatDateTimeDMY(row.updated_at)}</Field>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
