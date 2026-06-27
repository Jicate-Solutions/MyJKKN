'use client';

import { Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { JOB_STATUS_LABELS, type HRRecruitmentJob } from '@/types/hr-recruitment';

import { ROLE_CATEGORY_LABELS } from './labels';

interface JobDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: HRRecruitmentJob | null;
  institutionName: string;
  departmentName: string;
  /** Optional — when provided, shows an "Edit" button that hands off to edit. */
  onEdit?: (job: HRRecruitmentJob) => void;
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

const fmtInr = (n: number | null | undefined) =>
  n == null ? null : `₹${new Intl.NumberFormat('en-IN').format(n)}`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-3 gap-3 py-2 border-b last:border-b-0'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 text-sm'>{children}</dd>
    </div>
  );
}

export function JobDetailDialog({
  open,
  onOpenChange,
  job,
  institutionName,
  departmentName,
  onEdit,
}: JobDetailDialogProps) {
  if (!job) return null;

  const salary =
    job.min_monthly_salary == null && job.max_monthly_salary == null
      ? 'Not disclosed'
      : `${fmtInr(job.min_monthly_salary) ?? '—'} – ${
          fmtInr(job.max_monthly_salary) ?? '—'
        } / month`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90dvh] max-w-lg flex-col'>
        <DialogHeader>
          <DialogTitle>{job.title}</DialogTitle>
          <DialogDescription>
            {ROLE_CATEGORY_LABELS[job.role_category] ?? job.role_category} ·{' '}
            {institutionName || '—'}
          </DialogDescription>
        </DialogHeader>

        <dl className='min-h-0 flex-1 overflow-y-auto pr-1'>
          <Row label='Status'>
            <Badge variant='secondary'>
              {JOB_STATUS_LABELS[job.status] ?? job.status}
            </Badge>
          </Row>
          <Row label='Public on /careers'>
            {job.is_public ? 'On /careers' : 'Hidden'}
          </Row>
          <Row label='Institution'>{institutionName || '—'}</Row>
          <Row label='Department'>{departmentName || '—'}</Row>
          <Row label='Positions'>
            {job.positions_filled} filled / {job.positions_open} open
          </Row>
          <Row label='Salary'>{salary}</Row>
          <Row label='Description'>
            {job.description ? (
              <p className='whitespace-pre-wrap'>{job.description}</p>
            ) : (
              <span className='text-muted-foreground'>—</span>
            )}
          </Row>
          <Row label='Posted'>
            {fmtDate(job.posted_at) ?? (
              <span className='text-muted-foreground'>Not posted yet</span>
            )}
          </Row>
          <Row label='Closes'>
            {fmtDate(job.closes_at) ?? (
              <span className='text-muted-foreground'>—</span>
            )}
          </Row>
          <Row label='Created'>{fmtDate(job.created_at) ?? '—'}</Row>
        </dl>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={() => onEdit(job)}>
              <Pencil className='mr-2 h-4 w-4' />
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
