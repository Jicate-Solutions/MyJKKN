'use client';

// ============================================================================
// IdCardMorningPage — the one campus-scanning page read each morning.
// Created: 2026-08-14.
//
// Three sections, in the order a morning asks for them:
//   1. What needs a human today   — a ranked exception list, capped at a dozen
//   2. Who is outside right now   — open hostel gate passes
//   3. How much of this we can believe — the coverage / trust meter
//
// Two rules run through all three:
//
//   • An empty section says WHY it is empty. "Nobody is out" and "you cannot
//     read gate passes" and "the read failed" are three different facts and
//     they get three different messages — never one blank panel (CLAUDE.md
//     #27). Gate passes and meal records are gated on campus_living.* keys
//     that an ID-card viewer will not usually hold, and a refused row-level
//     read returns zero rows rather than an error, so the page checks the
//     permission itself and says so.
//
//   • The coverage meter never claims certainty it does not have. It reports
//     what fraction of scans a human could have photo-checked, per college,
//     with the worst college first — because the cluster average hides that
//     one college sits at 26%.
// ============================================================================

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  CameraOff,
  CheckCircle2,
  DoorOpen,
  EyeOff,
  Info,
  Lock,
  RefreshCw,
  ShieldQuestion,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  EXCEPTION_LINE_CAP,
  MORNING_WINDOW_HOURS,
  UNRECORDED_EXCEPTION_CLASSES,
  coverageSpread,
  formatLateness,
  formatPercent,
  hoursBetween,
  measureCluster,
  measureCollege,
  rankExceptions,
  readMorningExceptions,
  readPhotoCoverage,
  readWhoIsOutNow,
  sortCoverageWorstFirst,
  unreadableColleges,
  withReadTimeout,
  type CoverageRow,
  type ExceptionReadout,
  type Measurable,
  type MorningException,
  type WhoIsOutNow,
} from '@/lib/services/id-cards/morning-page-service';

const GATE_PASS_KEY = 'campus_living.gate_passes.view';
const MEAL_RECORD_KEY = 'campus_living.mess.meals.view';

type LoadState = {
  loading: boolean;
  outNow: { ok: true; data: WhoIsOutNow } | { ok: false; message: string } | null;
  exceptions: { ok: true; data: ExceptionReadout } | { ok: false; message: string } | null;
  coverage: { ok: true; data: CoverageRow[] } | { ok: false; message: string } | null;
  refreshedAt: Date | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Small shared pieces
// ──────────────────────────────────────────────────────────────────────────────

function Note({
  tone,
  icon,
  children,
}: {
  tone: 'neutral' | 'warn' | 'good';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      : tone === 'good'
        ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200'
        : 'border-border bg-muted/40 text-muted-foreground';
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function ReadFailed({ message }: { message: string }) {
  return (
    <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
      This section could not be read, so it is blank for a reason that has nothing to do with the
      figures. The database said: <span className="font-mono text-xs">{message}</span>
    </Note>
  );
}

/**
 * Rendered when the signed-in person does not hold the key that gates the
 * underlying table. Row-level security answers a refused read with zero rows,
 * which is indistinguishable from "there is nothing to show" — so the page
 * states the limitation rather than presenting an empty list as reassurance.
 */
function AccessCaveat({ what, permissionKey }: { what: string; permissionKey: string }) {
  return (
    <Note tone="warn" icon={<Lock className="h-4 w-4" />}>
      You do not hold <span className="font-mono text-xs">{permissionKey}</span>, so {what} may be
      incomplete or empty even when there is something to see. Ask an administrator to grant that key
      in Role Management before treating this section as complete.
    </Note>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Exceptions
// ──────────────────────────────────────────────────────────────────────────────

const KIND_ICON: Record<MorningException['kind'], React.ReactNode> = {
  gate_pass_overdue: <DoorOpen className="h-4 w-4 text-red-600 dark:text-red-400" />,
  pass_holder_has_left: <ShieldQuestion className="h-4 w-4 text-red-600 dark:text-red-400" />,
  meal_scanned_for_someone_who_left: (
    <ShieldQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
  ),
  second_open_pass: <DoorOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  scans_without_a_photo_to_check: <CameraOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  card_print_failed: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
};

function ExceptionsSection({
  state,
  canReadPasses,
  canReadMeals,
}: {
  state: LoadState['exceptions'];
  canReadPasses: boolean;
  canReadMeals: boolean;
}) {
  const body = () => {
    if (!state) return <Skeleton className="h-24 w-full" />;
    if (!state.ok) return <ReadFailed message={state.message} />;

    const { shown, hiddenCount } = rankExceptions(state.data.exceptions, EXCEPTION_LINE_CAP);

    return (
      <div className="space-y-3">
        {shown.length === 0 ? (
          <Note tone="good" icon={<CheckCircle2 className="h-4 w-4" />}>
            Nothing on the recorded sources needs a person this morning. Read the note below for what
            those sources cannot see.
          </Note>
        ) : (
          <ul className="divide-y rounded-md border">
            {shown.map((e) => (
              <li key={e.id} className="flex items-start gap-3 p-3">
                <span className="mt-0.5 shrink-0">{KIND_ICON[e.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.headline}</p>
                  <p className="text-sm text-muted-foreground">{e.detail}</p>
                </div>
                {e.occurredAt && (
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.occurredAt), { addSuffix: true })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {hiddenCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {hiddenCount} further item{hiddenCount === 1 ? '' : 's'} ranked below the top{' '}
            {EXCEPTION_LINE_CAP} and {hiddenCount === 1 ? 'is' : 'are'} not listed. This page is a
            morning read, not a log.
          </p>
        )}

        {state.data.mealsTruncated && (
          <Note tone="warn" icon={<Info className="h-4 w-4" />}>
            More meal scans were recorded in this window than this page reads in one go, so the counts
            above are a floor, not a total.
          </Note>
        )}

        {state.data.passesTruncated && (
          <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            More gate passes are open than this page reads in one go. The ones listed are those due
            back earliest, so the count is a floor — there are people outside who are not on this
            page.
          </Note>
        )}

        {state.data.unreadableSources.length > 0 && (
          <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            {state.data.unreadableSources.length === 1 ? 'One source' : 'Some sources'} could not be
            read, so nothing from{' '}
            {state.data.unreadableSources.length === 1 ? 'it' : 'them'} appears above — that is
            silence, not a clean bill of health:{' '}
            <span className="font-mono text-xs">{state.data.unreadableSources.join('; ')}</span>
          </Note>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Needs a person today</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ranked by how much attention each one wants, over the last {MORNING_WINDOW_HOURS} hours.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canReadPasses && <AccessCaveat what="gate-pass problems" permissionKey={GATE_PASS_KEY} />}
        {!canReadMeals && <AccessCaveat what="meal-scan problems" permissionKey={MEAL_RECORD_KEY} />}
        {body()}

        <div className="rounded-md border border-dashed p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <EyeOff className="h-4 w-4" />
            What this list cannot see
          </p>
          <ul className="mt-2 space-y-2">
            {UNRECORDED_EXCEPTION_CLASSES.map((gap) => (
              <li key={gap.title} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{gap.title}.</span> {gap.why}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Who is out now
// ──────────────────────────────────────────────────────────────────────────────

function OutNowSection({
  state,
  canReadPasses,
  now,
}: {
  state: LoadState['outNow'];
  canReadPasses: boolean;
  now: Date;
}) {
  const body = () => {
    if (!state) return <Skeleton className="h-24 w-full" />;
    if (!state.ok) return <ReadFailed message={state.message} />;
    if (state.data.passes.length === 0) {
      return (
        <Note tone="good" icon={<CheckCircle2 className="h-4 w-4" />}>
          Nobody is out. Every gate pass on record has been closed.
        </Note>
      );
    }

    return (
      <div className="space-y-3">
        {state.data.truncated && (
          <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            More passes are open than this page reads in one go. These are the ones due back
            earliest — the list below is a floor, not everyone who is outside.
          </Note>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Who</TableHead>
                <TableHead>Where</TableHead>
                <TableHead className="w-40">Out since</TableHead>
                <TableHead className="w-48">Due back</TableHead>
                <TableHead className="w-32">Pass</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.passes.map((p) => {
                const hoursLate = hoursBetween(p.expectedReturn, now);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.personName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.destination}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.outTime ? format(new Date(p.outTime), 'dd MMM, HH:mm') : 'Not recorded'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(p.expectedReturn), 'dd MMM, HH:mm')}
                      {hoursLate > 0 && (
                        <span className="ml-2 text-red-600 dark:text-red-400">
                          {formatLateness(hoursLate)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.passNumber}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Out on a pass right now</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gate passes that were issued and never closed. A closed pass leaves this list immediately.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canReadPasses && <AccessCaveat what="this list" permissionKey={GATE_PASS_KEY} />}
        {body()}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Coverage / trust meter
// ──────────────────────────────────────────────────────────────────────────────

function Meter({ value }: { value: Measurable }) {
  const percent = value.percent;
  const width = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const bar =
    percent === null
      ? 'bg-muted-foreground/30'
      : percent >= 80
        ? 'bg-green-500'
        : percent >= 50
          ? 'bg-amber-500'
          : 'bg-red-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function CoverageSection({
  coverage,
  exceptions,
}: {
  coverage: LoadState['coverage'];
  exceptions: LoadState['exceptions'];
}) {
  if (!coverage) return <Skeleton className="h-40 w-full" />;
  if (!coverage.ok) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How much of this can be believed</CardTitle>
        </CardHeader>
        <CardContent>
          <ReadFailed message={coverage.message} />
        </CardContent>
      </Card>
    );
  }

  const ordered = sortCoverageWorstFirst(coverage.data);
  const cluster = measureCluster(coverage.data);
  const spread = coverageSpread(coverage.data);
  const unreadable = unreadableColleges(coverage.data);
  // Three distinct states, three distinct messages: the exception read itself
  // failed / it succeeded but the identity sources behind it did not
  // (scanVerifiability null) / it is measurable.
  const scans = exceptions && exceptions.ok ? exceptions.data.scanVerifiability : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">How much of this can be believed</CardTitle>
        <p className="text-sm text-muted-foreground">
          A card&apos;s QR is only a number — a photograph of somebody else&apos;s card scans exactly
          the same. What actually proves identity is the picture on the operator&apos;s screen and a
          person looking at it. So the honest question is not how many scans happened, it is how many
          of them a human could have checked.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* What the last window could actually be verified against. */}
        <div className="rounded-md border p-4">
          <p className="text-sm font-medium">Scans a person could have photo-checked</p>
          {exceptions && !exceptions.ok ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Meal-scan records could not be read, so this cannot be stated.
            </p>
          ) : scans === null ? (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              The learner and team-member records this is measured against could not be read, so
              there is no verifiable share to report. It is deliberately not shown as 0% — that
              would publish a read failure as a trust score.
            </p>
          ) : scans.percent === null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No scans were recorded in the last {MORNING_WINDOW_HOURS} hours, so there is no
              percentage to report. This is deliberately not shown as 100% — nothing was verified,
              because nothing happened.
            </p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatPercent(scans.percent)}
              </p>
              <p className="text-sm text-muted-foreground">
                {scans.withPhoto} of {scans.total} scans in the last {MORNING_WINDOW_HOURS} hours had
                a photo on file. The remaining {scans.total - scans.withPhoto} were accepted on the
                card number alone.
              </p>
              <div className="mt-3">
                <Meter value={scans} />
              </div>
            </>
          )}
        </div>

        {/* The ceiling: who has a photo on file at all. */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Photos on file, college by college</p>
            {/* Labelled by what it ACTUALLY covers, never "Cluster". Row-level
                security decides how many colleges a given reader can count, so
                a fixed "Cluster" label would be a false claim the moment
                somebody sees fewer than all of them — on the one page whose
                argument is that numbers must not overstate themselves. */}
            <p className="text-sm text-muted-foreground">
              Across the {ordered.length} college{ordered.length === 1 ? '' : 's'} you can see:{' '}
              <span className="font-semibold tabular-nums">{formatPercent(cluster.percent)}</span>{' '}
              ({cluster.withPhoto} of {cluster.total})
            </p>
          </div>

          {ordered.length === 1 && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Only one college is visible to you, so the figure above is that college — not a
              cluster average. Somebody with cross-college access will see a different number here.
            </p>
          )}

          {spread && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              That cluster figure hides a {spread.pointsApart.toFixed(0)}-point spread:{' '}
              {spread.worst.institutionName} sits at{' '}
              {formatPercent(measureCollege(spread.worst).percent)} while{' '}
              {spread.best.institutionName} sits at{' '}
              {formatPercent(measureCollege(spread.best).percent)}. Read the rows, not the average.
            </p>
          )}


          <div className="mt-3 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead className="w-48">Photo on file</TableHead>
                  <TableHead className="w-32 text-right">Learners</TableHead>
                  <TableHead className="w-40 text-right">Team members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((row) => {
                  const m = measureCollege(row);
                  // A college whose counts failed to read shows as unreadable,
                  // never as 0% — a failed read is not a coverage score.
                  if (row.readFailed) {
                    return (
                      <TableRow key={row.institutionId}>
                        <TableCell className="font-medium">{row.institutionName}</TableCell>
                        <TableCell colSpan={3} className="text-sm text-amber-700 dark:text-amber-300">
                          Counts could not be read — this row is unknown, not zero.
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={row.institutionId}>
                      <TableCell className="font-medium">{row.institutionName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-sm tabular-nums">
                            {formatPercent(m.percent)}
                          </span>
                          <Meter value={m} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.learnersWithPhoto}/{row.learnersTotal}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.teamWithPhoto}/{row.teamTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {unreadable.length > 0 && (
            <div className="mt-3">
              <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
                {unreadable.length} college{unreadable.length === 1 ? '' : 's'} could not be counted,
                so {unreadable.length === 1 ? 'it is' : 'they are'} excluded from the cluster figure
                above rather than dragging it down as a false zero:{' '}
                {unreadable.map((r) => r.institutionName).join(', ')}.
              </Note>
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            Learners are counted while they are on the books; a graduated record is not counted
            because that person will not be presenting a card. An empty photo field counts as no
            photo — treating a blank as a picture is how a coverage meter starts lying. This table
            covers every college in the cluster, not only your own, because its purpose is the
            comparison.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page body
// ──────────────────────────────────────────────────────────────────────────────

export function IdCardMorningPage() {
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [state, setState] = useState<LoadState>({
    loading: true,
    outNow: null,
    exceptions: null,
    coverage: null,
    refreshedAt: null,
  });

  // Bumping this re-runs the read. The read itself lives INSIDE the effect and
  // only touches state after its awaits, so nothing is set synchronously from
  // an effect body (same shape as the print-queue bridge chip).
  const [readToken, setReadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      // hostel_gate_passes, mess_meal_records and id_card_print_jobs are newer
      // than the generated Database types — read through the untyped client
      // view, the pattern already used by the print-queue bridge chip.
      const client = createClientSupabaseClient() as unknown as SupabaseClient;
      const now = new Date();
      // Every read is time-boxed. A connection that neither answers nor errors
      // would otherwise leave all three sections on their skeletons with the
      // refresh button disabled — a page that spins forever and says nothing.
      const [outNow, exceptions, coverage] = await Promise.all([
        withReadTimeout(readWhoIsOutNow(client), 'The gate-pass read'),
        withReadTimeout(readMorningExceptions(client, now), 'The exception read'),
        withReadTimeout(readPhotoCoverage(client), 'The coverage read'),
      ]);
      if (cancelled) return;
      setState({ loading: false, outNow, exceptions, coverage, refreshedAt: now });
    };

    read();
    return () => {
      cancelled = true;
    };
  }, [readToken]);

  const refresh = () => {
    setState((s) => ({ ...s, loading: true }));
    setReadToken((n) => n + 1);
  };

  const canReadPasses = isSuperAdmin || can(GATE_PASS_KEY);
  const canReadMeals = isSuperAdmin || can(MEAL_RECORD_KEY);
  const now = state.refreshedAt ?? new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {state.refreshedAt
            ? `Read at ${format(state.refreshedAt, 'dd MMM yyyy, HH:mm')}`
            : 'Reading…'}
        </p>
        <Button variant="outline" size="sm" onClick={refresh} disabled={state.loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />
          Read again
        </Button>
      </div>

      <ExceptionsSection
        state={state.exceptions}
        canReadPasses={permissionsLoading || canReadPasses}
        canReadMeals={permissionsLoading || canReadMeals}
      />
      <OutNowSection
        state={state.outNow}
        canReadPasses={permissionsLoading || canReadPasses}
        now={now}
      />
      <CoverageSection coverage={state.coverage} exceptions={state.exceptions} />
    </div>
  );
}
