'use client';

/**
 * "Where pay goes": every bank-account and paying-trust change, newest first,
 * with who made it. Shown ONLY to the Director list (ruling 1 Oct 2026); for
 * anyone else this renders nothing. The Monday notice links here.
 */

import { useState } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describeChange, personLabel, totalChanges } from '@/lib/hr/payroll/pay-destination-changes';
import { useIsTheDirector, usePayDestinationChanges } from '@/hooks/hr/payroll/use-pay-destination-changes';

const RANGES = [7, 30, 90] as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

/** A plain sentence for the reader; the database's own wording stays in the log. */
function errorSentence(error: Error): string {
  if (/Only the Director list can read/i.test(error.message)) {
    return 'This list is only for the Director list, and your account is not on it.';
  }
  return 'The list of changes could not be loaded just now.';
}

export function PayDestinationChanges() {
  const director = useIsTheDirector();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const list = usePayDestinationChanges(days, director.data === true);

  if (director.data !== true) return null;

  const rows = list.data ?? [];
  const total = totalChanges(rows);

  return (
    <section id='pay-destination-changes' className='mb-6 rounded-xl border border-border bg-card p-4' data-testid='pay-destination-changes'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='flex items-center gap-2 text-base font-semibold text-foreground'>
            <Landmark className='h-4 w-4' /> Where pay goes: changes
          </h2>
          <p className='text-xs text-muted-foreground'>
            Every bank account and paying trust changed, and who changed it. Only you and Isvarya see this.
          </p>
        </div>
        <div className='flex gap-1' role='group' aria-label='How far back'>
          {RANGES.map((d) => (
            <Button key={d} size='sm' variant={d === days ? 'default' : 'outline'} onClick={() => setDays(d)}>
              Last {d} days
            </Button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> Loading…
        </p>
      ) : list.error ? (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
            <span>{errorSentence(list.error)}</span>
            <Button size='sm' variant='outline' onClick={() => list.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No bank account or paying trust was changed in the last {days} days.</p>
      ) : (
        <>
          {total > rows.length && (
            <p className='mb-2 text-sm font-medium text-foreground' data-testid='pay-destination-cap'>
              Showing the newest {rows.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} changes in the last {days} days.
            </p>
          )}
          <ul className='divide-y divide-border text-sm'>
            {rows.map((c) => (
              <li key={c.change_id} className='py-2' data-testid='pay-destination-change'>
                <p className='font-medium text-foreground'>{personLabel(c)}</p>
                <p className='text-muted-foreground'>
                  {describeChange(c)}. By {c.changed_by_name}, {when(c.changed_at)}.
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
