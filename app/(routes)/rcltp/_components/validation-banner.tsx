'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ValidationBannerProps {
  /**
   * Number of draft / AI-generated items currently shown. The banner renders ONLY
   * when this is > 0 — forcing every call site to pass explicit draft-awareness, so
   * a surface can never show draft content without the warning (content-safety, F4).
   */
  draftCount: number;
  className?: string;
}

/**
 * ValidationBanner — persistent safety banner for draft / AI-generated RCLTP content.
 *
 * CONTENT-SAFETY CONTRACT: This banner MUST be rendered on every surface that
 * displays draft or AI-generated passages / questions. It is the user-visible
 * signal that the content has NOT been validated by MyJKKN and MUST NOT be used
 * with students until an educator explicitly approves it.
 *
 * Never suppress or conditionally hide this banner when draft content is present.
 */
export function ValidationBanner({ draftCount, className }: ValidationBannerProps) {
  if (draftCount <= 0) return null;
  return (
    <Alert
      className={cn(
        'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
        className
      )}
    >
      <AlertTriangle className='h-4 w-4 text-amber-600 dark:text-amber-400' aria-hidden='true' />
      <AlertDescription className='text-sm font-medium'>
        <span className='font-semibold'>Provisional — AI-drafted / unapproved content.</span>{' '}
        {draftCount} item{draftCount === 1 ? '' : 's'} below {draftCount === 1 ? 'is' : 'are'} in
        draft and {draftCount === 1 ? 'has' : 'have'} NOT been validated. Draft content is never shown
        to students — it must be explicitly approved by an authorised educator first.
      </AlertDescription>
    </Alert>
  );
}
