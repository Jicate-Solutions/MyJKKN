'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VACATE_STEPS } from '@/types/hostel-vacate';
import type { HostelVacateApproval, HostelVacateRequest, VacateStep } from '@/types/hostel-vacate';

type StepState = 'done' | 'current' | 'upcoming' | 'rejected';

/** Order of the step statuses; a request sits at exactly one of them. */
const ORDER: VacateStep[] = ['bills', 'principal', 'warden', 'mess', 'cao', 'fine'];

function stepState(
  request: HostelVacateRequest,
  approvals: HostelVacateApproval[],
  step: VacateStep,
): StepState {
  const idx = ORDER.indexOf(step);
  const status = request.status;

  if (status === 'completed') return 'done';

  if (status === 'rejected' || status === 'cancelled') {
    // A closed request keeps whatever it had already passed.
    const rejectedHere = approvals.some((a) => a.step === step && a.action === 'rejected');
    if (rejectedHere) return 'rejected';
    const approvedHere = approvals.some(
      (a) => a.step === step && (a.action === 'approved' || (step === 'bills' && a.action === 'system')),
    );
    return approvedHere ? 'done' : 'upcoming';
  }

  const current = VACATE_STEPS.find((s) => s.status === status)?.step;
  if (!current) return 'upcoming'; // draft
  const curIdx = ORDER.indexOf(current);
  if (idx < curIdx) return 'done';
  if (idx === curIdx) return 'current';
  return 'upcoming';
}

/** Step progress bar. The fine step only appears once there is a fine to pay. */
export function VacateStepper({
  request,
  approvals,
}: {
  request: HostelVacateRequest;
  approvals: HostelVacateApproval[];
}) {
  const showFine = request.damage_total > 0 || !!request.fine_bill_id || request.status === 'pending_fine';
  const steps = VACATE_STEPS.filter((s) => s.step !== 'fine' || showFine);

  return (
    <ol className='flex flex-wrap items-center gap-y-3'>
      {steps.map((s, i) => {
        const state = stepState(request, approvals, s.step);
        return (
          <li key={s.step} className='flex items-center'>
            <div className='flex items-center gap-2'>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
                  state === 'done' && 'border-green-600 bg-green-600 text-white',
                  state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  state === 'rejected' && 'border-destructive bg-destructive text-destructive-foreground',
                  state === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {state === 'done' ? (
                  <Check className='h-4 w-4' />
                ) : state === 'rejected' ? (
                  <X className='h-4 w-4' />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  state === 'current' ? 'font-semibold' : 'text-muted-foreground',
                  state === 'rejected' && 'text-destructive font-medium',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <span className='mx-3 h-px w-6 bg-border sm:w-10' />}
          </li>
        );
      })}
    </ol>
  );
}
