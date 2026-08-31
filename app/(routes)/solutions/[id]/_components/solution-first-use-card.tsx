'use client';

/**
 * FIRST REAL USE — the one checkpoint on this solution's own page.
 *
 * The producing department works here, which is the whole reason the control
 * lives on the solution rather than in an accreditation screen: the people who
 * know a real user turned up are the people who built the thing (Director
 * decision #5), and asking them to go somewhere else to say so is how a
 * register ends up empty.
 *
 * ONCE, EVER. When an entry exists this card SHOWS it and offers no way to
 * record another. That is a courtesy, not the guarantee — the guarantee is the
 * UNIQUE constraint on `sh_solution_first_use.solution_id`, so a second tab or a
 * double submit collides in the database rather than producing a second "first"
 * use. `firstUseErrorMessage` translates that collision into the one sentence
 * that actually helps: somebody already recorded it, reload.
 *
 * NOT A USAGE COUNTER. This card never says how many times the solution has
 * been used, and it must not grow into that: counting uses is a different
 * feature with different plumbing, and a half-built counter is worse than no
 * counter because it reads as a measurement.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSolutionFirstUse,
  useRecordFirstUse,
  firstUseErrorMessage,
} from '@/hooks/solutions/use-solution-first-use';

/** A date cannot be in the future: a first use is something that happened. */
const today = () => format(new Date(), 'yyyy-MM-dd');

export function SolutionFirstUseCard({ solutionId }: { solutionId: string }) {
  const { data: entry, isLoading, isError, error } = useSolutionFirstUse(solutionId);
  const record = useRecordFirstUse(solutionId);

  const [open, setOpen] = useState(false);
  const [usedOn, setUsedOn] = useState(today());
  const [usedBy, setUsedBy] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    if (!usedBy.trim()) {
      setFormError('Say who used it. A name, a department, an office — anything a reader could follow up.');
      return;
    }
    if (!usedOn) {
      setFormError('Give the date it first happened.');
      return;
    }
    if (usedOn > today()) {
      setFormError('That date is in the future. A first use is something that has already happened.');
      return;
    }
    try {
      await record.mutateAsync({ used_on: usedOn, used_by: usedBy.trim(), note });
      setOpen(false);
      setUsedBy('');
      setNote('');
    } catch (e) {
      setFormError(firstUseErrorMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          First real use
        </CardTitle>
        <CardDescription>
          Recorded once, by the department that produced this solution, the first
          time somebody outside the team used it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">This could not be read.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing here is known either way — this is a fault in the read, not
              a statement about the solution. {String((error as Error)?.message ?? '')}
            </p>
          </div>
        ) : entry ? (
          // The entry exists, so this branch shows it and offers nothing to
          // press. One entry per solution, ever.
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Used by {entry.used_by}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              First used on {format(new Date(entry.used_on), 'dd MMM yyyy')}.
            </p>
            {entry.note ? (
              <p className="mt-2 whitespace-pre-wrap text-sm">{entry.note}</p>
            ) : null}
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              This is recorded once and does not change. To correct it, ask an
              administrator.
            </p>
          </div>
        ) : (
          <>
            {/* Not "0 uses" — nothing has been recorded, which is a different
                statement and the only honest one. */}
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet. This does not mean nobody has used it; it
              means nobody has said so here.
            </p>
            <Button size="sm" onClick={() => setOpen(true)}>
              Record the first real use
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFormError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record the first real use</DialogTitle>
            <DialogDescription>
              This is recorded once for this solution and cannot be entered
              again, so record the first time it happened rather than the most
              recent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="first-use-by">Who used it</Label>
              <Input
                id="first-use-by"
                value={usedBy}
                onChange={(e) => setUsedBy(e.target.value)}
                placeholder="A department, an office, a partner organisation"
              />
              <p className="text-xs text-muted-foreground">
                Free text on purpose — the first real user is often not somebody
                this platform holds a record of.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="first-use-on">When it first happened</Label>
              <Input
                id="first-use-on"
                type="date"
                max={today()}
                value={usedOn}
                onChange={(e) => setUsedOn(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="first-use-note">What they did with it (optional)</Label>
              <Textarea
                id="first-use-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="One or two lines a reader could follow up on"
              />
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={record.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={record.isPending}>
              {record.isPending ? 'Recording…' : 'Record it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
