'use client';

import { Ban, FileText } from 'lucide-react';
import { BILL_CANCEL_REASON_LABELS } from '@/types/billing-bill-cancellation';
import type {
  BillCancellation,
  BillCancelReasonCode,
} from '@/types/billing-bill-cancellation';

interface Props {
  cancellation: BillCancellation;
  className?: string;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The audit strip shown under a cancelled bill.
 *
 * Reads the identity SNAPSHOTS on the cancellation row rather than joining to
 * profiles: the person who cancelled the bill may since have been renamed or
 * deactivated, and the question "who voided this" has to keep its answer.
 */
export function BillCancellationDetails({ cancellation, className }: Props) {
  const attachments = Array.isArray(cancellation.attachments)
    ? cancellation.attachments
    : [];
  const who =
    cancellation.cancelled_by_name || cancellation.cancelled_by_email || 'Unknown user';
  const role = cancellation.cancelled_by_is_super_admin
    ? 'Super Admin'
    : cancellation.cancelled_by_role;

  return (
    <div
      className={`rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20 ${className ?? ''}`}
    >
      <div className='flex items-start gap-2'>
        <Ban className='h-4 w-4 mt-0.5 shrink-0 text-amber-600' />
        <div className='min-w-0 space-y-1'>
          <p className='font-medium text-amber-900 dark:text-amber-200'>
            Cancelled —{' '}
            {BILL_CANCEL_REASON_LABELS[
              cancellation.reason_code as BillCancelReasonCode
            ] ?? cancellation.reason_code}
          </p>
          <p className='text-amber-800 dark:text-amber-300 break-words'>
            {cancellation.reason}
          </p>
          <p className='text-xs text-amber-700 dark:text-amber-400'>
            {who}
            {role ? ` · ${role}` : ''} · {formatDateTime(cancellation.cancelled_at)}
          </p>
          {attachments.length > 0 && (
            <ul className='pt-1 space-y-0.5'>
              {attachments.map((a) => (
                <li key={a.drive_file_id} className='flex items-center gap-1.5'>
                  <FileText className='h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400' />
                  <a
                    href={a.drive_url}
                    target='_blank'
                    rel='noreferrer'
                    className='text-xs underline truncate max-w-[280px] text-amber-800 dark:text-amber-300'
                  >
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
