'use client';

// School of Influence — the control that moves a batch from one stage to the next.
//
// WHY THIS EXISTS. public.cohort_status_events has carried the full audit shape
// since the cohort spine shipped — from_status, to_status, actor_id, reason —
// and held ZERO rows, because no screen anywhere moved a cohort's stage.
// Measured on production 2026-09-07: 10 cohorts, 392 memberships, 0 status
// events, and all three School of Influencer batches still saying "enrolling"
// although intake ends 12 September. A table built to record a decision that
// nobody can make is not an audit trail; it is an empty promise.
//
// A STAGE CHANGE IS A HUMAN DECISION, AND IT ALWAYS ASKS WHY. There is no
// automatic advance here and none anywhere else: nothing moves a batch on a
// date, and the reason is required by the form AND by the database
// (fn_cohort_set_status), so a change made by any future screen still lands
// with a reason attached.
//
// THE VERDICT COMES FROM THE DATABASE, NOT FROM A PERMISSION KEY READ HERE.
// fn_cohort_status_control returns can_change, and this component renders
// whatever comes back. Gating the button on a key in the browser is how a
// screen ends up NARROWER than the write it guards — it would lock out the
// coordinator this platform appointed to run the batch, who holds no permission
// key at all but whom the database plainly admits.
//
// NOTHING HERE DECIDES ANY PARTICULAR BATCH'S FATE. Which batch closes, when,
// and why is the coordinator's call. This file only makes the call possible and
// keeps the record of it.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27): a refusal renders a
// sentence saying who to ask, never a hidden button and never a blank history —
// an empty log and a refused read look identical, and only one of them is true.

import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, History, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { CohortService } from '@/lib/services/cohort-core/cohort-service';
import type { CohortStatus, CohortStatusControl } from '@/lib/types/cohort-core';

/**
 * The five stages in plain words. The stored value is shown next to the label
 * wherever the two could be confused, so what is on screen and what is in the
 * database can always be matched up.
 */
const STAGE_LABEL: Record<string, string> = {
  draft: 'Not open yet',
  enrolling: 'Taking applications',
  active: 'Running',
  completed: 'Finished',
  archived: 'Archived',
};

function stageLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return STAGE_LABEL[status] ?? status;
}

/** What each move does, said as the person deciding would say it. */
const MOVE: Record<
  string,
  { action: string; Icon: typeof PlayCircle; meaning: string; warning?: string }
> = {
  enrolling: {
    action: 'Open for applications',
    Icon: PlayCircle,
    meaning: 'People can apply and be accepted into this batch.',
  },
  active: {
    action: 'Start the batch',
    Icon: PlayCircle,
    meaning:
      'Intake is over and the batch is running. Nobody new is expected — the people in it now are the batch.',
  },
  completed: {
    action: 'Mark this round finished',
    Icon: CheckCircle2,
    meaning: 'The round is over. The batch and everyone in it stay on the record.',
  },
  archived: {
    action: 'Archive this batch',
    Icon: Archive,
    meaning: 'The batch is closed and put away. Nothing is deleted.',
    warning:
      'Archiving is the last stage. There is no move out of it, so a batch you archive cannot be reopened from this screen. And if this is the LAST batch of the programme still open, archiving it also closes these screens to you: an appointed coordinator reaches School of Influence through its open batches, so once none is open you will see "you do not have permission" here and only a MyJKKN administrator can let you back in. Archive the last batch only when the programme is genuinely finished.',
  },
};

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function whenText(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

interface Props {
  /** The batch this card acts on. */
  cohortId: string;
  /** Shown in the heading and the confirmation, so it is clear which batch. */
  cohortName: string;
  /**
   * The stage on the cohort row the parent already read. Used only to show the
   * stage when the caller may not change it — the database's own answer wins
   * whenever it gives one.
   */
  fallbackStatus: CohortStatus | null;
  /** Called after a successful change so the parent can re-read the batch. */
  onChanged?: () => void;
}

export function BatchStatusCard({
  cohortId,
  cohortName,
  fallbackStatus,
  onChanged,
}: Props) {
  const [control, setControl] = useState<CohortStatusControl | null>(null);
  const [loading, setLoading] = useState(true);
  // A read that FAILED is not "you may not change this". Kept apart so the card
  // can say which of the two happened.
  const [problem, setProblem] = useState<string | null>(null);

  const [target, setTarget] = useState<CohortStatus | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      setControl(await CohortService.getStatusControl(cohortId));
    } catch (error) {
      setProblem(messageOf(error));
      setControl(null);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useCallback(async () => {
    if (!target || reason.trim().length === 0) return;
    setSaving(true);
    try {
      const result = await CohortService.transitionCohortStatus(cohortId, target, {
        reason,
      });
      toast.success(result.message);
      setTarget(null);
      setReason('');
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setSaving(false);
    }
  }, [cohortId, load, onChanged, reason, target]);

  if (loading && !control) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  const status = control?.status ?? fallbackStatus;
  const canChange = control?.canChange === true;
  const nextStatuses = control?.nextStatuses ?? [];
  const history = control?.history ?? [];
  const move = target ? MOVE[target] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              Stage of this batch
              <Badge variant="secondary" className="text-[10px] font-normal">
                {stageLabel(status)}
              </Badge>
            </CardTitle>
            <CardDescription>
              A batch moves from taking applications, to running, to finished — and
              somebody decides each move. Nothing here happens on its own, and every
              move asks you to write why.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* A read that failed is not a refusal, and saying so is the difference
            between "ask an administrator" and "try again". */}
        {problem && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            The stage of this batch could not be read: {problem} Nothing has changed.
            Try again, and tell a MyJKKN administrator if it keeps happening.
          </p>
        )}

        {!problem && !canChange && (
          <p className="text-sm text-muted-foreground">
            You can see which stage this batch is at, but you cannot change it.
            Changing a batch&rsquo;s stage needs the &ldquo;cohort.edit&rdquo; permission
            for the institution that runs the programme, or &ldquo;cohort.manage&rdquo;,
            or an appointment as one of the programme&rsquo;s coordinators. Ask the COO
            or a MyJKKN administrator.
          </p>
        )}

        {canChange && nextStatuses.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This batch is at its last stage, so there is no move left to make. Its
            record stays exactly as it is.
          </p>
        )}

        {canChange && nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((next) => {
              const option = MOVE[next];
              const Icon = option?.Icon ?? PlayCircle;
              return (
                <Button
                  key={next}
                  size="sm"
                  variant={next === 'archived' ? 'outline' : 'default'}
                  onClick={() => {
                    setTarget(next);
                    setReason('');
                  }}
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  {option?.action ?? `Move to ${next}`}
                </Button>
              );
            })}
          </div>
        )}

        {/* The record. This is what the whole control is for: the change, who
            made it, and the reason they wrote, readable back on the same screen
            rather than buried in a table nobody opens. */}
        {canChange && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" /> Stage changes
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stage change has been recorded for this batch yet. The first one you
                make appears here, with your name and the reason you write.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Reason given</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {whenText(entry.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {stageLabel(entry.from_status)} &rarr;{' '}
                          <span className="font-medium">{stageLabel(entry.to_status)}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.actor_name ?? (
                            <span className="text-muted-foreground">
                              Name not on record
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[26rem] text-sm">
                          {entry.reason ? (
                            <span>&ldquo;{entry.reason}&rdquo;</span>
                          ) : (
                            <span className="text-muted-foreground">
                              No reason was recorded
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* The reason is required in the form as well as in the database, so the
          person is told what is missing before a round trip, not after one. */}
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setTarget(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{move?.action ?? 'Change the stage'}</DialogTitle>
            <DialogDescription>
              {cohortName} moves from <strong>{stageLabel(status)}</strong> to{' '}
              <strong>{stageLabel(target)}</strong>. {move?.meaning}
            </DialogDescription>
          </DialogHeader>

          {move?.warning && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              {move.warning}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="stage-reason">Why are you making this change?</Label>
            <Textarea
              id="stage-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="For example: intake closed on 12 September and everyone accepted has been added."
            />
            <p className="text-xs text-muted-foreground">
              Your name, the date, and this reason are kept with the change. Anyone
              reading the batch later can see who decided and why.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTarget(null);
                setReason('');
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={saving || reason.trim().length === 0}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {move?.action ?? 'Change the stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
