'use client';

/**
 * A pattern's working days — the ONLY thing a pattern configures about the
 * week. Hours come from each member's own Shift Timings row; the pattern
 * switches days off. It can never add a day the institution's week does not
 * work, because there would be no hours for it.
 *
 * Effective-dated, like a shift week: saving takes an "Effective from" date and
 * the RPC closes the previous days row at that date (or rewrites it when
 * backdating), so a later change never re-judges months already closed.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, getErrorMessage } from '@/lib/utils';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import { DAY_OF_WEEK_OPTIONS, type IsoDayOfWeek } from '@/types/hr-shift-timings';
import {
  useInstitutionWorkingDays,
  useSetWorkPatternDays,
  useWorkPatternDays,
} from '@/hooks/hr/use-work-patterns';
import type { WorkPatternSummary } from '@/types/hr-work-patterns';

interface Props {
  pattern: WorkPatternSummary;
  institutionId: string;
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' by string split, so no viewer timezone can shift it. */
function formatDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function WorkingDaysTab({ pattern, institutionId }: Props) {
  const { data: current, isLoading: daysLoading } = useWorkPatternDays(pattern.id);
  const { data: institutionDays = [], isLoading: instLoading } = useInstitutionWorkingDays(institutionId);
  const setDays = useSetWorkPatternDays();

  const [selected, setSelected] = useState<Set<IsoDayOfWeek>>(new Set());
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());

  // Seed once per pattern, during render (react-hooks/set-state-in-effect):
  // the days in force today, or — for a pattern with none yet — the
  // institution's own week, so "5-day" is one untick away from Mon–Sat.
  const ready = !daysLoading && !instLoading;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (ready && seededFor !== pattern.id) {
    setSeededFor(pattern.id);
    setSelected(new Set(current?.working_days ?? institutionDays));
  }

  const toggle = (day: IsoDayOfWeek) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const isScheduledChange = effectiveFrom > todayISO();

  const handleSave = async () => {
    const days = Array.from(selected).sort((a, b) => a - b);
    if (days.length === 0) {
      toast.error('Pick at least one working day.');
      return;
    }
    try {
      const outcome = await setDays.mutateAsync({
        patternId: pattern.id,
        institutionId,
        workingDays: days,
        effectiveFrom,
      });
      if (isScheduledChange) {
        toast.success(`Working days scheduled from ${formatDMY(effectiveFrom)}`);
      } else if (outcome.recomputeError) {
        // The days ARE saved; only the re-judging failed.
        toast.warning(
          `Working days saved, but recomputing past attendance failed: ${outcome.recomputeError}`,
        );
      } else if (outcome.recompute && outcome.recompute.changed > 0) {
        toast.success(
          `Working days saved — ${outcome.recompute.changed} attendance day(s) recomputed`,
        );
      } else if (outcome.recompute) {
        toast.success(
          `Working days saved — ${outcome.recompute.examined} attendance day(s) re-checked, none changed`,
        );
      } else {
        toast.success('Working days saved');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!ready) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  const count = selected.size;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Hours come from each member&apos;s Shift Timings (teaching, non-teaching or
        category week). A pattern switches days <strong>off</strong>; a day the
        institution&apos;s week does not work stays off for its members whatever is
        ticked here.
      </p>

      <div>
        <Label>Working days</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAY_OF_WEEK_OPTIONS.map((d) => {
            const on = selected.has(d.value);
            const institutionWorks = institutionDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(d.value)}
                title={
                  institutionWorks
                    ? d.label
                    : `${d.label} — the institution's week does not work this day`
                }
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/50',
                  !institutionWorks && 'border-dashed opacity-60',
                )}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {count} day{count === 1 ? '' : 's'} a week
          {institutionDays.length > 0 && (
            <>
              {' '}· the institution works{' '}
              {institutionDays
                .map((v) => DAY_OF_WEEK_OPTIONS.find((o) => o.value === v)?.short ?? v)
                .join(', ')}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="wp-days-effective-from">Effective from</Label>
          <Input
            id="wp-days-effective-from"
            type="date"
            className="mt-1 w-44"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={setDays.isPending || count === 0}>
          {setDays.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save working days
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {current ? (
          <>
            In force since {formatDMY(current.effective_from)}. Saving from an earlier date rewrites
            that rule; a later date schedules a change and keeps the earlier days for the days before it.
          </>
        ) : (
          <>No working days saved yet — the ticks above start from the institution&apos;s week.</>
        )}
      </p>
    </div>
  );
}
