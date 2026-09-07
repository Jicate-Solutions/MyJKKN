'use client';

// School of Influence — folding a batch that is too small to run.
// Director decision 2026-08-02.
//
// THE PLAN IS AUTOMATIC. THE MOVE IS NOT, AND THAT IS THE WHOLE DESIGN.
// Opening this screen works out what should happen and shows it. It moves
// nobody. Every fold needs one person to press Confirm on that specific fold,
// having read the names on it. The same Director requires the inactivity engine
// to act on nobody without review, and a merge is a stronger case for the same
// rule: inactivity acts on somebody because of what they did, a merge acts on
// somebody who did nothing but apply to a batch that turned out quiet.
//
// NO NUMBER ON THIS SCREEN IS WRITTEN IN THIS FILE. The threshold, the capacity,
// the headcounts and the reasons are rendered exactly as the database resolved
// them, so the screen always shows the figures the fold was actually judged
// against.
//
// THE COORDINATOR CAN OVERRIDE AND EXCLUDE. Any batch can be left out of the
// plan with a tick, which re-plans without it. The destination of any fold can be
// changed to another batch with room. An overridden fold is audited and announced
// exactly like a recommended one.
//
// A PARTIAL RUN IS SHOWN AS A PARTIAL RUN. There is no bulk transfer in the
// spine, so a fold is one move per person. If three of six move and then a
// failure stops the rest, that is what the screen says — and if the receipt
// itself fails after people have moved, a loud panel says so and offers to write
// it again rather than leaving anybody moved without being told.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27): a 403 renders a named
// access panel, never a redirect and never an empty list where a refusal belongs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  Info,
  Loader2,
  RefreshCw,
  Undo2,
  Users,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import {
  SoiMergeService,
  type SoiMergeBatch,
  type SoiMergeLogEntry,
  type SoiMergeOutcome,
  type SoiMergePlan,
  type SoiMergeProposal,
} from '@/lib/services/school-of-influence/merge-service';

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function isDenied(error: unknown): boolean {
  return (error as { status?: number })?.status === 403;
}

function whenText(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Explicit refusal panel — never a redirect, never an empty list (rule 27). */
function AccessPanel({ message }: { message: string }) {
  return (
    <Card className="mt-4 border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> You do not have access
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

interface Props {
  /** Programme event whose batches this screen plans over. */
  eventId: string | null;
}

export function MergeWorkspace({ eventId }: Props) {
  const [plan, setPlan] = useState<SoiMergePlan | null>(null);
  const [log, setLog] = useState<SoiMergeLogEntry[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SoiMergeOutcome | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setDenied(null);
    try {
      // The plan RPC is STABLE and writes nothing, so opening this screen never
      // moves anybody and never records anything.
      const next = await SoiMergeService.plan(eventId, excluded);
      setPlan(next);
      const ids = next.batches.map((b) => b.cohort_id);
      setLog(ids.length > 0 ? await SoiMergeService.listMergeEvents(ids) : []);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setPlan(null);
      setLog([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, excluded]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const batches = useMemo(() => plan?.batches ?? [], [plan]);
  const proposals = useMemo(() => plan?.proposals ?? [], [plan]);

  /** Batches that could take people, for the destination override picker. */
  const destinationChoices = useCallback(
    (proposal: SoiMergeProposal): SoiMergeBatch[] =>
      batches.filter(
        (b) =>
          b.cohort_id !== proposal.from_cohort_id &&
          b.can_receive &&
          b.free_seats >= proposal.moving_count
      ),
    [batches]
  );

  const toggleExcluded = useCallback((cohortId: string, on: boolean) => {
    setExcluded((current) =>
      on ? Array.from(new Set([...current, cohortId])) : current.filter((id) => id !== cohortId)
    );
  }, []);

  const confirm = useCallback(
    async (proposal: SoiMergeProposal) => {
      setRunning(proposal.from_cohort_id);
      setOutcome(null);
      try {
        const result = await SoiMergeService.confirmMerge(proposal, {
          destinationOverride: overrides[proposal.from_cohort_id] ?? null,
        });
        setOutcome(result);
        if (result.failed.length > 0) {
          toast.warning(
            `${result.moved.length} moved, ${result.failed.length} could not be moved.`
          );
        } else if (result.receipt_failed) {
          toast.error('Everybody was moved, but the record and the notice failed.');
        } else {
          toast.success(`${result.moved.length} moved and told.`);
        }
        await refresh();
      } catch (error) {
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(messageOf(error));
      } finally {
        setRunning(null);
      }
    },
    [overrides, refresh]
  );

  /**
   * Put ONE person back where they applied. The merge record carries the batch
   * they came from, so this needs no extra state and works months later — which
   * is the whole reason the record names both batches.
   */
  const undo = useCallback(
    async (entry: SoiMergeLogEntry) => {
      if (!entry.membership_id || !entry.from_cohort_id || !entry.to_cohort_id) return;
      setRunning(entry.id);
      try {
        const result = await SoiMergeService.undoMove({
          membershipId: entry.membership_id,
          fullName: entry.member_name ?? 'This person',
          currentCohortId: entry.to_cohort_id,
          originalCohortId: entry.from_cohort_id,
          originalBatchName: entry.from_batch_name ?? 'their original batch',
        });
        if (result.failed.length > 0) toast.error(result.failed[0].message);
        else if (result.receipt_failed) toast.error(result.receipt_error ?? 'Moved, but not recorded.');
        else toast.success('Moved back, and they have been told.');
        await refresh();
      } catch (error) {
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(messageOf(error));
      } finally {
        setRunning(null);
      }
    },
    [refresh]
  );

  const retryReceipt = useCallback(async () => {
    if (!outcome) return;
    setRunning(outcome.from_cohort_id);
    try {
      const result = await SoiMergeService.record({
        runId: outcome.run_id,
        fromCohortId: outcome.from_cohort_id,
        toCohortId: outcome.to_cohort_id,
        moved: outcome.moved,
        failed: outcome.failed,
      });
      setOutcome(result);
      if (result.receipt_failed) toast.error(result.receipt_error ?? 'Still could not be written.');
      else toast.success(`Recorded. ${result.notified} person(s) told.`);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setRunning(null);
    }
  }, [outcome]);

  if (denied) return <AccessPanel message={denied} />;

  if (!eventId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Pick a programme</CardTitle>
          <CardDescription>
            Open this screen from the School of Influence admin, or add{' '}
            <code>?event=&lt;programme event id&gt;</code> to the address to plan over
            that programme&apos;s batches.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-check
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !plan ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to show</CardTitle>
            <CardDescription>
              The plan could not be read for this programme. Try Re-check.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* ── What this screen is, in plain words, on every load. ─────── */}
          <Card className="border-slate-200 bg-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4 text-slate-600" /> Nothing here has happened yet
              </CardTitle>
              <CardDescription>
                This is what <strong>would</strong> happen. No one has been moved. Each
                fold below needs you to press Confirm on it, and everybody moved is told
                in their own notifications the moment they are.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {plan.attendance_note}
            </CardContent>
          </Card>

          {/* ── The one case where folding is a programme-level decision. ─ */}
          {plan.all_under_strength && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                  <AlertTriangle className="h-4 w-4" /> Every batch is under strength
                </CardTitle>
                <CardDescription className="text-amber-900">
                  {plan.combined_clears_threshold
                    ? `No batch of this programme has enough people on its own. Put together they come to ${plan.combined_headcount}, which does clear the bar — so folding them is a real fix, but it collapses the programme into fewer groups. That is a decision for the programme, not a tidy-up.`
                    : `No batch of this programme has enough people, and even all ${plan.combined_headcount} of them together do not clear the bar. Folding will not fix that. Extending intake, or running the programme smaller on purpose, is the decision in front of you.`}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* ── Every batch, measured. Tick to leave one out of the plan. ─ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> The batches
              </CardTitle>
              <CardDescription>
                Taking part counts the people who would be in the room. Seats counts
                everybody holding a place, which is what the capacity is measured
                against. Tick a batch to leave it out of the plan entirely.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {batches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This programme has no batches you can run.
                </p>
              )}
              {batches.map((batch) => (
                <div
                  key={batch.cohort_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm"
                >
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={excluded.includes(batch.cohort_id)}
                      onCheckedChange={(value) =>
                        toggleExcluded(batch.cohort_id, value === true)
                      }
                      aria-label={`Leave ${batch.name} out of the plan`}
                    />
                    <span className="font-medium">{batch.name}</span>
                  </label>
                  <span className="text-muted-foreground">
                    {batch.headcount} taking part · {batch.occupied_seats}/{batch.capacity}{' '}
                    seats
                  </span>
                  {batch.invited_count > 0 && (
                    <span className="text-muted-foreground">
                      {batch.invited_count} invitation(s) not answered
                    </span>
                  )}
                  {batch.under_strength ? (
                    <Badge className="border-amber-200 bg-amber-100 text-amber-900">
                      Under {batch.min_viable}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Worth running
                    </Badge>
                  )}
                  {!batch.intake_closed && (
                    <Badge variant="outline">Intake still open — never folded</Badge>
                  )}
                  {excluded.includes(batch.cohort_id) && (
                    <Badge variant="outline">Left out of the plan</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── The folds. Each one confirmed on its own. ───────────────── */}
          {proposals.map((proposal) => {
            const choices = destinationChoices(proposal);
            const chosen = overrides[proposal.from_cohort_id] ?? proposal.to_cohort_id;
            const chosenName =
              choices.find((c) => c.cohort_id === chosen)?.name ?? proposal.to_name;
            const busy = running === proposal.from_cohort_id;
            return (
              <Card key={proposal.from_cohort_id} className="border-blue-200">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {proposal.from_name}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    {chosenName}
                    <Badge variant="outline">{proposal.moving_count} moving</Badge>
                  </CardTitle>
                  <CardDescription>{proposal.reason}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Move them into</span>
                    <Select
                      value={chosen}
                      onValueChange={(value) =>
                        setOverrides((current) => ({
                          ...current,
                          [proposal.from_cohort_id]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Choose a batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {choices.map((choice) => (
                          <SelectItem key={choice.cohort_id} value={choice.cohort_id}>
                            {choice.name} — {choice.free_seats} seat(s) free
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">
                      {proposal.to_name} would go from {proposal.to_headcount} to{' '}
                      {proposal.to_headcount_after}, leaving{' '}
                      {proposal.to_free_seats_after} seat(s) free
                    </span>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-medium">Who moves</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {proposal.movers.map((mover) => (
                        <li key={mover.membership_id}>
                          {mover.full_name}{' '}
                          <span className="text-xs">({mover.membership_status})</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {proposal.left_behind.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-medium">
                        Who stays in {proposal.from_name}
                      </p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {proposal.left_behind.map((person) => (
                          <li key={person.membership_id}>
                            {person.full_name} — {person.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button
                    onClick={() => void confirm(proposal)}
                    disabled={busy || proposal.moving_count === 0}
                  >
                    {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Confirm this move — {proposal.moving_count} person(s) will be told
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {/* ── Under strength but nowhere to go. Never silent. ─────────── */}
          {plan.blocked.map((blocked) => (
            <Card key={blocked.from_cohort_id} className="border-amber-200">
              <CardHeader>
                <CardTitle className="text-base">
                  {blocked.from_name} is too small, and cannot be folded
                </CardTitle>
                <CardDescription>{blocked.reason}</CardDescription>
              </CardHeader>
            </Card>
          ))}

          {!plan.has_proposals && plan.blocked.length === 0 && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
                  <CheckCircle2 className="h-4 w-4" /> Nothing needs folding
                </CardTitle>
                <CardDescription className="text-emerald-900">
                  No batch of this programme is below its own minimum with its intake
                  already closed, so nobody needs to be moved.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* ── What just happened, including the halfway cases. ────────── */}
          {outcome && (
            <Card
              className={
                outcome.receipt_failed || outcome.failed.length > 0
                  ? 'border-red-300 bg-red-50'
                  : 'border-emerald-200 bg-emerald-50'
              }
            >
              <CardHeader>
                <CardTitle className="text-base">
                  {outcome.moved.length} person(s) moved
                </CardTitle>
                <CardDescription>
                  {outcome.receipt_failed
                    ? outcome.receipt_error
                    : `${outcome.notified} person(s) have been told in their notifications.` +
                      (outcome.audit_backfilled > 0
                        ? ` ${outcome.audit_backfilled} audit row(s) had to be repaired.`
                        : '')}
                </CardDescription>
              </CardHeader>
              {(outcome.failed.length > 0 || outcome.receipt_failed) && (
                <CardContent className="space-y-2 text-sm">
                  {outcome.failed.map((failure) => (
                    <p key={failure.membership_id}>
                      {failure.full_name} was not moved — {failure.message}
                    </p>
                  ))}
                  {outcome.receipt_failed && (
                    <Button size="sm" variant="outline" onClick={() => void retryReceipt()}>
                      Write the record and tell them
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* ── The record. Also how somebody is put back. ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> What has already been folded
              </CardTitle>
              <CardDescription>
                Every move is recorded here, so anybody can be told why they are in the
                batch they are in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {log.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No batch of this programme has been folded yet.
                </p>
              )}
              {log.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {entry.undo ? (
                        <>
                          <Undo2 className="mr-1 h-3 w-3" /> Moved back
                        </>
                      ) : (
                        'Folded'
                      )}
                    </Badge>
                    <span className="text-muted-foreground">{whenText(entry.created_at)}</span>
                    {entry.member_name && (
                      <span className="font-medium">{entry.member_name}</span>
                    )}
                    {entry.audit_backfilled && (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-900">
                        Record repaired
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">{entry.reason}</p>
                  {!entry.undo &&
                    entry.membership_id &&
                    entry.from_cohort_id &&
                    entry.to_cohort_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={running === entry.id}
                        onClick={() => void undo(entry)}
                      >
                        {running === entry.id && (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        )}
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                        Move back to {entry.from_batch_name ?? 'their original batch'}
                      </Button>
                    )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
