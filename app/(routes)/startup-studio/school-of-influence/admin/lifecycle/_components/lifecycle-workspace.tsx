'use client';

// School of Influence — inactivity dry-run list (spec §5, §7 S7).
//
// D8 — remind → pause → remove, SHIPPED DELIBERATELY DISABLED. This screen is
// the inspection surface spec §5 point 3 requires: it shows who the engine WOULD
// act on, so the Director can judge the verdicts BEFORE anything is armed.
//
// THERE IS NO ACTION CONTROL ON THIS SCREEN, and that is the design. Every
// button here re-reads. Nothing sends a reminder, pauses access or removes
// anybody, because the engine has no action step to trigger yet.
//
// THE BANNER IS NOT DECORATION. SF100 carried inactivity settings that never
// fired once and nobody noticed for four months. So the state of the engine is
// stated at the top of the screen in plain words on every load — including the
// case where somebody has switched the master flag ON while this build still has
// no action step, which is shown as a LOUD warning rather than a green tick.
//
// NO THRESHOLD IS STATED IN THIS FILE. The reminder / pause / removal day counts
// and the marks that count as attending are rendered exactly as the database
// resolved them for this batch, so the screen always shows the numbers the
// database actually judged against.
//
// UNTRACKABLE MEMBERS GET THEIR OWN SECTION, NEVER THE ACTION LIST. The register
// stores marks against a learner record; a member admitted as a team member has
// none, so no attendance row can exist for them. They are listed separately with
// the reason spelled out — never counted as quiet, never proposed for removal.
// The type makes that structural: the untrackable variant of SoiInactivityRow has
// no days_quiet and no actionable verdict, so this component cannot render one
// even if the database sent one.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27): a 403 renders a named
// access panel, never a redirect and never an empty list where a refusal belongs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  History,
  Info,
  PauseCircle,
  RefreshCw,
  ShieldOff,
  UserMinus,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { SoiBatchService } from '@/lib/services/school-of-influence/batch-service';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';
import {
  isSoiTrackable,
  isSoiUntrackable,
  SoiLifecycleService,
  soiVerdictLabel,
  summariseSoiInactivity,
  type SoiInactivityLogEntry,
  type SoiInactivityPreview,
} from '@/lib/services/school-of-influence/lifecycle';
import type { Cohort } from '@/lib/types/cohort-core';

/** The three actionable verdicts, in escalation order, with their presentation. */
const ACTION_SECTIONS = [
  {
    verdict: 'remove' as const,
    title: 'Would be removed from the batch',
    Icon: UserMinus,
    style: 'border-red-200',
    badge: 'bg-red-100 text-red-800 border-red-200',
  },
  {
    verdict: 'pause' as const,
    title: 'Would have access paused',
    Icon: PauseCircle,
    style: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  {
    verdict: 'nudge' as const,
    title: 'Would get a reminder',
    Icon: BellRing,
    style: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

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
  /** Programme event whose batches this screen offers. */
  eventId: string | null;
  /** Deep-linked batch, if the coordinator arrived from the batch admin. */
  initialCohortId: string | null;
}

export function LifecycleWorkspace({ eventId, initialCohortId }: Props) {
  const [batches, setBatches] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState<string | null>(initialCohortId);
  const [preview, setPreview] = useState<SoiInactivityPreview | null>(null);
  const [log, setLog] = useState<SoiInactivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  // Batch list. Reuses SoiBatchService (S3) rather than re-querying cohorts:
  // one lister, one definition of "a batch of this programme".
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    SoiBatchService.listBatches(eventId)
      .then((rows) => {
        if (cancelled) return;
        setBatches(rows);
        setCohortId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(`Couldn't load the batches: ${messageOf(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const refresh = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setDenied(null);
    try {
      // The preview RPC is STABLE and writes nothing, so opening this screen
      // never records a run or triggers the engine.
      const [previewResult, logRows] = await Promise.all([
        SoiLifecycleService.preview(cohortId),
        SoiLifecycleService.listRecordedEvents(cohortId),
      ]);
      setPreview(previewResult);
      setLog(logRows);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setPreview(null);
      setLog([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Memoised so the empty-array fallback does not produce a new reference on
  // every render and invalidate the two derivations below.
  const members = useMemo(() => preview?.members ?? [], [preview]);
  const summary = useMemo(() => summariseSoiInactivity(members), [members]);

  const untrackable = useMemo(() => members.filter(isSoiUntrackable), [members]);

  if (denied) return <AccessPanel message={denied} />;

  if (!cohortId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Pick a batch</CardTitle>
          <CardDescription>
            {eventId
              ? 'This programme has no School of Influencer batches yet. Create one from the batch admin, then come back here to see what the inactivity engine would do.'
              : 'Open this screen from a batch in the School of Influencer admin, or add ?event=<programme event id> to the address to choose a batch here.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* ── Batch picker + refresh. No action control exists on this screen. ── */}
      <div className="flex flex-wrap items-center gap-2">
        {batches.length > 0 && (
          <Select value={cohortId} onValueChange={setCohortId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {soiDisplayName(batch.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to show</CardTitle>
            <CardDescription>
              The dry run could not be read for this batch. Try Refresh.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* ── The state of the engine, in plain words, on every load. ──── */}
          {preview.engine_armed ? (
            <Card className="border-red-300 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-900">
                  <ShieldOff className="h-4 w-4" /> The master switch is ON, but this
                  build still cannot act
                </CardTitle>
                <CardDescription className="text-red-900">
                  Somebody has turned <code>soi.inactivity.enabled</code> on for this
                  batch, and this build of the engine has no action step: nobody has
                  been reminded, paused or removed. Turn the switch back off, or ship
                  the action step, so the setting and the behaviour agree.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="border-slate-200 bg-slate-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-4 w-4 text-slate-600" /> Dry run — the engine has
                  taken no action
                </CardTitle>
                <CardDescription>
                  This list is what the inactivity engine <strong>would</strong> do. It
                  has not sent a reminder, paused anybody, or removed anybody, and it
                  cannot: the master switch is off and this build has no action step.
                  Switching it on is a separate decision, made after this list has been
                  read.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-6 gap-y-1 pt-0 text-sm text-muted-foreground">
                <span>
                  Reminder after <strong>{preview.thresholds.nudge_days}</strong> quiet
                  day(s)
                </span>
                <span>
                  Pause after <strong>{preview.thresholds.pause_days}</strong>
                </span>
                <span>
                  Remove after <strong>{preview.thresholds.remove_days}</strong>
                </span>
                <span>
                  Counts as attending:{' '}
                  <strong>{preview.attending_statuses.join(', ') || '—'}</strong>
                </span>
                <span>
                  Sessions held <strong>{preview.sessions_held}</strong> of{' '}
                  {preview.sessions_scheduled}
                </span>
              </CardContent>
            </Card>
          )}

          {/* ── Integrity alarms. Should always be zero; loud when not. ──── */}
          {(summary.integrityWarnings > 0 || summary.illegalMoves > 0) && (
            <Card className="border-red-300 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-900">
                  <AlertTriangle className="h-4 w-4" /> This list disagreed with itself
                </CardTitle>
                <CardDescription className="text-red-900">
                  {summary.integrityWarnings > 0 && (
                    <span className="block">
                      {summary.integrityWarnings} proposal(s) were made for people whose
                      attendance cannot be recorded at all. They have been discarded
                      here. Report this before the engine is armed.
                    </span>
                  )}
                  {summary.illegalMoves > 0 && (
                    <span className="block">
                      {summary.illegalMoves} proposal(s) would move somebody to a status
                      the cohort rules do not allow from where they are now.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* ── The honest empty state. ────────────────────────────────── */}
          {members.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nothing to evaluate yet</CardTitle>
                <CardDescription>
                  {preview.batch_name ? soiDisplayName(preview.batch_name) : 'This batch'} has
                  nobody in it, so there is
                  nobody who could have gone quiet. The engine still records that it
                  ran — an empty result and a run that never happened must never look
                  the same again.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              {/* ── Counts. ────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'In the batch', value: summary.total },
                  { label: 'Would be reminded', value: summary.nudge },
                  { label: 'Would be paused', value: summary.pause },
                  { label: 'Would be removed', value: summary.remove },
                  { label: 'Not measured', value: summary.notTracked },
                ].map((tile) => (
                  <Card key={tile.label}>
                    <CardContent className="p-4">
                      <div className="text-2xl font-semibold">{tile.value}</div>
                      <div className="text-xs text-muted-foreground">{tile.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Who would be acted on, most severe first. ───────────── */}
              {ACTION_SECTIONS.map(({ verdict, title, Icon, style, badge }) => {
                // Narrowed through the guard, so this list can only ever contain
                // measurable members: an untrackable row cannot reach an action
                // section even if the database sent one with that verdict.
                const rows = members
                  .filter(isSoiTrackable)
                  .filter((r) => r.verdict === verdict);
                if (rows.length === 0) return null;
                return (
                  <Card key={verdict} className={style}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4" /> {title}
                        <Badge variant="outline" className={badge}>
                          {rows.length}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Nothing has happened to these people. This is what the engine
                        would do if it were switched on.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {rows.map((row) => (
                        <div
                          key={row.membership_id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{row.full_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {row.membership_status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {soiVerdictLabel(row.verdict)}
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{row.reason}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Quiet for {row.days_quiet} day(s) · last attended{' '}
                            {whenText(row.last_attended_at)}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}

              {/* ── Nobody would be touched. ───────────────────────────── */}
              {summary.nudge + summary.pause + summary.remove === 0 && (
                <Card className="border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Nobody would be
                      acted on
                    </CardTitle>
                    <CardDescription>
                      Every measurable member of this batch is inside the reminder
                      threshold.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              {/* ── Outside the measurement. NOT the action list. ───────── */}
              {untrackable.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Info className="h-4 w-4 text-slate-600" /> Attendance not
                      trackable
                      <Badge variant="outline">{untrackable.length}</Badge>
                    </CardTitle>
                    <CardDescription>
                      No attendance can be recorded for these people, so they have no
                      quiet period and the engine will never propose an action for them.
                      They are listed here rather than hidden — hiding them would look
                      like they had left the batch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {untrackable.map((row) => (
                      <div key={row.membership_id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.full_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {row.membership_status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{row.reason}</p>
                        {row.integrity_warning && (
                          <p className="mt-1 font-medium text-red-700">
                            {row.integrity_warning}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── The receipt SF100 never had. ────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Recorded runs
              </CardTitle>
              <CardDescription>
                Every run leaves a row here, even when it finds nothing — so &ldquo;the
                engine ran and found nobody&rdquo; can never again be mistaken for
                &ldquo;the engine never ran&rdquo;.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The engine has not recorded a run for this batch yet. It records one
                  each time <code>/api/cron/soi-inactivity</code> runs.
                </p>
              ) : (
                <div className="space-y-2">
                  {log.map((entry) => (
                    <div key={entry.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {entry.event_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {whenText(entry.created_at)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {entry.actions_taken} action(s) taken
                        </Badge>
                      </div>
                      {entry.reason && (
                        <p className="mt-1 text-muted-foreground">{entry.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
