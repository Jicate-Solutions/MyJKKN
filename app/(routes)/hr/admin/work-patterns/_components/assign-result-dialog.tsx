'use client';

/**
 * Shows what fn_hr_assign_work_pattern actually did: who moved, what their
 * leave figures changed to, and whether the attendance recompute that
 * follows an assignment succeeded.
 */

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AssignWorkPatternOutcome } from '@/hooks/hr/use-work-patterns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcome: AssignWorkPatternOutcome | null;
}

export function AssignResultDialog({ open, onOpenChange, outcome }: Props) {
  if (!outcome) return null;
  const { result, recompute, recomputeError } = outcome;

  const heading = result.removed
    ? `${result.staff_count} staff removed from ${result.staff[0]?.previous_pattern ?? 'their pattern'} from ${result.effective_from}`
    : `${result.staff_count} staff assigned to ${result.pattern_name ?? 'the pattern'} from ${result.effective_from}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="divide-y rounded-md border">
            {result.staff.map((s) => (
              <div key={s.staff_id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {s.name}
                    {s.staff_code && (
                      <span className="ml-1 font-normal text-muted-foreground">({s.staff_code})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Previously: {s.previous_pattern ?? '—'}
                  </p>
                </div>
                {s.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.changes.map((c) => (
                      <span
                        key={`${c.leave_type_code}-${c.year_name}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                      >
                        {c.leave_type_code} {c.from} → {c.to} ({c.year_name})
                        {c.overridden && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-100 text-[10px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
                          >
                            override applies
                          </Badge>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {recomputeError ? (
            <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Assignment saved, but recomputing past attendance failed: {recomputeError}
              </AlertDescription>
            </Alert>
          ) : recompute ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {recompute.changed > 0
                  ? `${recompute.changed} attendance day(s) re-judged.`
                  : `${recompute.examined} attendance day(s) re-checked, none changed.`}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Attendance will follow the pattern from {result.effective_from}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
