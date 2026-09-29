'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Timer, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useMyFeePaymentNotice } from '@/hooks/billing/use-my-fee-payment-notice';
import { clockOffset, feeNoticeState, formatRemaining, remainingMs } from '@/lib/billing/fee-payment-notice';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * The learner's 48-hour Transport Maintenance Fee countdown, shown under the
 * navbar on every page. Same notice, same states and same wording as the TMS
 * learner portal. Renders null for anyone who is not a learner or has no notice.
 */
export function FeePaymentNoticeBanner() {
  const { profile } = useAuth();
  const isLearner = profile?.role === 'student' && !!profile.learner_id;
  const { data: notice, dataUpdatedAt } = useMyFeePaymentNotice(isLearner);

  // Offset is captured per response; dataUpdatedAt changes on every refetch.
  const offset = useMemo(
    () => (notice?.server_now ? clockOffset(notice.server_now, dataUpdatedAt || Date.now()) : 0),
    [notice?.server_now, dataUpdatedAt],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (notice?.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [notice?.status]);

  if (!isLearner || !notice) return null;
  const left = remainingMs(notice.expires_at, now, offset);
  const state = feeNoticeState(notice, left);
  if (state === 'hidden') return null;

  // Always an alert: light red in every state. The icon pulses once the
  // urgent window starts so the last hours still read as more pressing.
  const pulse = state === 'urgent' || state === 'processing';
  const Icon = state === 'fined' ? AlertTriangle : Timer;

  return (
    <div
      role='status'
      aria-live='off'
      className='w-full border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 md:px-8 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
    >
      <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
        <Icon className={`h-4 w-4 shrink-0 ${pulse ? 'animate-pulse' : ''}`} aria-hidden />
        <p className='min-w-0 flex-1'>
          {state === 'fined' ? (
            `A Transport Fee of ${inr(notice.amount)} has been added because the maintenance fee wasn't paid in time.`
          ) : state === 'processing' ? (
            "Time's up — Transport Fee being added…"
          ) : (
            <>
              Pay your Transport Maintenance Fee within{' '}
              <span className='font-mono font-semibold tabular-nums'>{formatRemaining(left)}</span>
              {notice.amount > 0 && <>, or a Transport Fee of {inr(notice.amount)} will be added</>}.
            </>
          )}
        </p>
        <Link
          href='/learners/my-bills'
          className='inline-flex h-11 shrink-0 items-center rounded-md bg-green-600 px-4 font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2 md:h-7'
        >
          {state === 'fined' ? 'View fees' : 'Pay now'}
        </Link>
      </div>
    </div>
  );
}
