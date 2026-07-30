'use client';

/**
 * Shared display pieces for the tournament-permission flow.
 *
 * Used by BOTH halves of the Director-locked two-party path:
 *   /health/sports/approvals      — the Principal decides
 *   /health/sports/squad-requests — the Physical Director files for a squad
 *
 * Nothing here talks to the database; it renders what the caller already has.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  MinusCircle,
  Plane,
  Users,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPORT_LEVELS } from '@/types/health-sports';
import type {
  TournamentPermissionRecord,
  TournamentSquadMember,
  TournamentStepStatus,
} from '@/lib/services/health/health-sports-service';

// ---------------------------------------------------------------------------
// Failure reporting
// ---------------------------------------------------------------------------

/**
 * A Supabase/PostgREST failure is a PLAIN OBJECT, not an Error instance, so
 * `err instanceof Error ? err.message : fallback` silently discards it and shows
 * the fallback — which is how a page ends up printing its own title twice and
 * telling the reader nothing. Read the shape directly.
 */
export function readFailure(err: unknown): { message: string; code: string | null } {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    const message = typeof e.message === 'string' && e.message.length > 0 ? e.message : null;
    const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : null;
    if (message) return { message, code };
  }
  if (err instanceof Error && err.message) return { message: err.message, code: null };
  return { message: 'No reason was reported by the server.', code: null };
}

/**
 * Both failures below mean exactly one thing here — the migration that makes
 * this a two-party approval has not been applied to this environment:
 *
 *   42703 undefined_column      reading `filed_by_profile_id` before it exists
 *   23514 check_violation on a  writing 'not_required' to step 1 / 2 / 4 before
 *         step*_status CHECK    their CHECK constraints have been widened
 *
 * Telling the reader "please try again" for either is the silent-failure trap in
 * a new costume: retrying can never succeed, so the message must name the
 * pending database change instead. Verified against the live error strings
 * (2026-07-30) rather than guessed.
 */
export function isSchemaNotApplied(code: string | null, message: string): boolean {
  if (code === '42703' || /does not exist/i.test(message)) return true;
  return (
    (code === '23514' || /check constraint/i.test(message)) &&
    /step[124]_|sports_coordinator_sta|hod_status|pe_director_status/i.test(message)
  );
}

export function FailureNotice({
  heading,
  err,
  onRetry,
}: {
  heading: string;
  err: unknown;
  onRetry?: () => void;
}) {
  const { message, code } = readFailure(err);
  const schemaPending = isSchemaNotApplied(code, message);

  return (
    <Alert
      className={
        schemaPending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
      }
    >
      <AlertCircle
        className={`h-4 w-4 ${schemaPending ? 'text-amber-600' : 'text-red-600'}`}
      />
      <AlertTitle className={schemaPending ? 'text-amber-900' : 'text-red-900'}>
        {schemaPending ? 'This feature is not switched on yet' : heading}
      </AlertTitle>
      <AlertDescription
        className={`space-y-2 ${schemaPending ? 'text-amber-900' : 'text-red-900'}`}
      >
        {schemaPending ? (
          <p className="text-sm">
            The database change for the two-party tournament approval has not been
            applied to this environment, so there is nothing to read yet. Nobody has
            done anything wrong and no request has been lost — an administrator needs
            to apply the pending migration.
          </p>
        ) : (
          <p className="text-sm">{message}</p>
        )}
        <p className="text-xs opacity-80">
          Reported by the server{code ? ` as ${code}` : ''}: {message}
        </p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function levelLabel(level: string): string {
  return SPORT_LEVELS.find((l) => l.value === level)?.label ?? level;
}

export function dateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const from = new Date(start).toLocaleDateString('en-IN', opts);
  const to = new Date(end).toLocaleDateString('en-IN', { ...opts, year: 'numeric' });
  return start === end ? to : `${from} — ${to}`;
}

export function learnerName(
  learner: TournamentPermissionRecord['learners_profiles']
): string {
  if (!learner) return 'Learner record unavailable';
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(' ').trim();
  return name || 'Unnamed learner';
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

export function OverallStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
    completed: 'bg-blue-100 text-blue-700 border-blue-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  const label: Record<string, string> = {
    approved: 'Approved',
    rejected: 'Rejected',
    completed: 'Completed',
    pending: 'Awaiting Principal',
  };
  return (
    <Badge className={cn('text-xs hover:bg-inherit', map[status] ?? map.pending)}>
      {label[status] ?? 'Awaiting Principal'}
    </Badge>
  );
}

/**
 * The approval path, honestly.
 *
 * Only the Principal step is a decision. The three steps nobody decides render
 * as "Not required" — greyed and struck through — so no one reads them as work
 * still pending, and nothing ever displays an approval that was never given.
 */
export function ApprovalPath({ perm }: { perm: TournamentPermissionRecord }) {
  const steps: { label: string; status: TournamentStepStatus; decisive: boolean }[] = [
    { label: 'Sports Coordinator', status: perm.step1_sports_coordinator_status, decisive: false },
    { label: 'Head of Department', status: perm.step2_hod_status, decisive: false },
    { label: 'Principal', status: perm.step3_principal_status, decisive: true },
    { label: 'PE Director', status: perm.step4_pe_director_status, decisive: false },
  ];

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2">
        Approval path — the Principal decides
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {steps.map((step) => {
          const notRequired = step.status === 'not_required';
          return (
            <div
              key={step.label}
              className={cn(
                'rounded-lg border px-2 py-2 text-center',
                notRequired
                  ? 'border-dashed border-slate-200 bg-slate-50'
                  : step.status === 'approved'
                    ? 'border-green-200 bg-green-50'
                    : step.status === 'rejected'
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
              )}
            >
              <div className="mb-1 flex justify-center">
                <StepIcon status={step.status} />
              </div>
              <p
                className={cn(
                  'text-xs font-medium leading-tight',
                  notRequired
                    ? 'text-slate-400 line-through'
                    : step.status === 'approved'
                      ? 'text-green-700'
                      : step.status === 'rejected'
                        ? 'text-red-600'
                        : 'text-amber-700'
                )}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {notRequired ? 'Not required' : step.status}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: TournamentStepStatus }) {
  if (status === 'not_required')
    return <MinusCircle className="h-4 w-4 text-slate-300" />;
  if (status === 'approved')
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

// ---------------------------------------------------------------------------
// Squad roster
// ---------------------------------------------------------------------------

/**
 * Every participant, named. Accreditation needs per-learner participation, so
 * each member is listed with their own learner id present in the data — never
 * summarised as a headcount.
 */
export function SquadRoster({ members }: { members: TournamentSquadMember[] }) {
  if (!members || members.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No squad recorded — this request covers the nominated learner only.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Users className="h-3.5 w-3.5" />
        Squad — {members.length} {members.length === 1 ? 'learner' : 'learners'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <span
            key={m.learner_id}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {m.name}
            {m.roll_number ? (
              <span className="ml-1 text-slate-400">{m.roll_number}</span>
            ) : null}
            {m.sport ? <span className="ml-1 text-emerald-600">· {m.sport}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One request, read-only
// ---------------------------------------------------------------------------

export function RequestCard({
  perm,
  actions,
}: {
  perm: TournamentPermissionRecord;
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {perm.tournament_name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>{perm.sport}</span>
              <span className="text-slate-300">·</span>
              <span>{levelLabel(perm.tournament_level)}</span>
              <span className="text-slate-300">·</span>
              <span>{dateRange(perm.start_date, perm.end_date)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Nominated learner: {learnerName(perm.learners_profiles)}
              {perm.learners_profiles?.roll_number
                ? ` (${perm.learners_profiles.roll_number})`
                : ''}
            </p>
          </div>
          <OverallStatusBadge status={perm.overall_status} />
        </div>

        {perm.travel_required ? (
          <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-2.5">
            <Plane className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            <p className="text-xs text-sky-900">
              Travel required{perm.travel_details ? ` — ${perm.travel_details}` : ''}
            </p>
          </div>
        ) : null}

        {perm.justification ? (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Justification</p>
            <p className="text-xs text-slate-700">{perm.justification}</p>
          </div>
        ) : null}

        <SquadRoster members={perm.team_members ?? []} />

        <ApprovalPath perm={perm} />

        {perm.step3_notes ? (
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="mb-0.5 text-xs font-medium text-slate-400">Principal&apos;s note</p>
            <p className="text-xs text-slate-700">{perm.step3_notes}</p>
          </div>
        ) : null}

        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Explicit failures (CLAUDE.md #27 — never a silent redirect)
// ---------------------------------------------------------------------------

/**
 * Shown instead of an empty page when the signed-in user lacks the permission
 * this surface needs. Names the permission and who to ask, so the first click
 * explains itself rather than bouncing to a dashboard.
 */
export function NoAccessNotice({
  permissionKey,
  purpose,
}: {
  permissionKey: string;
  purpose: string;
}) {
  return (
    <Alert className="border-amber-200 bg-amber-50">
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900">You do not have access to this page</AlertTitle>
      <AlertDescription className="space-y-2 text-amber-900">
        <p className="text-sm">
          {purpose} needs the permission{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">{permissionKey}</code>,
          which none of your roles currently grants.
        </p>
        <p className="text-sm">
          Ask an administrator to grant it in Role Management. Nothing is wrong with
          your account — this page is simply not part of your role yet.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/health/dashboard">Back to Health &amp; Wellness</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown when the surface loads but the data door is shut — for example a squad
 * picker whose role cannot read learner records. A blank list would look like
 * "there is nobody"; this says what actually happened.
 */
export function EmptyBecauseNoDataAccess({
  what,
  permissionKeys,
}: {
  what: string;
  permissionKeys: string[];
}) {
  return (
    <Alert className="border-slate-200 bg-slate-50">
      <UserX className="h-4 w-4 text-slate-500" />
      <AlertTitle className="text-slate-800">No {what} could be read</AlertTitle>
      <AlertDescription className="text-slate-600">
        <p className="text-sm">
          This is a permission result, not an empty campus. Reading {what} needs one
          of: {permissionKeys.map((k) => (
            <code key={k} className="mx-0.5 rounded bg-slate-200 px-1 py-0.5 text-xs">
              {k}
            </code>
          ))}
          . Ask an administrator to grant one in Role Management.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Shown when a required approver role has nobody in it. */
export function NoApproverNotice({ roleLabel }: { roleLabel: string }) {
  return (
    <Alert className="border-red-200 bg-red-50">
      <ShieldAlert className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-900">No one can approve these requests</AlertTitle>
      <AlertDescription className="text-red-900">
        <p className="text-sm">
          The {roleLabel} role currently has no holder with approval permission, so
          filed requests would wait indefinitely with nobody able to act. Contact an
          administrator to assign the role before filing.
        </p>
      </AlertDescription>
    </Alert>
  );
}
